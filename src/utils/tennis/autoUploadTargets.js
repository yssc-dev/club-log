// 자동 업로드·아카이브 대상 선별. RTDB/시트에 닿지 않는 순수 함수 — 러너의 유일한 판단 지점이다.
// ★ 사람이 "경기 마감"을 눌러 요약 화면(summary)에 도달한 경기만 대상이다.
//   setup/playing(시작만 하고 버린 경기 포함)은 어떤 경우에도 건드리지 않는다.
// ★ sport 검사는 팀 필터와 별개의 이중 방어다 — 풋살/축구 state가 섞여 들어와도 배제된다.

import { TENNIS_SPORT } from './tennisSchema';

export const ACTION_UPLOAD_ARCHIVE = 'upload_archive';
export const ACTION_ARCHIVE_ONLY = 'archive_only';
export const ACTION_SKIP = 'skip';

const FINISHED_PHASES = new Set(['summary', 'done']);

export function classifyAutoTarget(state) {
  if (!state || state.sport !== TENNIS_SPORT) return ACTION_SKIP;
  if (!FINISHED_PHASES.has(state.phase)) return ACTION_SKIP;
  return state.gameFinalized === true ? ACTION_ARCHIVE_ONLY : ACTION_UPLOAD_ARCHIVE;
}

export function selectAutoTargets(games) {
  return (games || [])
    .map(g => ({ ...g, action: classifyAutoTarget(g && g.state) }))
    .filter(g => g.action !== ACTION_SKIP);
}

// (2026-08-31 유저 결정) 신선도 가드(isSettled, 마지막 수정 후 10분)는 제거했다 —
// 실행 시점에 마감(summary/done) 상태이기만 하면 처리한다. 편집 중 레이스로 부활한 노드의
// 중복 업로드는 아래 resolveWithArchiveState가 닫는다.

// 이미 아카이브된 gameId가 active에 다시 나타나면, 삭제를 모르는 클라이언트가
// 되살린 것이다(앱은 RTDB를 구독하지 않는다). 그 상태는 gameFinalized:false라
// upload_archive로 분류되지만 시트에는 이미 들어가 있다 — 다시 올리면 중복 행이 된다.
// 중복 업로드를 막는 유일한 장치이므로 제거 금지.
export function resolveWithArchiveState(action, alreadyArchived) {
  if (alreadyArchived && action === ACTION_UPLOAD_ARCHIVE) return ACTION_ARCHIVE_ONLY;
  return action;
}
