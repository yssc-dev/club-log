// 빅마스터FC 마감 행 빌더. 외부전 경기는 하버FC SoccerApp.handleFinalize 와 **같은 인자·같은 빌더**로 만든다(출력 동일).
// 자체전 경기는 편 기준 시점 뷰(vA, vB)를 같은 빌더에 넣고 편 이름만 후처리한다 — 스펙 §7.
import { buildEventLogRows, buildPointLogRows, buildPlayerLogRows } from '../soccerScoring';
import { buildRawEventsFromSoccer, buildRawPlayerGamesFromSoccer } from '../rawLogBuilders';
import { buildRoundRowsFromSoccer } from '../matchRowBuilder';
import { isIntra, sideView, fieldsOfA, fieldsOfB } from './sideView';

const plusOne = (m) => ({ ...m, matchIdx: m.matchIdx + 1 }); // 로그_매치용: buildEventLogRows 는 내부에서 +1, buildRoundRowsFromSoccer 는 그대로 쓴다

// buildEventLogRows가 '출전' 다음에 실제 row를 만드는 이벤트 타입(gkChange는 배경 이벤트라 row 없음).
const ROW_EVENT_TYPES = new Set(['goal', 'owngoal', 'opponentGoal', 'opponentOwnGoal', 'sub']);

// buildEventLogRows 내부와 동일한 정렬 기준(timestamp 오름차순) — row-생성 이벤트만.
function sortedRowEvents(events) {
  return (events || [])
    .filter((e) => ROW_EVENT_TYPES.has(e.type))
    .slice()
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}

// A측 event-row queue(큐A)와 B측 event-row queue(큐B)를, 각자의 원본 이벤트 timestamp 순서를 보존하며
// 하나의 시간순 시퀀스로 합친다. vA.events/vB.events는 같은 원본 m.events에서 파생된 두 시점이라
// (sideView) 같은 사건이 서로 다른 type(득점 ↔ 실점)으로 양쪽에 한 행씩 나타난다 — 전역 시간 순서로
// 합쳐야 골/실점 각각의 부분열이 실제 발생 순서를 따른다(리뷰 테스트: 실점 행은 '파랑,파랑,주황' 순).
export function mergeEventRowsByTimestamp(rowsA, eventsA, rowsB, eventsB) {
  // 인덱스 짝(rowsX[i] ↔ eventsX[i])은 buildEventLogRows 가 ROW_EVENT_TYPES 와 같은 집합·같은 정렬로
  // 행을 만든다는 전제다. 한쪽이 바뀌어 어긋나면 행이 엉뚱한 timestamp 위치로 섞여 조용히 잘못 기록된다.
  if (rowsA.length !== eventsA.length || rowsB.length !== eventsB.length) {
    throw new Error('buildIntraRows: 이벤트 행/이벤트 수 불일치 — SOCCER_EVENT_MAP 과 ROW_EVENT_TYPES 가 어긋났습니다');
  }
  let ia = 0, ib = 0;
  const merged = [];
  while (ia < eventsA.length && ib < eventsB.length) {
    const ta = eventsA[ia].timestamp || 0;
    const tb = eventsB[ib].timestamp || 0;
    if (ta <= tb) { merged.push(rowsA[ia]); ia++; }
    else { merged.push(rowsB[ib]); ib++; }
  }
  while (ia < eventsA.length) { merged.push(rowsA[ia]); ia++; }
  while (ib < eventsB.length) { merged.push(rowsB[ib]); ib++; }
  return merged;
}

export function buildIntraRows({ team, dateStr, inputTime, finished }) {
  const list = finished || [];
  if (list.length === 0) {
    return { sessionGameId: '', pointLogRows: [], playerLogRows: [], rawEvents: [], rawPlayerGames: [], matchRows: [] };
  }
  const sessionGameId = list[0].startedAt ? `s_${list[0].startedAt}` : `s_${dateStr}_${list[0].matchIdx + 1}`;

  // ── 외부전: 하버FC 경로 그대로(mode '기본', 후처리 없음) ──
  const external = list.filter((m) => !isIntra(m));
  const intraList = list.filter(isIntra);
  // 자체전 경기 하나 = 편 시점 뷰 두 개. 선수 집계는 이 뷰 전체를 한 번에 돌린다(아래 집계 주석).
  const intraViews = intraList.flatMap((m) => [sideView(m, 'A'), sideView(m, 'B')]);
  const extEvents = buildEventLogRows(external, dateStr);
  const pointLogRows = buildPointLogRows(external, dateStr, inputTime);   // 자체전은 포인트 로그에 쓰지 않는다(스펙 §7)
  const extPlayers = buildPlayerLogRows(external, dateStr, inputTime);
  const extMatchRows = buildRoundRowsFromSoccer({
    team, mode: '기본', tournamentId: '', date: dateStr,
    stateJSON: { soccerMatches: external.map(plusOne) }, inputTime,
  });
  const extRaw = buildRawEventsFromSoccer({ team, gameId: sessionGameId, events: extEvents });
  const extPG = buildRawPlayerGamesFromSoccer({ team, inputTime, players: extPlayers });

  // ── 선수 집계는 '날짜당 선수 1행' ──
  // Apps Script 의 로그_선수경기 dedupe 키는 team|sport|mode|tournament_id|date|player 뿐이라
  // (apps-script/Code.js:1751, _writeRawPlayerGames) 경기×편 1행이면 같은 날 2번째 자체전의 행이
  // 조용히 버려진다. calcSoccerPlayerStats 가 이름으로 누적하므로 뷰를 한 번에 넣어 합산한다.
  // session_team 은 상수 '자체전' — 한 선수가 1경기 A, 2경기 B 일 수 있어 단일 편 이름을 쓸 수 없다
  // (편 소속은 로그_매치 our_members_json/opponent_members_json 으로 복원, 분석은 session_team 을 읽지 않는다).
  const playerLogRows = buildPlayerLogRows([...external, ...intraViews], dateStr, inputTime);
  const intraPG = buildRawPlayerGamesFromSoccer({
    team, inputTime, players: buildPlayerLogRows(intraViews, dateStr, inputTime),
  }).map((r) => ({ ...r, mode: '자체전', session_team: '자체전' }));
  const rawPlayerGames = [...extPG, ...intraPG];

  // ── 자체전: 편마다 시점 뷰로 같은 빌더를 돌리고 편 이름·mode 후처리 ──
  const rawEvents = [...extRaw];
  const intraMatchRows = [];
  for (const m of intraList) {
    const nameA = fieldsOfA(m).name, nameB = fieldsOfB(m).name;
    const vA = sideView(m, 'A'), vB = sideView(m, 'B');

    const evA = buildEventLogRows([vA], dateStr);
    const evB = buildEventLogRows([vB], dateStr);

    const rawA = buildRawEventsFromSoccer({ team, mode: '자체전', gameId: sessionGameId, events: evA })
      .map((r) => ({ ...r, our_team: nameA }));
    const rawB = buildRawEventsFromSoccer({ team, mode: '자체전', gameId: sessionGameId, events: evB })
      .map((r) => ({ ...r, our_team: nameB }));
    // 출전 행은 앞쪽 lineup.length개 고정(buildEventLogRows 구조) — 나머지가 이벤트행.
    const lineupCountA = (vA.lineup || []).length;
    const lineupCountB = (vB.lineup || []).length;
    const lineupRowsA = rawA.slice(0, lineupCountA);
    const lineupRowsB = rawB.slice(0, lineupCountB);
    const eventRowsA = rawA.slice(lineupCountA);
    const eventRowsB = rawB.slice(lineupCountB);
    const mergedEventRows = mergeEventRowsByTimestamp(
      eventRowsA, sortedRowEvents(vA.events),
      eventRowsB, sortedRowEvents(vB.events),
    );
    rawEvents.push(...lineupRowsA, ...lineupRowsB, ...mergedEventRows);

    // 로그_매치 1행 = A 시점 행 + B 정보(명단·포메이션·수비수는 객체형 opponent_members_json 안에).
    const rowA = buildRoundRowsFromSoccer({ team, mode: '자체전', tournamentId: '', date: dateStr, stateJSON: { soccerMatches: [plusOne(vA)] }, inputTime })[0];
    const rowB = buildRoundRowsFromSoccer({ team, mode: '자체전', tournamentId: '', date: dateStr, stateJSON: { soccerMatches: [plusOne(vB)] }, inputTime })[0];
    intraMatchRows.push({
      ...rowA,
      our_team_name: nameA,
      opponent_team_name: nameB,
      opponent_members_json: JSON.stringify({ players: JSON.parse(rowB.our_members_json), formation: vB.formation || '', defenders: vB.defenders || [] }),
      opponent_gk: vB.gk || '',
    });
  }

  // 입력 순서대로 정렬(match_idx 기준) — 하버FC 처럼 한 배열로 쓴다
  const matchRows = [...extMatchRows, ...intraMatchRows].sort((a, b) => a.match_idx - b.match_idx);
  matchRows.forEach((r) => { r.game_id = sessionGameId; });
  return { sessionGameId, pointLogRows, playerLogRows, rawEvents, rawPlayerGames, matchRows };
}
