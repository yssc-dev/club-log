import { describe, it, expect } from 'vitest';
import { isRoundComplete, unfinishedCourtLabels, allRoundsConfirmed, isLastRoundConfirmed, canDeleteRound } from '../roundConfirm';

const done = (courtId) => ({ courtId, status: 'done' });
const ready = (courtId) => ({ courtId, status: 'ready' });
const playing = (courtId) => ({ courtId, status: 'playing' });

describe('isRoundComplete / unfinishedCourtLabels', () => {
  it('전 코트 done이면 완료', () => {
    expect(isRoundComplete({ roundIdx: 1, courts: [done(1), done(2)] })).toBe(true);
    expect(unfinishedCourtLabels({ roundIdx: 1, courts: [done(1), done(2)] })).toEqual([]);
  });
  it('배치 중/진행 중 코트가 있으면 미완료 + 라벨', () => {
    const r = { roundIdx: 1, courts: [done(1), ready(4), playing(2)] };
    expect(isRoundComplete(r)).toBe(false);
    expect(unfinishedCourtLabels(r)).toEqual(['C4', 'C2']);
  });
  it('코트 0개 라운드는 미완료', () => {
    expect(isRoundComplete({ roundIdx: 1, courts: [] })).toBe(false);
  });
});

describe('allRoundsConfirmed / isLastRoundConfirmed', () => {
  const rounds = [{ roundIdx: 1, courts: [done(1)] }, { roundIdx: 2, courts: [done(1)] }];
  it('전 라운드 확정이어야 true, 라운드 0개면 false', () => {
    expect(allRoundsConfirmed(rounds, { 1: true, 2: true })).toBe(true);
    expect(allRoundsConfirmed(rounds, { 1: true })).toBe(false);
    expect(allRoundsConfirmed([], {})).toBe(false);
  });
  it('마지막 라운드 확정 여부', () => {
    expect(isLastRoundConfirmed(rounds, { 2: true })).toBe(true);
    expect(isLastRoundConfirmed(rounds, { 1: true })).toBe(false);
    expect(isLastRoundConfirmed([], {})).toBe(false);
  });
});

describe('canDeleteRound', () => {
  const rounds = [{ roundIdx: 1, courts: [done(1)] }, { roundIdx: 2, courts: [ready(1)] }];
  it('마지막 라운드가 미확정이면 삭제 가능 — 기록(진행/완료 코트)이 있어도 허용', () => {
    expect(canDeleteRound(rounds, { 1: true }, 2, 'playing')).toBe(true);
    const withRecord = [rounds[0], { roundIdx: 2, courts: [done(1), playing(2)] }];
    expect(canDeleteRound(withRecord, { 1: true }, 2, 'playing')).toBe(true);
  });
  it('중간 라운드는 삭제 불가', () => {
    expect(canDeleteRound(rounds, {}, 1, 'playing')).toBe(false);
  });
  it('확정된 라운드는 삭제 불가 — 확정취소가 먼저', () => {
    expect(canDeleteRound(rounds, { 1: true, 2: true }, 2, 'playing')).toBe(false);
  });
  it('라운드가 1개뿐이면 삭제 불가 — 전부 지우려면 경기삭제', () => {
    expect(canDeleteRound([rounds[0]], {}, 1, 'playing')).toBe(false);
  });
  it('마감 완료(done) 경기는 삭제 불가', () => {
    expect(canDeleteRound(rounds, { 1: true }, 2, 'done')).toBe(false);
  });
  it('없는 라운드/빈 입력은 false', () => {
    expect(canDeleteRound(rounds, {}, 9, 'playing')).toBe(false);
    expect(canDeleteRound([], {}, 1, 'playing')).toBe(false);
  });
});
