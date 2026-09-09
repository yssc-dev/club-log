// 풋살·축구 캐시의 컬럼 상수.
//
// ★ 시트 헤더가 아니라 Apps Script 응답 객체의 키다. 서버(_getPointLog/_getPlayerLog)가
//   시트 열을 camelCase 키로 매핑해서 내리므로 시트 헤더와 이름이 다르다.
//   서버 반환 shape 이 바뀌면 여기도 고칠 것 — 안 고쳐도 MISS_SCHEMA 로 자동 강등되어
//   데이터 손상은 없지만 캐시가 항상 미스가 된다.
//
// 로그 3종(matchLog/eventLog/playerGameLog)은 별도 상수가 필요 없다 —
// RAW_MATCH_COLUMNS / RAW_EVENT_COLUMNS / RAW_PLAYER_GAME_COLUMNS 가 서버 헤더와
// 완전히 일치함을 확인했다(2026-09-09).

export const POINT_LOG_CACHE_COLUMNS = [
  'date', 'matchId', 'myTeam', 'opponent', 'scorer', 'assist', 'ownGoal', 'foul', 'concedingGk',
];

export const PLAYER_LOG_CACHE_COLUMNS = [
  'date', 'name', 'goals', 'assists', 'ownGoals', 'conceded', 'cleanSheets',
  'crova', 'goguma', 'keeperGames', 'rankScore',
];
