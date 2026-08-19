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
    expect(ab.members).toEqual(['A', 'B']);
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
    expect(r.pairs[0].members[0]).toBe('A');      // best: A-B (억제 +3)
    expect(r.worstPairs[0].members[0]).toBe('C'); // worst: C-D (억제 -3)
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

  it('3인 조합을 집계한다 — 동반 출전 경기만, 기본 임계 3경기', () => {
    const r = calcDefenseAnalysis({
      matchLogs: [
        m(['A', 'B', 'C'], 0),
        m(['A', 'B', 'C'], 2),
        m(['A', 'B', 'C'], 1),
        m(['A', 'B', 'D'], 3), // A·B·D는 1경기 → 임계 미달
      ],
      individualThreshold: 99, pairThreshold: 99,
    });
    expect(r.trios).toHaveLength(1);
    const abc = r.trios[0];
    expect(abc.members).toEqual(['A', 'B', 'C']);
    expect(abc.games).toBe(3);
    expect(abc.concededPerGame).toBeCloseTo(1);
    expect(abc.cleanSheets).toBe(1);
    expect(abc.baselineConcededPerGame).toBeCloseTo(3); // A·B·D전 1경기 3실점
  });

  it('trioThreshold로 3인 임계를 조절한다', () => {
    const logs = [m(['A', 'B', 'C'], 1), m(['A', 'B', 'C'], 1)];
    expect(calcDefenseAnalysis({ matchLogs: logs, trioThreshold: 3 }).trios).toHaveLength(0);
    expect(calcDefenseAnalysis({ matchLogs: logs, trioThreshold: 2 }).trios).toHaveLength(1);
  });

  it('worstTrios는 best의 역순', () => {
    const logs = [
      ...Array.from({ length: 3 }, () => m(['A', 'B', 'C'], 0)),
      ...Array.from({ length: 3 }, () => m(['D', 'E', 'F'], 3)),
    ];
    const r = calcDefenseAnalysis({ matchLogs: logs, individualThreshold: 99, pairThreshold: 99 });
    expect(r.trios[0].members).toEqual(['A', 'B', 'C']);
    expect(r.worstTrios[0].members).toEqual(['D', 'E', 'F']);
  });

  it('수비수가 2명뿐인 경기는 3인 조합을 만들지 않는다', () => {
    const r = calcDefenseAnalysis({
      matchLogs: [m(['A', 'B'], 1), m(['A', 'B'], 1), m(['A', 'B'], 1)],
      individualThreshold: 99, pairThreshold: 99, trioThreshold: 1,
    });
    expect(r.trios).toEqual([]);
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

  it('조합 행(members)도 이름 tiebreak가 동작 — 2인·3인 공통', () => {
    const combos = [
      { members: ['나', '가'], games: 2, delta: 0, cleanDelta: 0 },
      { members: ['가', '다'], games: 2, delta: 0, cleanDelta: 0 },
      { members: ['가', '나', '다'], games: 2, delta: 0, cleanDelta: 0 },
    ];
    expect(sortDefenseRows(combos, { metric: 'conceded' }).map(x => x.members[0]))
      .toEqual(['가', '가', '나']);
  });

  describe("by: 'raw' — Δ가 아니라 생값으로 세운다", () => {
    // delta는 raw와 일부러 반대로 박아, by:'raw'가 delta를 무시하는지 확인
    const raws = [
      { name: '저실점', games: 5, concededPerGame: 0.4, cleanRate: 0.2, delta: -5, cleanDelta: -5 },
      { name: '고실점', games: 5, concededPerGame: 1.0, cleanRate: 0.8, delta: 5, cleanDelta: 5 },
    ];

    it('실점률은 낮을수록 BEST', () => {
      expect(sortDefenseRows(raws, { metric: 'conceded', by: 'raw', dir: 'desc' }).map(x => x.name))
        .toEqual(['저실점', '고실점']);
    });

    it('클린시트율은 높을수록 BEST — 극성이 반대다', () => {
      expect(sortDefenseRows(raws, { metric: 'clean', by: 'raw', dir: 'desc' }).map(x => x.name))
        .toEqual(['고실점', '저실점']);
    });

    it("dir 'asc'는 두 지표 모두 WORST 순", () => {
      expect(sortDefenseRows(raws, { metric: 'conceded', by: 'raw', dir: 'asc' }).map(x => x.name))
        .toEqual(['고실점', '저실점']);
      expect(sortDefenseRows(raws, { metric: 'clean', by: 'raw', dir: 'asc' }).map(x => x.name))
        .toEqual(['저실점', '고실점']);
    });

    it('by 기본값은 delta — 기존 호출부는 그대로', () => {
      expect(sortDefenseRows(raws, { metric: 'conceded' }).map(x => x.name))
        .toEqual(['고실점', '저실점']);
    });
  });

  it('입력 배열을 변형하지 않는다', () => {
    const input = [...rows];
    sortDefenseRows(input, { metric: 'clean' });
    expect(input.map(x => x.name)).toEqual(['A', 'B']);
  });
});

// ─── 상대 보정: Δ = '같은 상대에서의' 부재 대비 ─────────────────────────────
// 상대팀명이 없는 위 픽스처들은 단일 버킷으로 떨어져 옛 수식과 동일해야 하고(하위호환),
// 상대가 갈리면 상대별 부재 기준선으로 기대 실점을 낸다.
describe('calcDefenseAnalysis 상대 보정 Δ', () => {
  const mo = (dfs, conceded, opponent) => ({
    our_defenders_json: JSON.stringify(dfs), opponent_score: conceded,
    opponent_team_name: opponent,
  });

  it('어려운 상대만 맡은 수비수가 과소평가되지 않는다', () => {
    const logs = [
      mo(['A', 'B'], 0, '쉬움'),
      mo(['B'], 0, '쉬움'),
      mo(['B'], 2, '쉬움'),
      mo(['A'], 2, '어려움'),
      mo(['C'], 3, '어려움'),
      mo(['C'], 3, '어려움'),
    ];
    const r = calcDefenseAnalysis({ matchLogs: logs, individualThreshold: 1, pairThreshold: 99, trioThreshold: 99 });
    const c = r.individuals.find(x => x.name === 'C');
    // C 부재 시 '어려움' 실점 = A의 경기 2 → 기대 2.00, 실제 3.00 → Δ = -1.00.
    // 상대를 무시하면 부재 4경기 (0,0,2,2)/4 = 1.00 → Δ = -2.00으로 두 배 과대 처벌된다.
    expect(c.delta).toBeCloseTo(-1.0);

    const a = r.individuals.find(x => x.name === 'A');
    // A: 쉬움 부재기준 (0+2)/2=1.0 ×1경기 + 어려움 부재기준 (3+3)/2=3.0 ×1경기 = 기대 4.0/2 → 2.0
    //    실제 (0+2)/2 = 1.0 → Δ = +1.0
    expect(a.delta).toBeCloseTo(1.0);
    expect(a.baselineConcededPerGame).toBeCloseTo(2.0);
  });

  it('그 상대 경기를 전부 뛴 구간은 매칭에서 빠진다 — 부재 표본이 없다', () => {
    const logs = [
      mo(['A'], 5, '독점'), // 이 상대 경기는 A가 전부 뛰어 부재 기준선이 없다
      mo(['A'], 0, '공유'),
      mo(['B'], 2, '공유'),
    ];
    const r = calcDefenseAnalysis({ matchLogs: logs, individualThreshold: 1, pairThreshold: 99, trioThreshold: 99 });
    const a = r.individuals.find(x => x.name === 'A');
    expect(a.delta).toBeCloseTo(2.0);            // 공유만 비교: 기대 2.0 vs 실제 0
    expect(a.concededPerGame).toBeCloseTo(2.5);  // 표시용 생값은 전 경기 기준 유지
    expect(a.cleanDelta).toBeCloseTo(1.0);       // 공유 부재 클린 0/1 → 기대 0, 실제 1/1
  });

  it('클린시트 Δ도 같은 상대 기준으로 매칭된다', () => {
    const logs = [
      mo(['A'], 0, '쉬움'), mo(['B'], 0, '쉬움'), mo(['B'], 0, '쉬움'),
      mo(['A'], 1, '어려움'), mo(['B'], 2, '어려움'),
    ];
    const r = calcDefenseAnalysis({ matchLogs: logs, individualThreshold: 1, pairThreshold: 99, trioThreshold: 99 });
    const a = r.individuals.find(x => x.name === 'A');
    // 쉬움: 부재 클린 2/2=1.0 ×1 + 어려움: 부재 클린 0/1=0 ×1 → 기대 클린율 0.5
    // 실제 클린 1/2 = 0.5 → cleanDelta = 0
    expect(a.cleanDelta).toBeCloseTo(0);
  });

  it('상대별 팀 기준선을 opponents로 노출한다 — 캡션의 상대별 실점 표기용', () => {
    const logs = [
      mo(['A'], 0, '쉬움'), mo(['B'], 2, '쉬움'), mo(['B'], 4, '어려움'),
    ];
    const r = calcDefenseAnalysis({ matchLogs: logs, individualThreshold: 99, pairThreshold: 99, trioThreshold: 99 });
    const easy = r.opponents.find(o => o.opponent === '쉬움');
    expect(easy).toMatchObject({ games: 2 });
    expect(easy.concededPerGame).toBeCloseTo(1.0);
    expect(easy.cleanRate).toBeCloseTo(0.5);
    expect(r.opponents.find(o => o.opponent === '어려움').concededPerGame).toBeCloseTo(4.0);
    // 경기수 많은 순 정렬
    expect(r.opponents[0].opponent).toBe('쉬움');
  });

  it('조합(페어) Δ도 같은 상대 기준을 쓴다', () => {
    const logs = [
      mo(['A', 'B'], 0, '어려움'),
      mo(['C', 'D'], 4, '어려움'),
      mo(['C', 'D'], 0, '쉬움'),
      mo(['A', 'B'], 0, '쉬움'),
    ];
    const r = calcDefenseAnalysis({ matchLogs: logs, individualThreshold: 99, pairThreshold: 1, trioThreshold: 99 });
    const ab = r.pairs.find(x => x.members.join('') === 'AB');
    // 어려움 부재기준 4.0 ×1 + 쉬움 부재기준 0.0 ×1 = 기대 2.0, 실제 0 → +2.0
    expect(ab.delta).toBeCloseTo(2.0);
  });
});
