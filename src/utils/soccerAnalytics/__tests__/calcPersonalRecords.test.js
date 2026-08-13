import { describe, it, expect } from 'vitest';
import { calcPersonalRecords } from '../calcPersonalRecords';

describe('calcPersonalRecords', () => {
  it('returns max goals/assists with date', () => {
    const logs = [
      { player: 'A', date: '2026-01-01', goals: 2, assists: 1, keeper_games: 0, conceded: 0, rank_score: 3 },
      { player: 'A', date: '2026-01-02', goals: 5, assists: 0, keeper_games: 0, conceded: 0, rank_score: 5 },
      { player: 'A', date: '2026-01-03', goals: 1, assists: 3, keeper_games: 0, conceded: 0, rank_score: 4 },
    ];
    const r = calcPersonalRecords({ playerName: 'A', playerLogs: logs });
    expect(r.mostGoals).toEqual({ value: 5, date: '2026-01-02' });
    expect(r.mostAssists).toEqual({ value: 3, date: '2026-01-03' });
    expect(r.bestRankScore).toEqual({ value: 5, date: '2026-01-02' });
  });

  it('computes longest clean sheet streak with dates', () => {
    const logs = [
      { player: 'G', date: '2026-01-01', goals: 0, assists: 0, keeper_games: 2, conceded: 0, rank_score: 1 },
      { player: 'G', date: '2026-01-02', goals: 0, assists: 0, keeper_games: 1, conceded: 0, rank_score: 1 },
      { player: 'G', date: '2026-01-03', goals: 0, assists: 0, keeper_games: 1, conceded: 2, rank_score: 0 },
      { player: 'G', date: '2026-01-04', goals: 0, assists: 0, keeper_games: 1, conceded: 0, rank_score: 1 },
    ];
    const r = calcPersonalRecords({ playerName: 'G', playerLogs: logs });
    expect(r.longestCleanSheet).toEqual({ value: 2, startDate: '2026-01-01', endDate: '2026-01-02' });
  });

  it('returns null records for player with no logs', () => {
    const r = calcPersonalRecords({ playerName: 'X', playerLogs: [] });
    expect(r).toEqual({
      mostGoals: null, mostAssists: null,
      longestCleanSheet: null, bestRankScore: null,
      keeperSummary: null, rankScore: null,
    });
  });

  it('keeperSummary: 키퍼 세션/경기 누적, 클린시트율, 경기당 실점', () => {
    const logs = [
      { player: 'G', date: '2026-01-01', goals: 0, assists: 0, keeper_games: 2, conceded: 0, cleansheets: 1, rank_score: 1 },
      { player: 'G', date: '2026-01-02', goals: 0, assists: 0, keeper_games: 1, conceded: 3, cleansheets: 0, rank_score: 1 },
      { player: 'G', date: '2026-01-03', goals: 1, assists: 0, keeper_games: 0, conceded: 0, cleansheets: 0, rank_score: 2 }, // 필드만
    ];
    const r = calcPersonalRecords({ playerName: 'G', playerLogs: logs });
    expect(r.keeperSummary).toEqual({
      keeperSessions: 2,       // keeper_games>0인 세션 수
      keeperGames: 3,          // Σkeeper_games
      conceded: 3,
      cleanSheets: 1,          // Σcleansheets (무실점 세션)
      cleanSheetRate: 0.5,     // 1/2 세션
      concededPerGame: 1,      // 3실점 / 3경기
    });
  });

  it('키퍼 세션이 없으면 keeperSummary=null', () => {
    const logs = [{ player: 'A', date: '2026-01-01', goals: 1, assists: 0, keeper_games: 0, conceded: 0, rank_score: 1 }];
    const r = calcPersonalRecords({ playerName: 'A', playerLogs: logs });
    expect(r.keeperSummary).toBeNull();
  });

  it('rankScore: 시즌 누적/세션당 평균', () => {
    const logs = [
      { player: 'A', date: '2026-01-01', goals: 0, assists: 0, keeper_games: 0, conceded: 0, rank_score: 3 },
      { player: 'A', date: '2026-01-02', goals: 0, assists: 0, keeper_games: 0, conceded: 0, rank_score: 5 },
    ];
    const r = calcPersonalRecords({ playerName: 'A', playerLogs: logs });
    expect(r.rankScore).toEqual({ total: 8, avg: 4, sessions: 2 });
  });
});
