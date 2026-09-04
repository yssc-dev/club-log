import { describe, it, expect } from 'vitest';
import { calcMetricLeaders } from '../calcMetricLeaders';

// 어워드 "지표 Top5" — 레이더 6축 raw값 + 팀득점관여율 랭킹.
// 진입 기준은 동적(2026-08-21): 각 지표를 자기 표본 축 최대치의 30%(올림)로 게이트.
// 출전 기반 지표=max(rounds)×30%, 수비력=max(fieldRounds)×30%, 키퍼=max(keeperRounds)×30%.
const P = (over = {}) => ({
  rounds: 30, keeperRounds: 0, fieldRounds: 30, games: 5,
  goals: 0, assists: 0, ownGoals: 0, fouls: 0,
  conceded: 0, fieldConceded: 30, avgConceded: 1.0,
  matches: 30, wins: 15, draws: 0, losses: 15, winRate: 0.5,
  teamGoals: 20, goalInvolvement: 0,
  ...over,
});

describe('calcMetricLeaders', () => {
  it('득점력/창의력은 경기당 값 내림차순, topN 제한', () => {
    const perPlayer = {
      A: P({ goals: 30 }), // 1.0골
      B: P({ goals: 15 }), // 0.5골
      C: P({ goals: 24 }), // 0.8골
      D: P({ goals: 21 }),
      E: P({ goals: 18 }),
      F: P({ goals: 3 }),  // 6th — topN=5에서 잘림
    };
    const r = calcMetricLeaders({ perPlayer, totalSessions: 10 });
    expect(r.scoring.map(x => x.player)).toEqual(['A', 'C', 'D', 'E', 'B']);
    expect(r.scoring[0].value).toBeCloseTo(1.0);
    expect(r.scoring).toHaveLength(5);
  });

  it('진입선(최대 출전 30%) 미만 선수는 출전 기반 지표에서 제외 (소표본 왜곡 방지)', () => {
    const perPlayer = {
      A: P({ goals: 30 }), // rounds 30 → 진입선 ceil(30×0.3)=9
      Rookie: P({ rounds: 8, fieldRounds: 8, goals: 16 }), // 2골/경기지만 8 < 9 → 제외
    };
    const r = calcMetricLeaders({ perPlayer, totalSessions: 10 });
    expect(r.scoring.map(x => x.player)).toEqual(['A']);
  });

  it('수비력은 경기당 팀실점 오름차순, 필드 30경기 미만 제외', () => {
    const perPlayer = {
      A: P({ avgConceded: 0.5 }),
      B: P({ avgConceded: 1.5 }),
      NoField: P({ fieldRounds: 0, avgConceded: 0 }),
    };
    const r = calcMetricLeaders({ perPlayer, totalSessions: 10 });
    expect(r.defense.map(x => x.player)).toEqual(['A', 'B']);
  });

  it('키퍼는 경기당 실점 오름차순, 최대 키퍼경기 30% 미만 제외', () => {
    const perPlayer = {
      A: P({ keeperRounds: 10, conceded: 5 }),  // 0.5 — maxKeeper 10 → 진입선 3
      B: P({ keeperRounds: 4, conceded: 8 }),   // 2.0
      C: P({ keeperRounds: 2, conceded: 0 }),   // 2 < 3 → 표본 미달
    };
    const r = calcMetricLeaders({ perPlayer, totalSessions: 10 });
    expect(r.keeping.map(x => x.player)).toEqual(['A', 'B']);
    expect(r.keeping[0].value).toBeCloseTo(0.5);
  });

  it('참석률·승리기여·팀득점관여율 내림차순', () => {
    const perPlayer = {
      A: P({ games: 9, winRate: 0.7, goals: 6, assists: 4, teamGoals: 20, goalInvolvement: 0.5 }),
      B: P({ games: 3, winRate: 0.4, goals: 2, assists: 0, teamGoals: 20, goalInvolvement: 0.1 }),
    };
    const r = calcMetricLeaders({ perPlayer, totalSessions: 10 });
    expect(r.attendance[0]).toMatchObject({ player: 'A', value: 0.9 });
    expect(r.winRate[0].player).toBe('A');
    expect(r.involvement.map(x => x.player)).toEqual(['A', 'B']);
    expect(r.involvement[0].value).toBeCloseTo(0.5);
  });

  it('팀득점관여율은 teamGoals<10(소분모) 제외', () => {
    const perPlayer = {
      A: P({ teamGoals: 4, goals: 2, assists: 1, goalInvolvement: 0.75 }), // 분모 4골 — 제외
      B: P({ teamGoals: 20, goals: 6, assists: 4, goalInvolvement: 0.5 }),
    };
    const r = calcMetricLeaders({ perPlayer, totalSessions: 10 });
    expect(r.involvement.map(x => x.player)).toEqual(['B']);
  });

  it('진입 기준은 최다 출전의 30%(올림) — 동적', () => {
    const perPlayer = {
      Max: P({ rounds: 73, fieldRounds: 73, goals: 73 }),  // maxRounds 73 → cutoff ceil(21.9)=22
      In: P({ rounds: 22, fieldRounds: 22, goals: 44 }),   // 22 ≥ 22 → 포함
      Out: P({ rounds: 21, fieldRounds: 21, goals: 63 }),  // 3골/경기지만 21 < 22 → 제외
    };
    const r = calcMetricLeaders({ perPlayer, totalSessions: 10 });
    expect(r.scoring.map(x => x.player)).toContain('In');
    expect(r.scoring.map(x => x.player)).not.toContain('Out');
    expect(r.thresholds.minRounds).toBe(22);
  });

  it('키퍼는 최다 키퍼경기의 30%로만 게이트 — 총 출전 기준과 무관', () => {
    const perPlayer = {
      MainGk: P({ rounds: 73, keeperRounds: 65, conceded: 65 }), // maxKeeper 65 → cutoff 20
      SubGk: P({ rounds: 21, keeperRounds: 20, conceded: 10 }),  // 출전 21 < minRounds(22)이지만 키퍼 축은 통과
      Rare: P({ rounds: 73, keeperRounds: 19, conceded: 0 }),    // 19 < 20 → 제외
    };
    const r = calcMetricLeaders({ perPlayer, totalSessions: 10 });
    expect(r.keeping.map(x => x.player)).toContain('SubGk');
    expect(r.keeping.map(x => x.player)).not.toContain('Rare');
    expect(r.thresholds.minKeeperRounds).toBe(20);
  });

  it('수비력은 최다 필드경기의 30%로만 게이트', () => {
    const perPlayer = {
      MaxField: P({ rounds: 73, fieldRounds: 65, avgConceded: 1.0 }), // maxField 65 → cutoff 20
      InField: P({ rounds: 21, fieldRounds: 20, avgConceded: 0.5 }),  // 출전 미달이어도 필드 축 통과
      OutField: P({ rounds: 73, fieldRounds: 19, avgConceded: 0.1 }),
    };
    const r = calcMetricLeaders({ perPlayer, totalSessions: 10 });
    expect(r.defense.map(x => x.player)).toContain('InField');
    expect(r.defense.map(x => x.player)).not.toContain('OutField');
    expect(r.thresholds.minFieldRounds).toBe(20);
  });

  it('동률이면 표본 큰 쪽 우선', () => {
    const perPlayer = {
      Small: P({ rounds: 30, fieldRounds: 30, goals: 30 }), // 1.0골/경기
      Big: P({ rounds: 40, fieldRounds: 40, goals: 40 }),   // 1.0골/경기, 표본 큼
    };
    const r = calcMetricLeaders({ perPlayer, totalSessions: 10 });
    expect(r.scoring.map(x => x.player)).toEqual(['Big', 'Small']);
  });
});

// 2026-09-04 어워드 기간 토글: 표본이 작아져도 진입선이 0으로 내려가면 안 된다.
// perPlayer는 matchLogs뿐 아니라 eventLogs 루프에서도 ensure()로 채워져(calcPlayerSummary)
// 매치 기록 없이 골 이벤트만 있는 선수가 rounds=0으로 들어온다(레거시 부분명단 구간).
describe('진입선 하한 — 0 나눗셈 방어', () => {
  it('축 최대치가 극소여도 minRounds는 1 이상', () => {
    const perPlayer = {
      유령: { rounds: 0, keeperRounds: 0, fieldRounds: 0, games: 0, goals: 3, assists: 0,
              conceded: 0, avgConceded: 0, matches: 0, winRate: 0, teamGoals: 0, goalInvolvement: 0 },
      실재: { rounds: 1, keeperRounds: 0, fieldRounds: 1, games: 1, goals: 1, assists: 0,
              conceded: 0, avgConceded: 0, matches: 1, winRate: 0, teamGoals: 0, goalInvolvement: 0 },
    };
    const r = calcMetricLeaders({ perPlayer, totalSessions: 1 });
    expect(r.thresholds.minRounds).toBe(1);
    expect(r.scoring.map(x => x.player)).toEqual(['실재']);
    expect(r.scoring.every(x => Number.isFinite(x.value))).toBe(true);
  });

  it('표본이 충분하면 하한은 아무 영향이 없다 — 누적 화면 무변경', () => {
    const mk = (rounds) => ({ rounds, keeperRounds: 0, fieldRounds: rounds, games: rounds, goals: 1,
      assists: 0, conceded: 0, avgConceded: 0, matches: rounds, winRate: 0, teamGoals: 0, goalInvolvement: 0 });
    const r = calcMetricLeaders({ perPlayer: { A: mk(89), B: mk(20) }, totalSessions: 34 });
    expect(r.thresholds.minRounds).toBe(27); // ceil(89*0.3)
  });
});
