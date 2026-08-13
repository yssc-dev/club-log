import { describe, it, expect } from 'vitest';
import { calcStreaks } from '../calcStreaks';

describe('calcStreaks', () => {
  it('counts current & best scoring streak', () => {
    const logs = [
      { player: 'A', date: '2026-01-01', goals: 2, keeper_games: 0, conceded: 0 },
      { player: 'A', date: '2026-01-02', goals: 1, keeper_games: 0, conceded: 0 },
      { player: 'A', date: '2026-01-03', goals: 0, keeper_games: 0, conceded: 0 },
      { player: 'A', date: '2026-01-04', goals: 1, keeper_games: 0, conceded: 0 },
      { player: 'A', date: '2026-01-05', goals: 2, keeper_games: 0, conceded: 0 },
    ];
    const r = calcStreaks({ playerName: 'A', playerLogs: logs });
    expect(r.scoringStreak).toEqual({ current: 2, best: 2 });
  });

  it('best > current when last session is non-scoring', () => {
    const logs = [
      { player: 'A', date: '2026-01-01', goals: 1, keeper_games: 0, conceded: 0 },
      { player: 'A', date: '2026-01-02', goals: 1, keeper_games: 0, conceded: 0 },
      { player: 'A', date: '2026-01-03', goals: 1, keeper_games: 0, conceded: 0 },
      { player: 'A', date: '2026-01-04', goals: 0, keeper_games: 0, conceded: 0 },
    ];
    const r = calcStreaks({ playerName: 'A', playerLogs: logs });
    expect(r.scoringStreak).toEqual({ current: 0, best: 3 });
  });

  it('clean sheet streak only counts sessions where keeper_games>0', () => {
    const logs = [
      { player: 'G', date: '2026-01-01', goals: 0, keeper_games: 2, conceded: 0 },
      { player: 'G', date: '2026-01-02', goals: 0, keeper_games: 0, conceded: 0 },
      { player: 'G', date: '2026-01-03', goals: 0, keeper_games: 1, conceded: 0 },
      { player: 'G', date: '2026-01-04', goals: 0, keeper_games: 1, conceded: 1 },
    ];
    const r = calcStreaks({ playerName: 'G', playerLogs: logs });
    expect(r.cleanSheetStreak).toEqual({ current: 0, best: 2 });
  });

  it('returns zeros for unknown player', () => {
    const r = calcStreaks({ playerName: 'X', playerLogs: [] });
    expect(r).toEqual({
      scoringStreak: { current: 0, best: 0 },
      cleanSheetStreak: { current: 0, best: 0 },
    });
  });

  it('sessionDates 제공 시: 결석(클럽 세션인데 PG 행 없음)은 득점 스트릭을 끊는다', () => {
    const logs = [
      { player: 'A', date: '2026-01-01', goals: 1, keeper_games: 0, conceded: 0 },
      // 2026-01-08 클럽 세션 결석
      { player: 'A', date: '2026-01-15', goals: 1, keeper_games: 0, conceded: 0 },
    ];
    const sessionDates = ['2026-01-01', '2026-01-08', '2026-01-15'];
    const r = calcStreaks({ playerName: 'A', playerLogs: logs, sessionDates });
    expect(r.scoringStreak).toEqual({ current: 1, best: 1 });
  });

  it('sessionDates 제공 시: 결석은 GK 무실점 스트릭도 끊는다', () => {
    const logs = [
      { player: 'G', date: '2026-01-01', goals: 0, keeper_games: 2, conceded: 0 },
      { player: 'G', date: '2026-01-15', goals: 0, keeper_games: 2, conceded: 0 },
    ];
    const sessionDates = ['2026-01-01', '2026-01-08', '2026-01-15'];
    const r = calcStreaks({ playerName: 'G', playerLogs: logs, sessionDates });
    expect(r.cleanSheetStreak).toEqual({ current: 1, best: 1 });
  });

  it('sessionDates 제공 시: 참석했지만 필드로만 뛴 세션은 GK 스트릭을 끊지 않는다', () => {
    const logs = [
      { player: 'G', date: '2026-01-01', goals: 0, keeper_games: 2, conceded: 0 },
      { player: 'G', date: '2026-01-08', goals: 1, keeper_games: 0, conceded: 0 }, // 참석, 필드만
      { player: 'G', date: '2026-01-15', goals: 0, keeper_games: 1, conceded: 0 },
    ];
    const sessionDates = ['2026-01-01', '2026-01-08', '2026-01-15'];
    const r = calcStreaks({ playerName: 'G', playerLogs: logs, sessionDates });
    expect(r.cleanSheetStreak).toEqual({ current: 2, best: 2 });
  });
});
