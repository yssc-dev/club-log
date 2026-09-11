import { describe, it, expect } from 'vitest';
import { formationFingerprint, decideRemount } from '../liveSync';

const base = {
  formation: '4-4-2', gk: 'a1',
  assignments: { 0: 'a1', 1: 'a2', 10: 'a11' },
  positionMap: { a1: 'GK', a2: 'DF', a11: 'FW' },
  subs: ['a12', 'a13'],
  events: [{ id: 'e1', type: 'goal', player: 'a11' }],
};

describe('formationFingerprint', () => {
  it('같은 배치는 키 삽입 순서·subs 순서와 무관하게 같은 지문', () => {
    const shuffled = {
      subs: ['a13', 'a12'],
      positionMap: { a11: 'FW', a1: 'GK', a2: 'DF' },
      assignments: { 10: 'a11', 1: 'a2', 0: 'a1' },
      gk: 'a1', formation: '4-4-2',
      events: [],                                  // events 는 지문에 영향 없음
    };
    expect(formationFingerprint(shuffled)).toBe(formationFingerprint(base));
  });
  it('슬롯 번호는 숫자 순서로 정렬한다(문자열 정렬이면 10 이 2 앞에 온다)', () => {
    const a = formationFingerprint({ ...base, assignments: { 0: 'a1', 1: 'a2', 10: 'a11' } });
    const b = formationFingerprint({ ...base, assignments: { 0: 'a1', 10: 'a11', 1: 'a2' } });
    expect(a).toBe(b);
  });
  it('배치 한 곳만 달라도 지문이 다르다', () => {
    expect(formationFingerprint({ ...base, gk: 'a2' })).not.toBe(formationFingerprint(base));
    expect(formationFingerprint({ ...base, formation: '4-3-3' })).not.toBe(formationFingerprint(base));
    expect(formationFingerprint({ ...base, assignments: { ...base.assignments, 1: 'a9' } })).not.toBe(formationFingerprint(base));
    expect(formationFingerprint({ ...base, positionMap: { ...base.positionMap, a2: 'MF' } })).not.toBe(formationFingerprint(base));
    expect(formationFingerprint({ ...base, subs: ['a12'] })).not.toBe(formationFingerprint(base));
  });
  it('이벤트만 바뀌면 지문은 같다(재마운트 금지 — 진행 중 입력 보호)', () => {
    expect(formationFingerprint({ ...base, events: [{ id: 'x', type: 'goal', player: 'a2' }] }))
      .toBe(formationFingerprint(base));
  });
  it('누락·null·빈 객체도 던지지 않고 안정적인 지문을 만든다', () => {
    expect(typeof formationFingerprint({})).toBe('string');
    expect(formationFingerprint({ assignments: null, positionMap: null, subs: null }))
      .toBe(formationFingerprint({}));
    expect(typeof formationFingerprint(null)).toBe('string');
  });
});

describe('decideRemount', () => {
  const S = (...xs) => new Set(xs);
  it('① 시드와 같으면 아무것도 안 하고 보류도 해제', () => {
    expect(decideRemount({ currentFp: 'fp1', seedFp: 'fp1', localFps: S('fp9'), busy: true }))
      .toEqual({ remount: false, pending: false, consume: null });
  });
  it('② 내 변경 echo 는 재마운트하지 않고 1회 소비한다', () => {
    expect(decideRemount({ currentFp: 'fp2', seedFp: 'fp1', localFps: S('fp2', 'fp3'), busy: false }))
      .toEqual({ remount: false, pending: false, consume: 'fp2' });
  });
  it('③ 입력 중이면 보류', () => {
    expect(decideRemount({ currentFp: 'fpX', seedFp: 'fp1', localFps: S(), busy: true }))
      .toEqual({ remount: false, pending: true, consume: null });
  });
  it('④ 입력 중이 아니면 재마운트', () => {
    expect(decideRemount({ currentFp: 'fpX', seedFp: 'fp1', localFps: S(), busy: false }))
      .toEqual({ remount: true, pending: false, consume: null });
  });
  it('연속 두 변경: 두 지문이 모두 Set 에 있어 어느 echo 가 먼저 와도 오인하지 않는다', () => {
    const set = S('fp2', 'fp3');
    const first = decideRemount({ currentFp: 'fp2', seedFp: 'fp1', localFps: set, busy: false });
    expect(first.remount).toBe(false);
    set.delete(first.consume);
    const second = decideRemount({ currentFp: 'fp3', seedFp: 'fp1', localFps: set, busy: false });
    expect(second).toEqual({ remount: false, pending: false, consume: 'fp3' });
  });
  it('같은 지문으로 두 번 억제되지 않는다(소비 후 남이 되돌리면 원격 변경으로 본다)', () => {
    const set = S('fp2');
    set.delete(decideRemount({ currentFp: 'fp2', seedFp: 'fp1', localFps: set, busy: false }).consume);
    expect(decideRemount({ currentFp: 'fp2', seedFp: 'fp1', localFps: set, busy: false }).remount).toBe(true);
  });
  it('localFps 미전달도 안전', () => {
    expect(decideRemount({ currentFp: 'fpX', seedFp: 'fp1', busy: false }).remount).toBe(true);
  });
});
