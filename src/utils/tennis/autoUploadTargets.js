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

// 아카이브는 active 노드 삭제를 동반하는데, 앱은 RTDB를 구독하지 않아(TennisApp은 마운트 시 1회 로드)
// 경기를 열어둔 클라이언트가 삭제를 모른 채 다음 동작에서 saveState로 노드를 되살린다.
// 그러면 다음 실행에서 같은 경기가 다시 업로드돼 시트에 중복 행이 생긴다.
// 최근에 수정된 경기를 건너뛰면 그 레이스를 실용적으로 닫을 수 있다(다음 실행에서 자연 재시도).
export const MIN_IDLE_MS = 3 * 60 * 60 * 1000;   // 3시간

// meta.updatedAt(서버 타임스탬프, ms)이 minIdleMs 이상 지났을 때만 true.
// 값이 없거나 숫자가 아니거나 미래(클럭 스큐)면 false — 판단 불가는 "건드리지 않는다"로 처리한다.
export function isSettled(updatedAt, nowMs, minIdleMs = MIN_IDLE_MS) {
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || updatedAt <= 0) return false;
  const age = nowMs - updatedAt;
  return age >= minIdleMs;
}
