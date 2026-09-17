// src/hooks/__tests__/gameReducer.cupStart.test.js
// 스펙 §6.2 v2.1 — 마법사 통과 후 START_MATCHES 가 컵 식별 필드를 보존한다.
import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

describe('START_MATCHES 는 컵 세션 필드를 보존한다', () => {
  it('tournamentId/teams/teamNames/attendees/settingsSnapshot 유지, split/push 초기화', () => {
    const before = {
      ...initialState,
      phase: 'teamBuild', tournamentId: '컵2026', teams: [['a'], ['b']], teamNames: ['팀A', '팀B'],
      attendees: ['a', 'b'], settingsSnapshot: { cup: true }, splitPhase: 'first', pushState: { x: 1 },
    };
    const after = gameReducer(before, { type: 'START_MATCHES', schedule: [{ matches: [[0, 1]] }], pushState: null, splitPhase: null });
    expect(after.phase).toBe('match');
    expect(after.tournamentId).toBe('컵2026');
    expect(after.teams).toEqual([['a'], ['b']]);
    expect(after.teamNames).toEqual(['팀A', '팀B']);
    expect(after.attendees).toEqual(['a', 'b']);
    expect(after.settingsSnapshot).toEqual({ cup: true });
    expect(after.schedule).toEqual([{ matches: [[0, 1]] }]);
    expect(after.splitPhase).toBeNull();
    expect(after.pushState).toBeNull();
  });
});
