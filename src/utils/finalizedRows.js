// src/utils/finalizedRows.js
// 확정 세션(finalized stateJSON) 1건 → 로그_매치 rows. 설정 화면의 "Firebase → 로그_매치 정확 덮어쓰기"
// 도구가 쓴다. 태그(mode/tournament_id)는 하드코딩하지 않고 세션 state 에서 파생한다 — 컵 세션을
// 태그 없이 재기록하면 SheetCache rowFilter 를 우회해 정규 분석이 오염된다(스펙 §5).
import { buildRoundRowsFromFutsal, buildRoundRowsFromSoccer } from './matchRowBuilder';
import { logTagsOf } from './cup/cupSession';

export function rowsForFinalizedSession({ team, sport, gameDate, savedAt, state }) {
  const buildFn = sport === '축구' ? buildRoundRowsFromSoccer : buildRoundRowsFromFutsal;
  const { mode, tournamentId } = logTagsOf(state);
  return buildFn({ team, mode, tournamentId, date: gameDate, stateJSON: state, inputTime: savedAt || '' });
}
