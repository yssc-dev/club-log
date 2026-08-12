import { describe, it, expect } from 'vitest';
import { tennisReducer, tennisInitialState } from '../useTennisReducer';

describe('SET_GAME_DATE', () => {
  it('setup에서 gameDate+season 갱신', () => {
    const s0 = { ...tennisInitialState }; // phase 'setup'
    const s1 = tennisReducer(s0, { type: 'SET_GAME_DATE', date: '2026-03-15' });
    expect(s1.gameDate).toBe('2026-03-15');
    expect(s1.season).toBe(2026);
  });
  it('playing 이후엔 no-op', () => {
    const playing = { ...tennisInitialState, phase: 'playing', gameDate: '2026-08-12' };
    expect(tennisReducer(playing, { type: 'SET_GAME_DATE', date: '2026-03-15' })).toBe(playing);
  });
  it('빈/이상 날짜는 무시', () => {
    const s0 = { ...tennisInitialState, gameDate: '2026-08-12', season: 2026 };
    expect(tennisReducer(s0, { type: 'SET_GAME_DATE', date: '' })).toBe(s0);
  });
});
