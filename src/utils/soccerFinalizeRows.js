// 하버FC 축구 「기록확정」이 시트 5종에 쓰는 행을 만드는 순수 함수.
//
// SoccerApp.handleFinalize(사람이 누르는 기록확정)와 scripts/soccerAutoUpload.mjs(다음날 오전 10시
// 자동 업로드)가 **같은 함수**를 쓴다 — 시트 스키마를 두 벌 두지 않기 위해서다.
// 브라우저 의존(Date 지역시각·toLocaleString)은 호출부가 dateStr/inputTime 으로 넘긴다.
import { buildEventLogRows, buildPointLogRows, buildPlayerLogRows } from './soccerScoring';
import { buildRawEventsFromSoccer, buildRawPlayerGamesFromSoccer } from './rawLogBuilders';
import { buildRoundRowsFromSoccer } from './matchRowBuilder';

export function buildSoccerFinalizeRows({ state, team, dateStr, inputTime }) {
  const finished = (state.soccerMatches || []).filter(m => m.status === "finished");
  const eventLogRows = buildEventLogRows(finished, dateStr);
  const pointLogRows = buildPointLogRows(finished, dateStr, inputTime);
  const playerLogRows = buildPlayerLogRows(finished, dateStr, inputTime);
  const stateForMatchRows = {
    ...state,
    soccerMatches: finished.map(m => ({ ...m, matchIdx: m.matchIdx + 1 })),
  };
  const sessionGameId = finished.length > 0
    ? (finished[0].startedAt ? `s_${finished[0].startedAt}` : `s_${dateStr}_${finished[0].matchIdx + 1}`)
    : '';
  const matchRows = buildRoundRowsFromSoccer({
    team,
    mode: '기본',
    tournamentId: '',
    date: dateStr,
    stateJSON: stateForMatchRows,
    inputTime,
  });
  matchRows.forEach(r => { r.game_id = sessionGameId; });
  const rawEvents = buildRawEventsFromSoccer({ team, gameId: sessionGameId, events: eventLogRows });
  const rawPlayerGames = buildRawPlayerGamesFromSoccer({ team, inputTime, players: playerLogRows });
  return { finished, sessionGameId, pointLogRows, playerLogRows, rawEvents, rawPlayerGames, matchRows };
}
