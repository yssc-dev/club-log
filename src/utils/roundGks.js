// 풋살 schedule 모드의 "라운드별 GK" 단일 소스.
//
// 원래 라이브 GK는 전역 한 칸(state.gks)에 있고 확정할 때만 gksHistory[roundIdx] 로 옮겨졌다.
// 그래서 확정취소로 미확정 라운드가 둘 이상 생기면 그 한 칸을 서로 공유해 GK가 섞이거나
// 사라졌다(2026-10-23). 이제 라이브든 확정이든 라운드 키 하나만 본다.
//
// ★ 키에 'R' 접두어를 붙이는 이유: free/push 매치는 같은 gksHistory 를 completedMatches
//   인덱스(숫자)로 쓴다. 자유+자동대진 혼합 모드에서는 free 매치 3개가 0·1·2 를 차지한 채
//   schedule 라운드 0·1·2 가 생기므로, 숫자 키를 그대로 쓰면 서로의 GK를 덮어쓴다.
//
// state.gks 는 라이브 경기가 하나뿐인 free/push 모드 전용으로 남고, schedule 모드에서는
// "이 배포 전에 GK를 지정해 둔 진행 중 세션"을 위한 1회성 폴백으로만 읽는다.
//
// React·firebase 의존 없음.

const EMPTY = Object.freeze({});

/** schedule 라운드의 gksHistory 키. free/push 의 숫자 키와 겹치지 않는다. */
export function roundGkKey(roundIdx) {
  return `R${roundIdx}`;
}

/**
 * @param {{ gksHistory?: object, gks?: object, confirmedRounds?: object, currentRoundIdx?: number }} state
 * @param {number} roundIdx
 * @returns {object} { [teamIdx]: 선수명 }
 */
export function resolveRoundGks(state, roundIdx) {
  const { gksHistory = {}, gks = {}, confirmedRounds = {}, currentRoundIdx = null } = state || {};
  if (roundIdx == null) return EMPTY;

  const own = gksHistory?.[roundGkKey(roundIdx)];
  if (own && Object.keys(own).length > 0) return own;

  // 구버전 호환 — 이 배포 전에 확정된 라운드는 숫자 키에 들어 있다.
  // 확정된 라운드에만 적용한다: 혼합 모드에서 숫자 키는 free 매치 몫이라,
  // 미확정 라운드까지 숫자 키를 읽으면 남의 GK를 끌어온다.
  if (confirmedRounds?.[roundIdx]) {
    const legacy = gksHistory?.[roundIdx];
    if (legacy && Object.keys(legacy).length > 0) return legacy;
  }

  // 구버전 진행 중 세션: 아직 옮겨지지 않은 현재 라운드의 GK가 전역 칸에 있다.
  if (roundIdx === currentRoundIdx) return gks || EMPTY;

  // 매 렌더 새 객체를 만들면 matchInfos useMemo 가 계속 재계산돼 CourtRecorder 가 리마운트된다.
  return EMPTY;
}
