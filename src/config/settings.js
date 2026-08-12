import { ref, set, get } from 'firebase/database';
import { firebaseDb } from './firebase';
import { SHEET_CONFIG } from './constants';

const SETTINGS_KEY = "masterfc_settings";

export const SPORT_DEFAULTS = {
  풋살: {
    ownGoalPoint: -1,
    foulPoint: -1,
    useCrovaGoguma: false,
    crovaPoint: 0,
    gogumaPoint: 0,
    bonusMultiplier: 1,
  },
  축구: {
    ownGoalPoint: -1,
    foulPoint: -1,
    cleanSheetPoint: 1,
    opponents: [],
  },
  테니스: {
    // 랭킹 포인트 산식. rankPoints.js의 DEFAULT_POINT_RULES와 같은 모양.
    // 등급 2단계 이상 차이의 점수가 확정되면 여기(또는 팀 override)만 고치면 된다.
    pointRules: {
      baseWin: 1,
      sameLeagueUpset: 2,
      leagueUpset: 3,
      gradeUpset: 5,
      gradeUpsetPerStep: false,
    },
    rosterSheet: '테니스_회원명부',
    // 경기 스코어링 규칙. 경기 생성 시 이 값을 state.scoringRules로 스냅샷한다.
    scoringRules: {
      tiebreakMode: '7point',     // '7point'(5:5 노애드 7점) | '1point'(5:5 단판 데스)
      acesDfAffectScore: false,   // false(분석 전용) | true(에이스=서버편 득점, DF=상대편 득점)
    },
  },
};

export const PRESETS = {
  풋살: {
    "표준풋살": {
      description: "일반 풋살 규칙",
      values: {},
    },
    "마스터FC풋살": {
      description: "마스터FC 커스텀 (자살골 2배, 크로바/고구마)",
      values: {
        ownGoalPoint: -2,
        useCrovaGoguma: true,
        crovaPoint: 2,
        gogumaPoint: -1,
        bonusMultiplier: 2,
      },
    },
  },
  축구: {
    "표준축구": {
      description: "일반 축구 규칙",
      values: {},
    },
  },
  테니스: {
    "표준테니스": {
      description: "6게임 선취 · 5:5 노애드 타이브레이크 7점",
      values: {},
    },
  },
};

const PRESET_MAP = {
  "마스터FC": { 풋살: "마스터FC풋살" },
  _default: { 풋살: "표준풋살", 축구: "표준축구", 테니스: "표준테니스" },
};

export function resolvePreset(team, sport) {
  return PRESET_MAP[team]?.[sport] ?? PRESET_MAP._default[sport];
}

const DEFAULTS = {
  sheetId: SHEET_CONFIG.sheetId,
  attendanceSheet: "참석명단",
  dashboardSheet: "대시보드",
  pointLogSheet: "포인트로그",
  playerLogSheet: "선수별집계기록로그",
};

function _key(team) {
  return `${SETTINGS_KEY}_${team || "default"}`;
}

function _safeTeam(team) {
  return (team || "기본팀").replace(/[.#$/[\]]/g, "_");
}

function _firebaseRef(team) {
  return ref(firebaseDb, "settings/" + _safeTeam(team));
}

// localStorage 캐시 + Firebase 동기화
let _cache = {};

export function getSettings(team) {
  const key = _key(team);
  let stored = _cache[key];
  if (!stored) {
    try {
      stored = JSON.parse(localStorage.getItem(key) || "{}");
      _cache[key] = stored;
    } catch {
      stored = {};
    }
  }
  // 중첩 포맷의 shared.* 는 top-level로 평탄화. 레거시 flat 포맷은 stored 전개로 처리.
  return { ...DEFAULTS, ...(stored.shared || {}), ...stored };
}

export async function saveSettings(team, sport, effectiveValues, presetName) {
  const sportDef = SPORT_DEFAULTS[sport] || {};
  const presetValues = PRESETS[sport]?.[presetName]?.values || {};

  const sharedOut = {};
  const overrides = {};

  for (const k of Object.keys(effectiveValues)) {
    if (k === "_meta" || k.startsWith("_")) continue;
    if (SHARED_KEYS.includes(k)) {
      sharedOut[k] = effectiveValues[k];
      continue;
    }
    const presetVal = k in presetValues ? presetValues[k] : sportDef[k];
    if (effectiveValues[k] === presetVal) continue;
    overrides[k] = effectiveValues[k];
  }

  const existing = _cache[team] || {};
  const next = {
    ...existing,
    shared: { ...(existing.shared || {}), ...sharedOut },
    [sport]: { preset: presetName, overrides },
  };

  _cache[team] = next;
  localStorage.setItem(_key(team), JSON.stringify(next));
  try {
    await set(_firebaseRef(team), next);
  } catch (e) {
    console.warn("설정 Firebase 저장 실패:", e.message);
  }
}

// Firebase에서 설정 로드 → localStorage에 캐싱
// legacy 포맷 감지 시 nested 구조로 자동 마이그레이션 후 Firebase 덮어쓰기
export async function loadSettingsFromFirebase(team, teamEntries) {
  try {
    const snap = await get(_firebaseRef(team));
    const raw = snap.exists() ? snap.val() : null;

    if (raw && isLegacyFormat(raw)) {
      // 1) 원본 백업
      try {
        await set(
          ref(firebaseDb, "settings_legacy_backup/" + _safeTeam(team)),
          { ...raw, _migratedAt: Date.now() }
        );
      } catch (e) {
        console.warn("설정 백업 실패 (마이그레이션 중단):", e.message);
        return { ...DEFAULTS, ...raw };
      }
      // 2) 변환
      const migrated = migrateToNested(team, raw, teamEntries || []);
      // 3) 덮어쓰기
      await set(_firebaseRef(team), migrated);
      // 4) localStorage에 nested 구조 저장 (legacy 키는 동일 slot에 덮어쓰기)
      localStorage.setItem(_key(team), JSON.stringify(migrated));
      _cache[team] = migrated;
      console.info("설정 마이그레이션 완료:", team);
      return migrated;
    }

    if (raw) {
      _cache[team] = raw;
      // localStorage 동기화 (new 구조)
      localStorage.setItem(_key(team), JSON.stringify(raw));
      return raw;
    }

    // Firebase에 데이터 없는 신규 팀: 기본 nested 구조 생성
    const sports = new Set((teamEntries || []).map(e => e.mode));
    if (sports.size === 0) sports.add("풋살");
    const fresh = { shared: {} };
    if (sports.has("풋살")) {
      fresh["풋살"] = { preset: resolvePreset(team, "풋살"), overrides: {} };
    }
    if (sports.has("축구")) {
      fresh["축구"] = { preset: resolvePreset(team, "축구"), overrides: {} };
    }
    if (sports.has("테니스")) {
      fresh["테니스"] = { preset: resolvePreset(team, "테니스"), overrides: {} };
    }
    _cache[team] = fresh;
    localStorage.setItem(_key(team), JSON.stringify(fresh));
    return fresh;
  } catch (e) {
    console.warn("설정 Firebase 로드 실패:", e.message);
    return _cache[team] || { shared: {} };
  }
}

export function _setCacheForTest(obj) {
  _cache = obj;
}

// Firebase 로드 이전 cold-start 대비: localStorage에 있으면 동기적으로 캐시 채움
function _hydrateCacheFromStorage(team) {
  if (_cache[team]) return;
  try {
    const raw = JSON.parse(localStorage.getItem(_key(team)) || "null");
    if (raw && !isLegacyFormat(raw)) _cache[team] = raw;
  } catch { /* ignore */ }
}

export function getEffectiveSettings(team, sport) {
  _hydrateCacheFromStorage(team);
  const teamData = _cache[team] || {};
  const sportDefaults = SPORT_DEFAULTS[sport] || {};
  const presetName = teamData[sport]?.preset;
  const presetValues = PRESETS[sport]?.[presetName]?.values || {};
  const overrides = teamData[sport]?.overrides || {};
  const shared = teamData.shared || {};

  return {
    ...sportDefaults,
    ...presetValues,
    ...overrides,
    ...shared,
    _meta: { preset: presetName, sport, team },
  };
}

export function getSportDefault(sport, key) {
  return SPORT_DEFAULTS[sport]?.[key];
}

export function getPresetValue(sport, preset, key) {
  return PRESETS[sport]?.[preset]?.values?.[key];
}

// shared는 종목 무관 키(sheetId 등) 전용이므로 override보다 우선 검사한다.
// 동일 키가 shared와 override 양쪽에 있으면 shared를 반환 — 배지 UI는 이 규칙을 전제로 한다.
export function getSourceOf(team, sport, key) {
  const teamData = _cache[team] || {};
  if (teamData.shared && key in teamData.shared) return "shared";
  const overrides = teamData[sport]?.overrides || {};
  if (key in overrides) return "override";
  const preset = teamData[sport]?.preset;
  const presetValues = PRESETS[sport]?.[preset]?.values || {};
  if (key in presetValues) return "preset";
  const sportDefaults = SPORT_DEFAULTS[sport] || {};
  if (key in sportDefaults) return "default";
  return "unknown";
}

const SHARED_KEYS = [
  "sheetId", "attendanceSheet", "dashboardSheet",
  "pointLogSheet", "playerLogSheet",
];
const FUTSAL_KEYS = [
  "ownGoalPoint", "foulPoint", "crovaPoint", "gogumaPoint", "bonusMultiplier",
  "useCrovaGoguma", "dualTeams", "dualTeamStartDate", "dualTeamEndDate",
];
const SOCCER_KEYS = [
  "ownGoalPoint", "foulPoint", "cleanSheetPoint", "opponents",
];
const TENNIS_KEYS = [
  "pointRules", "rosterSheet",
];

export function isLegacyFormat(raw) {
  if (!raw || typeof raw !== "object") return false;
  if (Object.keys(raw).length === 0) return false;
  return !raw.shared && !raw["풋살"] && !raw["축구"] && !raw["테니스"];
}

function _sparseOverrides(legacy, keys, presetValues) {
  const overrides = {};
  for (const k of keys) {
    if (legacy[k] === undefined) continue;
    if (legacy[k] === presetValues[k]) continue;
    overrides[k] = legacy[k];
  }
  return overrides;
}

export function migrateToNested(team, legacy, teamEntries) {
  const out = { shared: {} };
  for (const k of SHARED_KEYS) {
    if (legacy[k] !== undefined) out.shared[k] = legacy[k];
  }

  const sports = new Set((teamEntries || []).map(e => e.mode));
  if (sports.size === 0) sports.add("풋살");

  if (sports.has("풋살")) {
    const preset = resolvePreset(team, "풋살");
    const presetValues = PRESETS.풋살[preset]?.values || {};
    out["풋살"] = {
      preset,
      overrides: _sparseOverrides(legacy, FUTSAL_KEYS, presetValues),
    };
  }
  if (sports.has("축구")) {
    const preset = resolvePreset(team, "축구");
    const presetValues = PRESETS.축구[preset]?.values || {};
    out["축구"] = {
      preset,
      overrides: _sparseOverrides(legacy, SOCCER_KEYS, presetValues),
    };
  }
  if (sports.has("테니스")) {
    const preset = resolvePreset(team, "테니스");
    const presetValues = PRESETS.테니스[preset]?.values || {};
    out["테니스"] = {
      preset,
      overrides: _sparseOverrides(legacy, TENNIS_KEYS, presetValues),
    };
  }
  return out;
}
