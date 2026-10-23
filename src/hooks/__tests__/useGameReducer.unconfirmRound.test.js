import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

function withState(overrides) {
  return { ...initialState, ...overrides };
}

// 2026-10-23 구조 변경: 풋살 schedule 모드의 GK는 라이브든 확정이든 gksHistory['R{roundIdx}'] 하나에만 산다.
// 확정/확정취소는 "수정 가능 여부"를 가르는 상태 전환이지 GK를 옮기는 이사가 아니다.
describe('gameReducer — SET_ROUND_GK (라운드별 GK 단일 소스)', () => {
  it('라운드별로 따로 기록된다', () => {
    let s = withState({});
    s = gameReducer(s, { type: 'SET_ROUND_GK', roundIdx: 0, teamIdx: 0, player: '우상운' });
    s = gameReducer(s, { type: 'SET_ROUND_GK', roundIdx: 1, teamIdx: 0, player: '정보영' });
    expect(s.gksHistory.R0).toEqual({ 0: '우상운' });
    expect(s.gksHistory.R1).toEqual({ 0: '정보영' });
  });

  it('같은 라운드의 다른 팀은 독립적', () => {
    let s = withState({});
    s = gameReducer(s, { type: 'SET_ROUND_GK', roundIdx: 3, teamIdx: 0, player: '우상운' });
    s = gameReducer(s, { type: 'SET_ROUND_GK', roundIdx: 3, teamIdx: 1, player: '정보영' });
    expect(s.gksHistory.R3).toEqual({ 0: '우상운', 1: '정보영' });
  });

  it('player 가 null 이면 그 자리만 해제', () => {
    let s = withState({ gksHistory: { R3: { 0: '우상운', 1: '정보영' } } });
    s = gameReducer(s, { type: 'SET_ROUND_GK', roundIdx: 3, teamIdx: 0, player: null });
    expect(s.gksHistory.R3).toEqual({ 1: '정보영' });
  });

  it('전역 gks 는 건드리지 않는다 (혼합 모드의 free 라운드 GK 보호)', () => {
    const s = withState({ gks: { 0: 'FREE_GK' } });
    const next = gameReducer(s, { type: 'SET_ROUND_GK', roundIdx: 0, teamIdx: 0, player: '우상운' });
    expect(next.gks).toEqual({ 0: 'FREE_GK' });
  });
});

describe('gameReducer — CONFIRM_ROUND / UNCONFIRM_ROUND 의 GK 취급', () => {
  const schedule9 = Array.from({ length: 9 }, () => ({ matches: [[0, 1]] }));

  it('확정취소는 GK를 건드리지 않는다 — 라운드별 기록이 그대로 남는다', () => {
    const confirmedRounds = {}; const gksHistory = {};
    for (let i = 0; i < 9; i++) { confirmedRounds[i] = true; gksHistory[`R${i}`] = { 0: `GK${i}a`, 1: `GK${i}b` }; }
    const state = withState({
      schedule: schedule9, confirmedRounds, gksHistory, gks: {},
      completedMatches: Array.from({ length: 9 }, (_, i) => ({ matchId: `R${i + 1}_C0`, homeIdx: 0, awayIdx: 1 })),
      currentRoundIdx: 9,
    });
    const next = gameReducer(state, { type: 'UNCONFIRM_ROUND', roundIdx: 6 });
    expect(next.gksHistory.R6).toEqual({ 0: 'GK6a', 1: 'GK6b' });
    expect(next.confirmedRounds[6]).toBeUndefined();
    expect(next.confirmedRounds[7]).toBe(true);
  });

  it('여러 라운드를 동시에 취소해도 각 라운드 GK가 섞이지 않는다', () => {
    const confirmedRounds = {}; const gksHistory = {};
    for (let i = 0; i < 9; i++) { confirmedRounds[i] = true; gksHistory[`R${i}`] = { 0: `GK${i}a` }; }
    let s = withState({
      schedule: schedule9, confirmedRounds, gksHistory, gks: {},
      completedMatches: Array.from({ length: 9 }, (_, i) => ({ matchId: `R${i + 1}_C0`, homeIdx: 0, awayIdx: 1 })),
      currentRoundIdx: 9,
    });
    s = gameReducer(s, { type: 'UNCONFIRM_ROUND', roundIdx: 6 });
    s = gameReducer(s, { type: 'UNCONFIRM_ROUND', roundIdx: 3 });
    expect(s.gksHistory.R6).toEqual({ 0: 'GK6a' });
    expect(s.gksHistory.R3).toEqual({ 0: 'GK3a' });
  });

  it('진행 중 라운드의 라이브 gks 도 덮어쓰지 않는다', () => {
    const state = withState({
      schedule: [{ matches: [[0, 1]] }, { matches: [[2, 3]] }, { matches: [[0, 2]] }],
      confirmedRounds: { 0: true, 1: true },
      gksHistory: { R0: { 0: 'A' }, R1: { 1: 'B' } },
      gks: { 0: 'LIVE' },
      completedMatches: [
        { matchId: 'R1_C0', homeIdx: 0, awayIdx: 1 },
        { matchId: 'R2_C0', homeIdx: 2, awayIdx: 3 },
      ],
      currentRoundIdx: 2,
    });
    const next = gameReducer(state, { type: 'UNCONFIRM_ROUND', roundIdx: 0 });
    expect(next.gks).toEqual({ 0: 'LIVE' });
    expect(next.gksHistory.R0).toEqual({ 0: 'A' });
    expect(next.currentRoundIdx).toBe(2);
  });

  it('확정은 이미 기록된 라운드 GK를 그대로 둔다', () => {
    const state = withState({
      schedule: [{ matches: [[0, 1]] }, { matches: [[0, 1]] }],
      gksHistory: { R0: { 0: '우상운', 1: '정보영' } },
      gks: {}, currentRoundIdx: 0,
    });
    const next = gameReducer(state, {
      type: 'CONFIRM_ROUND', roundIdx: 0, nextRoundIdx: 1,
      matchResults: [{ matchId: 'R1_C0', homeIdx: 0, awayIdx: 1, homeGk: '우상운', awayGk: '정보영' }],
    });
    expect(next.gksHistory.R0).toEqual({ 0: '우상운', 1: '정보영' });
  });

  it('구버전 세션: 라운드 기록이 없으면 확정 시 전역 gks 를 그 라운드로 승격', () => {
    const state = withState({
      schedule: [{ matches: [[0, 1]] }, { matches: [[0, 1]] }],
      gksHistory: {}, gks: { 0: '우상운', 1: '정보영' }, currentRoundIdx: 0,
    });
    const next = gameReducer(state, {
      type: 'CONFIRM_ROUND', roundIdx: 0, nextRoundIdx: 1,
      matchResults: [{ matchId: 'R1_C0', homeIdx: 0, awayIdx: 1, homeGk: '우상운', awayGk: '정보영' }],
    });
    expect(next.gksHistory.R0).toEqual({ 0: '우상운', 1: '정보영' });
    expect(next.gks).toEqual({});   // 전역 칸은 비워 다음 라운드로 새지 않게
  });
});

describe('gameReducer — UNCONFIRM_ROUND 나머지 동작', () => {
  it('8팀 스플릿: 전반 라운드 취소 시 후반 스케줄 제거 + splitPhase=first 복귀', () => {
    const fullSchedule = Array.from({ length: 12 }, () => ({ matches: [[0, 1], [4, 5]] }));
    const state = withState({
      teamCount: 8, courtCount: 2, matchMode: 'schedule',
      splitPhase: 'second',
      schedule: fullSchedule,
      confirmedRounds: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true },
      gksHistory: {}, completedMatches: [], currentRoundIdx: 6,
    });
    const next = gameReducer(state, { type: 'UNCONFIRM_ROUND', roundIdx: 5 });
    expect(next.splitPhase).toBe('first');
    expect(next.schedule).toHaveLength(6);
  });

  it('8팀 스플릿: 후반 라운드 취소는 splitPhase/스케줄 유지 (후반 중복 재생성 방지)', () => {
    const fullSchedule = Array.from({ length: 12 }, () => ({ matches: [[0, 1], [4, 5]] }));
    const state = withState({
      teamCount: 8, courtCount: 2, matchMode: 'schedule',
      splitPhase: 'second',
      schedule: fullSchedule,
      confirmedRounds: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true },
      gksHistory: {}, completedMatches: [], currentRoundIdx: 7,
    });
    const next = gameReducer(state, { type: 'UNCONFIRM_ROUND', roundIdx: 6 });
    expect(next.splitPhase).toBe('second');
    expect(next.schedule).toHaveLength(12);
  });

  it('matchId 없는 completedMatches 항목이 있어도 크래시하지 않음', () => {
    // RTDB partial write 등으로 matchId가 빠진 항목이 동기화될 수 있음
    const state = withState({
      schedule: [{ matches: [[0, 1]] }],
      confirmedRounds: { 0: true },
      gksHistory: { 0: {} },
      completedMatches: [
        { homeIdx: 0, awayIdx: 1 },
        { matchId: 'R1_C0', homeIdx: 0, awayIdx: 1 },
      ],
    });
    expect(() => gameReducer(state, { type: 'UNCONFIRM_ROUND', roundIdx: 0 })).not.toThrow();
    const next = gameReducer(state, { type: 'UNCONFIRM_ROUND', roundIdx: 0 });
    expect(next.completedMatches).toEqual([{ homeIdx: 0, awayIdx: 1 }]);
  });

  it('취소한 라운드의 용병·휴식은 라이브로 복원된다', () => {
    const state = withState({
      schedule: [{ matches: [[0, 1]] }],
      confirmedRounds: { 0: true },
      gksHistory: { R0: { 0: 'A' } },
      completedMatches: [{
        matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
        mercenaries: [{ player: '용병', teamIdx: 0 }],
        homeAbsent: ['쉰사람'], awayAbsent: [],
      }],
      currentRoundIdx: 1,
    });
    const next = gameReducer(state, { type: 'UNCONFIRM_ROUND', roundIdx: 0 });
    expect(next.liveMercs['R1_C0']).toEqual([{ player: '용병', teamIdx: 0 }]);
    expect(next.absentees['R1_C0']).toEqual({ 0: ['쉰사람'] });
  });
});
