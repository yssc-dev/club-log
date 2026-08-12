import { describe, it, expect } from 'vitest';
import { calcMonthlyRanking } from '../calcMonthlyRanking';

describe('calcMonthlyRanking', () => {
  const playerLogs = [
    { player: 'A', date: '2026-01-05', goals: 3, assists: 1 },
    { player: 'A', date: '2026-01-12', goals: 2, assists: 0 },
    { player: 'B', date: '2026-01-05', goals: 1, assists: 3 },
    { player: 'A', date: '2026-02-01', goals: 10, assists: 0 },
  ];
  const matchLogs = [
    { date: '2026-01-05', our_members_json: '["A","B"]', our_score: 3, opponent_score: 1 },
    { date: '2026-01-12', our_members_json: '["A"]', our_score: 1, opponent_score: 2 },
    { date: '2026-02-01', our_members_json: '["A"]', our_score: 5, opponent_score: 0 },
  ];

  it('aggregates within month only', () => {
    const r = calcMonthlyRanking({ yearMonth: '2026-01', playerLogs, matchLogs });
    expect(r.goals[0]).toMatchObject({ player: 'A', value: 5, games: 2, rank: 1 });
    expect(r.goals.find(x => x.player === 'A').value).toBe(5);
  });

  it('ranks assists descending (statMinGames=1로 단세션 선수 포함)', () => {
    const r = calcMonthlyRanking({ yearMonth: '2026-01', playerLogs, matchLogs, statMinGames: 1 });
    expect(r.assists[0]).toMatchObject({ player: 'B', value: 3 });
  });

  it('기본 statMinGames=2: 1세션 선수는 득점·어시 랭킹에서 제외', () => {
    const r = calcMonthlyRanking({ yearMonth: '2026-01', playerLogs, matchLogs });
    expect(r.assists.find(x => x.player === 'B')).toBeUndefined(); // B는 1월 1세션뿐
  });

  it('winRate uses only that month matches and includes games (min games 0)', () => {
    const r = calcMonthlyRanking({ yearMonth: '2026-01', playerLogs, matchLogs, winRateMinGames: 0 });
    const a = r.winRate.find(x => x.player === 'A');
    expect(a.games).toBe(2);
    expect(a.value).toBeCloseTo(0.5, 5);
  });

  it('winRate filters out players below min games threshold (default 5)', () => {
    // A has 2 games, B has 1 game → 둘 다 제외 (기본 minGames=5)
    const r = calcMonthlyRanking({ yearMonth: '2026-01', playerLogs, matchLogs });
    expect(r.winRate).toEqual([]);
  });

  it('winRate includes player only when games >= winRateMinGames', () => {
    const ml = [
      { date: '2026-01-01', our_members_json: '["A"]', our_score: 1, opponent_score: 0 },
      { date: '2026-01-02', our_members_json: '["A"]', our_score: 1, opponent_score: 0 },
      { date: '2026-01-03', our_members_json: '["A","B"]', our_score: 1, opponent_score: 0 },
      { date: '2026-01-04', our_members_json: '["A","B"]', our_score: 1, opponent_score: 0 },
      { date: '2026-01-05', our_members_json: '["A","B"]', our_score: 0, opponent_score: 1 },
    ];
    const r = calcMonthlyRanking({ yearMonth: '2026-01', playerLogs: [], matchLogs: ml });
    expect(r.winRate.find(x => x.player === 'A')?.games).toBe(5);
    expect(r.winRate.find(x => x.player === 'B')).toBeUndefined(); // 3경기라 제외
  });

  it('respects topN', () => {
    const r = calcMonthlyRanking({ yearMonth: '2026-01', playerLogs, matchLogs, topN: 1 });
    expect(r.goals).toHaveLength(1);
    expect(r.assists).toHaveLength(1);
  });

  it('returns empty arrays for month with no data', () => {
    const r = calcMonthlyRanking({ yearMonth: '2025-12', playerLogs, matchLogs });
    expect(r).toEqual({ goals: [], assists: [], attackPoints: [], totalPoints: [], winRate: [] });
  });
});
