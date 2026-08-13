import { describe, it, expect } from 'vitest';
import { buildRadarPopulations, calcRadarValues, getPlayerType } from '../calcRadarData';

// 최소 요약 객체 헬퍼 (calcPlayerSummary perPlayer 형태)
const mk = (over = {}) => ({
  rounds: 10, goals: 5, assists: 3,
  fieldRounds: 8, avgConceded: 1.0,
  keeperRounds: 2, conceded: 2,
  games: 4, winRate: 0.5,
  ...over,
});

describe('calcRadarData', () => {
  it('표본 없는 축은 null (999 센티널 없음): keeperRounds=0 → keeping null, fieldRounds=0 → defense null', () => {
    const summary = {
      F: mk({ keeperRounds: 0, conceded: 0 }),          // 필드 전용
      G: mk({ fieldRounds: 0, keeperRounds: 10 }),      // 키퍼 전용
    };
    const pops = buildRadarPopulations(summary, ['F', 'G'], 4);
    const f = calcRadarValues(pops, summary.F, 4);
    const g = calcRadarValues(pops, summary.G, 4);
    expect(f.values[3]).toBeNull();   // keeping
    expect(g.values[2]).toBeNull();   // defense
    expect(f.values[2]).not.toBeNull();
    expect(g.values[3]).not.toBeNull();
  });

  it('표본 없는 선수는 모집단에 혼입되지 않음: 키퍼 2명만으로 keeping 백분위 계산', () => {
    const summary = {
      A: mk({ keeperRounds: 2, conceded: 2 }),   // 실점률 1.0
      B: mk({ keeperRounds: 2, conceded: 4 }),   // 실점률 2.0
      C: mk({ keeperRounds: 0, conceded: 0 }),
      D: mk({ keeperRounds: 0, conceded: 0 }),
      E: mk({ keeperRounds: 0, conceded: 0 }),
    };
    const pops = buildRadarPopulations(summary, Object.keys(summary), 4);
    expect(pops.keeping).toHaveLength(2); // 999 센티널이 있었다면 5
    const b = calcRadarValues(pops, summary.B, 4);
    // 모집단 [1.0, 2.0]에서 2.0의 역백분위: rank=1, pct=50 → 50
    // (센티널 혼입 시 [1,2,999,999,999]에서 85.7로 부풀려졌을 값)
    expect(b.values[3]).toBe(50);
  });

  it('K=0 극단: 키퍼가 아무도 없으면 전원 keeping null (가짜 100점 없음)', () => {
    const summary = {
      A: mk({ keeperRounds: 0 }),
      B: mk({ keeperRounds: 0 }),
    };
    const pops = buildRadarPopulations(summary, ['A', 'B'], 4);
    const a = calcRadarValues(pops, summary.A, 4);
    const b = calcRadarValues(pops, summary.B, 4);
    expect(a.values[3]).toBeNull();
    expect(b.values[3]).toBeNull();
  });

  it('getPlayerType: null 축은 평균에서 제외 (0으로 강제변환 금지)', () => {
    // null 포함 6축 — null 제외 평균 65 → 올라운더. null을 0으로 치면 54.2라 미달.
    const t = getPlayerType([65, 65, 65, null, 65, 65]);
    expect(t.label).toBe('올라운더');
  });

  it('getPlayerType: 킬러/메이커 판정은 기존과 동일', () => {
    expect(getPlayerType([80, 20, 50, 50, 50, 50]).label).toBe('킬러');
    expect(getPlayerType([20, 80, 50, 50, 50, 50]).label).toBe('메이커');
  });
});
