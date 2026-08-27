// ═══════════════════════════════════════════════════════════════
// 풋살 웹앱 Apps Script v2.0
//
// CHANGELOG
// 2026-08-27: 테니스 시트 쓰기에 _sanitizeCell 적용 — 수식 주입 차단(_tennisRowToArray)
// 2026-08-19: _playerLogColMap 크로바/고구마 폴백 7/8 → -1(헤더 없으면 0). 하버FC
//             선수기록보관소엔 두 헤더가 없어 클린시트/실점 열을 오독 — getPrevRankings의
//             증분에 실점이 고구마로 실려 개인 누적 기록 ▲/▼ 배지가 유령 순위변동 표시
//             (_getCumulativeBonus/_getRankingHistory도 동일 경로라 함께 해소).
// 2026-08-14: 테니스 회원관리 — 회원명부 "구분"(정회원/게스트) 10번째 열 추가, getTennisRoster가
//             탈퇴+게스트 제외(분석 무변경). 액션 2종 신설: getTennisRosterAdmin(관리자 전용, 전체+행번호),
//             writeTennisRosterMember(관리자 전용 upsert+소프트삭제). 둘 다 ADMIN_ACTIONS 게이트+
//             행 팀소유 검증+수식 인젝션 이스케이프. _ensureTennisRosterColumns(10열만·가드·쓰기경로만).
// 2026-08-12: 로그_테니스매치/선수경기에 input_by(전송자) 컬럼 추가
// 2026-08-10: 테니스_레거시전적 시트+액션 2종(getTennisLegacyRecords, writeTennisLegacyRecords) 추가
// 2026-08-06: 테니스 종목 추가 — 시트 3종(테니스_회원명부/로그_테니스매치/로그_테니스선수경기)과
//             액션 5종(getTennisRoster, getTennisMatches, getTennisPlayerGames,
//             writeTennisMatches, writeTennisPlayerGames) 신설. 기존 풋살/축구 시트·액션 무수정.
//             회원명부 조회는 생년월일을 클라이언트로 내리지 않는다(2차 연령대 분석용으로만 시트에 보관).
// 2026-07-01: backfillSoccerMembers 추가 — 레거시 축구 로그_매치의 빈 our_members_json을
//             로그_이벤트 참여자(득점/어시/자책/실점GK) + our_gk 로 복원(개인분석 rounds 누락 해소).
//             dryRun 기본, 빈 행만 채움(비파괴). 에디터에서 _dryrun→검토→_apply 순으로 실행.
// 2026-06-11: 보안 강화 — (1) 2파트 레거시 authToken('이름:번호') 폐지: 팀 접근 제어 우회 경로 차단.
//             (2) _parseAuthToken이 토큰의 팀이 실제 소속인지 검증 + role 파싱.
//             (3) 파괴적/유지보수 액션(deleteRaw*, deleteTournament, reimport*, migrate*,
//                 backfill*, backupSheet, ensureEventLogHasGameId, finalizeState)에 관리자 role 서버측 검증 추가.
//             (4) verifyAuth 브루트포스 방어 — 이름당 실패 10회 시 10분 잠금(CacheService).
// 2026-06-11: _writePointLog/_writePlayerLog 시트 자동생성 버그 수정 — insertSheet('')(빈 상수) 호출로
//             팀 전용 시트 첫 마감이 항상 실패하던 문제. insertSheet(targetName)으로 수정.
// 2026-06-01: 선수별집계 로그 읽기 함수(_getCumulativeBonus/_getPrevRankings/_getRankingHistory)를
//             하드코딩 인덱스(소속팀=12, 크로바=7 등) → 헤더명 기반(_playerLogColMap)으로 전환.
//             향후 컬럼 삽입/순서변경에 견고. 헤더 탐색 실패 시 기존 표준 인덱스로 폴백.
// 2026-05-29: 로그_선수경기 중복 컬럼 "역주행"(=owngoals와 동일 자책골) 제거 완료 — PG 스키마 21→20칸.
//             RAW_PLAYER_GAMES_HEADERS/_rawPlayerGameToArray에서 역주행 삭제 + 일회성 함수로 시트 컬럼
//             삭제 완료(함수는 적용 후 제거). (선수별집계 로그의 역주행=owngoal 정식컬럼은 유지)
// 2026-05-29: 로그_선수경기 21칸 정합화 완료 — 5/15 fouls(N,14번) 중간삽입 이전 옛 행(739개, 20칸)을
//             N열 fouls=0 삽입으로 21칸 재정렬 + 시트 헤더도 20→21칸 갱신(5/15에 수동 헤더추가 누락분).
//             일회성 마이그레이션 함수는 적용 후 제거함.
// 2026-05-15: 비매너(반칙) 후속 수정 — _validatePointLogEvent가 foul 이벤트 거부하던 버그 수정,
//             _writePointLog에 "반칙선수" 컬럼(K열, 팀이름 다음) 추가 및 e.foulPlayer 기록.
//             ★ 기존 포인트로그 시트(마스터FC 포인트 로그)에 K열 "반칙선수" 헤더 수동 추가 필요.
// 2026-05-15: 비매너(반칙) 도입 — event_type 'foul' 신규 (1실점 처리, GK conceded+1, 클린시트 깸).
//             로그_선수경기 헤더에 fouls 컬럼 추가 (goals/assists/owngoals 다음 위치).
//             선수별집계기록 로그 헤더에 "반칙" 컬럼 추가 (N열, 소속팀 다음) — 점수 합산값 저장.
//             _writeRawEvents에서 foul도 dedupe 우회 (goal/owngoal과 동일하게 반복 가능).
// 2026-05-09: backfillFutsalGk 추가 — 4/23 이전 비어있는 our_gk/opponent_gk를 로그_이벤트.concede_gk로 추론 채움 (dryRun 기본). HTTP action 노출.
// 2026-05-08: _writeRawEvents — goal/owngoal 이벤트는 dedupe 우회 (축구·풋살 공통). 골 이벤트는 같은 (선수,어시,GK) 조합이 정당히 반복 가능
// 2026-05-02: _writeRawMatches — 풋살 our_gk/opponent_gk 누락 시 경고 로그 (미래 회귀 감지용)
// 2026-05-01: _isStandardMatchId 풋살 P/F prefix 인정 (P{n}_C{m}, F{n}_C{m})
// 2026-04-30: _writeRawEvents/_writeRawMatches 서버측 match_id 정규화 (클라이언트 우회 경로 방어)
// 2026-04-28: reimportPointLog 액션 추가 (HTTP 노출, 풋살/축구 디스패치)
// 2026-04-28: _importTournamentEventLogs — owngoal 정규화 + concede_gk 필드 추가 (누락 수정)
// 2026-04-28: _readSoccerPointSchema 통합 스키마 변환 + event_type owngoal 정규화 + concede_gk 필드 추가
// 2026-04-28: 로그_이벤트 스키마 변경 — concede_gk 컬럼 추가, goal/owngoal 행에 실점 GK 통합 기록
// 2026-04-28: deleteRawEventsByDate 액션 추가 (로그_이벤트 날짜별 삭제)
// 2026-04-08: 응답 표준화, 입력 검증, 팀 접근 제어, LockService 동시성 제어 (v2)
//
// 배포: 배포 관리 → 편집 → 새 버전 (URL 고정 유지)
// ═══════════════════════════════════════════════════════════════

var STATE_SHEET_NAME = "앱_경기상태";
var AUTH_SHEET_NAME = "회원인증";
var POINT_LOG_SHEET = "";
var PLAYER_LOG_SHEET = "";

var RAW_EVENTS_SHEET = "로그_이벤트";
var RAW_PLAYER_GAMES_SHEET = "로그_선수경기";
var RAW_MATCHES_SHEET = "로그_매치";

var RAW_EVENTS_HEADERS = [
  "team","sport","mode","tournament_id",
  "date","match_id","our_team","opponent",
  "event_type","player","related_player","concede_gk","position",
  "input_time","game_id"
];

var RAW_MATCHES_HEADERS = [
  "team","sport","mode","tournament_id",
  "date","game_id","match_idx",
  "round_idx","court_id","match_id",
  "our_team_name","opponent_team_name",
  "our_members_json","opponent_members_json",
  "our_score","opponent_score",
  "our_gk","opponent_gk",
  "formation","our_defenders_json",
  "is_extra","input_time"
];

var RAW_PLAYER_GAMES_HEADERS = [
  "team","sport","mode","tournament_id","date",
  "player","session_team",
  "games","field_games","keeper_games",
  "goals","assists","owngoals","fouls","conceded","cleansheets",
  "crova","goguma","rank_score",
  "input_time"
];

// ── 테니스 ─────────────────────────────────────────────
// ★ 아래 두 헤더 배열은 src/utils/tennis/tennisSchema.js 의
//   TENNIS_MATCH_COLUMNS / TENNIS_PLAYER_GAME_COLUMNS 와 순서까지 같아야 한다.
var TENNIS_ROSTER_SHEET = "테니스_회원명부";
var TENNIS_MATCHES_SHEET = "로그_테니스매치";
var TENNIS_PLAYER_GAMES_SHEET = "로그_테니스선수경기";

var TENNIS_ROSTER_HEADERS = [
  "팀이름", "이름", "닉네임", "생년월일", "등급", "상태", "시즌시작순위", "가입일", "비고", "구분"
];

var TENNIS_MATCH_HEADERS = [
  "team", "sport", "season", "date", "game_id",
  "round_idx", "court_id", "match_idx", "match_id",
  "format", "best_of",
  "side_a_json", "side_b_json",
  "sets_json", "sets_a", "sets_b", "games_a", "games_b", "winner",
  "league", "input_time", "input_by"
];

var TENNIS_PLAYER_GAME_HEADERS = [
  "team", "sport", "season", "date", "game_id", "match_id", "round_idx", "court_id",
  "player", "is_guest", "side", "format", "best_of",
  "partner", "opponents_json", "result",
  "sets_won", "sets_lost", "games_won", "games_lost",
  "tb_played", "tb_won", "aces", "double_faults",
  "bagels_taken", "bagels_given",
  "grade_at_date", "league", "input_time", "input_by"
];

var TENNIS_LEGACY_SHEET = "테니스_레거시전적";
var TENNIS_LEGACY_HEADERS = [
  "team", "sport", "season", "format", "player", "wins", "losses"
];

function _ensureRawSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var created = [];
  var ev = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (!ev) {
    ev = ss.insertSheet(RAW_EVENTS_SHEET);
    ev.getRange(1, 1, 1, RAW_EVENTS_HEADERS.length).setValues([RAW_EVENTS_HEADERS]);
    ev.getRange(1, 1, 1, RAW_EVENTS_HEADERS.length).setFontWeight("bold");
    created.push(RAW_EVENTS_SHEET);
  }
  var pg = ss.getSheetByName(RAW_PLAYER_GAMES_SHEET);
  if (!pg) {
    pg = ss.insertSheet(RAW_PLAYER_GAMES_SHEET);
    pg.getRange(1, 1, 1, RAW_PLAYER_GAMES_HEADERS.length).setValues([RAW_PLAYER_GAMES_HEADERS]);
    pg.getRange(1, 1, 1, RAW_PLAYER_GAMES_HEADERS.length).setFontWeight("bold");
    created.push(RAW_PLAYER_GAMES_SHEET);
  }
  var mt = ss.getSheetByName(RAW_MATCHES_SHEET);
  if (!mt) {
    mt = ss.insertSheet(RAW_MATCHES_SHEET);
    mt.getRange(1, 1, 1, RAW_MATCHES_HEADERS.length).setValues([RAW_MATCHES_HEADERS]);
    mt.getRange(1, 1, 1, RAW_MATCHES_HEADERS.length).setFontWeight("bold");
    created.push(RAW_MATCHES_SHEET);
  }
  return { created: created };
}

function _ensureEventLogHasGameId() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (!sheet) { _ensureRawSheets(); sheet = ss.getSheetByName(RAW_EVENTS_SHEET); }
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers.indexOf("game_id") >= 0) {
    if (sheet.getLastColumn() < RAW_EVENTS_HEADERS.length) {
      sheet.getRange(1, 1, 1, RAW_EVENTS_HEADERS.length).setValues([RAW_EVENTS_HEADERS]);
    }
    return { success: true, added: false };
  }
  var newCol = lastCol + 1;
  sheet.getRange(1, newCol).setValue("game_id");
  sheet.getRange(1, newCol).setFontWeight("bold");
  return { success: true, added: true, col: newCol };
}

function _backupSheet(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(sheetName);
  if (!src) return { success: false, error: "시트 없음: " + sheetName };
  var stamp = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyyMMdd_HHmm");
  var backupName = sheetName + "_백업_" + stamp;
  if (ss.getSheetByName(backupName)) {
    return { success: true, name: backupName, skipped: true };
  }
  var copy = src.copyTo(ss);
  copy.setName(backupName);
  return { success: true, name: backupName, skipped: false };
}

// ─── 한국시간 헬퍼 ───

function _kstNow() {
  return Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd'T'HH:mm:ss'+09:00'");
}

function _kstDate() {
  return Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd");
}

// 셀 값을 yyyy-MM-dd 문자열로 변환 (Date 객체, "2026. 1. 15", "2026-01-15" 등 모두 처리)
function _toDateStr(val) {
  if (val instanceof Date) return Utilities.formatDate(val, "Asia/Seoul", "yyyy-MM-dd");
  var s = String(val).trim();
  // "2026. 1. 15" or "2026.1.15" 형태 처리
  var m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (m) return m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2);
  return s;
}

// ─── 공통 헬퍼 ───

function _jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function _errorResponse(message, extra) {
  var resp = { success: false, error: message };
  if (extra) {
    for (var k in extra) resp[k] = extra[k];
  }
  return _jsonResponse(resp);
}

function _successResponse(data) {
  if (!data) data = {};
  data.success = true;
  return _jsonResponse(data);
}

// ─── 인증 토큰 파싱 (팀+이름+번호 추출) ───

function _parseAuthToken(token) {
  if (!token) return null;
  var parts = token.split(":");
  // "팀이름:이름:번호" 형식만 허용.
  // (2파트 레거시 '이름:번호'는 team이 비어 _checkTeamAccess가 무조건 통과되는 우회 경로라 폐지 — 2026-06-11)
  if (parts.length !== 3) return null;
  var result = _verifyAuth(parts[1], parts[2]);
  if (!result.success) return null;
  var tokenTeam = parts[0];
  // 회원인증 시트가 5컬럼(팀/역할 포함)이면 토큰의 팀이 실제 소속인지 검증하고 role을 붙인다.
  if (result.teams) {
    var role = "";
    for (var i = 0; i < result.teams.length; i++) {
      if (result.teams[i].team === tokenTeam) { role = result.teams[i].role || "멤버"; break; }
    }
    if (!role) return null; // 소속이 아닌 팀을 토큰에 지정 — 거부
    return { team: tokenTeam, name: parts[1], phone4: parts[2], role: role };
  }
  // 레거시 2컬럼 인증 시트 호환 (팀/역할 정보 없음)
  return { team: tokenTeam, name: parts[1], phone4: parts[2], role: "멤버" };
}

function _verifyAuthToken(token) {
  return _parseAuthToken(token) !== null;
}

// 팀 접근 제어: 토큰의 팀과 요청 팀이 일치하는지 확인
function _checkTeamAccess(authInfo, requestTeam) {
  if (!authInfo || !authInfo.team) return true; // 이전 형식이면 제한 없음
  if (!requestTeam) return true;
  return authInfo.team === requestTeam;
}

// ═══════════════════════════════════════════════════════════════
// 라우터
// ═══════════════════════════════════════════════════════════════

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || "ping";

    if (action === "ping") {
      return _jsonResponse({ success: true, time: _kstNow() });
    }

    // 인증
    var authToken = (e && e.parameter && e.parameter.authToken) || "";
    var authInfo = _parseAuthToken(authToken);
    if (!authInfo) return _errorResponse("인증 실패", { authRequired: true });

    var team = (e && e.parameter && e.parameter.team) || "";

    // 팀 접근 제어
    if (!_checkTeamAccess(authInfo, team)) {
      return _errorResponse("다른 팀의 데이터에 접근할 수 없습니다");
    }

    if (action === "loadState") {
      return _jsonResponse(_loadGameState(team));
    } else if (action === "getHistory") {
      return _jsonResponse(_getHistory(team));
    } else if (action === "getCumulativeBonus") {
      return _jsonResponse(_getCumulativeBonus(team));
    }

    return _errorResponse("Unknown action: " + action);
  } catch (err) {
    return _errorResponse(err.message);
  }
}

function doPost(e) {
  try {
    var body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return _errorResponse("잘못된 요청 형식");
    }

    var action = body.action;

    // verifyAuth는 인증 불필요 — 단 브루트포스 방어(이름당 실패 10회 → 10분 잠금)
    if (action === "verifyAuth") {
      var cache = CacheService.getScriptCache();
      var rlKey = "authfail_" + String(body.name || "").trim();
      var fails = Number(cache.get(rlKey) || 0);
      if (fails >= 10) {
        return _errorResponse("시도 횟수를 초과했습니다. 10분 후 다시 시도하세요");
      }
      var vres = _verifyAuth(body.name, body.phone4);
      if (vres.success) cache.remove(rlKey);
      else cache.put(rlKey, String(fails + 1), 600);
      return _jsonResponse(vres);
    }

    // 그 외 액션은 인증 필요
    var authToken = body.authToken || "";
    var authInfo = _parseAuthToken(authToken);
    if (!authInfo) return _errorResponse("인증 실패", { authRequired: true });

    // 팀 접근 제어 (요청 body에서 team 추출)
    var requestTeam = body.team || (body.data && body.data.team) || "";
    if (!_checkTeamAccess(authInfo, requestTeam)) {
      return _errorResponse("다른 팀의 데이터에 접근할 수 없습니다");
    }

    // 파괴적/유지보수 액션은 서버측 role 검증 — 클라이언트 버튼 숨김만으로는 우회 가능
    var ADMIN_ACTIONS = {
      finalizeState: 1,
      deleteRawPlayerGamesByDate: 1, deleteRawMatchesByDate: 1, deleteRawEventsByDate: 1,
      deleteTournament: 1, reimportPointLog: 1,
      migrateEventTypes: 1, migrateMatchIds: 1, backfillFutsalGk: 1,
      backupSheet: 1, ensureEventLogHasGameId: 1,
      getTennisRosterAdmin: 1, writeTennisRosterMember: 1,
    };
    if (ADMIN_ACTIONS[action] && authInfo.role !== "관리자") {
      return _errorResponse("관리자 권한이 필요합니다");
    }

    if (action === "saveState") {
      return _jsonResponse(_saveGameState(body.state, body.team, body.gameId));
    } else if (action === "loadState") {
      return _jsonResponse(_loadGameState(requestTeam));
    } else if (action === "getHistory") {
      return _jsonResponse(_getHistory(requestTeam));
    } else if (action === "getCumulativeBonus") {
      return _jsonResponse(_getCumulativeBonus(requestTeam, body.playerLogSheet || ""));
    } else if (action === "getPointLog") {
      return _jsonResponse(_getPointLog(requestTeam, body.pointLogSheet || ""));
    } else if (action === "getPlayerLog") {
      return _jsonResponse(_getPlayerLog(requestTeam, body.playerLogSheet || ""));
    } else if (action === "getSheetList") {
      return _jsonResponse(_getSheetList());
    } else if (action === "getPrevRankings") {
      return _jsonResponse(_getPrevRankings(requestTeam, body.playerLogSheet || ""));
    } else if (action === "getRankingHistory") {
      return _jsonResponse(_getRankingHistory(requestTeam, body.allPlayers || [], body.playerLogSheet || ""));
    } else if (action === "clearState") {
      return _jsonResponse(_clearGameState(body.team, body.gameId));
    } else if (action === "finalizeState") {
      return _jsonResponse(_finalizeGameState(body.team, body.gameId, body.state));
    } else if (action === "writePointLog") {
      return _jsonResponse(_writePointLog(body.data, body.pointLogSheet || ""));
    } else if (action === "writePlayerLog") {
      return _jsonResponse(_writePlayerLog(body.data, body.playerLogSheet || ""));
    } else if (action === "writeEventLog") {
      return _jsonResponse(_writeEventLog(body.data, body.eventLogSheet || ""));
    } else if (action === "writeSoccerPointLog") {
      return _jsonResponse(_writeSoccerPointLog(body.data, body.pointLogSheet || ""));
    } else if (action === "writeSoccerPlayerLog") {
      return _jsonResponse(_writeSoccerPlayerLog(body.data, body.playerLogSheet || ""));
    } else if (action === "writeRawEvents") {
      return _jsonResponse(_writeRawEvents(body.data));
    } else if (action === "reimportPointLog") {
      return _jsonResponse(_reimportPointLog(body.team, body.sport, body.pointSheet));
    } else if (action === "writeRawPlayerGames") {
      return _jsonResponse(_writeRawPlayerGames(body.data));
    } else if (action === "deleteRawPlayerGamesByDate") {
      return _jsonResponse(_deleteRawPlayerGamesByDate(body.team, body.sport, body.date));
    } else if (action === "ensureEventLogHasGameId") {
      return _jsonResponse(_ensureEventLogHasGameId());
    } else if (action === "backupSheet") {
      return _jsonResponse(_backupSheet(body.sheetName));
    } else if (action === "writeRawMatches") {
      return _jsonResponse(_writeRawMatches(body.data));
    } else if (action === "deleteRawMatchesByDate") {
      return _jsonResponse(_deleteRawMatchesByDate(body.team, body.sport, body.date));
    } else if (action === "deleteRawEventsByDate") {
      return _jsonResponse(_deleteRawEventsByDate(body.team, body.sport, body.date));
    } else if (action === "getRawMatches") {
      return _jsonResponse(_getRawMatches(body.team, body.sport, body.dateFrom, body.dateTo));
    } else if (action === "getRawEvents") {
      return _jsonResponse(_getRawEvents(body.team, body.sport, body.dateFrom, body.dateTo));
    } else if (action === "getTennisRoster") {
      return _jsonResponse(_getTennisRoster(requestTeam));
    } else if (action === "getTennisRosterAdmin") {
      return _jsonResponse(_getTennisRosterAdmin(requestTeam));
    } else if (action === "writeTennisRosterMember") {
      return _jsonResponse(_writeTennisRosterMember(requestTeam, body));
    } else if (action === "getTennisMatches") {
      return _jsonResponse(_readTennisRows(TENNIS_MATCHES_SHEET, TENNIS_MATCH_HEADERS, requestTeam, body.dateFrom, body.dateTo));
    } else if (action === "getTennisPlayerGames") {
      return _jsonResponse(_readTennisRows(TENNIS_PLAYER_GAMES_SHEET, TENNIS_PLAYER_GAME_HEADERS, requestTeam, body.dateFrom, body.dateTo));
    } else if (action === "writeTennisMatches") {
      return _jsonResponse(_writeTennisMatches(body.data));
    } else if (action === "writeTennisPlayerGames") {
      return _jsonResponse(_writeTennisPlayerGames(body.data));
    } else if (action === "getTennisLegacyRecords") {
      return _jsonResponse(_getTennisLegacyRecords(requestTeam));
    } else if (action === "writeTennisLegacyRecords") {
      return _jsonResponse(_writeTennisRows(TENNIS_LEGACY_SHEET, TENNIS_LEGACY_HEADERS, body.data));
    } else if (action === "getRawPlayerGames") {
      return _jsonResponse(_getRawPlayerGames(body.team, body.sport));
    } else if (action === "migrateEventTypes") {
      return _jsonResponse(migrateEventTypes());
    } else if (action === "migrateMatchIds") {
      return _jsonResponse(migrateMatchIds());
    } else if (action === "backfillFutsalGk") {
      return _jsonResponse(backfillFutsalGk(body.opts || {}));
    } else if (action === "createTournament") {
      return _jsonResponse(_createTournament(body.data));
    } else if (action === "deleteTournament") {
      return _jsonResponse(_deleteTournament(body.tournamentId));
    } else if (action === "updateTournamentMatch") {
      return _jsonResponse(_updateTournamentMatch(body.tournamentId, body.matchNum, body.updates || {}));
    } else if (action === "getTournamentList") {
      return _jsonResponse(_getTournamentList(requestTeam));
    } else if (action === "getTournamentRoster") {
      return _jsonResponse(_getTournamentRoster(body.tournamentId));
    } else if (action === "getTournamentSchedule") {
      return _jsonResponse(_getTournamentSchedule(body.tournamentId, body.ourTeam || ""));
    } else if (action === "updateTournamentMatchScore") {
      return _jsonResponse(_updateTournamentMatchScore(body.tournamentId, body.matchNum, body.homeScore, body.awayScore));
    } else if (action === "writeTournamentEventLog") {
      return _jsonResponse(_writeTournamentEventLog(body.tournamentId, body.data));
    } else if (action === "writeTournamentPlayerRecord") {
      return _jsonResponse(_writeTournamentPlayerRecord(body.tournamentId, body.data));
    } else if (action === "getTournamentPlayerRecords") {
      return _jsonResponse(_getTournamentPlayerRecords(body.tournamentId));
    } else if (action === "getTournamentEventLog") {
      return _jsonResponse(_getTournamentEventLog(body.tournamentId));
    }

    return _errorResponse("Unknown action: " + action);
  } catch (err) {
    return _errorResponse(err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// 회원 인증
// 시트 컬럼: A=팀이름, B=모드, C=이름, D=휴대폰뒷자리, E=역할
// ═══════════════════════════════════════════════════════════════

function _getAuthSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(AUTH_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(AUTH_SHEET_NAME);
    sheet.getRange("A1:E1").setValues([["팀이름", "모드", "이름", "휴대폰뒷자리", "역할"]]);
    sheet.getRange("A1:E1").setFontWeight("bold");
  }
  return sheet;
}

function _verifyAuth(name, phone4) {
  if (!name || !phone4) return { success: false, message: "이름과 휴대폰 뒷자리를 입력하세요" };

  var sheet = _getAuthSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: false, message: "등록된 회원이 없습니다. 관리자에게 문의하세요" };

  var colCount = sheet.getLastColumn();
  var inputName = String(name).trim();
  var inputPhone = String(phone4).trim().replace(/^0+/, "");

  // 새 형식 (5컬럼: 팀이름, 모드, 이름, 휴대폰뒷자리, 역할)
  if (colCount >= 5) {
    var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
    var teams = [];
    for (var i = 0; i < data.length; i++) {
      var regName = String(data[i][2]).trim();
      var regPhone = String(data[i][3]).trim().replace(/^0+/, "");
      if (regName === inputName && regPhone === inputPhone) {
        teams.push({
          team: String(data[i][0]).trim(),
          mode: String(data[i][1]).trim() || "풋살",
          role: String(data[i][4]).trim() || "멤버",
        });
      }
    }
    if (teams.length > 0) {
      return { success: true, name: inputName, teams: teams };
    }
    return { success: false, message: "이름 또는 번호가 일치하지 않습니다" };
  }

  // 이전 형식 호환 (2컬럼: 이름, 휴대폰뒷자리)
  var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (var i = 0; i < data.length; i++) {
    var regName = String(data[i][0]).trim();
    var regPhone = String(data[i][1]).trim().replace(/^0+/, "");
    if (regName === inputName && regPhone === inputPhone) {
      return { success: true, name: regName };
    }
  }
  return { success: false, message: "이름 또는 번호가 일치하지 않습니다" };
}

// ═══════════════════════════════════════════════════════════════
// 경기 상태 관리 (LockService로 동시성 제어)
// 시트 컬럼: A=팀이름, B=경기일자, C=상태(진행중/확정), D=상태JSON, E=저장시간, F=요약
// ═══════════════════════════════════════════════════════════════

function _getOrCreateStateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STATE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(STATE_SHEET_NAME);
    sheet.getRange("A1:F1").setValues([["팀이름", "경기일자", "상태", "상태JSON", "저장시간", "요약"]]);
    sheet.getRange("A1:F1").setFontWeight("bold");
  }
  return sheet;
}

// 팀+상태로 모든 행 찾기 (다중 경기 지원)
function _findAllStateRows(sheet, team, status) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  var rows = [];
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === team && String(data[i][2]).trim() === status) {
      rows.push(i + 2);
    }
  }
  return rows;
}

// 팀+gameId로 특정 행 찾기 (state_json 내부의 gameId 매칭)
function _findStateRowByGameId(sheet, team, gameId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var colCount = sheet.getLastColumn();
  if (colCount < 6) return -1;
  var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() !== team) continue;
    if (String(data[i][2]).trim() !== "진행중") continue;
    // 요약(F열)에서 gameId 매칭 (빠른 검색)
    if (gameId && String(data[i][5]).indexOf(gameId) >= 0) return i + 2;
    // 폴백: JSON 파싱
    if (gameId) {
      try {
        var s = JSON.parse(data[i][3]);
        if (s.gameId === gameId) return i + 2;
      } catch(e) {}
    }
  }
  return -1;
}

// 경기일자: gameId 타임스탬프(경기 생성 시점) 사용, 없으면 현재 날짜
function _stateRowGameDate(gameId) {
  var gameDate = _kstDate();
  if (gameId && gameId.indexOf("g_") === 0) {
    try {
      var ts = parseInt(gameId.substring(2), 10);
      if (ts > 0) gameDate = Utilities.formatDate(new Date(ts), "Asia/Seoul", "yyyy-MM-dd");
    } catch(e) {}
  }
  return gameDate;
}

function _stateRowSummary(gameId, state) {
  var evtCount = (state.allEvents || []).length;
  var matchCount = (state.completedMatches || []).length;
  var creator = state.gameCreator || state.lastEditor || "?";
  return gameId + " | " + creator + " | " + (state.phase || "?") + " | 이벤트 " + evtCount + "건 | 완료 " + matchCount + "경기";
}

function _saveGameState(state, team, gameId) {
  if (!state) return { success: false, error: "state is empty" };
  if (!team) team = "기본팀";
  if (!gameId) gameId = state.gameId || "";
  var gameDate = _stateRowGameDate(gameId);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { success: false, error: "다른 저장이 진행 중입니다. 잠시 후 다시 시도하세요" };

  try {
    var sheet = _getOrCreateStateSheet();
    var json = JSON.stringify(state);
    var now = _kstNow();
    var summary = _stateRowSummary(gameId, state);

    // gameId로 기존 행 찾기
    var row = gameId ? _findStateRowByGameId(sheet, team, gameId) : -1;
    if (row > 0) {
      sheet.getRange(row, 2, 1, 5).setValues([[gameDate, "진행중", json, now, summary]]);
    } else {
      var lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, 1, 6).setValues([[team, gameDate, "진행중", json, now, summary]]);
    }

    return { success: true, savedAt: now, summary: summary };
  } finally {
    lock.releaseLock();
  }
}

function _loadGameState(team) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STATE_SHEET_NAME);
  if (!sheet) return { success: true, found: false, games: [] };

  if (!team) team = "기본팀";

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, found: false, games: [] };

  var colCount = sheet.getLastColumn();

  if (colCount >= 6) {
    var rows = _findAllStateRows(sheet, team, "진행중");
    if (rows.length === 0) return { success: true, found: false, games: [] };

    var games = [];
    for (var r = 0; r < rows.length; r++) {
      var rowData = sheet.getRange(rows[r], 1, 1, 6).getValues()[0];
      var json = rowData[3];
      if (!json) continue;
      try {
        var state = JSON.parse(json);
        games.push({
          gameId: state.gameId || "legacy_" + r,
          state: state,
          savedAt: rowData[4] ? new Date(rowData[4]).toISOString() : null,
          summary: String(rowData[5]) || "",
        });
      } catch (e) { /* skip invalid */ }
    }

    // 하위호환: 단일 게임도 found 플래그 제공
    return { success: true, found: games.length > 0, games: games, state: games.length > 0 ? games[0].state : null, savedAt: games.length > 0 ? games[0].savedAt : null };
  }

  // 이전 형식 호환 (3컬럼)
  var json = sheet.getRange("A2").getValue();
  var savedAt = sheet.getRange("B2").getValue();
  if (!json) return { success: true, found: false, games: [] };
  try {
    var state = JSON.parse(json);
    var game = { gameId: state.gameId || "legacy", state: state, savedAt: savedAt ? String(savedAt) : null };
    return { success: true, found: true, games: [game], state: state, savedAt: game.savedAt };
  } catch (e) {
    return { success: false, found: false, games: [], error: "JSON 파싱 실패: " + e.message };
  }
}

function _clearGameState(team, gameId) {
  if (!team) team = "기본팀";

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { success: false, error: "잠금 획득 실패" };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(STATE_SHEET_NAME);
    if (!sheet) return { success: true, message: "시트 없음" };

    var colCount = sheet.getLastColumn();

    if (colCount >= 6) {
      var row = gameId ? _findStateRowByGameId(sheet, team, gameId) : -1;
      // gameId 없으면 첫 번째 "진행중" 삭제 (하위호환)
      if (row < 0) {
        var rows = _findAllStateRows(sheet, team, "진행중");
        row = rows.length > 0 ? rows[0] : -1;
      }
      if (row > 0) {
        sheet.deleteRow(row);
      }
      return { success: true, message: "상태 초기화 완료" };
    }

    sheet.getRange("A2:C2").clearContent();
    return { success: true, message: "상태 초기화 완료" };
  } finally {
    lock.releaseLock();
  }
}

// Firebase 단일화 이후 진행중 행이 없을 수 있으므로, state가 제공되면 확정 행을 신규 insert.
function _finalizeGameState(team, gameId, state) {
  if (!team) team = "기본팀";

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { success: false, error: "잠금 획득 실패" };

  try {
    var sheet = _getOrCreateStateSheet();
    var colCount = sheet.getLastColumn();
    var now = _kstNow();

    if (colCount >= 6) {
      var row = gameId ? _findStateRowByGameId(sheet, team, gameId) : -1;
      if (row < 0) {
        var rows = _findAllStateRows(sheet, team, "진행중");
        row = rows.length > 0 ? rows[0] : -1;
      }

      if (row > 0) {
        if (state) {
          var gameDate = _stateRowGameDate(gameId);
          var json = JSON.stringify(state);
          var summary = _stateRowSummary(gameId, state);
          sheet.getRange(row, 2, 1, 5).setValues([[gameDate, "확정", json, now, summary]]);
        } else {
          sheet.getRange(row, 3).setValue("확정");
          sheet.getRange(row, 5).setValue(now);
        }
        return { success: true, message: "경기 확정 완료" };
      }

      if (state) {
        var gameDate2 = _stateRowGameDate(gameId);
        var json2 = JSON.stringify(state);
        var summary2 = _stateRowSummary(gameId, state);
        var lastRow = sheet.getLastRow();
        sheet.getRange(lastRow + 1, 1, 1, 6).setValues([[team, gameDate2, "확정", json2, now, summary2]]);
        return { success: true, message: "경기 확정 신규 저장" };
      }
      return { success: false, error: "진행중인 경기 없음 (state 없음)" };
    }

    sheet.getRange("A2:C2").clearContent();
    return { success: true, message: "경기 확정 완료 (이전 형식)" };
  } finally {
    lock.releaseLock();
  }
}

function _getHistory(team) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STATE_SHEET_NAME);
  if (!sheet) return { success: true, history: [] };

  if (!team) team = "기본팀";

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, history: [] };

  var colCount = sheet.getLastColumn();
  if (colCount < 3) return { success: true, history: [] };

  // 최소 3열(team, date, status)만 있으면 동작, 부족한 열은 빈값 처리
  var readCols = Math.min(colCount, 6);
  var data = sheet.getRange(2, 1, lastRow - 1, readCols).getValues();
  var history = [];

  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === team && String(data[i][2]).trim() === "확정") {
      history.push({
        team: String(data[i][0]).trim(),
        gameDate: String(data[i][1]).trim(),
        status: "확정",
        stateJson: data[i][3] ? String(data[i][3]) : "",
        savedAt: data[i][4] ? String(data[i][4]) : null,
        summary: data[i][5] ? String(data[i][5]) : "",
      });
    }
  }

  history.sort(function(a, b) {
    var d = b.gameDate.localeCompare(a.gameDate);
    if (d !== 0) return d;
    return (b.savedAt || "").localeCompare(a.savedAt || "");
  });

  return { success: true, history: history };
}

// ═══════════════════════════════════════════════════════════════
// 포인트로그 / 선수별집계 (입력 검증 + LockService)
// ═══════════════════════════════════════════════════════════════

function _validatePointLogEvent(e, idx) {
  var errors = [];
  if (!e.gameDate) errors.push("이벤트[" + idx + "]: gameDate 누락");
  if (!e.matchId) errors.push("이벤트[" + idx + "]: matchId 누락");
  if (!e.scorer && !e.ownGoalPlayer && !e.foulPlayer) errors.push("이벤트[" + idx + "]: scorer, ownGoalPlayer, foulPlayer 중 하나 필요");
  return errors;
}

function _validatePlayerLogEntry(p, idx) {
  var errors = [];
  if (!p.gameDate) errors.push("선수[" + idx + "]: gameDate 누락");
  if (!p.name) errors.push("선수[" + idx + "]: name 누락");
  return errors;
}

function _writePointLog(data, sheetName) {
  if (!data) return { success: false, error: "data 누락" };
  var teamName = data.team || "";
  var rows = data.events || [];
  if (rows.length === 0) return { success: true, message: "이벤트 없음", count: 0 };

  // 입력 검증
  var allErrors = [];
  for (var i = 0; i < rows.length; i++) {
    var errs = _validatePointLogEvent(rows[i], i);
    allErrors = allErrors.concat(errs);
  }
  if (allErrors.length > 0) return { success: false, error: "검증 실패", details: allErrors };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var targetName = sheetName || POINT_LOG_SHEET;
    if (!targetName) return { success: false, error: "포인트로그 시트명이 지정되지 않았습니다" };
    var sheet = ss.getSheetByName(targetName);
    if (!sheet) {
      sheet = ss.insertSheet(targetName);
      sheet.getRange("A1:K1").setValues([["경기일자","경기번호","내팀","상대팀","득점선수","어시선수","자책골","실점키퍼명","입력시간","팀이름","반칙선수"]]);
      sheet.getRange("A1:K1").setFontWeight("bold");
    }

    var values = rows.map(function(e) {
      return [
        e.gameDate, e.matchId, e.myTeam || "", e.opponentTeam || "",
        e.scorer || "", e.assist || "", e.ownGoalPlayer || "",
        e.concedingGk || "", e.inputTime || _kstNow(), teamName,
        e.foulPlayer || "",
      ];
    });

    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, values.length, 11).setValues(values);
    return { success: true, count: values.length };
  } finally {
    lock.releaseLock();
  }
}

function _writePlayerLog(data, sheetName) {
  if (!data) return { success: false, error: "data 누락" };
  var teamName = data.team || "";
  var rows = data.players || [];
  if (rows.length === 0) return { success: true, message: "선수 데이터 없음", count: 0 };

  // 입력 검증
  var allErrors = [];
  for (var i = 0; i < rows.length; i++) {
    var errs = _validatePlayerLogEntry(rows[i], i);
    allErrors = allErrors.concat(errs);
  }
  if (allErrors.length > 0) return { success: false, error: "검증 실패", details: allErrors };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var targetName = sheetName || PLAYER_LOG_SHEET;
    if (!targetName) return { success: false, error: "선수별집계 시트명이 지정되지 않았습니다" };
    var sheet = ss.getSheetByName(targetName);
    if (!sheet) {
      sheet = ss.insertSheet(targetName);
      sheet.getRange("A1:N1").setValues([["경기일자","선수명","골","어시","역주행","실점","클린시트","크로바","고구마","키퍼경기수","팀순위점수","입력시간","소속팀","반칙"]]);
      sheet.getRange("A1:N1").setFontWeight("bold");
    }

    var values = rows.map(function(p) {
      return [
        p.gameDate, p.name,
        Number(p.goals) || 0, Number(p.assists) || 0, Number(p.owngoals) || 0,
        Number(p.conceded) || 0, Number(p.cleanSheets) || 0,
        Number(p.crova) || 0, Number(p.goguma) || 0, Number(p.keeperGames) || 0,
        Number(p.rankScore) || 0, p.inputTime || _kstNow(), teamName,
        Number(p.fouls) || 0,
      ];
    });

    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, values.length, 14).setValues(values);
    return { success: true, count: values.length };
  } finally {
    lock.releaseLock();
  }
}

// ═══════════════════════════════════════════════════════════════
// 축구 이벤트로그 쓰기
// 컬럼: 경기일자, 경기번호, 상대팀명, 이벤트, 선수, 관련선수, 포지션, 입력시간
// ═══════════════════════════════════════════════════════════════

function _writeEventLog(data, sheetName) {
  if (!data) return { success: false, error: "data 누락" };
  var teamName = data.team || "";
  var rows = data.events || [];
  if (rows.length === 0) return { success: true, message: "이벤트 없음", count: 0 };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var targetName = sheetName || "축구_이벤트로그";
    var sheet = ss.getSheetByName(targetName);
    if (!sheet) {
      sheet = ss.insertSheet(targetName);
      sheet.getRange("A1:H1").setValues([["경기일자","경기번호","상대팀명","이벤트","선수","관련선수","포지션","입력시간"]]);
      sheet.getRange("A1:H1").setFontWeight("bold");
    }

    var values = rows.map(function(e) {
      return [
        e.gameDate, e.matchNum || "", e.opponent || "",
        e.event || "", e.player || "", e.relatedPlayer || "",
        e.position || "", e.inputTime || _kstNow(),
      ];
    });

    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, values.length, 8).setValues(values);
    return { success: true, count: values.length };
  } finally {
    lock.releaseLock();
  }
}

// ═══════════════════════════════════════════════════════════════
// 축구 포인트로그 쓰기
// 컬럼: 경기일자, 경기번호, 상대팀명, 득점, 어시, 실점, 자책골, 입력시간
// ═══════════════════════════════════════════════════════════════

function _writeSoccerPointLog(data, sheetName) {
  if (!data) return { success: false, error: "data 누락" };
  var teamName = data.team || "";
  var rows = data.events || [];
  if (rows.length === 0) return { success: true, message: "이벤트 없음", count: 0 };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var targetName = sheetName || "축구_포인트로그";
    var sheet = ss.getSheetByName(targetName);
    if (!sheet) {
      sheet = ss.insertSheet(targetName);
      sheet.getRange("A1:H1").setValues([["경기일자","경기번호","상대팀명","득점","어시","실점","자책골","입력시간"]]);
      sheet.getRange("A1:H1").setFontWeight("bold");
    }

    var values = rows.map(function(e) {
      return [
        e.gameDate, e.matchId || "", e.opponent || "",
        e.scorer || "", e.assist || "", e.conceded || "",
        e.ownGoalPlayer || "", e.inputTime || _kstNow(),
      ];
    });

    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, values.length, 8).setValues(values);
    return { success: true, count: values.length };
  } finally {
    lock.releaseLock();
  }
}

// ═══════════════════════════════════════════════════════════════
// 축구 선수별집계기록 쓰기
// 컬럼: 경기일자, 선수명, 전체경기, 필드경기, 키퍼경기, 골, 어시, 클린시트, 실점, 자책골, 입력시간
// ═══════════════════════════════════════════════════════════════

function _writeSoccerPlayerLog(data, sheetName) {
  if (!data) return { success: false, error: "data 누락" };
  var teamName = data.team || "";
  var rows = data.players || [];
  if (rows.length === 0) return { success: true, message: "선수 데이터 없음", count: 0 };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var targetName = sheetName || "축구_선수별집계기록로그";
    var sheet = ss.getSheetByName(targetName);
    if (!sheet) {
      sheet = ss.insertSheet(targetName);
      sheet.getRange("A1:K1").setValues([["경기일자","선수명","전체경기","필드경기","키퍼경기","골","어시","클린시트","실점","자책골","입력시간"]]);
      sheet.getRange("A1:K1").setFontWeight("bold");
    }

    var values = rows.map(function(p) {
      return [
        p.gameDate, p.name,
        Number(p.games) || 0, Number(p.fieldGames) || 0, Number(p.keeperGames) || 0,
        Number(p.goals) || 0, Number(p.assists) || 0, Number(p.cleanSheets) || 0,
        Number(p.conceded) || 0, Number(p.owngoals) || 0,
        p.inputTime || _kstNow(),
      ];
    });

    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, values.length, 11).setValues(values);
    return { success: true, count: values.length };
  } finally {
    lock.releaseLock();
  }
}

function _writeRawEvents(data) {
  if (!data || !data.rows) return { success: false, error: "rows 누락" };
  _ensureRawSheets();
  var rows = data.rows;
  if (rows.length === 0) return { success: true, count: 0, skipped: 0 };
  // skipDedupe=true: Legacy import 용. 같은 (선수,경기,event_type,date,tid,team) 조합이
  // 정당하게 중복되는 케이스(헤딩골 2회 입력 등) 보존 위함. 재실행 전 _clearRawSheets 필수.
  var skipDedupe = data.skipDedupe === true;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(RAW_EVENTS_SHEET);
    var existingKeys = skipDedupe ? {} : _loadRawEventKeys(sheet);

    var toInsert = [];
    var skipped = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      // 서버측 match_id 정규화 (클라이언트 우회 경로 방어)
      r.match_id = _normalizeMatchIdAS(r.match_id || "", r.sport || "");
      // 골/자책골/반칙 이벤트는 dedupe 우회: 같은 매치에서 동일 (선수, 어시, 상대 GK) 조합이
      // 정당하게 반복 가능 (헤딩 2골, 반칙 2회 등). 축구·풋살 공통 규칙.
      var isGoalEvent = r.event_type === "goal" || r.event_type === "owngoal" || r.event_type === "foul";
      if (!skipDedupe && !isGoalEvent) {
        var key = _rawEventKey(r);
        if (existingKeys[key]) { skipped++; continue; }
        existingKeys[key] = true;
      }
      toInsert.push(_rawEventToArray(r));
    }
    if (toInsert.length > 0) {
      var lastRow = sheet.getLastRow();
      var lastCol = sheet.getLastColumn();
      if (lastCol < RAW_EVENTS_HEADERS.length) {
        _ensureEventLogHasGameId();
      }
      sheet.getRange(lastRow + 1, 1, toInsert.length, RAW_EVENTS_HEADERS.length).setValues(toInsert);
    }
    return { success: true, count: toInsert.length, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}

function _rawEventKey(r) {
  return [r.team||"", r.sport||"", r.mode||"", r.tournament_id||"", r.date||"", r.match_id||"",
    r.event_type||"", r.player||"", r.related_player||"", r.concede_gk||"", r.input_time||"", r.game_id||""].join("|");
}

function _rawEventToArray(r) {
  return [r.team||"", r.sport||"", r.mode||"", r.tournament_id||"",
    r.date||"", r.match_id||"", r.our_team||"", r.opponent||"",
    r.event_type||"", r.player||"", r.related_player||"", r.concede_gk||"", r.position||"",
    r.input_time||"", r.game_id||""];
}

function _loadRawEventKeys(sheet) {
  var lastRow = sheet.getLastRow();
  var keys = {};
  if (lastRow < 2) return keys;
  var lastCol = sheet.getLastColumn();
  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var gidCol = headers.indexOf("game_id");
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    var gid = gidCol >= 0 ? String(r[gidCol] || "") : "";
    var key = [r[0], r[1], r[2], r[3], _toDateStr(r[4]), r[5], r[8], r[9], r[10], String(r[11]||""), String(r[13]), gid].join("|");
    keys[key] = true;
  }
  return keys;
}

function _writeRawMatches(data) {
  if (!data || !data.rows) return { success: false, error: "rows 누락" };
  _ensureRawSheets();
  var rows = data.rows;
  if (rows.length === 0) return { success: true, count: 0, skipped: 0 };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(RAW_MATCHES_SHEET);
    var existingKeys = _loadRawMatchKeys(sheet);

    var toInsert = [];
    var skipped = 0;
    var gkMissing = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      // 서버측 match_id 정규화 (클라이언트 우회 경로 방어)
      r.match_id = _normalizeMatchIdAS(r.match_id || "", r.sport || "");
      // 풋살 our_gk/opponent_gk 누락 가드: PG 시트와 keeper 카운트가 어긋나는 데이터 회귀를 조기 감지.
      // 멤버가 있는데 GK 표기가 비면 일단 기록은 하되 카운트해서 마지막에 경고 로그.
      if (r.sport === "풋살" && !r.is_extra) {
        var hasOurMembers = (r.our_members_json && r.our_members_json !== "[]");
        var hasOppMembers = (r.opponent_members_json && r.opponent_members_json !== "[]");
        if ((hasOurMembers && !r.our_gk) || (hasOppMembers && !r.opponent_gk)) gkMissing++;
      }
      var key = (r.game_id || "") + "|" + (r.match_id || "");
      if (existingKeys[key]) { skipped++; continue; }
      existingKeys[key] = true;
      toInsert.push(_rawMatchToArray(r));
    }
    if (gkMissing > 0) {
      Logger.log("[_writeRawMatches] 풋살 GK 누락 행 " + gkMissing + "건 — PG/matchLogs keeper 불일치 위험");
    }
    if (toInsert.length > 0) {
      var lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, toInsert.length, RAW_MATCHES_HEADERS.length).setValues(toInsert);
    }
    return { success: true, count: toInsert.length, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}

function _loadRawMatchKeys(sheet) {
  var lastRow = sheet.getLastRow();
  var keys = {};
  if (lastRow < 2) return keys;
  var data = sheet.getRange(2, 6, lastRow - 1, 5).getValues(); // game_id=col6, match_id=col10 → 6..10
  for (var i = 0; i < data.length; i++) {
    var key = (data[i][0] || "") + "|" + (data[i][4] || "");
    keys[key] = true;
  }
  return keys;
}

function _rawMatchToArray(r) {
  return [
    r.team||"", r.sport||"", r.mode||"", r.tournament_id||"",
    r.date||"", r.game_id||"", r.match_idx||0,
    r.round_idx===null||r.round_idx===undefined?"":r.round_idx,
    r.court_id===null||r.court_id===undefined?"":r.court_id,
    r.match_id||"",
    r.our_team_name||"", r.opponent_team_name||"",
    r.our_members_json||"[]", r.opponent_members_json||"[]",
    r.our_score||0, r.opponent_score||0,
    r.our_gk||"", r.opponent_gk||"",
    r.formation||"", r.our_defenders_json||"[]",
    r.is_extra===true, r.input_time||""
  ];
}

function _deleteRawPlayerGamesByDate(team, sport, date) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_PLAYER_GAMES_SHEET);
  if (!sheet) return { removed: 0 };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { removed: 0 };
  var data = sheet.getRange(2, 1, lastRow - 1, RAW_PLAYER_GAMES_HEADERS.length).getValues();
  var removed = 0;
  for (var i = data.length - 1; i >= 0; i--) {
    if (data[i][0] === team && data[i][1] === sport && _toDateStr(data[i][4]) === date) {
      sheet.deleteRow(i + 2);
      removed++;
    }
  }
  return { removed: removed };
}

function _deleteRawMatchesByDate(team, sport, date) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_MATCHES_SHEET);
  if (!sheet) return { removed: 0 };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { removed: 0 };
  var data = sheet.getRange(2, 1, lastRow - 1, RAW_MATCHES_HEADERS.length).getValues();
  var removed = 0;
  for (var i = data.length - 1; i >= 0; i--) {
    if (data[i][0] === team && data[i][1] === sport && _toDateStr(data[i][4]) === date) {
      sheet.deleteRow(i + 2);
      removed++;
    }
  }
  return { removed: removed };
}

function _deleteRawEventsByDate(team, sport, date) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (!sheet) return { removed: 0 };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { removed: 0 };
  var data = sheet.getRange(2, 1, lastRow - 1, RAW_EVENTS_HEADERS.length).getValues();
  var removed = 0;
  for (var i = data.length - 1; i >= 0; i--) {
    if (data[i][0] === team && data[i][1] === sport && _toDateStr(data[i][4]) === date) {
      sheet.deleteRow(i + 2);
      removed++;
    }
  }
  return { removed: removed };
}

function _getRawMatches(team, sport, dateFrom, dateTo) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_MATCHES_SHEET);
  if (!sheet) { _ensureRawSheets(); sheet = ss.getSheetByName(RAW_MATCHES_SHEET); }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, rows: [] };
  var data = sheet.getRange(2, 1, lastRow - 1, RAW_MATCHES_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    if (team && r[0] !== team) continue;
    if (sport && r[1] !== sport) continue;
    var d = _toDateStr(r[4]);
    if (dateFrom && d < dateFrom) continue;
    if (dateTo && d > dateTo) continue;
    var row = {};
    for (var j = 0; j < RAW_MATCHES_HEADERS.length; j++) row[RAW_MATCHES_HEADERS[j]] = r[j];
    row.date = d;
    out.push(row);
  }
  return { success: true, rows: out };
}

function _getRawEvents(team, sport, dateFrom, dateTo) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (!sheet) { _ensureRawSheets(); sheet = ss.getSheetByName(RAW_EVENTS_SHEET); }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, rows: [] };
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var out = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    if (team && r[0] !== team) continue;
    if (sport && r[1] !== sport) continue;
    var d = _toDateStr(r[4]);
    if (dateFrom && d < dateFrom) continue;
    if (dateTo && d > dateTo) continue;
    var row = {};
    for (var j = 0; j < headers.length; j++) row[headers[j]] = r[j];
    row.date = d;
    out.push(row);
  }
  return { success: true, rows: out };
}

function _getRawPlayerGames(team, sport) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_PLAYER_GAMES_SHEET);
  if (!sheet) return { success: true, rows: [] };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, rows: [] };
  var data = sheet.getRange(2, 1, lastRow - 1, RAW_PLAYER_GAMES_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    if (team && r[0] !== team) continue;
    if (sport && r[1] !== sport) continue;
    var row = {};
    for (var j = 0; j < RAW_PLAYER_GAMES_HEADERS.length; j++) row[RAW_PLAYER_GAMES_HEADERS[j]] = r[j];
    row.date = _toDateStr(r[4]);
    out.push(row);
  }
  return { success: true, rows: out };
}

// ─────────────────────────────────────────────────────────────────────────────
// backfillFutsalGk — 풋살 로그_매치의 빈 our_gk/opponent_gk를 로그_이벤트의 concede_gk에서 추론
// 풋살은 our/opponent 모두 같은 팀의 두 squad라서 player가 어느 멤버 리스트에 속하는지 보고
// 어느 쪽 GK가 실점한 건지 판별 가능.
//
// 추론 규칙:
//   event_type=goal,    player ∈ our_members      → opp_gk_candidate = concede_gk (상대 골대에 우리가 넣음)
//   event_type=goal,    player ∈ opponent_members → our_gk_candidate = concede_gk
//   event_type=owngoal, player ∈ our_members      → our_gk_candidate = concede_gk (우리 자책)
//   event_type=owngoal, player ∈ opponent_members → opp_gk_candidate = concede_gk
//
// 한 매치 내 후보들이 충돌하면 (한 라운드에 GK 교체된 비정상 경우) 로깅하고 skip.
// 클린시트(이벤트 없음)는 빈 채로 둠.
//
// dryRun=true: 통계만 반환, 쓰기 안 함. dryRun=false: 실제 시트 수정.
// 옵션 onlyEmpty=true(기본): 이미 값 있는 행은 건드리지 않음.
function backfillFutsalGk(opts) {
  opts = opts || {};
  var dryRun = opts.dryRun !== false;
  var onlyEmpty = opts.onlyEmpty !== false;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var matchSheet = ss.getSheetByName(RAW_MATCHES_SHEET);
  var evSheet = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (!matchSheet) return { success: false, error: "로그_매치 시트 없음" };
  if (!evSheet) return { success: false, error: "로그_이벤트 시트 없음" };

  var matchHeaders = matchSheet.getRange(1, 1, 1, matchSheet.getLastColumn()).getValues()[0];
  var evHeaders = evSheet.getRange(1, 1, 1, evSheet.getLastColumn()).getValues()[0];

  function colIdx(headers, name) {
    var i = headers.indexOf(name);
    if (i < 0) throw new Error("헤더 누락: " + name);
    return i;
  }

  var mSport = colIdx(matchHeaders, "sport");
  var mDate = colIdx(matchHeaders, "date");
  var mMid = colIdx(matchHeaders, "match_id");
  var mOurJson = colIdx(matchHeaders, "our_members_json");
  var mOppJson = colIdx(matchHeaders, "opponent_members_json");
  var mOurGk = colIdx(matchHeaders, "our_gk");
  var mOppGk = colIdx(matchHeaders, "opponent_gk");

  var eDate = colIdx(evHeaders, "date");
  var eMid = colIdx(evHeaders, "match_id");
  var eType = colIdx(evHeaders, "event_type");
  var ePlayer = colIdx(evHeaders, "player");
  var eGk = colIdx(evHeaders, "concede_gk");

  var matchLastRow = matchSheet.getLastRow();
  var evLastRow = evSheet.getLastRow();
  if (matchLastRow < 2) return { success: true, scanned: 0, filled: 0, conflicts: 0, cleanSheets: 0 };

  // 이벤트 (date|match_id) → [{type, player, gk}]
  var evIndex = {};
  if (evLastRow >= 2) {
    var evData = evSheet.getRange(2, 1, evLastRow - 1, evSheet.getLastColumn()).getValues();
    for (var i = 0; i < evData.length; i++) {
      var t = String(evData[i][eType] || "");
      if (t !== "goal" && t !== "owngoal") continue;
      var gk = String(evData[i][eGk] || "").trim();
      if (!gk) continue;
      var k = _toDateStr(evData[i][eDate]) + "|" + String(evData[i][eMid] || "");
      if (!evIndex[k]) evIndex[k] = [];
      evIndex[k].push({ type: t, player: String(evData[i][ePlayer] || ""), gk: gk });
    }
  }

  var matchData = matchSheet.getRange(2, 1, matchLastRow - 1, matchSheet.getLastColumn()).getValues();
  var scanned = 0, filledOur = 0, filledOpp = 0, conflicts = 0, cleanSheets = 0;
  var unmatchedScorerRows = 0, ambiguousMembershipRows = 0, eventsButNoUsable = 0;
  var rowsWithOurCand = 0, rowsWithOppCand = 0;
  var rowsOurAlreadyFilled = 0, rowsOppAlreadyFilled = 0;
  var conflictRows = [];
  var sampleFilled = [];
  var unmatchedSamples = [];
  var diagSamples = [];
  var evIndexSize = Object.keys(evIndex).length;

  for (var r = 0; r < matchData.length; r++) {
    var row = matchData[r];
    if (String(row[mSport] || "") !== "풋살") continue;
    var hasOur = String(row[mOurGk] || "").trim();
    var hasOpp = String(row[mOppGk] || "").trim();
    if (onlyEmpty && hasOur && hasOpp) continue;
    scanned++;

    var ourMembers = [], oppMembers = [];
    try { ourMembers = JSON.parse(row[mOurJson] || "[]"); } catch (e) {}
    try { oppMembers = JSON.parse(row[mOppJson] || "[]"); } catch (e) {}
    var ourSet = {}; for (var oi = 0; oi < ourMembers.length; oi++) ourSet[ourMembers[oi]] = true;
    var oppSet = {}; for (var oi2 = 0; oi2 < oppMembers.length; oi2++) oppSet[oppMembers[oi2]] = true;

    var k2 = _toDateStr(row[mDate]) + "|" + String(row[mMid] || "");
    var evs = evIndex[k2] || [];
    if (evs.length === 0) { cleanSheets++; continue; }

    var ourGkCand = {}, oppGkCand = {};
    var rowHasUnmatchedScorer = false;
    var rowHasAmbiguousScorer = false;
    var rowUsableEvents = 0;
    for (var j = 0; j < evs.length; j++) {
      var ev = evs[j];
      var inOur = ourSet[ev.player] === true;
      var inOpp = oppSet[ev.player] === true;
      if (!inOur && !inOpp) {
        rowHasUnmatchedScorer = true;
        if (unmatchedSamples.length < 5) unmatchedSamples.push({ date: _toDateStr(row[mDate]), match_id: String(row[mMid] || ""), player: ev.player });
        continue;
      }
      if (inOur && inOpp) {
        rowHasAmbiguousScorer = true;
        continue; // 같은 이름이 양쪽에 있는 비정상 케이스 — 무시
      }
      rowUsableEvents++;
      var assignTo;
      if (ev.type === "goal") assignTo = inOur ? "opp" : "our";
      else assignTo = inOur ? "our" : "opp"; // owngoal
      if (assignTo === "our") ourGkCand[ev.gk] = (ourGkCand[ev.gk] || 0) + 1;
      else oppGkCand[ev.gk] = (oppGkCand[ev.gk] || 0) + 1;
    }
    if (rowHasUnmatchedScorer) unmatchedScorerRows++;
    if (rowHasAmbiguousScorer) ambiguousMembershipRows++;
    if (Object.keys(ourGkCand).length > 0) rowsWithOurCand++;
    if (Object.keys(oppGkCand).length > 0) rowsWithOppCand++;
    if (hasOur) rowsOurAlreadyFilled++;
    if (hasOpp) rowsOppAlreadyFilled++;
    if (diagSamples.length < 5) {
      diagSamples.push({
        date: _toDateStr(row[mDate]),
        match_id: String(row[mMid] || ""),
        hasOur: hasOur, hasOpp: hasOpp,
        ourMembersLen: ourMembers.length, oppMembersLen: oppMembers.length,
        evCount: evs.length, usable: rowUsableEvents,
        ourGkCand: Object.keys(ourGkCand), oppGkCand: Object.keys(oppGkCand),
      });
    }
    if (rowUsableEvents === 0) { eventsButNoUsable++; continue; }

    function pickUnique(map) {
      var keys = Object.keys(map);
      if (keys.length === 0) return null;
      if (keys.length === 1) return keys[0];
      return "__CONFLICT__:" + keys.join(",");
    }

    var newOur = pickUnique(ourGkCand);
    var newOpp = pickUnique(oppGkCand);
    var rowConflict = false;

    if (!hasOur && newOur && newOur.indexOf("__CONFLICT__") === 0) { rowConflict = true; }
    if (!hasOpp && newOpp && newOpp.indexOf("__CONFLICT__") === 0) { rowConflict = true; }
    if (rowConflict) {
      conflicts++;
      if (conflictRows.length < 10) conflictRows.push({ date: _toDateStr(row[mDate]), match_id: String(row[mMid] || ""), our: newOur, opp: newOpp });
      continue;
    }

    var rowSheetIdx = r + 2;
    if (!hasOur && newOur) {
      filledOur++;
      if (sampleFilled.length < 10) sampleFilled.push({ date: _toDateStr(row[mDate]), match_id: String(row[mMid] || ""), our_gk: newOur });
      if (!dryRun) matchSheet.getRange(rowSheetIdx, mOurGk + 1).setValue(newOur);
    }
    if (!hasOpp && newOpp) {
      filledOpp++;
      if (!dryRun) matchSheet.getRange(rowSheetIdx, mOppGk + 1).setValue(newOpp);
    }
  }

  return {
    success: true,
    dryRun: dryRun,
    scanned: scanned,
    filledOurGk: filledOur,
    filledOppGk: filledOpp,
    cleanSheetsLeft: cleanSheets,
    eventsButNoUsable: eventsButNoUsable,
    rowsWithUnmatchedScorer: unmatchedScorerRows,
    rowsWithAmbiguousScorer: ambiguousMembershipRows,
    conflicts: conflicts,
    evIndexSize: evIndexSize,
    rowsWithOurCand: rowsWithOurCand,
    rowsWithOppCand: rowsWithOppCand,
    rowsOurAlreadyFilled: rowsOurAlreadyFilled,
    rowsOppAlreadyFilled: rowsOppAlreadyFilled,
    conflictSamples: conflictRows,
    filledSamples: sampleFilled,
    unmatchedScorerSamples: unmatchedSamples,
    diagSamples: diagSamples,
  };
}

// 편집기에서 직접 실행할 수 있는 래퍼 (Logger.log로 결과 확인)
function backfillFutsalGk_dryRun() {
  var r = backfillFutsalGk({ dryRun: true });
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
function backfillFutsalGk_apply() {
  var r = backfillFutsalGk({ dryRun: false });
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}

// 레거시 축구 로그_매치의 빈 our_members_json 을, 같은 경기(team|date|match_id)의
// 로그_이벤트 참여자(player + related_player + concede_gk) + 로그_매치.our_gk 로 복원한다.
// 과거 데이터라 원본 명단이 없으므로 '이벤트에 등장한 선수'만 복원됨(무이벤트 출전자는 복원 불가).
// - dryRun(기본 true): 미리보기만. false 로 실제 기록.
// - onlyEmpty(기본 true): our_members_json 이 빈 배열/공백인 행만 채움(기존 명단 무손상, 비파괴).
// - team: 지정 시 해당 팀만.
function backfillSoccerMembers(opts) {
  opts = opts || {};
  var dryRun = opts.dryRun !== false;
  var onlyEmpty = opts.onlyEmpty !== false;
  var team = opts.team || "";

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var matchSheet = ss.getSheetByName(RAW_MATCHES_SHEET);
  var evSheet = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (!matchSheet) return { success: false, error: "로그_매치 시트 없음" };
  if (!evSheet) return { success: false, error: "로그_이벤트 시트 없음" };

  var mH = matchSheet.getRange(1, 1, 1, matchSheet.getLastColumn()).getValues()[0];
  var eH = evSheet.getRange(1, 1, 1, evSheet.getLastColumn()).getValues()[0];
  function ci(h, n) { var i = h.indexOf(n); if (i < 0) throw new Error("헤더 누락: " + n); return i; }

  var mTeam = ci(mH, "team"), mSport = ci(mH, "sport"), mDate = ci(mH, "date"),
      mMid = ci(mH, "match_id"), mOpp = ci(mH, "opponent_team_name"),
      mOurJson = ci(mH, "our_members_json"), mOurGk = ci(mH, "our_gk");
  var eTeam = ci(eH, "team"), eDate = ci(eH, "date"), eMid = ci(eH, "match_id"),
      ePlayer = ci(eH, "player"), eRelated = ci(eH, "related_player"), eGk = ci(eH, "concede_gk");

  var matchLast = matchSheet.getLastRow();
  if (matchLast < 2) return { success: true, dryRun: dryRun, scanned: 0, filled: 0 };
  var evLast = evSheet.getLastRow();

  // 로그_이벤트 인덱스: team|date|match_id → { 선수이름: true }
  var evIndex = {};
  if (evLast >= 2) {
    var ev = evSheet.getRange(2, 1, evLast - 1, evSheet.getLastColumn()).getValues();
    for (var i = 0; i < ev.length; i++) {
      var k = String(ev[i][eTeam] || "") + "|" + _toDateStr(ev[i][eDate]) + "|" + String(ev[i][eMid] || "");
      if (!evIndex[k]) evIndex[k] = {};
      var cands = [ev[i][ePlayer], ev[i][eRelated], ev[i][eGk]];
      for (var c = 0; c < cands.length; c++) {
        var p = String(cands[c] || "").trim();
        if (p) evIndex[k][p] = true;
      }
    }
  }

  var md = matchSheet.getRange(2, 1, matchLast - 1, matchSheet.getLastColumn()).getValues();
  var scanned = 0, filled = 0, noEvents = 0, skippedNonEmpty = 0, samples = [], updates = [];
  for (var r = 0; r < md.length; r++) {
    if (String(md[r][mSport] || "") !== "축구") continue;
    if (team && String(md[r][mTeam] || "") !== team) continue;
    var cur = String(md[r][mOurJson] || "").trim();
    var isEmpty = (cur === "" || cur === "[]");
    if (onlyEmpty && !isEmpty) { skippedNonEmpty++; continue; }
    scanned++;
    var key = String(md[r][mTeam] || "") + "|" + _toDateStr(md[r][mDate]) + "|" + String(md[r][mMid] || "");
    var setObj = evIndex[key] || {};
    var members = Object.keys(setObj);
    var gk = String(md[r][mOurGk] || "").trim();
    if (gk && members.indexOf(gk) < 0) members.push(gk);
    if (members.length === 0) { noEvents++; continue; }
    filled++;
    updates.push({ row: r + 2, col: mOurJson + 1, value: JSON.stringify(members) });
    if (samples.length < 15) {
      samples.push({ date: _toDateStr(md[r][mDate]), match_id: String(md[r][mMid] || ""),
        opponent: String(md[r][mOpp] || ""), count: members.length, members: members });
    }
  }

  if (!dryRun) {
    for (var u = 0; u < updates.length; u++) {
      matchSheet.getRange(updates[u].row, updates[u].col).setValue(updates[u].value);
    }
  }
  return { success: true, dryRun: dryRun, team: team || "(전체)",
    scanned: scanned, filled: filled, noEvents: noEvents, skippedNonEmpty: skippedNonEmpty, samples: samples };
}
function backfillSoccerMembers_dryrun() {
  var r = backfillSoccerMembers({ dryRun: true, team: '하버FC' });
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
function backfillSoccerMembers_apply() {
  var r = backfillSoccerMembers({ dryRun: false, team: '하버FC' });
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}

function migrateEventTypes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (!sheet) return { success: false, error: "로그_이벤트 시트 없음" };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, updated: 0 };
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var col = headers.indexOf("event_type") + 1;
  if (col < 1) return { success: false, error: "event_type 컬럼 없음" };
  var range = sheet.getRange(2, col, lastRow - 1, 1);
  var vals = range.getValues();
  var updated = 0;
  for (var i = 0; i < vals.length; i++) {
    var v = String(vals[i][0] || "");
    var next = v;
    if (v === "ownGoal") next = "owngoal";
    else if (v === "opponentGoal") next = "concede";
    if (next !== v) { vals[i][0] = next; updated++; }
  }
  if (updated > 0) range.setValues(vals);
  return { success: true, updated: updated };
}

function migrateMatchIds() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (!sheet) return { success: false, error: "로그_이벤트 시트 없음" };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, updated: 0, unrecognized: [] };
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var midCol = headers.indexOf("match_id") + 1;
  var sportCol = headers.indexOf("sport") + 1;
  if (midCol < 1 || sportCol < 1) return { success: false, error: "match_id/sport 컬럼 없음" };
  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var updated = 0;
  var unrecognized = {};
  for (var i = 0; i < data.length; i++) {
    var raw = String(data[i][midCol - 1] || "").trim();
    var sport = String(data[i][sportCol - 1] || "").trim();
    var next = _normalizeMatchIdAS(raw, sport);
    if (next !== raw) {
      sheet.getRange(i + 2, midCol).setValue(next);
      updated++;
    } else if (raw && !_isStandardMatchId(raw, sport)) {
      unrecognized[raw] = (unrecognized[raw] || 0) + 1;
    }
  }
  return { success: true, updated: updated, unrecognized: unrecognized };
}

function _normalizeMatchIdAS(raw, sport) {
  if (!raw) return raw;
  var s = String(raw).trim();
  if (/^R\d+_C\d+$/.test(s)) return s;
  var m1 = s.match(/^(\d+)라운드\s*매치(\d+)$/);
  if (m1) return "R" + m1[1] + "_C" + (parseInt(m1[2], 10) - 1);
  // "1라운드 A구장" → R1_C0, "1라운드 B구장" → R1_C1 (코트 알파벳 인덱스)
  var m3 = s.match(/^(\d+)라운드\s*([A-Z])구장$/);
  if (m3) return "R" + m3[1] + "_C" + (m3[2].charCodeAt(0) - 65);
  var m2 = s.match(/^(\d+)경기$/);
  var n = m2 ? m2[1] : (/^\d+$/.test(s) ? s : null);
  if (n !== null) return sport === "풋살" ? "R" + n + "_C0" : n;
  return s;
}

function _isStandardMatchId(s, sport) {
  if (sport === "풋살") return /^[RPF]\d+_C\d+$/.test(s);
  return /^\d+$/.test(s);
}

function _writeRawPlayerGames(data) {
  if (!data || !data.rows) return { success: false, error: "rows 누락" };
  _ensureRawSheets();
  var rows = data.rows;
  if (rows.length === 0 && !data.replaceBy) return { success: true, count: 0, skipped: 0 };
  // skipDedupe=true: Legacy import 용. 같은 선수가 한 날짜에 복수 세션 기록된 케이스 보존.
  var skipDedupe = data.skipDedupe === true;
  // replaceBy={team, sport, mode, tournament_id}: 대회 재집계용.
  // 해당 스코프의 기존 행을 삭제한 뒤 새 rows insert.
  var replaceBy = data.replaceBy && typeof data.replaceBy === 'object' ? data.replaceBy : null;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(RAW_PLAYER_GAMES_SHEET);
    var removed = 0;
    if (replaceBy) removed = _removeRawPlayerGamesMatching(sheet, replaceBy);
    var existingKeys = (skipDedupe || replaceBy) ? {} : _loadRawPlayerGameKeys(sheet);

    var toInsert = [];
    var skipped = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!skipDedupe && !replaceBy) {
        var key = _rawPlayerGameKey(r);
        if (existingKeys[key]) { skipped++; continue; }
        existingKeys[key] = true;
      }
      toInsert.push(_rawPlayerGameToArray(r));
    }
    if (toInsert.length > 0) {
      var lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, toInsert.length, RAW_PLAYER_GAMES_HEADERS.length).setValues(toInsert);
    }
    return { success: true, count: toInsert.length, skipped: skipped, removed: removed };
  } finally {
    lock.releaseLock();
  }
}

// replaceBy 스코프 (team, sport, mode, tournament_id) 매칭 기존 행 삭제. 반환: 삭제 건수.
function _removeRawPlayerGamesMatching(sheet, filter) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var data = sheet.getRange(2, 1, lastRow - 1, RAW_PLAYER_GAMES_HEADERS.length).getValues();
  var ft = filter.team || "", fs = filter.sport || "", fm = filter.mode || "", fti = filter.tournament_id || "";
  var removed = 0;
  for (var i = data.length - 1; i >= 0; i--) {
    var r = data[i];
    if (r[0] === ft && r[1] === fs && r[2] === fm && r[3] === fti) {
      sheet.deleteRow(i + 2);
      removed++;
    }
  }
  return removed;
}

function _rawPlayerGameKey(r) {
  return [r.team||"", r.sport||"", r.mode||"", r.tournament_id||"", r.date||"", r.player||""].join("|");
}

function _rawPlayerGameToArray(r) {
  return [r.team||"", r.sport||"", r.mode||"", r.tournament_id||"",
    r.date||"", r.player||"", r.session_team||"",
    Number(r.games)||0, Number(r.field_games)||0, Number(r.keeper_games)||0,
    Number(r.goals)||0, Number(r.assists)||0, Number(r.owngoals)||0, Number(r.fouls)||0,
    Number(r.conceded)||0, Number(r.cleansheets)||0,
    Number(r.crova)||0, Number(r.goguma)||0, Number(r.rank_score)||0,
    r.input_time||""];
}

function _loadRawPlayerGameKeys(sheet) {
  var lastRow = sheet.getLastRow();
  var keys = {};
  if (lastRow < 2) return keys;
  var data = sheet.getRange(2, 1, lastRow - 1, RAW_PLAYER_GAMES_HEADERS.length).getValues();
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    // [team, sport, mode, tid, date, player, session_team, ...]
    var key = [r[0], r[1], r[2], r[3], _toDateStr(r[4]), r[5]].join("|");
    keys[key] = true;
  }
  return keys;
}

// ═══════════════════════════════════════════════════════════════
// 일회성 Legacy Import (기존 시트 read-only → 로그_이벤트/로그_선수경기 append)
// skipDedupe=true 로 write — 같은 (선수,경기,event_type,date,tid) 중복도 보존
// (헤딩골 같은 이벤트를 2번 입력한 케이스 등).
//
// 사용법 (Apps Script 편집기에서 _runImport 실행):
//   _importLegacyToRaw({
//     teams: [
//       { team: "마스터FC", pointSheet: "마스터FC 포인트 로그", pointSchema: "futsalPoint",
//         playerSheet: "마스터FC 선수별집계기록 로그", playerSchema: "futsalPlayer" },
//       { team: "하버FC",   pointSheet: "하버FC 포인트 로그",  pointSchema: "soccerPoint",
//         playerSheet: "하버FC 선수기록보관소",             playerSchema: "soccerPlayer" },
//     ],
//     includeTournaments: true   // 생략하면 true
//   });
//
// 주의사항:
//   - config.teams 필수. 빈 config로 호출하면 { error: "config.teams 필요" } 반환.
//   - **재실행 전 반드시 _clearRawSheets() 먼저 실행**. skipDedupe 모드라 중복 방지 안 됨.
//   - 신규 dual-write 경로 (doPost → _writeRawEvents)는 skipDedupe=false 로 정상 dedupe.
// ═══════════════════════════════════════════════════════════════

// ---------------------------------------------------------------
// 스키마별 Reader 함수 (각각 sheetName, team 인자를 받아 { rows, error? } 반환)
// ---------------------------------------------------------------

// 첫 5행 중 A열이 firstColExpected인 행을 헤더로 간주. 못 찾으면 1.
// 시트에 빈 상단 행(frozen row 용도)이 있는 경우에 대응.
function _findHeaderRow(sheet, firstColExpected) {
  var lastRow = sheet.getLastRow();
  var maxPeek = Math.min(lastRow, 5);
  if (maxPeek < 1) return 1;
  var peek = sheet.getRange(1, 1, maxPeek, 1).getValues();
  for (var i = 0; i < peek.length; i++) {
    if (String(peek[i][0] || "").trim() === firstColExpected) return i + 1;
  }
  return 1;
}

function _readFutsalPointSchema(sheetName, team) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(sheetName);
  if (!src) return { rows: [], error: sheetName + " 없음" };
  var lastRow = src.getLastRow();
  if (lastRow < 2) return { rows: [] };
  var headerRow = _findHeaderRow(src, "경기일자");
  if (lastRow <= headerRow) return { rows: [] };
  // 헤더 검증: 인덱스 0-8 필수
  var headers = src.getRange(headerRow, 1, 1, Math.min(src.getLastColumn(), 10)).getValues()[0];
  var expectedBase = ["경기일자", "경기번호", "내팀", "상대팀"];
  var goalVariants = ["득점", "득점선수"];
  var assistVariants = ["어시", "어시선수"];
  var gkVariants = ["실점키퍼", "실점키퍼명"];
  // 인덱스 0-3 고정 검증
  for (var ci = 0; ci < expectedBase.length; ci++) {
    if (String(headers[ci] || "").trim() !== expectedBase[ci]) {
      return { rows: [], error: "헤더 불일치: expected " + expectedBase[ci] + ", got " + String(headers[ci] || "") };
    }
  }
  // 인덱스 4,5,6,7 유연 검증 (변형 허용)
  var h4 = String(headers[4] || "").trim();
  var h5 = String(headers[5] || "").trim();
  var h7 = String(headers[7] || "").trim();
  var validH4 = (h4 === goalVariants[0] || h4 === goalVariants[1]);
  var validH5 = (h5 === assistVariants[0] || h5 === assistVariants[1]);
  var validH7 = (h7 === gkVariants[0] || h7 === gkVariants[1]);
  if (!validH4) return { rows: [], error: "헤더 불일치: expected 득점/득점선수, got " + h4 };
  if (!validH5) return { rows: [], error: "헤더 불일치: expected 어시/어시선수, got " + h5 };
  if (String(headers[6] || "").trim() !== "자책골") return { rows: [], error: "헤더 불일치: expected 자책골, got " + String(headers[6] || "") };
  if (!validH7) return { rows: [], error: "헤더 불일치: expected 실점키퍼/실점키퍼명, got " + h7 };
  if (String(headers[8] || "").trim() !== "입력시간") return { rows: [], error: "헤더 불일치: expected 입력시간, got " + String(headers[8] || "") };

  var colCount = Math.min(src.getLastColumn(), 10);
  var data = src.getRange(headerRow + 1, 1, lastRow - headerRow, colCount).getValues();
  var rows = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    var gameDate = _toDateStr(r[0]);
    var matchId = String(r[1] || "");
    var myTeam = String(r[2] || "");
    var opponent = String(r[3] || "");
    var scorer = String(r[4] || "");
    var assist = String(r[5] || "");
    var ownGoal = String(r[6] || "");
    var concedingGk = String(r[7] || "");
    var inputTime = r[8] instanceof Date ? Utilities.formatDate(r[8], "Asia/Seoul", "yyyy-MM-dd HH:mm:ss") : String(r[8] || "");
    var common = {
      team: team, sport: "풋살", mode: "기본", tournament_id: "",
      date: gameDate, match_id: matchId, our_team: myTeam, opponent: opponent,
      position: "", input_time: inputTime
    };
    // 한 포인트로그 행 → 한 로그_이벤트 행 (concede_gk 컬럼에 실점 키퍼 통합)
    if (scorer) {
      rows.push({
        team: common.team, sport: common.sport, mode: common.mode, tournament_id: common.tournament_id,
        date: common.date, match_id: common.match_id, our_team: common.our_team, opponent: common.opponent,
        position: common.position, input_time: common.input_time,
        event_type: "goal", player: scorer, related_player: assist, concede_gk: concedingGk
      });
    } else if (ownGoal) {
      rows.push({
        team: common.team, sport: common.sport, mode: common.mode, tournament_id: common.tournament_id,
        date: common.date, match_id: common.match_id, our_team: common.our_team, opponent: common.opponent,
        position: common.position, input_time: common.input_time,
        event_type: "owngoal", player: ownGoal, related_player: "", concede_gk: concedingGk
      });
    } else if (concedingGk) {
      // 단독 실점 (득점자 미상) — 드물지만 보존
      rows.push({
        team: common.team, sport: common.sport, mode: common.mode, tournament_id: common.tournament_id,
        date: common.date, match_id: common.match_id, our_team: common.our_team, opponent: common.opponent,
        position: common.position, input_time: common.input_time,
        event_type: "concede", player: concedingGk, related_player: "", concede_gk: concedingGk
      });
    }
  }
  return { rows: rows };
}

function _readFutsalPlayerSchema(sheetName, team) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(sheetName);
  if (!src) return { rows: [], error: sheetName + " 없음" };
  var lastRow = src.getLastRow();
  if (lastRow < 2) return { rows: [] };
  var headerRow = _findHeaderRow(src, "경기일자");
  if (lastRow <= headerRow) return { rows: [] };
  // 헤더 검증: 13 컬럼 필수
  var expectedHeaders = ["경기일자", "선수명", "골", "어시", "역주행", "실점", "클린시트", "크로바", "고구마", "키퍼경기수", "팀순위점수", "입력시간", "소속팀"];
  var headers = src.getRange(headerRow, 1, 1, 13).getValues()[0];
  for (var ci = 0; ci < expectedHeaders.length; ci++) {
    if (String(headers[ci] || "").trim() !== expectedHeaders[ci]) {
      return { rows: [], error: "헤더 불일치: expected " + expectedHeaders[ci] + ", got " + String(headers[ci] || "") };
    }
  }

  var data = src.getRange(headerRow + 1, 1, lastRow - headerRow, 13).getValues();
  var rows = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    var name = String(r[1] || "");
    if (!name) continue;
    var gameDate = _toDateStr(r[0]);
    var inputTime = r[11] instanceof Date ? Utilities.formatDate(r[11], "Asia/Seoul", "yyyy-MM-dd HH:mm:ss") : String(r[11] || "");
    rows.push({
      team: team, sport: "풋살", mode: "기본", tournament_id: "",
      date: gameDate, player: name, session_team: "",
      games: 0, field_games: 0, keeper_games: Number(r[9]) || 0,
      goals: Number(r[2]) || 0, assists: Number(r[3]) || 0,
      owngoals: 0, conceded: Number(r[5]) || 0, cleansheets: Number(r[6]) || 0,
      crova: Number(r[7]) || 0, goguma: Number(r[8]) || 0,
      "역주행": Number(r[4]) || 0, rank_score: Number(r[10]) || 0,
      input_time: inputTime
    });
  }
  return { rows: rows };
}

function _readSoccerPointSchema(sheetName, team) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(sheetName);
  if (!src) return { rows: [], error: sheetName + " 없음" };
  var lastRow = src.getLastRow();
  if (lastRow < 2) return { rows: [] };
  var headerRow = _findHeaderRow(src, "경기일자");
  if (lastRow <= headerRow) return { rows: [] };
  // 헤더 검증: 8 컬럼 필수
  var expectedHeaders = ["경기일자", "경기번호", "상대팀명", "득점", "어시", "실점", "자책골", "입력시간"];
  var headers = src.getRange(headerRow, 1, 1, 8).getValues()[0];
  for (var ci = 0; ci < expectedHeaders.length; ci++) {
    if (String(headers[ci] || "").trim() !== expectedHeaders[ci]) {
      return { rows: [], error: "헤더 불일치: expected " + expectedHeaders[ci] + ", got " + String(headers[ci] || "") };
    }
  }

  var data = src.getRange(headerRow + 1, 1, lastRow - headerRow, 8).getValues();
  var rows = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    var gameDate = _toDateStr(r[0]);
    var matchId = String(r[1] || "");
    var opponent = String(r[2] || "");
    var goalVal = String(r[3] || "");
    var assist = String(r[4] || "");
    var concede = String(r[5] || "");
    var ownGoal = String(r[6] || "");
    var inputTime = r[7] instanceof Date ? Utilities.formatDate(r[7], "Asia/Seoul", "yyyy-MM-dd HH:mm:ss") : String(r[7] || "");
    var common = {
      team: team, sport: "축구", mode: "기본", tournament_id: "",
      date: gameDate, match_id: matchId, our_team: team, opponent: opponent,
      position: "", input_time: inputTime
    };
    if (goalVal === "OG") {
      // 득점 컬럼에 "OG" 리터럴 + 자책골 컬럼에 선수명이 있을 수 있으니 r[6] 우선
      rows.push({
        team: common.team, sport: common.sport, mode: common.mode, tournament_id: common.tournament_id,
        date: common.date, match_id: common.match_id, our_team: common.our_team, opponent: common.opponent,
        position: common.position, input_time: common.input_time,
        event_type: "owngoal", player: ownGoal, related_player: "", concede_gk: ""
      });
    } else if (goalVal) {
      rows.push({
        team: common.team, sport: common.sport, mode: common.mode, tournament_id: common.tournament_id,
        date: common.date, match_id: common.match_id, our_team: common.our_team, opponent: common.opponent,
        position: common.position, input_time: common.input_time,
        event_type: "goal", player: goalVal, related_player: assist, concede_gk: ""
      });
    } else if (ownGoal) {
      rows.push({
        team: common.team, sport: common.sport, mode: common.mode, tournament_id: common.tournament_id,
        date: common.date, match_id: common.match_id, our_team: common.our_team, opponent: common.opponent,
        position: common.position, input_time: common.input_time,
        event_type: "owngoal", player: ownGoal, related_player: "", concede_gk: ""
      });
    } else if (concede) {
      rows.push({
        team: common.team, sport: common.sport, mode: common.mode, tournament_id: common.tournament_id,
        date: common.date, match_id: common.match_id, our_team: common.our_team, opponent: common.opponent,
        position: common.position, input_time: common.input_time,
        event_type: "concede", player: concede, related_player: "", concede_gk: concede
      });
    }
  }
  return { rows: rows };
}

function _readSoccerPlayerSchema(sheetName, team) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(sheetName);
  if (!src) return { rows: [], error: sheetName + " 없음" };
  var lastRow = src.getLastRow();
  if (lastRow < 2) return { rows: [] };
  var headerRow = _findHeaderRow(src, "경기일자");
  if (lastRow <= headerRow) return { rows: [] };
  // 헤더 검증: 11 컬럼 필수 (12번째 주석 컬럼은 무시)
  var expectedHeaders = ["경기일자", "선수명", "전체경기", "필드경기", "키퍼경기", "골", "어시", "클린시트", "실점", "자책골", "입력시간"];
  var headers = src.getRange(headerRow, 1, 1, 11).getValues()[0];
  for (var ci = 0; ci < expectedHeaders.length; ci++) {
    if (String(headers[ci] || "").trim() !== expectedHeaders[ci]) {
      return { rows: [], error: "헤더 불일치: expected " + expectedHeaders[ci] + ", got " + String(headers[ci] || "") };
    }
  }

  var data = src.getRange(headerRow + 1, 1, lastRow - headerRow, 11).getValues();
  var rows = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    var name = String(r[1] || "");
    if (!name) continue;
    var gameDate = _toDateStr(r[0]);
    var inputTime = r[10] instanceof Date ? Utilities.formatDate(r[10], "Asia/Seoul", "yyyy-MM-dd HH:mm:ss") : String(r[10] || "");
    rows.push({
      team: team, sport: "축구", mode: "기본", tournament_id: "",
      date: gameDate, player: name, session_team: "",
      games: Number(r[2]) || 0, field_games: Number(r[3]) || 0, keeper_games: Number(r[4]) || 0,
      goals: Number(r[5]) || 0, assists: Number(r[6]) || 0,
      owngoals: Number(r[9]) || 0, conceded: Number(r[8]) || 0, cleansheets: Number(r[7]) || 0,
      crova: 0, goguma: 0, "역주행": 0, rank_score: 0, input_time: inputTime
    });
  }
  return { rows: rows };
}

function _importTournamentEventLogs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var rows = [];
  var errors = [];
  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    var name = sheet.getName();
    var m = name.match(/^대회_(.+)_이벤트로그$/);
    if (!m) continue;
    var tid = m[1];
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) continue;
    // 컬럼: [경기번호, 상대팀, 이벤트, 선수, 관련선수, 포지션, 입력시간]
    var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
    var typeMap = { "출전": "lineup", "골": "goal", "자책골": "owngoal", "실점": "concede", "교체": "sub" };
    for (var i = 0; i < data.length; i++) {
      var r = data[i];
      var eventType = typeMap[String(r[2] || "")];
      if (!eventType) continue;
      var inputTime = r[6] instanceof Date ? Utilities.formatDate(r[6], "Asia/Seoul", "yyyy-MM-dd HH:mm:ss") : String(r[6] || "");
      // 대회 시트엔 date 컬럼 없음 → inputTime 앞부분을 date로 사용 (YYYY-MM-DD 추출)
      var date = "";
      var dm = inputTime.match(/^(\d{4}-\d{2}-\d{2})/);
      if (dm) date = dm[1];
      var playerVal = String(r[3] || "");
      // concede 이벤트: player(r[3])가 GK → _readSoccerPointSchema와 동일하게 concede_gk에 기록
      var concedeGk = (eventType === "concede") ? playerVal : "";
      rows.push({
        team: "", sport: "축구", mode: "대회", tournament_id: tid,
        date: date, match_id: String(r[0] || ""),
        our_team: "", opponent: String(r[1] || ""),
        event_type: eventType, player: playerVal, related_player: String(r[4] || ""),
        concede_gk: concedeGk, position: String(r[5] || ""), input_time: inputTime,
      });
    }
  }
  return { rows: rows, errors: errors };
}

/**
 * config.teams 기반 import. 반드시 명시적 config를 전달해야 함.
 * config = {
 *   teams: [
 *     { team: "마스터FC", pointSheet: "마스터FC 포인트 로그", pointSchema: "futsalPoint",
 *       playerSheet: "마스터FC 선수별집계기록 로그", playerSchema: "futsalPlayer" },
 *     { team: "하버FC", pointSheet: "하버FC 포인트 로그", pointSchema: "soccerPoint",
 *       playerSheet: "하버FC 선수기록보관소", playerSchema: "soccerPlayer" },
 *   ],
 *   includeTournaments: true  // 생략 시 true
 * }
 */
function _importLegacyToRaw(config) {
  if (!config || !config.teams) return { error: "config.teams 필요" };
  _ensureRawSheets();
  var result = { insertedEvents: 0, insertedPlayerGames: 0, skippedEvents: 0, skippedPlayerGames: 0, sources: {} };

  var teams = config.teams;
  for (var t = 0; t < teams.length; t++) {
    var entry = teams[t];
    var teamName = entry.team || "";

    // Point/Event 시트 처리
    if (entry.pointSheet && entry.pointSchema) {
      var pointData;
      try {
        if (entry.pointSchema === "futsalPoint") {
          pointData = _readFutsalPointSchema(entry.pointSheet, teamName);
        } else if (entry.pointSchema === "soccerPoint") {
          pointData = _readSoccerPointSchema(entry.pointSheet, teamName);
        } else {
          pointData = { rows: [], error: "알 수 없는 pointSchema: " + entry.pointSchema };
        }
      } catch (e) {
        result.sources[entry.pointSheet] = { error: e.message };
        pointData = null;
      }
      if (pointData) {
        var pointRows = pointData.rows || [];
        if (pointRows.length === 0) {
          result.sources[entry.pointSheet] = { inserted: 0, skipped: 0, note: pointData.error || "빈 소스" };
        } else {
          var pointWrite = _writeRawEvents({ rows: pointRows, skipDedupe: true });
          result.sources[entry.pointSheet] = { inserted: pointWrite.count || 0, skipped: pointWrite.skipped || 0 };
          result.insertedEvents += pointWrite.count || 0;
          result.skippedEvents += pointWrite.skipped || 0;
        }
      }
    }

    // Player 시트 처리
    if (entry.playerSheet && entry.playerSchema) {
      var playerData;
      try {
        if (entry.playerSchema === "futsalPlayer") {
          playerData = _readFutsalPlayerSchema(entry.playerSheet, teamName);
        } else if (entry.playerSchema === "soccerPlayer") {
          playerData = _readSoccerPlayerSchema(entry.playerSheet, teamName);
        } else {
          playerData = { rows: [], error: "알 수 없는 playerSchema: " + entry.playerSchema };
        }
      } catch (e) {
        result.sources[entry.playerSheet] = { error: e.message };
        playerData = null;
      }
      if (playerData) {
        var playerRows = playerData.rows || [];
        if (playerRows.length === 0) {
          result.sources[entry.playerSheet] = { inserted: 0, skipped: 0, note: playerData.error || "빈 소스" };
        } else {
          var playerWrite = _writeRawPlayerGames({ rows: playerRows, skipDedupe: true });
          result.sources[entry.playerSheet] = { inserted: playerWrite.count || 0, skipped: playerWrite.skipped || 0 };
          result.insertedPlayerGames += playerWrite.count || 0;
          result.skippedPlayerGames += playerWrite.skipped || 0;
        }
      }
    }
  }

  // 대회 이벤트로그 (기본 포함)
  var includeTournaments = config.includeTournaments !== false;
  if (includeTournaments) {
    var tourneyData;
    try { tourneyData = _importTournamentEventLogs(); } catch (e) {
      result.sources["대회 이벤트로그"] = { error: e.message };
      tourneyData = null;
    }
    if (tourneyData) {
      var tourneyRows = tourneyData.rows || [];
      if (tourneyRows.length === 0) {
        result.sources["대회 이벤트로그"] = { inserted: 0, skipped: 0, note: "빈 소스" };
      } else {
        var tourneyWrite = _writeRawEvents({ rows: tourneyRows, skipDedupe: true });
        result.sources["대회 이벤트로그"] = { inserted: tourneyWrite.count || 0, skipped: tourneyWrite.skipped || 0 };
        result.insertedEvents += tourneyWrite.count || 0;
        result.skippedEvents += tourneyWrite.skipped || 0;
      }
    }
  }

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * 로그_이벤트, 로그_선수경기 시트의 데이터 행을 전부 삭제하고 헤더만 보존.
 * 이전 import 결과가 잘못된 경우 _clearRawSheets() 후 _importLegacyToRaw() 재실행.
 * Returns { cleared: { 로그_이벤트: N, 로그_선수경기: M } }
 */
function _clearRawSheets() {
  _ensureRawSheets();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cleared = {};

  var eventSheet = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (eventSheet) {
    var eventLastRow = eventSheet.getLastRow();
    if (eventLastRow >= 2) {
      var eventCount = eventLastRow - 1;
      eventSheet.deleteRows(2, eventCount);
      cleared[RAW_EVENTS_SHEET] = eventCount;
    } else {
      cleared[RAW_EVENTS_SHEET] = 0;
    }
  }

  var playerSheet = ss.getSheetByName(RAW_PLAYER_GAMES_SHEET);
  if (playerSheet) {
    var playerLastRow = playerSheet.getLastRow();
    if (playerLastRow >= 2) {
      var playerCount = playerLastRow - 1;
      playerSheet.deleteRows(2, playerCount);
      cleared[RAW_PLAYER_GAMES_SHEET] = playerCount;
    } else {
      cleared[RAW_PLAYER_GAMES_SHEET] = 0;
    }
  }

  Logger.log(JSON.stringify({ cleared: cleared }));
  return { cleared: cleared };
}

/**
 * Apps Script 편집기 실행창에서 인자 전달이 안 되므로 래퍼.
 * 팀/시트 추가 시 teams 배열에 항목 추가.
 * 편집기에서 함수 선택 후 "실행" 클릭.
 */
function _runImport() {
  return _importLegacyToRaw({
    teams: [
      {
        team: "마스터FC",
        pointSheet: "마스터FC 포인트 로그",
        pointSchema: "futsalPoint",
        playerSheet: "마스터FC 선수별집계기록 로그",
        playerSchema: "futsalPlayer"
      },
      {
        team: "하버FC",
        pointSheet: "하버FC 포인트 로그",
        pointSchema: "soccerPoint",
        playerSheet: "하버FC 선수기록보관소",
        playerSchema: "soccerPlayer"
      }
    ]
  });
}

function _reimportPointLog(team, sport, pointSheet) {
  if (!team || !sport || !pointSheet) return { success: false, error: "team/sport/pointSheet 필요" };
  if (sport === "풋살") return _reimportFutsalPointForTeam(team, pointSheet);
  if (sport === "축구") return _reimportSoccerPointForTeam(team, pointSheet);
  return { success: false, error: "지원하지 않는 sport: " + sport };
}

function _reimportSoccerPointForTeam(team, pointSheet) {
  // _reimportFutsalPointForTeam 과 동일 패턴, 단 _readSoccerPointSchema 호출
  _ensureRawSheets();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (!sheet) return { success: false, error: "로그_이벤트 시트 없음" };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };
  try {
    var lastRow = sheet.getLastRow();
    var deleted = 0;
    if (lastRow >= 2) {
      var lastCol = sheet.getLastColumn();
      var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      var teamCol = headers.indexOf("team");
      var sportCol = headers.indexOf("sport");
      if (teamCol < 0 || sportCol < 0) return { success: false, error: "team/sport 컬럼 없음" };
      var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      var keep = [];
      for (var i = 0; i < data.length; i++) {
        var rowTeam = String(data[i][teamCol] || "").trim();
        var rowSport = String(data[i][sportCol] || "").trim();
        if (rowTeam === team && rowSport === "축구") { deleted++; continue; }
        keep.push(data[i]);
      }
      sheet.deleteRows(2, lastRow - 1);
      if (keep.length > 0) {
        sheet.getRange(2, 1, keep.length, lastCol).setValues(keep);
      }
    }

    var pointData = _readSoccerPointSchema(pointSheet, team);
    var rows = pointData.rows || [];
    if (pointData.error) return { success: false, deleted: deleted, error: pointData.error };

    var inserted = 0;
    if (rows.length > 0) {
      var write = _writeRawEvents({ rows: rows, skipDedupe: true });
      inserted = write.count || 0;
    }
    Logger.log(JSON.stringify({ team: team, sport: "축구", deleted: deleted, inserted: inserted }));
    return { success: true, deleted: deleted, inserted: inserted };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 특정 팀/종목의 로그_이벤트 행만 삭제 후 포인트 시트에서 재import.
 * _readFutsalPointSchema 같은 변환 로직이 바뀌었을 때 안전하게 재적용.
 * 로그_선수경기는 건드리지 않음.
 */
function _reimportFutsalPointForTeam(team, pointSheet) {
  _ensureRawSheets();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RAW_EVENTS_SHEET);
  if (!sheet) return { success: false, error: "로그_이벤트 시트 없음" };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };
  try {
    var lastRow = sheet.getLastRow();
    var deleted = 0;
    if (lastRow >= 2) {
      var lastCol = sheet.getLastColumn();
      var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      var teamCol = headers.indexOf("team");
      var sportCol = headers.indexOf("sport");
      if (teamCol < 0 || sportCol < 0) return { success: false, error: "team/sport 컬럼 없음" };
      var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      // 보존 행만 모아서 한 번에 다시 씀
      var keep = [];
      for (var i = 0; i < data.length; i++) {
        var rowTeam = String(data[i][teamCol] || "").trim();
        var rowSport = String(data[i][sportCol] || "").trim();
        if (rowTeam === team && rowSport === "풋살") { deleted++; continue; }
        keep.push(data[i]);
      }
      sheet.deleteRows(2, lastRow - 1);
      if (keep.length > 0) {
        sheet.getRange(2, 1, keep.length, lastCol).setValues(keep);
      }
    }

    var pointData = _readFutsalPointSchema(pointSheet, team);
    var rows = pointData.rows || [];
    if (pointData.error) return { success: false, deleted: deleted, error: pointData.error };

    var inserted = 0;
    if (rows.length > 0) {
      var write = _writeRawEvents({ rows: rows, skipDedupe: true });
      inserted = write.count || 0;
    }
    Logger.log(JSON.stringify({ deleted: deleted, inserted: inserted }));
    return { success: true, deleted: deleted, inserted: inserted };
  } finally {
    lock.releaseLock();
  }
}

/** Apps Script 편집기에서 직접 실행. 마스터FC/풋살 로그_이벤트 재import. */
function _reimportMasterFCFutsalPoint() {
  return _reimportFutsalPointForTeam("마스터FC", "마스터FC 포인트 로그");
}

// ═══════════════════════════════════════════════════════════════
// 누적 크로바/고구마 조회
// ═══════════════════════════════════════════════════════════════

// 선수별집계 로그 헤더명 기반 컬럼 인덱스 맵 — 컬럼 순서/삽입 변경에 견고(하드코딩 인덱스 금지).
// 헤더 탐색 실패 시 표준 인덱스로 폴백. _getCumulativeBonus/_getPrevRankings/_getRankingHistory 공용.
function _playerLogColMap(sheet) {
  var lastRow = sheet.getLastRow();
  var colCount = sheet.getLastColumn();
  var headerRow = 1;
  var scanRows = sheet.getRange(1, 1, Math.min(5, lastRow), colCount).getValues();
  for (var r = 0; r < scanRows.length; r++) {
    if (scanRows[r].some(function(cell){ var s = String(cell).trim(); return s === "선수명" || s === "경기일자"; })) { headerRow = r + 1; break; }
  }
  var headers = sheet.getRange(headerRow, 1, 1, colCount).getValues()[0].map(function(h){ return String(h).trim(); });
  var cm = {};
  for (var c = 0; c < headers.length; c++) {
    var h = headers[c];
    if (h === "경기일자") cm.date = c;
    else if (h === "선수명") cm.name = c;
    else if (h === "골") cm.goals = c;
    else if (h === "어시") cm.assists = c;
    else if (h === "역주행" || h === "자책골") cm.ownGoals = c;
    else if (h === "실점") cm.conceded = c;
    else if (h === "클린시트") cm.cleanSheets = c;
    else if (h === "크로바") cm.crova = c;
    else if (h === "고구마") cm.goguma = c;
    else if (h === "키퍼경기수" || h === "키퍼경기") cm.keeperGames = c;
    else if (h === "팀순위점수") cm.rankScore = c;
    else if (h === "소속팀") cm.teamName = c;
  }
  function idx(key, def) { return cm[key] !== undefined ? cm[key] : def; }
  return {
    headerRow: headerRow, colCount: colCount, cm: cm,
    iDate: idx('date', 0), iName: idx('name', 1), iGoals: idx('goals', 2),
    iAssists: idx('assists', 3), iOwn: idx('ownGoals', 4), iClean: idx('cleanSheets', 6),
    // 크로바/고구마는 헤더가 있을 때만 읽는다. 이전 폴백 7/8은 마스터FC 로그 레이아웃 전제라
    // 하버FC 선수기록보관소(두 헤더 없음)에서 7=클린시트/8=실점을 오독했다 — GK 실점이
    // 고구마 증분으로 새어 대시보드 ▲/▼ 배지가 유령 상승을 표시(8/18 선효림 ▲5).
    // -1이면 data[i][-1]=undefined → Number()||0 → 0 (소비자 3곳 모두 이 패턴).
    iCrova: idx('crova', -1), iGoguma: idx('goguma', -1), iTeam: idx('teamName', 12),
  };
}

function _getCumulativeBonus(team, sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName || PLAYER_LOG_SHEET);
  if (!sheet) return { success: true, crova: {}, goguma: {} };

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, crova: {}, goguma: {} };

  var m = _playerLogColMap(sheet);
  var dataStartRow = m.headerRow + 1;
  if (dataStartRow > lastRow) return { success: true, crova: {}, goguma: {} };
  var data = sheet.getRange(dataStartRow, 1, lastRow - dataStartRow + 1, m.colCount).getValues();

  var crova = {};
  var goguma = {};

  for (var i = 0; i < data.length; i++) {
    if (team && m.cm.teamName !== undefined) {
      var rowTeam = String(data[i][m.iTeam]).trim();
      if (rowTeam && rowTeam !== team) continue;
    }

    var name = String(data[i][m.iName]).trim();
    if (!name) continue;

    var c = Number(data[i][m.iCrova]) || 0;
    var g = Number(data[i][m.iGoguma]) || 0;

    if (c !== 0) crova[name] = (crova[name] || 0) + c;
    if (g !== 0) goguma[name] = (goguma[name] || 0) + g;
  }

  return { success: true, crova: crova, goguma: goguma };
}

// ═══════════════════════════════════════════════════════════════
// 시트 목록 조회
// ═══════════════════════════════════════════════════════════════

function _getSheetList() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var list = sheets.map(function(s) {
    return { name: s.getName(), gid: s.getSheetId() };
  });
  return { success: true, sheets: list };
}

// ═══════════════════════════════════════════════════════════════
// 이전 랭킹 계산 (마지막 경기 제외 누적 포인트 기반)
// ═══════════════════════════════════════════════════════════════

function _getPrevRankings(team, sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName || PLAYER_LOG_SHEET);
  if (!sheet) return { success: true, latestDeltas: {} };

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, latestDeltas: {} };

  var m = _playerLogColMap(sheet);
  var dataStartRow = m.headerRow + 1;
  if (dataStartRow > lastRow) return { success: true, latestDeltas: {} };
  var data = sheet.getRange(dataStartRow, 1, lastRow - dataStartRow + 1, m.colCount).getValues();

  // 팀 필터 + 최신 경기일자 찾기
  var latestDate = "";
  for (var i = 0; i < data.length; i++) {
    var rowTeam = data[i][m.iTeam] ? String(data[i][m.iTeam]).trim() : "";
    if (rowTeam && rowTeam !== team) continue;
    var dateStr = _toDateStr(data[i][m.iDate]);
    if (dateStr > latestDate) latestDate = dateStr;
  }

  if (!latestDate) return { success: true, latestDeltas: {} };

  // 최신 경기일자의 선수별 증분만 추출
  var deltas = {};
  for (var j = 0; j < data.length; j++) {
    var rTeam = data[j][m.iTeam] ? String(data[j][m.iTeam]).trim() : "";
    if (rTeam && rTeam !== team) continue;
    var ds = _toDateStr(data[j][m.iDate]);
    if (ds !== latestDate) continue;
    var name = String(data[j][m.iName]).trim();
    if (!name) continue;
    deltas[name] = {
      goals: Number(data[j][m.iGoals]) || 0,
      assists: Number(data[j][m.iAssists]) || 0,
      ownGoals: Number(data[j][m.iOwn]) || 0,
      cleanSheets: Number(data[j][m.iClean]) || 0,
      crova: Number(data[j][m.iCrova]) || 0,
      goguma: Number(data[j][m.iGoguma]) || 0,
    };
  }

  return { success: true, latestDeltas: deltas, latestDate: latestDate };
}

// ═══════════════════════════════════════════════════════════════
// 랭킹 히스토리 (캔들차트용 - 경기일자별 전체 선수 랭킹)
// ═══════════════════════════════════════════════════════════════

function _getRankingHistory(team, allPlayers, customSheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = customSheetName || PLAYER_LOG_SHEET;
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: true, rankingHistory: { dates: [], players: {} } };

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, rankingHistory: { dates: [], players: {} } };

  var m = _playerLogColMap(sheet);
  var dataStartRow = m.headerRow + 1;
  if (dataStartRow > lastRow) return { success: true, rankingHistory: { dates: [], players: {} } };
  var data = sheet.getRange(dataStartRow, 1, lastRow - dataStartRow + 1, m.colCount).getValues();

  // 경기일자별 선수 데이터 그룹핑
  var dateMap = {}; // { "2025-09-15": [ {name, goals, assists, ...} ] }
  for (var i = 0; i < data.length; i++) {
    var rowTeam = data[i][m.iTeam] ? String(data[i][m.iTeam]).trim() : "";
    if (rowTeam && rowTeam !== team) continue;

    var dateStr = _toDateStr(data[i][m.iDate]);
    var name = String(data[i][m.iName]).trim();
    if (!name || !dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;

    if (!dateMap[dateStr]) dateMap[dateStr] = [];
    dateMap[dateStr].push({
      name: name,
      goals: Number(data[i][m.iGoals]) || 0,
      assists: Number(data[i][m.iAssists]) || 0,
      ownGoals: Number(data[i][m.iOwn]) || 0,
      cleanSheets: Number(data[i][m.iClean]) || 0,
      crova: Number(data[i][m.iCrova]) || 0,
      goguma: Number(data[i][m.iGoguma]) || 0,
    });
  }

  var sortedDates = Object.keys(dateMap).sort();
  // 디버그: 처리된 행 수, 날짜 목록, 첫 5행 날짜 원본값
  var debug = {
    totalRows: data.length,
    datesFound: sortedDates,
    first5RawDates: data.slice(0, 5).map(function(r) { return { raw: String(r[m.iDate]), type: typeof r[m.iDate], isDate: r[m.iDate] instanceof Date, converted: _toDateStr(r[m.iDate]), name: String(r[m.iName]).trim(), team: String(r[m.iTeam] || "").trim() }; }),
  };
  if (sortedDates.length === 0) return { success: true, rankingHistory: { dates: [], players: {} }, debug: debug };

  // 경기일자별 누적 → 랭킹 계산
  var cumulative = {}; // { name: { goals, assists, ownGoals, cleanSheets, crova, goguma } }
  // 대시보드 전체 선수 목록으로 초기화 (0 스탯)
  if (allPlayers && allPlayers.length > 0) {
    for (var ap = 0; ap < allPlayers.length; ap++) {
      var pn = String(allPlayers[ap]).trim();
      if (pn) cumulative[pn] = { goals: 0, assists: 0, ownGoals: 0, cleanSheets: 0, crova: 0, goguma: 0 };
    }
  }
  var resultDates = [];
  var resultPlayers = {}; // { name: [rank1, rank2, ...] }

  for (var d = 0; d < sortedDates.length; d++) {
    var dt = sortedDates[d];
    var rows = dateMap[dt];

    // 해당 날짜 데이터 누적
    for (var r = 0; r < rows.length; r++) {
      var p = rows[r];
      if (!cumulative[p.name]) cumulative[p.name] = { goals: 0, assists: 0, ownGoals: 0, cleanSheets: 0, crova: 0, goguma: 0 };
      cumulative[p.name].goals += p.goals;
      cumulative[p.name].assists += p.assists;
      cumulative[p.name].ownGoals += p.ownGoals;
      cumulative[p.name].cleanSheets += p.cleanSheets;
      cumulative[p.name].crova += p.crova;
      cumulative[p.name].goguma += p.goguma;
    }

    // 전체 선수 랭킹 계산
    var ranked = Object.keys(cumulative).map(function(n) {
      var s = cumulative[n];
      var pt = s.goals + s.assists + s.ownGoals + s.cleanSheets + s.crova + s.goguma;
      return { name: n, point: pt, ownGoals: s.ownGoals, goguma: s.goguma, goals: s.goals, assists: s.assists, cleanSheets: s.cleanSheets };
    });

    ranked.sort(function(a, b) {
      if (b.point !== a.point) return b.point - a.point;
      if (a.ownGoals !== b.ownGoals) return a.ownGoals - b.ownGoals;
      if (a.goguma !== b.goguma) return a.goguma - b.goguma;
      if (b.goals !== a.goals) return b.goals - a.goals;
      if (b.assists !== a.assists) return b.assists - a.assists;
      return b.cleanSheets - a.cleanSheets;
    });

    resultDates.push(dt);
    for (var k = 0; k < ranked.length; k++) {
      var nm = ranked[k].name;
      if (!resultPlayers[nm]) {
        // 첫 등장 전 날짜들은 null로 채움
        resultPlayers[nm] = [];
        for (var f = 0; f < resultDates.length - 1; f++) resultPlayers[nm].push(null);
      }
      resultPlayers[nm].push(k + 1);
    }

    // 이전에 존재했지만 이번 날짜에 랭킹 안 된 선수 (있을 수 없지만 안전장치)
    for (var pn in resultPlayers) {
      if (resultPlayers[pn].length < resultDates.length) {
        resultPlayers[pn].push(resultPlayers[pn][resultPlayers[pn].length - 1]);
      }
    }
  }

  return { success: true, rankingHistory: { dates: resultDates, players: resultPlayers }, debug: debug };
}

// ═══════════════════════════════════════════════════════════════
// 포인트로그(골 이벤트) 조회
// ═══════════════════════════════════════════════════════════════

function _getPointLog(team, customSheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = customSheetName || POINT_LOG_SHEET;
  var useCustomSheet = !!customSheetName && customSheetName !== POINT_LOG_SHEET;
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: true, events: [] };

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, events: [] };

  var colCount = sheet.getLastColumn();
  // 헤더 행 자동 탐색 (1~5행 중 "경기일자" 포함 행)
  var headerRow = 1;
  var scanRows = sheet.getRange(1, 1, Math.min(5, lastRow), colCount).getValues();
  for (var r = 0; r < scanRows.length; r++) {
    if (scanRows[r].some(function(cell) { return String(cell).trim() === "경기일자"; })) {
      headerRow = r + 1;
      break;
    }
  }
  var headers = sheet.getRange(headerRow, 1, 1, colCount).getValues()[0].map(function(h) { return String(h).trim(); });

  // 헤더 기반 동적 컬럼 매핑 (풋살/축구 공통)
  var cm = {};
  for (var c = 0; c < headers.length; c++) {
    var h = headers[c];
    if (h === "경기일자") cm.date = c;
    else if (h === "경기번호") cm.matchId = c;
    else if (h === "내팀") cm.myTeam = c;
    else if (h === "상대팀" || h === "상대팀명") cm.opponent = c;
    else if (h === "득점" || h === "득점선수") cm.scorer = c;
    else if (h === "어시" || h === "어시선수") cm.assist = c;
    else if (h === "자책골") cm.ownGoal = c;
    else if (h === "실점" || h === "실점키퍼" || h === "실점키퍼명") cm.concedingGk = c;
    else if (h === "팀이름") cm.teamName = c;
    else if (h === "반칙선수" || h === "반칙") cm.foul = c;
  }

  var dataStartRow = headerRow + 1;
  if (dataStartRow > lastRow) return { success: true, events: [] };
  var data = sheet.getRange(dataStartRow, 1, lastRow - dataStartRow + 1, colCount).getValues();
  var events = [];
  for (var i = 0; i < data.length; i++) {
    if (cm.teamName !== undefined && !useCustomSheet) {
      var rowTeam = data[i][cm.teamName] ? String(data[i][cm.teamName]).trim() : "";
      if (rowTeam && rowTeam !== team) continue;
    }

    var dateStr = _toDateStr(data[i][cm.date !== undefined ? cm.date : 0]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;

    events.push({
      date: dateStr,
      matchId: cm.matchId !== undefined ? String(data[i][cm.matchId] || "").trim() : "",
      myTeam: cm.myTeam !== undefined ? String(data[i][cm.myTeam] || "").trim() : "",
      opponent: cm.opponent !== undefined ? String(data[i][cm.opponent] || "").trim() : "",
      scorer: cm.scorer !== undefined ? String(data[i][cm.scorer] || "").trim() : "",
      assist: cm.assist !== undefined ? String(data[i][cm.assist] || "").trim() : "",
      ownGoal: cm.ownGoal !== undefined ? String(data[i][cm.ownGoal] || "").trim() : "",
      foul: cm.foul !== undefined ? String(data[i][cm.foul] || "").trim() : "",
      concedingGk: cm.concedingGk !== undefined ? String(data[i][cm.concedingGk] || "").trim() : "",
    });
  }

  return { success: true, events: events };
}

// ═══════════════════════════════════════════════════════════════
// 선수별집계기록로그 조회
// ═══════════════════════════════════════════════════════════════

function _getPlayerLog(team, customSheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = customSheetName || PLAYER_LOG_SHEET;
  var useCustomSheet = !!customSheetName && customSheetName !== PLAYER_LOG_SHEET;
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: true, players: [] };

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, players: [] };

  var colCount = sheet.getLastColumn();
  // 헤더 행 자동 탐색 (1~5행 중 "선수명" 또는 "경기일자" 포함 행)
  var headerRow = 1;
  var scanRows = sheet.getRange(1, 1, Math.min(5, lastRow), colCount).getValues();
  for (var r = 0; r < scanRows.length; r++) {
    if (scanRows[r].some(function(cell) { var s = String(cell).trim(); return s === "선수명" || s === "경기일자"; })) {
      headerRow = r + 1;
      break;
    }
  }
  var headers = sheet.getRange(headerRow, 1, 1, colCount).getValues()[0].map(function(h) { return String(h).trim(); });

  // 헤더 기반 동적 컬럼 매핑 (풋살/축구 공통)
  var cm = {};
  for (var c = 0; c < headers.length; c++) {
    var h = headers[c];
    if (h === "경기일자") cm.date = c;
    else if (h === "선수명") cm.name = c;
    else if (h === "골") cm.goals = c;
    else if (h === "어시") cm.assists = c;
    else if (h === "역주행" || h === "자책골") cm.ownGoals = c;
    else if (h === "실점") cm.conceded = c;
    else if (h === "클린시트") cm.cleanSheets = c;
    else if (h === "크로바") cm.crova = c;
    else if (h === "고구마") cm.goguma = c;
    else if (h === "키퍼경기수" || h === "키퍼경기") cm.keeperGames = c;
    else if (h === "팀순위점수") cm.rankScore = c;
    else if (h === "소속팀") cm.teamName = c;
  }

  var dataStartRow = headerRow + 1;
  if (dataStartRow > lastRow) return { success: true, players: [] };
  var data = sheet.getRange(dataStartRow, 1, lastRow - dataStartRow + 1, colCount).getValues();
  var players = [];
  for (var i = 0; i < data.length; i++) {
    if (cm.teamName !== undefined && !useCustomSheet) {
      var rowTeam = data[i][cm.teamName] ? String(data[i][cm.teamName]).trim() : "";
      if (rowTeam && rowTeam !== team) continue;
    }
    var dateStr = _toDateStr(data[i][cm.date !== undefined ? cm.date : 0]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
    var name = String(data[i][cm.name !== undefined ? cm.name : 1]).trim();
    if (!name) continue;
    players.push({
      date: dateStr, name: name,
      goals: cm.goals !== undefined ? Number(data[i][cm.goals]) || 0 : 0,
      assists: cm.assists !== undefined ? Number(data[i][cm.assists]) || 0 : 0,
      ownGoals: cm.ownGoals !== undefined ? Number(data[i][cm.ownGoals]) || 0 : 0,
      conceded: cm.conceded !== undefined ? Number(data[i][cm.conceded]) || 0 : 0,
      cleanSheets: cm.cleanSheets !== undefined ? Number(data[i][cm.cleanSheets]) || 0 : 0,
      crova: cm.crova !== undefined ? Number(data[i][cm.crova]) || 0 : 0,
      goguma: cm.goguma !== undefined ? Number(data[i][cm.goguma]) || 0 : 0,
      keeperGames: cm.keeperGames !== undefined ? Number(data[i][cm.keeperGames]) || 0 : 0,
      rankScore: cm.rankScore !== undefined ? Number(data[i][cm.rankScore]) || 0 : 0,
    });
  }
  return { success: true, players: players, debug: { totalRows: data.length, returned: players.length, requestedTeam: team, sheetName: sheetName, headers: headers } };
}

// ═══════════════════════════════════════════════════════════════
// 대회 관리
// ═══════════════════════════════════════════════════════════════

function _createTournament(data) {
  if (!data || !data.id || !data.name) return { success: false, error: "필수 정보 누락" };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var listSheet = ss.getSheetByName("대회_목록");
  if (!listSheet) {
    listSheet = ss.insertSheet("대회_목록");
    listSheet.getRange("A1:J1").setValues([["대회ID","대회명","시작일","종료일","참가팀","대진형태","상태","생성시간","기본경기시간","기본구장"]]);
    listSheet.getRange("A1:J1").setFontWeight("bold");
  }
  var lastRow = listSheet.getLastRow();
  listSheet.getRange(lastRow + 1, 1, 1, 10).setValues([[
    data.id, data.name, data.startDate || "", data.endDate || "",
    (data.teams || []).join(","), data.format || "manual", "active", _kstNow(),
    Number(data.defaultMinutes) || 90, data.defaultVenue || ""
  ]]);
  var schedSheet = ss.insertSheet("대회_" + data.id + "_일정");
  schedSheet.getRange("A1:H1").setValues([["경기번호","날짜","홈팀","원정팀","홈스코어","원정스코어","시간","구장"]]);
  schedSheet.getRange("A1:H1").setFontWeight("bold");
  var matches = data.matches || [];
  if (matches.length > 0) {
    var defVenue = data.defaultVenue || "";
    var values = matches.map(function(m) {
      return [m.matchNum, m.date || "", m.home || "", m.away || "", "", "", "", defVenue];
    });
    schedSheet.getRange(2, 1, values.length, 8).setValues(values);
  }
  var eventSheet = ss.insertSheet("대회_" + data.id + "_이벤트로그");
  eventSheet.getRange("A1:G1").setValues([["경기번호","상대팀명","이벤트","선수","관련선수","포지션","입력시간"]]);
  eventSheet.getRange("A1:G1").setFontWeight("bold");
  var playerSheet = ss.insertSheet("대회_" + data.id + "_대시보드");
  playerSheet.getRange("A1:J1").setValues([["선수명","전체경기","필드경기","키퍼경기","골","어시","클린시트","실점","자책골","포인트"]]);
  playerSheet.getRange("A1:J1").setFontWeight("bold");
  return { success: true, id: data.id };
}

function _deleteTournament(tournamentId) {
  if (!tournamentId) return { success: false, error: "대회ID 누락" };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // 관련 시트 삭제
  ["_일정", "_이벤트로그", "_대시보드"].forEach(function(suffix) {
    var sheet = ss.getSheetByName("대회_" + tournamentId + suffix);
    if (sheet) ss.deleteSheet(sheet);
  });
  // 대회_목록에서 행 삭제
  var listSheet = ss.getSheetByName("대회_목록");
  if (listSheet) {
    var lastRow = listSheet.getLastRow();
    if (lastRow >= 2) {
      var data = listSheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = data.length - 1; i >= 0; i--) {
        if (String(data[i][0]) === tournamentId) listSheet.deleteRow(i + 2);
      }
    }
  }
  return { success: true };
}

function _updateTournamentMatch(tournamentId, matchNum, updates) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("대회_" + tournamentId + "_일정");
  if (!sheet) return { success: false, error: "일정 시트 없음" };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: false, error: "데이터 없음" };
  var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  for (var i = 0; i < data.length; i++) {
    if (Number(data[i][0]) === matchNum) {
      if (updates.date !== undefined) sheet.getRange(i + 2, 2).setValue(updates.date);
      if (updates.home !== undefined) sheet.getRange(i + 2, 3).setValue(updates.home);
      if (updates.away !== undefined) sheet.getRange(i + 2, 4).setValue(updates.away);
      if (updates.time !== undefined) sheet.getRange(i + 2, 7).setValue(updates.time);
      if (updates.venue !== undefined) sheet.getRange(i + 2, 8).setValue(updates.venue);
      return { success: true };
    }
  }
  return { success: false, error: "경기번호 " + matchNum + " 없음" };
}

function _getTournamentRoster(tournamentId) {
  // _대시보드 시트에서 명단 조회 (선수기록 = 대시보드)
  var result = _getTournamentPlayerRecords(tournamentId);
  return { success: true, players: (result.players || []).map(function(p) {
    return { name: p.name, games: p.games, goals: p.goals, assists: p.assists, cleanSheets: p.cleanSheets, point: p.point };
  })};
}

function _getTournamentList(team) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("대회_목록");
  if (!sheet) return { success: true, tournaments: [] };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, tournaments: [] };
  var colCount = Math.max(sheet.getLastColumn(), 10);
  var data = sheet.getRange(2, 1, lastRow - 1, colCount).getValues();
  var list = data.filter(function(r) { return r[0]; }).map(function(r) {
    return { id: String(r[0]), name: String(r[1]), startDate: _toDateStr(r[2]), endDate: _toDateStr(r[3]),
      teams: String(r[4]).split(",").map(function(t) { return t.trim(); }).filter(Boolean),
      format: String(r[5]), status: String(r[6]),
      defaultMinutes: Number(r[8]) || 90, defaultVenue: String(r[9] || "") };
  });
  return { success: true, tournaments: list };
}

function _getTournamentSchedule(tournamentId, ourTeam) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("대회_" + tournamentId + "_일정");
  if (!sheet) return { success: false, error: "일정 시트 없음" };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, matches: [] };
  var colCount = Math.max(sheet.getLastColumn(), 8);
  var data = sheet.getRange(2, 1, lastRow - 1, colCount).getValues();
  var matches = data.filter(function(r) { return r[0]; }).map(function(r) {
    var home = String(r[2] || "").trim();
    var away = String(r[3] || "").trim();
    var isOurs = ourTeam ? (home === ourTeam || away === ourTeam) : false;
    var hasScore = r[4] !== "" && r[4] !== null && r[4] !== undefined;
    return { matchNum: Number(r[0]), date: _toDateStr(r[1]),
      home: home, away: away,
      homeScore: hasScore ? Number(r[4]) : null,
      awayScore: r[5] !== "" && r[5] !== null ? Number(r[5]) : null,
      time: String(r[6] || "").trim(),
      venue: String(r[7] || "").trim(),
      isOurs: isOurs,
      status: hasScore ? "finished" : "scheduled" };
  });
  return { success: true, matches: matches };
}

function _updateTournamentMatchScore(tournamentId, matchNum, homeScore, awayScore) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("대회_" + tournamentId + "_일정");
  if (!sheet) return { success: false, error: "일정 시트 없음" };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: false, error: "데이터 없음" };
  var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  for (var i = 0; i < data.length; i++) {
    if (Number(data[i][0]) === matchNum) {
      sheet.getRange(i + 2, 5).setValue(homeScore);  // E열: 홈스코어
      sheet.getRange(i + 2, 6).setValue(awayScore);  // F열: 원정스코어
      return { success: true };
    }
  }
  return { success: false, error: "경기번호 " + matchNum + " 없음" };
}

function _writeTournamentEventLog(tournamentId, data) {
  if (!data) return { success: false, error: "data 누락" };
  var rows = data.events || [];
  if (rows.length === 0) return { success: true, count: 0 };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("대회_" + tournamentId + "_이벤트로그");
  if (!sheet) return { success: false, error: "이벤트로그 시트 없음" };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };
  try {
    var values = rows.map(function(e) {
      return [e.matchNum || "", e.opponent || "", e.event || "", e.player || "", e.relatedPlayer || "", e.position || "", e.inputTime || _kstNow()];
    });
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, values.length, 7).setValues(values);
    return { success: true, count: values.length };
  } finally { lock.releaseLock(); }
}

function _writeTournamentPlayerRecord(tournamentId, data) {
  if (!data) return { success: false, error: "data 누락" };
  var rows = data.players || [];
  if (rows.length === 0) return { success: true, count: 0 };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("대회_" + tournamentId + "_대시보드");
  if (!sheet) return { success: false, error: "선수기록 시트 없음" };
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 10).clearContent();
  var values = rows.map(function(p) {
    return [p.name, Number(p.games)||0, Number(p.fieldGames)||0, Number(p.keeperGames)||0,
      Number(p.goals)||0, Number(p.assists)||0, Number(p.cleanSheets)||0,
      Number(p.conceded)||0, Number(p.owngoals)||0, Number(p.point)||0];
  });
  sheet.getRange(2, 1, values.length, 10).setValues(values);
  return { success: true, count: values.length };
}

function _getTournamentPlayerRecords(tournamentId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("대회_" + tournamentId + "_대시보드");
  if (!sheet) return { success: true, players: [] };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, players: [] };
  var data = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  var players = data.filter(function(r) { return r[0]; }).map(function(r) {
    return { name: String(r[0]), games: Number(r[1])||0, fieldGames: Number(r[2])||0,
      keeperGames: Number(r[3])||0, goals: Number(r[4])||0, assists: Number(r[5])||0,
      cleanSheets: Number(r[6])||0, conceded: Number(r[7])||0, owngoals: Number(r[8])||0,
      point: Number(r[9])||0 };
  });
  return { success: true, players: players };
}

function _getTournamentEventLog(tournamentId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("대회_" + tournamentId + "_이벤트로그");
  if (!sheet) return { success: true, events: [] };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, events: [] };
  var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  var events = data.filter(function(r) { return r[0]; }).map(function(r) {
    return { matchNum: Number(r[0]), opponent: String(r[1]), event: String(r[2]),
      player: String(r[3]), relatedPlayer: String(r[4]), position: String(r[5]),
      inputTime: String(r[6]) };
  });
  return { success: true, events: events };
}

// ── 테니스 헬퍼 ───────────────────────────────────────────────────

function _ensureTennisSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var defs = [
    [TENNIS_ROSTER_SHEET, TENNIS_ROSTER_HEADERS],
    [TENNIS_MATCHES_SHEET, TENNIS_MATCH_HEADERS],
    [TENNIS_PLAYER_GAMES_SHEET, TENNIS_PLAYER_GAME_HEADERS],
    [TENNIS_LEGACY_SHEET, TENNIS_LEGACY_HEADERS]
  ];
  for (var i = 0; i < defs.length; i++) {
    var name = defs[i][0], headers = defs[i][1];
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.getRange(1, 1, 1, headers.length).setFontWeight("bold");
      sh.setFrozenRows(1);
    }
  }
}

function _tennisRowToArray(r, headers) {
  var out = [];
  for (var i = 0; i < headers.length; i++) {
    var v = r[headers[i]];
    // 시트 수식 주입 차단 — setValues()는 '='로 시작하는 문자열을 수식으로 해석한다.
    // RTDB는 공개 쓰기가 가능해 선수 이름 등에 payload가 심길 수 있고, 자동 업로드는
    // 사람이 보지 않고 그대로 시트에 넣는다. 숫자·불리언은 그대로 두고 문자열만 정화한다.
    if (v === undefined || v === null) out.push("");
    else if (typeof v === "string") out.push(_sanitizeCell(v));
    else out.push(v);
  }
  return out;
}

function _writeTennisRows(sheetName, headers, data) {
  if (!data || !data.rows) return { success: false, error: "rows 누락" };
  _ensureTennisSheets();
  var rows = data.rows;
  if (rows.length === 0) return { success: true, count: 0 };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    var toInsert = [];
    for (var i = 0; i < rows.length; i++) toInsert.push(_tennisRowToArray(rows[i], headers));
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, toInsert.length, headers.length).setValues(toInsert);
    return { success: true, count: toInsert.length };
  } finally {
    lock.releaseLock();
  }
}

function _writeTennisMatches(data) {
  return _writeTennisRows(TENNIS_MATCHES_SHEET, TENNIS_MATCH_HEADERS, data);
}

function _writeTennisPlayerGames(data) {
  return _writeTennisRows(TENNIS_PLAYER_GAMES_SHEET, TENNIS_PLAYER_GAME_HEADERS, data);
}

function _getTennisLegacyRecords(team) {
  _ensureTennisSheets();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TENNIS_LEGACY_SHEET);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, rows: [] };
  var values = sheet.getRange(2, 1, lastRow - 1, TENNIS_LEGACY_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    if (team && String(v[0]).trim() !== String(team).trim()) continue;
    var obj = {};
    for (var c = 0; c < TENNIS_LEGACY_HEADERS.length; c++) obj[TENNIS_LEGACY_HEADERS[c]] = v[c];
    out.push(obj);
  }
  return { success: true, rows: out };
}

function _readTennisRows(sheetName, headers, team, dateFrom, dateTo) {
  _ensureTennisSheets();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, rows: [] };
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var dateIdx = headers.indexOf("date");
  var teamIdx = headers.indexOf("team");
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    if (team && String(v[teamIdx]).trim() !== String(team).trim()) continue;
    var d = _toDateStr(v[dateIdx]);
    if (dateFrom && d < dateFrom) continue;
    if (dateTo && d > dateTo) continue;
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = v[c];
    obj.date = d;
    out.push(obj);
  }
  return { success: true, rows: out };
}

// 생년월일은 클라이언트로 내리지 않는다. 2차 연령대 분석 때 별도 경로를 만든다.
// 앱 전역 로스터 조회 — 정회원 활동만(탈퇴+게스트 제외). 반환 shape 불변(분석/순위 무변경).
// 읽기 hot-path라 _ensureTennisRosterColumns를 호출하지 않는다(구분은 v[9] 인덱스로 읽음, 헤더 불필요).
function _getTennisRoster(team) {
  _ensureTennisSheets();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TENNIS_ROSTER_SHEET);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, players: [] };
  var ncol = Math.min(TENNIS_ROSTER_HEADERS.length, sheet.getMaxColumns()); // 좁은 시트 방어
  var values = sheet.getRange(2, 1, lastRow - 1, ncol).getValues();
  var players = [];
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    if (team && String(v[0]).trim() !== String(team).trim()) continue;
    var name = String(v[1] || "").trim();
    if (!name) continue;
    var status = String(v[5] || "활동").trim();
    if (status === "탈퇴") continue;
    var memberType = String(v[9] || "정회원").trim(); // v[9] 없으면(구분열 미존재) 정회원
    if (memberType === "게스트") continue;   // 게스트는 정회원 지표에서 제외
    players.push({
      name: name,
      nickname: String(v[2] || "").trim(),
      grade: String(v[4] || "").trim(),
      status: status,
      seasonStartRank: v[6] === "" || v[6] === null ? null : Number(v[6])
    });
  }
  return { success: true, players: players };
}

// 회원명부 "구분"(10열) 헤더 보정 — 10열만, 이미 있으면 무동작. 쓰기/관리 경로에서만 호출.
function _ensureTennisRosterColumns() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TENNIS_ROSTER_SHEET);
  if (!sheet) return;
  var col = TENNIS_ROSTER_HEADERS.length; // 10
  if (sheet.getMaxColumns() < col) sheet.insertColumnsAfter(sheet.getMaxColumns(), col - sheet.getMaxColumns());
  if (String(sheet.getRange(1, col, 1, 1).getValue()).trim() === "구분") return;
  sheet.getRange(1, col, 1, 1).setValue("구분"); // 1~9열 헤더는 건드리지 않는다
}

// Sheets 수식 인젝션 차단 — =,+,-,@ 로 시작하면 앞에 ' 프리픽스.
function _sanitizeCell(s) {
  var str = (s === undefined || s === null) ? "" : String(s);
  if (str.length && "=+-@".indexOf(str.charAt(0)) !== -1) return "'" + str;
  return str;
}

// 관리자 전용 — 전체 회원(정회원+게스트, 활동+탈퇴)+시트 행번호. 생년월일 제외. team 필수.
function _getTennisRosterAdmin(team) {
  if (!team || !String(team).trim()) return { success: false, error: "team 필수" };
  _ensureTennisSheets();
  _ensureTennisRosterColumns();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TENNIS_ROSTER_SHEET);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, members: [] };
  var ncol = Math.min(TENNIS_ROSTER_HEADERS.length, sheet.getMaxColumns());
  var values = sheet.getRange(2, 1, lastRow - 1, ncol).getValues();
  var members = [];
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    if (String(v[0]).trim() !== String(team).trim()) continue;
    var name = String(v[1] || "").trim();
    if (!name) continue;
    var jd = v[7];
    var joinStr = (jd instanceof Date)
      ? Utilities.formatDate(jd, Session.getScriptTimeZone(), "yyyy-MM-dd")
      : (jd === "" || jd == null ? "" : String(jd));
    members.push({
      row: i + 2,                              // 실제 시트 행번호(2-base)
      name: name,
      nickname: String(v[2] || "").trim(),
      grade: String(v[4] || "").trim(),
      memberType: String(v[9] || "정회원").trim() || "정회원",
      status: String(v[5] || "활동").trim() || "활동",
      seasonStartRank: v[6] === "" || v[6] == null ? null : Number(v[6]),
      joinDate: joinStr,
      note: String(v[8] || "").trim()
      // 생년월일(v[3])은 반환하지 않는다(클라 미전송 원칙)
    });
  }
  return { success: true, members: members };
}

// 관리자 전용 upsert(+소프트삭제). row 있으면 수정(팀 소유 검증·생년월일 보존), 없으면 append.
function _writeTennisRosterMember(team, body) {
  if (!team || !String(team).trim()) return { success: false, error: "team 필수" };
  // 모든 자유입력은 trim 먼저→_sanitizeCell(선행공백+수식으로 우회 방지). enum은 화이트리스트.
  var name = _sanitizeCell(String((body && body.name) || "").trim());
  if (!name) return { success: false, error: "이름은 필수입니다" };

  _ensureTennisSheets();
  _ensureTennisRosterColumns();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TENNIS_ROSTER_SHEET);
  var ncol = TENNIS_ROSTER_HEADERS.length;

  var nickname = _sanitizeCell(String(body.nickname || "").trim());
  var grade = _sanitizeCell(String(body.grade || "").trim());
  var memberType = (String(body.memberType || "").trim() === "게스트") ? "게스트" : "정회원"; // 화이트리스트
  var status = (String(body.status || "").trim() === "탈퇴") ? "탈퇴" : "활동";               // 화이트리스트
  var rank = (body.seasonStartRank === "" || body.seasonStartRank === null || body.seasonStartRank === undefined)
    ? "" : Number(body.seasonStartRank);
  var joinDate = _sanitizeCell(String(body.joinDate || "").trim());
  var note = _sanitizeCell(String(body.note || "").trim());

  if (body.row !== undefined && body.row !== null && body.row !== "") {
    var row = Number(body.row);
    var lastRow = sheet.getLastRow();
    if (!Number.isFinite(row) || row < 2 || row > lastRow) return { success: false, error: "행 범위 초과" };
    var existing = sheet.getRange(row, 1, 1, ncol).getValues()[0];
    if (String(existing[0]).trim() !== String(team).trim()) return { success: false, error: "행 팀 불일치" };
    var birth = existing[3]; // 생년월일 보존
    // 열 순서는 TENNIS_ROSTER_HEADERS와 동일: 팀이름,이름,닉네임,생년월일,등급,상태,시즌시작순위,가입일,비고,구분
    sheet.getRange(row, 1, 1, ncol).setValues([[
      String(team).trim(), name, nickname, birth, grade, status, rank, (joinDate || existing[7] || ""), note, memberType
    ]]);
    return { success: true, row: row };
  }

  // append
  var newRow = sheet.getLastRow() + 1;
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  sheet.getRange(newRow, 1, 1, ncol).setValues([[
    String(team).trim(), name, nickname, "", grade, status, rank, (joinDate || today), note, memberType
  ]]);
  return { success: true, row: newRow };
}
