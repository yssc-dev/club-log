// 빅마스터FC(당장은): 로그_이벤트·로그_선수경기·로그_매치 + 빅마스터FC 참석명단만 쓴다(스펙 §15).
// 대시보드·포인트 로그·선수별집계 시트는 읽지도 쓰지도 않는다 — 설정이 비면 기본 탭 이름
// ('대시보드'/'포인트로그'/'선수별집계기록로그')으로 떨어져, 쓰기는 탭을 새로 만들고 읽기는
// 같은 이름의 다른 팀 탭을 볼 수 있기 때문이다. 스위치는 자체전축구 프리셋의 logSheetsOnly —
// 나중에 대시보드를 붙일 때 그 값만 끈다.
import { getEffectiveSettings, getPresetValue, resolvePreset } from '../../config/settings';

// 판정 규칙은 isIntraSquadTeam 과 같다: 저장된 설정에 있으면 그것, 없으면 팀 기본 프리셋으로 폴백
// (설정 로드 전·첫 접속에서도 다른 시트를 한 번도 읽지 않게).
export function isLogSheetsOnly(team, mode) {
  if (mode !== '축구' || !team) return false;
  if (getEffectiveSettings(team, '축구').logSheetsOnly === true) return true;
  return getPresetValue('축구', resolvePreset(team, '축구'), 'logSheetsOnly') === true;
}

// 마감 후 재적재 대상 = 로그 3종의 캐시 데이터셋(sheetCache.js soccerLikeAdapters 의 키).
export const LOG_SHEET_DATASETS = ['matchLog', 'eventLog', 'playerGameLog'];

// 마감 전송. 결과 배열의 순서·모양(포인트 로그, 선수별집계, 로그_이벤트, 로그_선수경기, 로그_매치)을
// 유지해 호출부의 성공 판정(legacyOk·rawFailed) 코드를 그대로 쓴다.
// logOnly 면 앞의 둘은 보내지 않고 성공(count 0)으로 채운다.
export function sendFinalizeWrites(AppSync, rows, settings, { logOnly }) {
  const notSent = () => Promise.resolve({ success: true, count: 0 });
  return Promise.allSettled([
    logOnly ? notSent() : AppSync.writeSoccerPointLog({ events: rows.pointLogRows }, settings.pointLogSheet),
    logOnly ? notSent() : AppSync.writeSoccerPlayerLog({ players: rows.playerLogRows }, settings.playerLogSheet),
    AppSync.writeRawEvents({ rows: rows.rawEvents }),
    AppSync.writeRawPlayerGames({ rows: rows.rawPlayerGames }),
    AppSync.writeMatchLog(rows.matchRows),
  ]);
}
