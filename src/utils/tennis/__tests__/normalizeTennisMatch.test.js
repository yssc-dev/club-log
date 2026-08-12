import { describe, it, expect } from 'vitest';
import { normalizeTennisCourt, normalizeTennisMatch, normalizeScoringRules } from '../normalizeTennisMatch';

describe('normalizeTennisCourt', () => {
  it('undefined 배열 필드를 빈 배열로 되살린다', () => {
    const c = normalizeTennisCourt({ courtId: 1 });
    expect(c.sideA).toEqual([]);
    expect(c.sideB).toEqual([]);
    expect(c.sets).toEqual([]);
    expect(c.undoStack).toEqual([]);
    expect(c.stats).toEqual({});
  });

  it('객체로 변환된 배열을 배열로 되돌린다', () => {
    const c = normalizeTennisCourt({
      courtId: 1,
      sideA: { 0: '박성언', 1: '기다빈' },
      sets: { 0: { a: 6, b: 3 } },
    });
    expect(c.sideA).toEqual(['박성언', '기다빈']);
    expect(c.sets).toEqual([{ a: 6, b: 3, tbA: 0, tbB: 0, done: false }]);
  });

  it('세트 안의 누락 필드도 채운다', () => {
    const c = normalizeTennisCourt({ courtId: 1, sets: [{ a: 6 }] });
    expect(c.sets[0]).toEqual({ a: 6, b: 0, tbA: 0, tbB: 0, done: false });
  });

  it('기본값 — 단식 · 1세트 · ready', () => {
    const c = normalizeTennisCourt({ courtId: 2 });
    expect(c.format).toBe('단식');
    expect(c.bestOf).toBe(1);
    expect(c.status).toBe('ready');
    expect(c.currentSet).toBe(0);
  });

  it('기존 값은 덮어쓰지 않는다', () => {
    const c = normalizeTennisCourt({ courtId: 2, format: '복식', bestOf: 3, status: 'playing', currentSet: 2 });
    expect(c).toMatchObject({ format: '복식', bestOf: 3, status: 'playing', currentSet: 2 });
  });
});

describe('normalizeTennisMatch', () => {
  it('null이면 null', () => {
    expect(normalizeTennisMatch(null)).toBeNull();
  });

  it('rounds/attendees/guests가 통째로 사라진 경우를 복원한다', () => {
    const s = normalizeTennisMatch({ gameId: 'g_1', team: '몽피스' });
    expect(s.rounds).toEqual([]);
    expect(s.attendees).toEqual([]);
    expect(s.guests).toEqual([]);
  });

  it('rounds가 객체여도 배열로 만들고 roundIdx 순으로 정렬한다', () => {
    const s = normalizeTennisMatch({
      rounds: { 1: { roundIdx: 2, courts: [{ courtId: 1 }] }, 0: { roundIdx: 1, courts: [] } },
    });
    expect(s.rounds.map(r => r.roundIdx)).toEqual([1, 2]);
    expect(s.rounds[1].courts[0].sideA).toEqual([]);
  });

  it('courts가 사라진 라운드도 빈 배열이 된다', () => {
    const s = normalizeTennisMatch({ rounds: [{ roundIdx: 1 }] });
    expect(s.rounds[0].courts).toEqual([]);
  });

  it('중첩 코트까지 정규화한다', () => {
    const s = normalizeTennisMatch({
      rounds: [{ roundIdx: 1, courts: { 0: { courtId: 1, sideB: { 0: '김성환' } } } }],
    });
    expect(s.rounds[0].courts[0].sideB).toEqual(['김성환']);
    expect(s.rounds[0].courts[0].sets).toEqual([]);
  });
});

describe('scoringRules 보정', () => {
  it('없으면 기본값(7point, false)', () => {
    expect(normalizeTennisMatch({ rounds: [] }).scoringRules)
      .toEqual({ tiebreakMode: '7point', acesDfAffectScore: false });
  });
  it('부분/이상 값은 정규화', () => {
    expect(normalizeTennisMatch({ rounds: [], scoringRules: { tiebreakMode: '1point' } }).scoringRules)
      .toEqual({ tiebreakMode: '1point', acesDfAffectScore: false });
    expect(normalizeTennisMatch({ rounds: [], scoringRules: { tiebreakMode: 'xxx', acesDfAffectScore: true } }).scoringRules)
      .toEqual({ tiebreakMode: '7point', acesDfAffectScore: true });
  });
});

describe('confirmedRounds 보정', () => {
  it('없으면 {} — 기존 진행 경기 하위 호환', () => {
    expect(normalizeTennisMatch({ rounds: [] }).confirmedRounds).toEqual({});
  });
  it('RTDB가 배열로 되돌려도 객체로 복원한다', () => {
    // roundIdx가 1부터라 RTDB는 [null, true, true]로 저장할 수 있다
    const out = normalizeTennisMatch({ rounds: [], confirmedRounds: [null, true, true] });
    expect(out.confirmedRounds).toEqual({ 1: true, 2: true });
  });
  it('객체는 true 값만 유지한다', () => {
    const out = normalizeTennisMatch({ rounds: [], confirmedRounds: { 1: true, 2: false, 3: 'x' } });
    expect(out.confirmedRounds).toEqual({ 1: true });
  });
});
