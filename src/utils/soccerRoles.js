// 경기별 역할(영상촬영 · 주심 · 부심) 순수 함수.
//
// ★ 이 모듈이 존재하는 이유: RTDB 는 빈 배열을 저장하지 않고, 비어있지 않은 배열을
//   객체({0:'김A'})로 바꿔 돌려줄 수 있다. 그래서 같은 roles 가 경로에 따라 네 가지
//   모양으로 도착한다. 더 나쁜 것은 아카이브 경로다 — firebaseSync.loadFinalizedOne 은
//   snap.val().state 를 그대로 반환해 reconstructState(=normalizeSoccerMatch)를 타지
//   않으므로, 동기화 쪽 정규화만으로는 보관소 상세가 안 막힌다.
//   따라서 "읽는 쪽은 전부 readRoles 를 경유한다" 를 계약으로 둔다.
//   호출부에 `|| []` 를 흩뿌리지 않는다 — 접근자 1개가 네 경로를 동시에 막는다.
//
// 설계: docs/superpowers/specs/2026-10-07-soccer-match-roles-design.md

export const MAX_ASSISTANTS = 2;

// 정규형 빈 값. 호출마다 새 객체를 만든다 — 상수 하나를 공유하면 호출부가 push 해서
// 다른 호출부를 오염시킨다.
export function emptyRoles() {
  return { camera: [], referee: '', assistants: [] };
}

// RTDB 가 돌려줄 수 있는 모든 모양 → 문자열 배열.
// (배열 / 객체화({0:..}) / undefined), falsy 원소 제거.
function asNameArray(v) {
  const arr = Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []);
  return arr.filter(n => typeof n === 'string' && n !== '');
}

function normalize(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyRoles();
  return {
    camera: asNameArray(raw.camera),
    referee: typeof raw.referee === 'string' ? raw.referee : '',
    assistants: asNameArray(raw.assistants).slice(0, MAX_ASSISTANTS),
  };
}

// 경기 객체 → 정규형 역할. 읽는 쪽의 유일한 입구.
export function readRoles(match) {
  return normalize(match && typeof match === 'object' ? match.roles : null);
}

// 정규형 → 로그_매치 roles_json 값.
// 전원 공석이면 빈 문자열 — 시트가 '{"camera":[],"referee":"","assistants":[]}' 로
// 도배되지 않고, 역할 기능 이전의 레거시 행(빈칸)과 같은 모양이 된다.
export function serializeRoles(roles) {
  const r = normalize(roles);
  if (r.camera.length === 0 && r.referee === '' && r.assistants.length === 0) return '';
  return JSON.stringify(r);
}

// 로그_매치 roles_json → 정규형. 빈값·깨진 JSON·엉뚱한 타입은 전원 공석.
export function parseRoles(rolesJson) {
  if (typeof rolesJson !== 'string' || rolesJson.trim() === '') return emptyRoles();
  try {
    return normalize(JSON.parse(rolesJson));
  } catch {
    return emptyRoles();
  }
}
