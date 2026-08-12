import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('firebase/database', () => ({
  ref: vi.fn(() => ({})),
  set: vi.fn(() => Promise.resolve()),
  get: vi.fn(() => Promise.resolve({ exists: () => false })),
}));
vi.mock('../firebase', () => ({ firebaseDb: {} }));

import { getSettings, _setCacheForTest } from '../settings.js';

// 하버FC 출석률 경기수 폴백 회귀 테스트 — getSettings가 loadSettingsFromFirebase와
// 다른 캐시 키를 읽으면 RTDB 설정이 같은 세션에 반영되지 않는다.
describe('getSettings 캐시 정합성', () => {
  let _store = {};
  const mockLocalStorage = {
    getItem: (k) => _store[k] ?? null,
    setItem: (k, v) => { _store[k] = String(v); },
    removeItem: (k) => { delete _store[k]; },
    clear: () => { _store = {}; },
  };
  beforeEach(() => {
    _store = {};
    vi.stubGlobal('localStorage', mockLocalStorage);
    _setCacheForTest({});
  });

  it('RTDB 로드가 쓰는 _cache[team]을 같은 세션의 getSettings가 즉시 본다', () => {
    _setCacheForTest({ '하버FC': { shared: { playerLogSheet: '하버FC 선수기록보관소' } } });
    expect(getSettings('하버FC').playerLogSheet).toBe('하버FC 선수기록보관소');
  });

  it('localStorage가 비어 있어도 빈 객체를 부정 캐시하지 않는다', () => {
    expect(getSettings('하버FC').playerLogSheet).toBe('선수별집계기록로그'); // DEFAULTS
    _setCacheForTest({ '하버FC': { shared: { playerLogSheet: '하버FC 선수기록보관소' } } });
    expect(getSettings('하버FC').playerLogSheet).toBe('하버FC 선수기록보관소');
  });

  it('localStorage의 중첩 설정을 하이드레이션해 읽는다', () => {
    localStorage.setItem('masterfc_settings_하버FC',
      JSON.stringify({ shared: { playerLogSheet: '하버FC 선수기록보관소' } }));
    expect(getSettings('하버FC').playerLogSheet).toBe('하버FC 선수기록보관소');
  });

  it('shared 평탄화 + DEFAULTS 병합 형태 유지', () => {
    _setCacheForTest({ '팀X': { shared: { dashboardSheet: '팀X 대시보드' } } });
    const s = getSettings('팀X');
    expect(s.dashboardSheet).toBe('팀X 대시보드');
    expect(s.pointLogSheet).toBe('포인트로그'); // DEFAULTS 유지
  });
});
