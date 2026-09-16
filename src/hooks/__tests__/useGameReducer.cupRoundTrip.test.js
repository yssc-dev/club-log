// src/hooks/__tests__/useGameReducer.cupRoundTrip.test.js
// 스펙 §4.1 왕복 테스트 — RTDB meta → reconstructState → RESTORE_STATE 를 거쳐도 컵 판별이 유지돼야
// 재접속 후 정규 마감 경로로 흘러가 포인트 로그가 오염되는 사고가 없다.
import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';
import { reconstructState } from '../../services/firebaseSyncDiff';
import { isCupSession } from '../../utils/cup/cupSession';

describe('tournamentId 왕복 (reconstructState → RESTORE_STATE)', () => {
  it('initialState 는 정규 세션(빈 문자열)', () => {
    expect(initialState.tournamentId).toBe('');
    expect(isCupSession(initialState)).toBe(false);
  });

  it('meta.tournamentId 가 있으면 복원 후에도 컵 세션', () => {
    const raw = { meta: { phase: 'match', tournamentId: '마스터스컵 2026' } };
    const restored = gameReducer(initialState, { type: 'RESTORE_STATE', state: reconstructState('g_1', raw) });
    expect(restored.tournamentId).toBe('마스터스컵 2026');
    expect(isCupSession(restored)).toBe(true);
  });

  it('meta 에 tournamentId 가 없으면 정규 세션으로 복원', () => {
    const cupState = { ...initialState, tournamentId: '마스터스컵 2026' };
    const restored = gameReducer(cupState, { type: 'RESTORE_STATE', state: reconstructState('g_1', { meta: { phase: 'match' } }) });
    // reconstructState 가 '' 를 돌려주고 RESTORE_STATE 가 != null 로 받아들여 정규로 돌아간다
    expect(restored.tournamentId).toBe('');
    expect(isCupSession(restored)).toBe(false);
  });
});
