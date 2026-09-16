// 마감 시 전송할 시트 목록 — 스펙 §6.5 불변식 1.
// 키는 App.jsx handleFinalize 의 AppSync 호출과 1:1 대응한다:
//   pointLog=마스터FC 포인트 로그, playerLog=마스터FC 선수별집계기록 로그,
//   rawEvents=로그_이벤트, rawPlayerGames=로그_선수경기, matchLog=로그_매치.
// 정규 순서는 handleFinalize 의 Promise.allSettled 순서와 같아야 한다(r1..r5 인덱스 판정).
export const REGULAR_FINALIZE_WRITES = ['pointLog', 'playerLog', 'rawEvents', 'rawPlayerGames', 'matchLog'];
// 컵은 포인트 계열 두 시트를 절대 쓰지 않는다(완전 분리 — 스펙 §1.1).
export const CUP_FINALIZE_WRITES = ['rawEvents', 'rawPlayerGames', 'matchLog'];

export function selectFinalizeWrites(isCup) {
  return isCup ? [...CUP_FINALIZE_WRITES] : [...REGULAR_FINALIZE_WRITES];
}
