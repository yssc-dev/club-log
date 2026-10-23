import { describe, it, expect } from 'vitest';
import { resolveRoundGks, roundGkKey } from '../roundGks';

describe('resolveRoundGks', () => {
  it('라운드별 GK가 있으면 확정 여부와 무관하게 그것을 쓴다', () => {
    const s = { gksHistory: { R6: { 0: '우상운', 1: '정보영' } }, gks: { 0: '다른사람' }, currentRoundIdx: 8 };
    expect(resolveRoundGks(s, 6)).toEqual({ 0: '우상운', 1: '정보영' });
  });

  it('미확정 라운드가 둘이어도 서로 섞이지 않는다', () => {
    const s = { gksHistory: { R2: { 0: 'A' }, R5: { 0: 'B' } }, gks: {}, currentRoundIdx: 8 };
    expect(resolveRoundGks(s, 2)).toEqual({ 0: 'A' });
    expect(resolveRoundGks(s, 5)).toEqual({ 0: 'B' });
  });

  it('기록이 없는 라운드는 빈 객체 (다른 라운드 GK가 새지 않는다)', () => {
    const s = { gksHistory: { R0: { 0: 'A' } }, gks: { 1: 'LIVE' }, currentRoundIdx: 3 };
    expect(resolveRoundGks(s, 1)).toEqual({});
  });

  it('혼합 모드: free 매치가 쓰는 숫자 키를 미확정 schedule 라운드가 끌어오지 않는다', () => {
    // 자유 3매치 완료 → gksHistory[0..2] 는 free 몫. 그 상태로 자동 대진 R1(=idx 0) 진행 중.
    const s = {
      gksHistory: { 0: { 0: 'FREE_GK' }, 1: { 0: 'FREE_GK2' } },
      gks: {}, confirmedRounds: {}, currentRoundIdx: 0,
    };
    expect(resolveRoundGks(s, 0)).toEqual({});
    expect(resolveRoundGks(s, 1)).toEqual({});
  });

  it('구버전: 이 배포 전에 확정된 라운드는 숫자 키에서 읽는다', () => {
    const s = { gksHistory: { 6: { 0: '우상운' } }, confirmedRounds: { 6: true }, gks: {}, currentRoundIdx: 9 };
    expect(resolveRoundGks(s, 6)).toEqual({ 0: '우상운' });
  });

  it('구버전 진행 중 세션: 현재 라운드만 전역 gks로 폴백', () => {
    const s = { gksHistory: {}, gks: { 0: '우상운' }, currentRoundIdx: 3 };
    expect(resolveRoundGks(s, 3)).toEqual({ 0: '우상운' });
    expect(resolveRoundGks(s, 2)).toEqual({});
  });

  it('빈 state·빈 인자에도 안전', () => {
    expect(resolveRoundGks(null, 0)).toEqual({});
    expect(resolveRoundGks({}, 0)).toEqual({});
    expect(resolveRoundGks({ gksHistory: { R0: { 0: 'A' } } }, null)).toEqual({});
  });

  it('roundGkKey 는 free/push 의 숫자 키와 겹치지 않는다', () => {
    expect(roundGkKey(0)).toBe('R0');
    expect(roundGkKey(6)).not.toBe(6);
  });
});
