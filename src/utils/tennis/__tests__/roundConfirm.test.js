import { describe, it, expect } from 'vitest';
import { isRoundComplete, unfinishedCourtLabels, allRoundsConfirmed, isLastRoundConfirmed } from '../roundConfirm';

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
