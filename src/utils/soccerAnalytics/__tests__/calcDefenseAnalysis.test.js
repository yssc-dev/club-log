import { describe, it, expect } from 'vitest';
import { calcDefenseAnalysis, sortDefenseRows } from '../calcDefenseAnalysis';

// 헬퍼: 수비수 명단+실점만 다른 최소 매치 행
const m = (dfs, conceded, extra = {}) => ({
  our_defenders_json: JSON.stringify(dfs), opponent_score: conceded, ...extra,
});

describe('calcDefenseAnalysis', () => {
  it('수비수 기록 없는 경기·is_extra 경기는 스코프 제외', () => {
    const r = calcDefenseAnalysis({ matchLogs: [
      m([], 3),
      { opponent_score: 2 },                 // our_defenders_json 없음(레거시)
      m(['A', 'B'], 1, { is_extra: true }),
    ] });
    expect(r.scopeMatches).toBe(0);
    expect(r.individuals).toEqual([]);
    expect(r.pairs).toEqual([]);
  });

  it('개인 억제율: 출전 vs 부재 경기당 실점 차', () => {
    const r = calcDefenseAnalysis({
      matchLogs: [
        m(['A', 'B'], 0), // A 출전: 0실점
        m(['A', 'C'], 1), // A 출전: 1실점
        m(['B', 'C'], 3), // A 부재: 3실점
      ],
      individualThreshold: 2, pairThreshold: 2,
    });
    const a = r.individuals.find(x => x.name === 'A');
    expect(a.games).toBe(2);
    expect(a.concededPerGame).toBeCloseTo(0.5);
    expect(a.baselineConcededPerGame).toBeCloseTo(3);
    expect(a.delta).toBeCloseTo(2.5); // 양수 = 억제
    expect(a.hasBaseline).toBe(true);
    expect(a.cleanSheets).toBe(1);
    expect(a.cleanRate).toBeCloseTo(0.5);
  });

  it('전 경기 출전 수비수는 hasBaseline=false·delta null, 정렬 맨 뒤', () => {
    const r = calcDefenseAnalysis({
      matchLogs: [m(['A', 'B'], 0), m(['A', 'C'], 2)],
      individualThreshold: 1, pairThreshold: 99,
    });
    const a = r.individuals.find(x => x.name === 'A');
    expect(a.hasBaseline).toBe(false);
    expect(a.delta).toBeNull();
    expect(a.baselineConcededPerGame).toBeNull();
    expect(r.individuals[r.individuals.length - 1].name).toBe('A'); // null delta는 best 정렬 맨 뒤
  });

  it('페어: 동반 출전 경기만 집계, threshold 미달 페어 제외', () => {
    const logs = [
      m(['A', 'B'], 0), m(['A', 'B'], 1), // A-B 2경기 (합 1실점)
      m(['A', 'C'], 5),                   // A-C 1경기 → threshold 2 미달
    ];
    const r = calcDefenseAnalysis({ matchLogs: logs, individualThreshold: 99, pairThreshold: 2 });
    expect(r.pairs).toHaveLength(1);
    const ab = r.pairs[0];
    expect([ab.a, ab.b]).toEqual(['A', 'B']);
    expect(ab.games).toBe(2);
    expect(ab.concededPerGame).toBeCloseTo(0.5);
    expect(ab.baselineConcededPerGame).toBeCloseTo(5); // 동반 아닌 경기 = A-C전 1경기 5실점
    expect(ab.delta).toBeCloseTo(4.5);
    expect(ab.cleanSheets).toBe(1);
  });

  it('worstPairs는 delta 오름차순', () => {
    const logs = [
      m(['A', 'B'], 0), m(['A', 'B'], 0),
      m(['C', 'D'], 3), m(['C', 'D'], 3),
    ];
    const r = calcDefenseAnalysis({ matchLogs: logs, individualThreshold: 99, pairThreshold: 2 });
    expect(r.pairs[0].a).toBe('A');      // best: A-B (억제 +3)
    expect(r.worstPairs[0].a).toBe('C'); // worst: C-D (억제 -3)
  });

  it('수비수 명단 중복 이름은 1회만 집계', () => {
    const r = calcDefenseAnalysis({ matchLogs: [m(['A', 'A', 'B'], 1)], individualThreshold: 1, pairThreshold: 1 });
    expect(r.individuals.find(x => x.name === 'A').games).toBe(1);
    expect(r.pairs).toHaveLength(1); // A-B만, A-A 없음
  });

  it('클린시트율도 부재 대비 Δ를 낸다 (실점률 Δ와 같은 부호 방향)', () => {
    const r = calcDefenseAnalysis({
      matchLogs: [
        m(['A', 'B'], 0), // A 출전: 무실점
        m(['A', 'C'], 0), // A 출전: 무실점
        m(['B', 'C'], 2), // A 부재: 실점
      ],
      individualThreshold: 2, pairThreshold: 99,
    });
    const a = r.individuals.find(x => x.name === 'A');
    expect(a.cleanRate).toBeCloseTo(1);
    expect(a.baselineCleanRate).toBeCloseTo(0);
    expect(a.cleanDelta).toBeCloseTo(1); // 양수 = 억제
  });

  it('베이스라인 없으면 클린시트 Δ도 null', () => {
    const r = calcDefenseAnalysis({
      matchLogs: [m(['A', 'B'], 0), m(['A', 'C'], 2)],
      individualThreshold: 1, pairThreshold: 99,
    });
    const a = r.individuals.find(x => x.name === 'A'); // 전 경기 출전
    expect(a.baselineCleanRate).toBeNull();
    expect(a.cleanDelta).toBeNull();
  });

  it('팀 단위 클린시트 집계를 노출한다', () => {
    const r = calcDefenseAnalysis({
      matchLogs: [m(['A', 'B'], 0), m(['A', 'C'], 0), m(['B', 'C'], 2)],
      individualThreshold: 99, pairThreshold: 99,
    });
    expect(r.totalCleanSheets).toBe(2);
    expect(r.teamCleanRate).toBeCloseTo(2 / 3);
  });
});

describe('sortDefenseRows', () => {
  // delta(실점률)와 cleanDelta(클린시트율)가 일부러 반대 순서인 행들 —
  // metric 인자가 실제로 정렬 축을 바꾸는지 확인하는 게 목적
  const rows = [
    { name: 'A', games: 5, delta: 0.1, cleanDelta: 0.9 },
    { name: 'B', games: 5, delta: 0.9, cleanDelta: 0.1 },
  ];

  it("metric 'conceded'는 실점률 Δ 내림차순", () => {
    expect(sortDefenseRows(rows, { metric: 'conceded' }).map(x => x.name)).toEqual(['B', 'A']);
  });

  it("metric 'clean'은 클린시트 Δ 내림차순", () => {
    expect(sortDefenseRows(rows, { metric: 'clean' }).map(x => x.name)).toEqual(['A', 'B']);
  });

  it("dir 'asc'는 worst 정렬", () => {
    expect(sortDefenseRows(rows, { metric: 'conceded', dir: 'asc' }).map(x => x.name)).toEqual(['A', 'B']);
  });

  it('null Δ는 방향과 무관하게 맨 뒤 — 오염된 값을 순위에 올리지 않는다', () => {
    const withNull = [{ name: 'N', games: 9, delta: null, cleanDelta: null }, ...rows];
    expect(sortDefenseRows(withNull, { metric: 'conceded', dir: 'desc' }).at(-1).name).toBe('N');
    expect(sortDefenseRows(withNull, { metric: 'conceded', dir: 'asc' }).at(-1).name).toBe('N');
    expect(sortDefenseRows(withNull, { metric: 'clean', dir: 'asc' }).at(-1).name).toBe('N');
  });

  it('Δ 동률은 경기수 많은 순 → 이름순', () => {
    const tied = [
      { name: '나', games: 3, delta: 0.5, cleanDelta: 0.5 },
      { name: '가', games: 3, delta: 0.5, cleanDelta: 0.5 },
      { name: '다', games: 9, delta: 0.5, cleanDelta: 0.5 },
    ];
    expect(sortDefenseRows(tied, { metric: 'conceded' }).map(x => x.name)).toEqual(['다', '가', '나']);
  });

  it('페어 행(a·b)도 이름 tiebreak가 동작', () => {
    const pairs = [
      { a: '나', b: '가', games: 2, delta: 0, cleanDelta: 0 },
      { a: '가', b: '다', games: 2, delta: 0, cleanDelta: 0 },
    ];
    expect(sortDefenseRows(pairs, { metric: 'conceded' }).map(x => x.a)).toEqual(['가', '나']);
  });

  it('입력 배열을 변형하지 않는다', () => {
    const input = [...rows];
    sortDefenseRows(input, { metric: 'clean' });
    expect(input.map(x => x.name)).toEqual(['A', 'B']);
  });
});
