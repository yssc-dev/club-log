// src/utils/__tests__/cupSession.test.js
import { describe, it, expect } from 'vitest';
import { isCupSession, logTagsOf } from '../cup/cupSession';

describe('isCupSession', () => {
  it('tournamentId 가 비어 있지 않은 문자열이면 컵 세션', () => {
    expect(isCupSession({ tournamentId: '마스터스컵 2026' })).toBe(true);
  });
  it("''·undefined·null·비문자열은 정규 세션", () => {
    expect(isCupSession({ tournamentId: '' })).toBe(false);
    expect(isCupSession({})).toBe(false);
    expect(isCupSession({ tournamentId: null })).toBe(false);
    expect(isCupSession({ tournamentId: 7 })).toBe(false);
    expect(isCupSession(null)).toBe(false);
    expect(isCupSession(undefined)).toBe(false);
  });
});

describe('logTagsOf', () => {
  it('정규 세션은 mode=기본, tournamentId 빈 문자열', () => {
    expect(logTagsOf({ tournamentId: '' })).toEqual({ mode: '기본', tournamentId: '' });
    expect(logTagsOf({})).toEqual({ mode: '기본', tournamentId: '' });
  });
  it('컵 세션은 mode=대회, tournamentId 그대로', () => {
    expect(logTagsOf({ tournamentId: '마스터스컵 2026' })).toEqual({ mode: '대회', tournamentId: '마스터스컵 2026' });
  });
});
