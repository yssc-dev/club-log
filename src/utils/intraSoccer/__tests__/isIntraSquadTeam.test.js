// F-I1: Root 게이트가 '저장된 설정'만 보면 RTDB 로드 실패·첫 접속(설정 노드 없음)에서
// 빅마스터FC 가 하버FC(SoccerApp) 모드로 열린다 → 팀 기본 프리셋(PRESET_MAP)으로 폴백해야 한다.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isIntraSquadTeam } from '../isIntraSquadTeam';
import { _setCacheForTest } from '../../../config/settings';

describe('isIntraSquadTeam', () => {
  let _store = {};
  const mockLocalStorage = {
    getItem: (k) => _store[k] ?? null,
    setItem: (k, v) => { _store[k] = String(v); },
    removeItem: (k) => { delete _store[k]; },
    clear: () => { _store = {}; },
  };

  // 저장된 설정이 전혀 없는 상태(RTDB 로드 실패 / 첫 접속) — 모듈 캐시까지 비운다.
  beforeEach(() => {
    _store = {};
    vi.stubGlobal('localStorage', mockLocalStorage);
    _setCacheForTest({});
  });

  it('저장된 설정이 없어도 빅마스터FC 축구는 프리셋 폴백으로 true', () => {
    expect(isIntraSquadTeam('빅마스터FC', '축구')).toBe(true);
  });
  it('하버FC 축구는 false (두 경로 모두 intraSquad 없음)', () => {
    expect(isIntraSquadTeam('하버FC', '축구')).toBe(false);
  });
  it('빅마스터FC 라도 축구가 아니면 false', () => {
    expect(isIntraSquadTeam('빅마스터FC', '풋살')).toBe(false);
    expect(isIntraSquadTeam('빅마스터FC', '테니스')).toBe(false);
  });
  it('팀이 없으면 false', () => {
    expect(isIntraSquadTeam(null, '축구')).toBe(false);
    expect(isIntraSquadTeam(undefined, '축구')).toBe(false);
    expect(isIntraSquadTeam('', '축구')).toBe(false);
  });
  it('저장된 설정에 자체전축구 프리셋이 있으면 팀 이름과 무관하게 true', () => {
    // masterfc_settings_<team> = settings.js 의 localStorage 키 포맷(_key)
    _store['masterfc_settings_어떤팀'] = JSON.stringify({ 축구: { preset: '자체전축구', overrides: {} } });
    expect(isIntraSquadTeam('어떤팀', '축구')).toBe(true);
  });
});
