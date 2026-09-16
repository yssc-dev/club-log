// src/utils/cup/cupSession.js
// 컵 세션 판별과 로그 태그의 단일 소스 — 스펙 §3.
// 컵 여부는 오직 state.tournamentId 로 판별한다(Root 의 gameMode 는 신규 진입 시점에만 존재하고
// 저장되지 않으므로 재접속·이어서 기록 후에는 이 필드만 남는다 — 스펙 §4.1).
export function isCupSession(state) {
  const id = state?.tournamentId;
  return typeof id === 'string' && id !== '';
}

// 로그_이벤트·로그_선수경기·로그_매치 행의 mode/tournament_id 값 — 스펙 §4.4.
// 마감(App.jsx)과 설정 화면의 로그_매치 재기록 도구가 반드시 이 함수를 쓴다(스펙 §5 우회 경로 차단).
export function logTagsOf(state) {
  return isCupSession(state)
    ? { mode: '대회', tournamentId: state.tournamentId }
    : { mode: '기본', tournamentId: '' };
}
