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

// 이 가드의 목적은 "지금 이 순간 저장이 오가는 중인 경기를 낚아채지 않는다"는 것이다.
// "오래 방치된 것만 처리"가 아니다 — 그 역할은 resolveWithArchiveState(finalized 존재 확인)가 닫는다.
// 아카이브 후 앱이 노드를 되살려 중복 업로드되는 경로는 resolveWithArchiveState가 차단하므로
// 이 가드는 마감 직후 saveState가 아직 오가는 수 초~수 분의 레이스만 막으면 충분하다.
// 값이 10분인 이유: 마감 후 같은 시간대 자동 실행(예: 09:32 마감 → 10:00 처리)에서 건너뛰지 않아야 한다.
export const MIN_IDLE_MS = 10 * 60 * 1000;   // 10분

// meta.updatedAt(서버 타임스탬프, ms)이 minIdleMs 이상 지났을 때만 true.
// 값이 없거나 숫자가 아니거나 미래(클럭 스큐)면 false — 판단 불가는 "건드리지 않는다"로 처리한다.
export function isSettled(updatedAt, nowMs, minIdleMs = MIN_IDLE_MS) {
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || updatedAt <= 0) return false;
  const age = nowMs - updatedAt;
  return age >= minIdleMs;
}

// 이미 아카이브된 gameId가 active에 다시 나타나면, 삭제를 모르는 클라이언트가
// 되살린 것이다(앱은 RTDB를 구독하지 않는다). 그 상태는 gameFinalized:false라
// upload_archive로 분류되지만 시트에는 이미 들어가 있다 — 다시 올리면 중복 행이 된다.
// 신선도 가드(isSettled)는 확률만 줄일 뿐 이 경로를 닫지 못하므로, 여기서 닫는다.
export function resolveWithArchiveState(action, alreadyArchived) {
  if (alreadyArchived && action === ACTION_UPLOAD_ARCHIVE) return ACTION_ARCHIVE_ONLY;
  return action;
}
