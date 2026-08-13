import { describe, it, expect } from 'vitest';
import { calcDefenseAnalysis } from '../calcDefenseAnalysis';

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
});
