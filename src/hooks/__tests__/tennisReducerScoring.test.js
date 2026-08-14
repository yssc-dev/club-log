import { describe, it, expect } from 'vitest';
import { tennisReducer, tennisInitialState } from '../useTennisReducer';

const playingCourt = (over = {}) => ({
  courtId: 1, format: '단식', bestOf: 1, status: 'playing', currentSet: 0,
  sideA: ['갑'], sideB: ['을'], sets: [{ a: 2, b: 1, tbA: 0, tbB: 0, done: false }],
  stats: {}, undoStack: [], ...over,
});
const base = (rules, courtOver) => ({
  ...tennisInitialState, phase: 'playing', scoringRules: rules,
  rounds: [{ roundIdx: 1, courts: [playingCourt(courtOver)] }],
});
const court0 = (s) => s.rounds[0].courts[0];

describe('SET_SCORING_RULES', () => {
  it('setup에서만 변경, 이후 무시', () => {
    const s0 = { ...tennisInitialState }; // phase 'setup'
    const s1 = tennisReducer(s0, { type: 'SET_SCORING_RULES', rules: { tiebreakMode: '1point', acesDfAffectScore: true } });
    expect(s1.scoringRules).toEqual({ tiebreakMode: '1point', acesDfAffectScore: true });
    const playing = { ...s1, phase: 'playing' };
    expect(tennisReducer(playing, { type: 'SET_SCORING_RULES', rules: { tiebreakMode: '7point', acesDfAffectScore: false } })).toBe(playing);
  });
});

describe('INCREMENT_STAT 스코어 반영', () => {
  it('acesDfAffectScore=false: stats만 (기존)', () => {
    const s = tennisReducer(base({ tiebreakMode: '7point', acesDfAffectScore: false }),
      { type: 'INCREMENT_STAT', roundIdx: 1, courtId: 1, player: '갑', stat: 'aces' });
    expect(court0(s).stats['갑'].aces).toBe(1);
    expect(court0(s).sets[0]).toMatchObject({ a: 2, b: 1 }); // 점수 불변
  });
  it('true: 에이스=서버편 게임 +1', () => {
    const s = tennisReducer(base({ tiebreakMode: '7point', acesDfAffectScore: true }),
      { type: 'INCREMENT_STAT', roundIdx: 1, courtId: 1, player: '갑', stat: 'aces' });
    expect(court0(s).stats['갑'].aces).toBe(1);
    expect(court0(s).sets[0]).toMatchObject({ a: 3, b: 1 }); // 갑=sideA → a+1
  });
  it('true: DF=상대편 게임 +1', () => {
    const s = tennisReducer(base({ tiebreakMode: '7point', acesDfAffectScore: true }),
      { type: 'INCREMENT_STAT', roundIdx: 1, courtId: 1, player: '갑', stat: 'df' });
    expect(court0(s).sets[0]).toMatchObject({ a: 2, b: 2 }); // 갑 DF → 상대 b+1
  });
  it('노에드7 5:5에서도 에이스가 게임에 반영(타이브레이크 폐지)', () => {
    const s = tennisReducer(base({ tiebreakMode: '7point', acesDfAffectScore: true }, { sets: [{ a: 5, b: 5, tbA: 0, tbB: 0, done: false }] }),
      { type: 'INCREMENT_STAT', roundIdx: 1, courtId: 1, player: '갑', stat: 'aces' });
    expect(court0(s).stats['갑'].aces).toBe(1);
    expect(court0(s).sets[0]).toMatchObject({ a: 6, b: 5 }); // 5:5→6:5 (에이스=서버측, 이제 5:5도 반영)
  });
  it('UNDO: 스코어 반영분도 함께 되돌림', () => {
    const s1 = tennisReducer(base({ tiebreakMode: '7point', acesDfAffectScore: true }),
      { type: 'INCREMENT_STAT', roundIdx: 1, courtId: 1, player: '갑', stat: 'aces' });
    const s2 = tennisReducer(s1, { type: 'UNDO', roundIdx: 1, courtId: 1 });
    expect(court0(s2).stats['갑'].aces).toBe(0);
    expect(court0(s2).sets[0]).toMatchObject({ a: 2, b: 1 }); // 게임도 원복
  });
});

describe('INCREMENT_GAME 1point 모드', () => {
  it('1점 모드: 5:5에서 게임+1 → 6:5 세트승(TB 액션 없이)', () => {
    const st = base({ tiebreakMode: '1point', acesDfAffectScore: false }, { sets: [{ a: 5, b: 5, tbA: 0, tbB: 0, done: false }] });
    const s = tennisReducer(st, { type: 'INCREMENT_GAME', roundIdx: 1, courtId: 1, side: 'A' });
    expect(court0(s).sets[0]).toMatchObject({ a: 6, b: 5 });
  });
  it('1점 모드: INCREMENT_GAME 6:5 → UNDO → 5:5 복원', () => {
    const st = base({ tiebreakMode: '1point', acesDfAffectScore: false }, { sets: [{ a: 5, b: 5, tbA: 0, tbB: 0, done: false }] });
    const s1 = tennisReducer(st, { type: 'INCREMENT_GAME', roundIdx: 1, courtId: 1, side: 'A' });
    const s2 = tennisReducer(s1, { type: 'UNDO', roundIdx: 1, courtId: 1 });
    expect(court0(s2).sets[0]).toMatchObject({ a: 5, b: 5 });
  });
});
