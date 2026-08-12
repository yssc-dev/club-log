import { describe, it, expect } from 'vitest';
import { calcTrends } from '../calcTrends';

describe('calcTrends', () => {
  it('returns per-session gpg/apg/winRate', () => {
    const playerLogs = [
      { player: 'A', date: '2026-01-01', goals: 2, assists: 1 },
      { player: 'A', date: '2026-01-08', goals: 1, assists: 0 },
    ];
    const matchLogs = [
      { date: '2026-01-01', our_members_json: JSON.stringify(['A']), our_score: 3, opponent_score: 1 },
      { date: '2026-01-01', our_members_json: JSON.stringify(['A']), our_score: 2, opponent_score: 2 },
      { date: '2026-01-08', our_members_json: JSON.stringify(['A']), our_score: 1, opponent_score: 2 },
    ];
    const result = calcTrends({ playerName: 'A', playerLogs, matchLogs });
    expect(result.points).toEqual([
      { date: '2026-01-01', gpg: 1, apg: 0.5, winRate: 0.75 },
      { date: '2026-01-08', gpg: 1, apg: 0, winRate: 0 },
    ]);
  });

  it('caps to maxSessions most recent', () => {
    const playerLogs = Array.from({ length: 15 }, (_, i) => ({
      player: 'A', date: `2026-01-${String(i+1).padStart(2,'0')}`, goals: 1, assists: 0
    }));
    const matchLogs = playerLogs.map(p => ({
      date: p.date, our_members_json: JSON.stringify(['A']), our_score: 1, opponent_score: 0
    }));
    const result = calcTrends({ playerName: 'A', playerLogs, matchLogs, maxSessions: 12 });
    expect(result.points).toHaveLength(12);
    expect(result.points[0].date).toBe('2026-01-04');
  });

  it('3-session moving average', () => {
    const playerLogs = [
      { player: 'A', date: '2026-01-01', goals: 3, assists: 0 },
      { player: 'A', date: '2026-01-02', goals: 0, assists: 0 },
      { player: 'A', date: '2026-01-03', goals: 3, assists: 0 },
    ];
    const matchLogs = playerLogs.map(p => ({
      date: p.date, our_members_json: JSON.stringify(['A']), our_score: 1, opponent_score: 0
    }));
    const result = calcTrends({ playerName: 'A', playerLogs, matchLogs, smoothWindow: 3 });
    expect(result.smoothed[2].gpg).toBeCloseTo(2, 5);
  });

  it('returns empty arrays when player has no logs', () => {
    const result = calcTrends({ playerName: 'X', playerLogs: [], matchLogs: [] });
    expect(result.points).toEqual([]);
    expect(result.smoothed).toEqual([]);
  });
});
