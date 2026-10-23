import { describe, it, expect, vi } from 'vitest';
import { stripUndefinedDeep, diffStateToWrites } from '../firebaseSyncDiff';

// RTDB update() 는 값 어딘가에 undefined 가 있으면 쓰기 전체를 거부한다.
// 한 경기의 undefined 하나가 세션 전체 저장을 막았던 사고(2026-10-23) 재발 방지.
describe('stripUndefinedDeep', () => {
  it('객체의 undefined 키를 제거한다', () => {
    const r = stripUndefinedDeep({ a: 1, b: undefined, c: 'x' });
    expect(r).toEqual({ a: 1, c: 'x' });
    expect('b' in r).toBe(false);
  });

  it('중첩된 객체 안쪽까지 제거한다', () => {
    const r = stripUndefinedDeep({ 'matches/R1_C1': { homePlayers: ['A'], mercenaries: undefined } });
    expect(r['matches/R1_C1']).toEqual({ homePlayers: ['A'] });
  });

  it('배열 구멍은 null 로 둔다 (인덱스가 밀리면 안 됨)', () => {
    expect(stripUndefinedDeep([1, undefined, 3])).toEqual([1, null, 3]);
  });

  it('null·0·빈문자열·false 는 그대로 둔다', () => {
    expect(stripUndefinedDeep({ a: null, b: 0, c: '', d: false })).toEqual({ a: null, b: 0, c: '', d: false });
  });

  it('제거할 때 경고를 남긴다 (조용히 삼키지 않음)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stripUndefinedDeep({ mercenaries: undefined });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('diffStateToWrites 결과에 undefined 가 섞여 나오지 않는다', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const prev = { completedMatches: [] };
    const next = { completedMatches: [{ matchId: 'R1_C1', homePlayers: ['A'], mercenaries: undefined }] };
    const writes = diffStateToWrites(prev, next);
    expect(writes['matches/R1_C1']).toEqual({ matchId: 'R1_C1', homePlayers: ['A'] });
    vi.restoreAllMocks();
  });
});
