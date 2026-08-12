import { describe, it, expect } from 'vitest';
import { calcMetricLeaders } from '../calcMetricLeaders';

// 어워드 "지표 Top5" — 레이더 6축 raw값 + 팀득점관여율 랭킹.
// 진입 기준 rounds>=10(소표본 왜곡 방지), 키퍼는 수문장 카드와 동일(keeperRounds>=4).
const P = (over = {}) => ({
  rounds: 10, keeperRounds: 0, fieldRounds: 10, games: 5,
  goals: 0, assists: 0, ownGoals: 0, fouls: 0,
  conceded: 0, fieldConceded: 10, avgConceded: 1.0,
  matches: 10, wins: 5, draws: 0, losses: 5, winRate: 0.5,
  teamGoals: 20, goalInvolvement: 0,
  ...over,
});

describe('calcMetricLeaders', () => {
  it('득점력/창의력은 경기당 값 내림차순, topN 제한', () => {
    const perPlayer = {
      A: P({ goals: 10 }), // 1.0골
      B: P({ goals: 5 }),  // 0.5골
      C: P({ goals: 8 }),  // 0.8골
      D: P({ goals: 7 }),
      E: P({ goals: 6 }),
      F: P({ goals: 1 }),  // 6th — topN=5에서 잘림
    };
    const r = calcMetricLeaders({ perPlayer, totalSessions: 10 });
    expect(r.scoring.map(x => x.player)).toEqual(['A', 'C', 'D', 'E', 'B']);
    expect(r.scoring[0].value).toBeCloseTo(1.0);
    expect(r.scoring).toHaveLength(5);
  });

  it('rounds<10 선수는 전 지표에서 제외 (소표본 왜곡 방지)', () => {
    const perPlayer = {
      A: P({ goals: 10 }),
      Rookie: P({ rounds: 3, fieldRounds: 3, goals: 6 }), // 3경기 2골/경기지만 제외
    };
    const r = calcMetricLeaders({ perPlayer, totalSessions: 10 });
    expect(r.scoring.map(x => x.player)).toEqual(['A']);
  });

  it('수비력은 경기당 팀실점 오름차순, 필드 10경기 미만 제외', () => {
    const perPlayer = {
      A: P({ avgConceded: 0.5 }),
      B: P({ avgConceded: 1.5 }),
      NoField: P({ fieldRounds: 0, avgConceded: 0 }),
    };
    const r = calcMetricLeaders({ perPlayer, totalSessions: 10 });
    expect(r.defense.map(x => x.player)).toEqual(['A', 'B']);
  });

  it('키퍼는 경기당 실점 오름차순, 4경기 미만 제외', () => {
    const perPlayer = {
      A: P({ keeperRounds: 10, conceded: 5 }),  // 0.5
      B: P({ keeperRounds: 4, conceded: 8 }),   // 2.0
      C: P({ keeperRounds: 3, conceded: 0 }),   // 표본 미달
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

  it('동률이면 표본 큰 쪽 우선', () => {
    const perPlayer = {
      Small: P({ rounds: 10, fieldRounds: 10, goals: 10 }), // 1.0골/경기
      Big: P({ rounds: 20, fieldRounds: 20, goals: 20 }),   // 1.0골/경기, 표본 큼
    };
    const r = calcMetricLeaders({ perPlayer, totalSessions: 10 });
    expect(r.scoring.map(x => x.player)).toEqual(['Big', 'Small']);
  });
});
