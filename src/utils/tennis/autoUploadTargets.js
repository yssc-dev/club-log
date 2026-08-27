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
