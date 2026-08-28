import { describe, it, expect } from 'vitest';
import { tennisReducer, tennisInitialState } from '../useTennisReducer';

const doneCourt = (courtId) => ({
  courtId, format: '단식', bestOf: 1, status: 'done', currentSet: 0,
  sideA: ['갑'], sideB: ['을'], sets: [{ a: 6, b: 4, tbA: 0, tbB: 0, done: true }],
  stats: {}, undoStack: [{ kind: 'endSet', setIdx: 0, endedMatch: true }],
});
const base = {
  ...tennisInitialState, phase: 'playing',
  rounds: [{ roundIdx: 1, courts: [doneCourt(1)] }],
};

describe('CONFIRM_ROUND / UNCONFIRM_ROUND', () => {
  it('전 코트 done이면 확정된다', () => {
    const s = tennisReducer(base, { type: 'CONFIRM_ROUND', roundIdx: 1 });
    expect(s.confirmedRounds).toEqual({ 1: true });
  });
  it('미완료 코트가 있으면 no-op', () => {
    const withReady = { ...base, rounds: [{ roundIdx: 1, courts: [doneCourt(1), { ...doneCourt(4), status: 'ready' }] }] };
    expect(tennisReducer(withReady, { type: 'CONFIRM_ROUND', roundIdx: 1 })).toBe(withReady);
  });
  it('확정취소는 키만 지운다', () => {
    const s1 = tennisReducer(base, { type: 'CONFIRM_ROUND', roundIdx: 1 });
    const s2 = tennisReducer(s1, { type: 'UNCONFIRM_ROUND', roundIdx: 1 });
    expect(s2.confirmedRounds).toEqual({});
    expect(s2.rounds).toEqual(s1.rounds); // 코트 데이터는 그대로 — 풋살식 스냅샷 이동 없음
  });
});

describe('확정 라운드 편집 차단 (리듀서 레벨)', () => {
  const confirmed = tennisReducer(base, { type: 'CONFIRM_ROUND', roundIdx: 1 });
  it.each([
    ['UNDO', { type: 'UNDO', roundIdx: 1, courtId: 1 }],
    ['EDIT_COURT_SETTINGS', { type: 'EDIT_COURT_SETTINGS', roundIdx: 1, courtId: 1 }],
    ['ADD_COURT', { type: 'ADD_COURT', roundIdx: 1 }],
    ['DELETE_COURT', { type: 'DELETE_COURT', roundIdx: 1, courtId: 1 }],
    ['INCREMENT_GAME', { type: 'INCREMENT_GAME', roundIdx: 1, courtId: 1, side: 'A' }],
    ['EXTEND_TO_THREE_SETS', { type: 'EXTEND_TO_THREE_SETS', roundIdx: 1, courtId: 1 }],
  ])('%s는 확정 라운드에서 no-op', (_name, action) => {
    expect(tennisReducer(confirmed, action)).toBe(confirmed);
  });
  it('확정취소 후에는 다시 편집된다', () => {
    const reopened = tennisReducer(confirmed, { type: 'UNCONFIRM_ROUND', roundIdx: 1 });
    const undone = tennisReducer(reopened, { type: 'UNDO', roundIdx: 1, courtId: 1 });
    expect(undone.rounds[0].courts[0].status).toBe('playing');
  });
});

describe('SET_PHASE', () => {
  const confirmed = tennisReducer(base, { type: 'CONFIRM_ROUND', roundIdx: 1 });
  it('playing↔summary만 허용', () => {
    const s = tennisReducer(confirmed, { type: 'SET_PHASE', phase: 'summary' });
    expect(s.phase).toBe('summary');
    expect(tennisReducer(s, { type: 'SET_PHASE', phase: 'playing' }).phase).toBe('playing');
    expect(tennisReducer(s, { type: 'SET_PHASE', phase: 'done' })).toBe(s); // 화이트리스트 밖 no-op
  });
  it('마감(summary)은 전 라운드 확정이 필수 — 미확정 라운드가 있으면 no-op', () => {
    expect(tennisReducer(base, { type: 'SET_PHASE', phase: 'summary' })).toBe(base);
    const twoRounds = {
      ...confirmed,
      rounds: [...confirmed.rounds, { roundIdx: 2, courts: [doneCourt(1)] }],
    };
    expect(tennisReducer(twoRounds, { type: 'SET_PHASE', phase: 'summary' })).toBe(twoRounds);
  });
  it('라운드가 없으면 마감 불가', () => {
    const empty = { ...base, rounds: [] };
    expect(tennisReducer(empty, { type: 'SET_PHASE', phase: 'summary' })).toBe(empty);
  });
  it('done(전송 완료)에서는 어느 phase로도 되돌리지 않는다', () => {
    const done = tennisReducer(confirmed, { type: 'FINALIZE' });
    expect(done.phase).toBe('done');
    expect(tennisReducer(done, { type: 'SET_PHASE', phase: 'playing' })).toBe(done);
    expect(tennisReducer(done, { type: 'SET_PHASE', phase: 'summary' })).toBe(done);
  });
});

describe('마감 상태(summary)에서의 편집', () => {
  const closed = tennisReducer(
    tennisReducer(base, { type: 'CONFIRM_ROUND', roundIdx: 1 }),
    { type: 'SET_PHASE', phase: 'summary' });

  it('확정취소는 마감을 자동 해제한다 (phase → playing, 키 삭제)', () => {
    expect(closed.phase).toBe('summary');
    const s = tennisReducer(closed, { type: 'UNCONFIRM_ROUND', roundIdx: 1 });
    expect(s.phase).toBe('playing');
    expect(s.confirmedRounds).toEqual({});
    expect(s.rounds).toEqual(closed.rounds);
  });
  it('playing 상태의 확정취소는 phase를 건드리지 않는다', () => {
    const confirmedPlaying = tennisReducer(base, { type: 'CONFIRM_ROUND', roundIdx: 1 });
    const s = tennisReducer(confirmedPlaying, { type: 'UNCONFIRM_ROUND', roundIdx: 1 });
    expect(s.phase).toBe('playing');
  });
  it('마감 상태에서도 참석자 추가는 허용된다 (기록 불변식과 무관)', () => {
    const s = tennisReducer(closed, { type: 'ADD_ATTENDEE', name: '병', isGuest: false });
    expect(s.attendees).toContain('병');
    expect(s.phase).toBe('summary');
  });
  it('확정취소로 마감을 풀면 코트를 다시 편집할 수 있다', () => {
    const reopened = tennisReducer(closed, { type: 'UNCONFIRM_ROUND', roundIdx: 1 });
    const undone = tennisReducer(reopened, { type: 'UNDO', roundIdx: 1, courtId: 1 });
    expect(undone.rounds[0].courts[0].status).toBe('playing');
  });
  it('확정취소 후 다시 확정하면 재마감할 수 있다', () => {
    const reopened = tennisReducer(closed, { type: 'UNCONFIRM_ROUND', roundIdx: 1 });
    const reconfirmed = tennisReducer(reopened, { type: 'CONFIRM_ROUND', roundIdx: 1 });
    expect(tennisReducer(reconfirmed, { type: 'SET_PHASE', phase: 'summary' }).phase).toBe('summary');
  });
});
