// 하버FC 축구 자동 업로드·아카이브 대상 선별. RTDB/시트에 닿지 않는 순수 함수 —
// scripts/soccerAutoUpload.mjs 의 유일한 판단 지점이다. (테니스판: utils/tennis/autoUploadTargets.js)
//
// ★ 사람이 「경기마감」을 눌러 최종 집계 화면(phase 'summary')에 도달한 경기만 대상이다.
//   setup/match(진행 중이거나 시작만 하고 버린 경기)는 어떤 경우에도 건드리지 않는다.
// ★ 경기일(KST)이 오늘보다 이전인 경기만 — "다음날 오전 10시" 규칙. 당일 오전 경기를
//   10시 직전에 마감했다면 관리자가 아직 검토 중일 수 있다.
// ★ matchMode 검사는 팀 필터와 별개의 이중 방어다 — 풋살·테니스 state 가 섞여도 배제된다.
// ★ 컵/대회 세션(tournamentId)과 종료된 경기가 0개인 세션은 자동 처리하지 않는다.

export const ACTION_UPLOAD_ARCHIVE = 'upload_archive';
export const ACTION_ARCHIVE_ONLY = 'archive_only';
export const ACTION_SKIP = 'skip';

// gameId "g_<ms>" → KST 날짜 "YYYY-MM-DD". 앱 handleFinalize 가 브라우저(KST) 지역시각으로
// 만드는 dateStr 과 같은 값이다. 형식이 아니면 null.
export function kstDateFromGameId(gameId) {
  if (typeof gameId !== 'string' || !gameId.startsWith('g_')) return null;
  const ts = parseInt(gameId.slice(2), 10);
  if (!(ts > 0)) return null;
  return new Date(ts + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function classifySoccerAutoTarget(gameId, state, todayKst) {
  if (!state || state.matchMode !== 'soccer') return ACTION_SKIP;
  if (state.phase !== 'summary') return ACTION_SKIP;
  if (state.tournamentId) return ACTION_SKIP;
  const date = kstDateFromGameId(gameId);
  if (!date || !todayKst || date >= todayKst) return ACTION_SKIP;
  // 사람이 이미 기록확정을 성공시킨 경기 — 시트는 들어갔고 Archive 만 안 누른 상태.
  if (state.gameFinalized === true) return ACTION_ARCHIVE_ONLY;
  const finished = (state.soccerMatches || []).filter(m => m && m.status === 'finished');
  if (finished.length === 0) return ACTION_SKIP;
  return ACTION_UPLOAD_ARCHIVE;
}

export function selectSoccerAutoTargets(games, todayKst) {
  return (games || [])
    .map(g => ({ ...g, action: classifySoccerAutoTarget(g && g.gameId, g && g.state, todayKst) }))
    .filter(g => g.action !== ACTION_SKIP);
}

// 시트 5종. 키 = 진행 기록(games/{팀}/autoUpload/{gameId}/{key}) 의 필드명.
// 순서 = 러너의 전송 순서. 진실 소스(포인트 로그·선수기록보관소)를 먼저 보낸다 — 앱도 이 둘이
// 실패하면 전체 실패로 본다.
export const SOCCER_SHEET_KEYS = ['pointLog', 'playerLog', 'rawEvents', 'rawPlayerGames', 'rawMatches'];

// 아직 안 보낸 시트 중, 그 경기일 행이 시트에 이미 있는 것 = 누군가(사람의 부분 실패 기록확정,
// 또는 "실패 응답인데 실제로는 써진" 요청)가 먼저 넣은 것이다. 그대로 보내면 중복 행이 되므로
// 하나라도 있으면 그 경기는 자동 처리하지 않고 사람에게 넘긴다.
// progress: { [key]: truthy } — 러너가 이미 보낸 것으로 기록한 시트
// existingCounts: { [key]: number } — 그 날짜로 시트에 이미 있는 행 수
export function findSheetConflicts(progress, existingCounts) {
  const done = progress || {};
  return SOCCER_SHEET_KEYS.filter(k => !done[k] && (existingCounts?.[k] || 0) > 0);
}
