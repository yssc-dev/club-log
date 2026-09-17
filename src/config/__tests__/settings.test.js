import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('firebase/database', () => ({
  ref: vi.fn(() => ({})),
  set: vi.fn(() => Promise.resolve()),
  get: vi.fn(() => Promise.resolve({ exists: () => false })),
}));
vi.mock('../firebase', () => ({
  firebaseDb: {},
}));

import { getCupSettings, SPORT_DEFAULTS, PRESETS, resolvePreset } from '../settings.js';
import { getEffectiveSettings, _setCacheForTest } from '../settings.js';

describe('SPORT_DEFAULTS', () => {
  it('풋살 기본은 자살골 -1, 크로바/고구마 OFF', () => {
    expect(SPORT_DEFAULTS.풋살.ownGoalPoint).toBe(-1);
    expect(SPORT_DEFAULTS.풋살.useCrovaGoguma).toBe(false);
  });
  it('축구 기본은 자살골 -1, 클린시트 +1', () => {
    expect(SPORT_DEFAULTS.축구.ownGoalPoint).toBe(-1);
    expect(SPORT_DEFAULTS.축구.cleanSheetPoint).toBe(1);
  });
});

describe('PRESETS', () => {
  it('마스터FC풋살 프리셋은 자살골 -2 + 크로바/고구마 ON', () => {
    const p = PRESETS.풋살["마스터FC풋살"].values;
    expect(p.ownGoalPoint).toBe(-2);
    expect(p.useCrovaGoguma).toBe(true);
    expect(p.crovaPoint).toBe(2);
    expect(p.gogumaPoint).toBe(-1);
    expect(p.bonusMultiplier).toBe(2);
  });
  it('표준풋살 프리셋은 빈 values (SPORT_DEFAULTS만 의존)', () => {
    expect(PRESETS.풋살["표준풋살"].values).toEqual({});
  });
});

describe('resolvePreset', () => {
  it('마스터FC + 풋살 → 마스터FC풋살', () => {
    expect(resolvePreset("마스터FC", "풋살")).toBe("마스터FC풋살");
  });
  it('알 수 없는 팀 → 표준풋살', () => {
    expect(resolvePreset("알 수 없는 팀", "풋살")).toBe("표준풋살");
  });
  it('알 수 없는 팀 + 축구 → 표준축구', () => {
    expect(resolvePreset("알 수 없는 팀", "축구")).toBe("표준축구");
  });
});

describe('getEffectiveSettings', () => {
  beforeEach(() => {
    _setCacheForTest({});
  });

  it('팀 데이터 없으면 SPORT_DEFAULTS만 반환', () => {
    const es = getEffectiveSettings("신규팀", "풋살");
    expect(es.ownGoalPoint).toBe(-1);
    expect(es.useCrovaGoguma).toBe(false);
  });

  it('프리셋이 SPORT_DEFAULTS를 덮어씀', () => {
    _setCacheForTest({
      "마스터FC": {
        shared: {},
        풋살: { preset: "마스터FC풋살", overrides: {} },
      },
    });
    const es = getEffectiveSettings("마스터FC", "풋살");
    expect(es.ownGoalPoint).toBe(-2);
    expect(es.useCrovaGoguma).toBe(true);
    expect(es.crovaPoint).toBe(2);
  });

  it('팀 오버라이드가 프리셋을 덮어씀', () => {
    _setCacheForTest({
      "팀A": {
        shared: {},
        풋살: { preset: "마스터FC풋살", overrides: { ownGoalPoint: -5 } },
      },
    });
    const es = getEffectiveSettings("팀A", "풋살");
    expect(es.ownGoalPoint).toBe(-5);
    expect(es.crovaPoint).toBe(2);
  });

  it('shared가 최상위 (종목 무관 데이터)', () => {
    _setCacheForTest({
      "팀B": {
        shared: { sheetId: "SHEET123", dashboardSheet: "팀B 대시보드" },
        풋살: { preset: "표준풋살", overrides: {} },
      },
    });
    const es = getEffectiveSettings("팀B", "풋살");
    expect(es.sheetId).toBe("SHEET123");
    expect(es.dashboardSheet).toBe("팀B 대시보드");
  });

  it('_meta에 preset/sport/team 포함', () => {
    _setCacheForTest({
      "팀C": { shared: {}, 풋살: { preset: "표준풋살", overrides: {} } },
    });
    const es = getEffectiveSettings("팀C", "풋살");
    expect(es._meta).toEqual({ preset: "표준풋살", sport: "풋살", team: "팀C" });
  });

  it('존재하지 않는 프리셋 이름 → 빈 프리셋 처리', () => {
    _setCacheForTest({
      "팀D": { shared: {}, 풋살: { preset: "없는프리셋", overrides: {} } },
    });
    const es = getEffectiveSettings("팀D", "풋살");
    expect(es.ownGoalPoint).toBe(-1);
  });
});

import { isLegacyFormat, migrateToNested } from '../settings.js';

describe('isLegacyFormat', () => {
  it('null/undefined → false', () => {
    expect(isLegacyFormat(null)).toBe(false);
    expect(isLegacyFormat(undefined)).toBe(false);
  });
  it('flat 객체 (shared/풋살/축구 키 없음) → true', () => {
    expect(isLegacyFormat({ ownGoalPoint: -2, dashboardSheet: "X" })).toBe(true);
  });
  it('새 구조 (shared 있음) → false', () => {
    expect(isLegacyFormat({ shared: {}, 풋살: {} })).toBe(false);
  });
  it('새 구조 (풋살만 있음) → false', () => {
    expect(isLegacyFormat({ 풋살: {} })).toBe(false);
  });
  it('빈 객체 → false (마이그레이션 불필요)', () => {
    expect(isLegacyFormat({})).toBe(false);
  });
});

describe('migrateToNested', () => {
  it('마스터FC + 풋살 팀은 마스터FC풋살 프리셋으로 매핑', () => {
    const legacy = {
      dashboardSheet: "마스터FC 대시보드",
      dualTeams: [{ name: "창조", members: ["A"] }],
      ownGoalPoint: -2,
      crovaPoint: 2,
    };
    const teamEntries = [{ mode: "풋살", role: "멤버" }];
    const result = migrateToNested("마스터FC", legacy, teamEntries);

    expect(result.shared.dashboardSheet).toBe("마스터FC 대시보드");
    expect(result.풋살.preset).toBe("마스터FC풋살");
    expect(result.풋살.overrides.dualTeams).toEqual([{ name: "창조", members: ["A"] }]);
    expect(result).not.toHaveProperty("축구");
  });

  it('신규 팀 + 풋살 → 표준풋살 프리셋', () => {
    const teamEntries = [{ mode: "풋살", role: "멤버" }];
    const result = migrateToNested("신규팀", {}, teamEntries);
    expect(result.풋살.preset).toBe("표준풋살");
  });

  it('축구 팀원 있으면 축구 섹션 생성', () => {
    const legacy = { cleanSheetPoint: 2, opponents: ["A팀"] };
    const teamEntries = [{ mode: "축구", role: "감독" }];
    const result = migrateToNested("신규팀", legacy, teamEntries);

    expect(result.축구.preset).toBe("표준축구");
    expect(result.축구.overrides.cleanSheetPoint).toBe(2);
    expect(result.축구.overrides.opponents).toEqual(["A팀"]);
    expect(result).not.toHaveProperty("풋살");
  });

  it('legacy 값이 프리셋 값과 동일하면 overrides에 저장하지 않음', () => {
    const legacy = { ownGoalPoint: -2, crovaPoint: 2 };
    const teamEntries = [{ mode: "풋살", role: "멤버" }];
    const result = migrateToNested("마스터FC", legacy, teamEntries);

    expect(result.풋살.overrides.ownGoalPoint).toBeUndefined();
    expect(result.풋살.overrides.crovaPoint).toBeUndefined();
  });

  it('shared 키는 종목 구분 없이 shared로 이동', () => {
    const legacy = {
      sheetId: "X", attendanceSheet: "참석", dashboardSheet: "대시",
      pointLogSheet: "포인트", playerLogSheet: "선수",
    };
    const teamEntries = [{ mode: "풋살", role: "멤버" }];
    const result = migrateToNested("팀", legacy, teamEntries);

    expect(result.shared).toEqual({
      sheetId: "X", attendanceSheet: "참석", dashboardSheet: "대시",
      pointLogSheet: "포인트", playerLogSheet: "선수",
    });
  });

  it('teamEntries에 양 종목 있으면 양쪽 섹션 생성', () => {
    const teamEntries = [
      { mode: "풋살", role: "멤버" },
      { mode: "축구", role: "감독" },
    ];
    const result = migrateToNested("팀X", {}, teamEntries);
    expect(result.풋살.preset).toBe("표준풋살");
    expect(result.축구.preset).toBe("표준축구");
  });
});

import { getSportDefault, getPresetValue, getSourceOf, _setCacheForTest as _resetCache } from '../settings.js';

describe('getSportDefault', () => {
  it('풋살 자살골 기본 -1', () => {
    expect(getSportDefault("풋살", "ownGoalPoint")).toBe(-1);
  });
  it('축구 클린시트 기본 +1', () => {
    expect(getSportDefault("축구", "cleanSheetPoint")).toBe(1);
  });
});

describe('getPresetValue', () => {
  it('마스터FC풋살의 ownGoalPoint → -2', () => {
    expect(getPresetValue("풋살", "마스터FC풋살", "ownGoalPoint")).toBe(-2);
  });
  it('표준풋살의 crovaPoint → undefined (values 비어있음)', () => {
    expect(getPresetValue("풋살", "표준풋살", "crovaPoint")).toBeUndefined();
  });
});

describe('getSourceOf', () => {
  beforeEach(() => { _resetCache({}); });

  it('shared 키 → "shared"', () => {
    _resetCache({ "팀": { shared: { sheetId: "X" }, 풋살: { preset: "표준풋살", overrides: {} } } });
    expect(getSourceOf("팀", "풋살", "sheetId")).toBe("shared");
  });
  it('override 키 → "override"', () => {
    _resetCache({ "팀": { shared: {}, 풋살: { preset: "표준풋살", overrides: { ownGoalPoint: -3 } } } });
    expect(getSourceOf("팀", "풋살", "ownGoalPoint")).toBe("override");
  });
  it('preset 값 → "preset"', () => {
    _resetCache({ "팀": { shared: {}, 풋살: { preset: "마스터FC풋살", overrides: {} } } });
    expect(getSourceOf("팀", "풋살", "crovaPoint")).toBe("preset");
  });
  it('sport default에만 있음 → "default"', () => {
    _resetCache({ "팀": { shared: {}, 풋살: { preset: "표준풋살", overrides: {} } } });
    expect(getSourceOf("팀", "풋살", "ownGoalPoint")).toBe("default");
  });
  it('아무 곳에도 없는 키 → "unknown"', () => {
    _resetCache({ "팀": { shared: {}, 풋살: { preset: "표준풋살", overrides: {} } } });
    expect(getSourceOf("팀", "풋살", "neverHeardOfThisKey")).toBe("unknown");
  });
});

import { saveSettings } from '../settings.js';

describe('saveSettings', () => {
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

  it('프리셋과 동일한 값은 overrides에 저장하지 않음 (sparse)', async () => {
    _setCacheForTest({ "팀A": { shared: {}, 풋살: { preset: "마스터FC풋살", overrides: {} } } });
    // 프리셋과 동일 값 + 프리셋과 다른 값 섞기
    const effective = {
      ownGoalPoint: -2,      // 마스터FC풋살 preset 값과 동일 (저장 X)
      crovaPoint: 5,         // preset 값(2)과 다름 (override O)
      useCrovaGoguma: true,  // preset 값과 동일 (저장 X)
      sheetId: "SHEET123",   // SHARED_KEYS (shared로 저장)
      _meta: { preset: "마스터FC풋살" },  // 무시
    };
    await saveSettings("팀A", "풋살", effective, "마스터FC풋살");

    const stored = JSON.parse(localStorage.getItem("masterfc_settings_팀A"));
    expect(stored["풋살"].preset).toBe("마스터FC풋살");
    expect(stored["풋살"].overrides).toEqual({ crovaPoint: 5 });
    expect(stored.shared).toEqual({ sheetId: "SHEET123" });
  });

  it('SPORT_DEFAULTS와 동일한 값(프리셋에 없는 키)도 저장하지 않음', async () => {
    _setCacheForTest({ "팀B": { shared: {}, 축구: { preset: "표준축구", overrides: {} } } });
    const effective = {
      ownGoalPoint: -1,   // SPORT_DEFAULTS.축구.ownGoalPoint = -1, 동일
      cleanSheetPoint: 3, // SPORT_DEFAULTS = 1, 다름
    };
    await saveSettings("팀B", "축구", effective, "표준축구");

    const stored = JSON.parse(localStorage.getItem("masterfc_settings_팀B"));
    expect(stored["축구"].overrides).toEqual({ cleanSheetPoint: 3 });
  });
});

describe('getCupSettings (스펙 §4.3)', () => {
  it('팀 프리셋·오버라이드(자책 -2, 크로바/고구마)는 무시하고 표준 규칙 + shared 시트 설정만 남긴다', () => {
    _setCacheForTest({ '마스터FC': {
      shared: { sheetId: 'SID', attendanceSheet: '참석명단', dashboardSheet: '대시보드', pointLogSheet: '마스터FC 포인트 로그', playerLogSheet: '마스터FC 선수별집계기록 로그' },
      풋살: { preset: '마스터FC풋살', overrides: { ownGoalPoint: -2, useCrovaGoguma: true, bonusMultiplier: 2 } },
    } });
    const s = getCupSettings('마스터FC');
    expect(s.sheetId).toBe('SID');
    expect(s.pointLogSheet).toBe('마스터FC 포인트 로그');
    expect(s.ownGoalPoint).toBe(SPORT_DEFAULTS.풋살.ownGoalPoint);
    expect(s.useCrovaGoguma).toBe(false);
    expect(s.bonusMultiplier).toBe(1);
    expect(s._meta).toEqual({ preset: null, sport: '풋살', team: '마스터FC', cup: true });
  });
});
