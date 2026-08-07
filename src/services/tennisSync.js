// 테니스 전용 Apps Script 통신. appSync.js를 열지 않기 위해 분리했지만,
// 그 파일이 지키던 계약 세 가지는 그대로 재현해야 한다:
//   1) 모든 요청에 authToken + team  — Code.js의 _checkTeamAccess는 team이 비면 무조건 통과한다
//   2) success:false → throw          — Apps Script는 서버측 실패도 HTTP 200으로 답한다
//   3) 이름의 ★ 표식 제거              — 시트 이름 매칭이 깨진다
// stripNameDecorations는 src/services/appSync.js:11 의 복사본이다. 한쪽을 고치면 다른 쪽도 고칠 것.

import AuthUtil from './authUtil';

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || "";

const NAME_DECORATION_RE = /[★☆✩✪✫✬✭✮✯✰⭐🌟]/g;
export function stripNameDecorations(value) {
  if (typeof value === 'string') return value.replace(NAME_DECORATION_RE, '');
  if (Array.isArray(value)) return value.map(stripNameDecorations);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = stripNameDecorations(value[k]);
    return out;
  }
  return value;
}

// Code.js의 _parseAuthToken은 ':'로 분리하여 정확히 3개 파트를 요구한다.
// (team이 빈 경우 _checkTeamAccess가 무조건 통과하므로 team도 필수)
function _auth() {
  const auth = AuthUtil.getStored();
  return {
    team: auth?.team || "",
    authToken: auth ? `${auth.team || ""}:${auth.name}:${auth.phone4}` : "",
  };
}

// 쓰기 공통 POST. 비200 및 success:false 모두 throw로 변환한다.
// Apps Script는 서버측 실패도 HTTP 200 + {success:false}로 응답하므로
// Promise.allSettled 기반 호출부가 실패를 성공으로 오판하지 않게 여기서 차단한다.
async function _post(payload) {
  const { team, authToken } = _auth();
  const body = stripNameDecorations({ ...payload, team, authToken });
  const resp = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`테니스 시트 요청 실패: HTTP ${resp.status}`);
  const result = await resp.json();
  if (!result || result.success === false) {
    throw new Error(`테니스 시트 요청 실패: ${result?.error || "서버 응답 오류"}`);
  }
  return result;
}

// 읽기는 화면을 죽이지 않도록 빈 값으로 폴백한다. 쓰기는 반드시 throw한다.
async function _safeRead(payload, pick, fallback) {
  try {
    const r = await _post(payload);
    return r[pick] ?? fallback;
  } catch (e) {
    console.warn("테니스 조회 실패:", e.message);
    return fallback;
  }
}

const TennisSync = {
  enabled() { return !!APPS_SCRIPT_URL; },

  getRoster() {
    return _safeRead({ action: "getTennisRoster" }, "players", []);
  },

  getPlayerGames(dateFrom = "", dateTo = "") {
    return _safeRead({ action: "getTennisPlayerGames", dateFrom, dateTo }, "rows", []);
  },

  writeMatches(rows) {
    return _post({ action: "writeTennisMatches", data: { rows: rows || [] } });
  },

  writePlayerGames(rows) {
    return _post({ action: "writeTennisPlayerGames", data: { rows: rows || [] } });
  },
};

export default TennisSync;
