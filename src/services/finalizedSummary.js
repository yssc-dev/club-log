// finalized/_meta 의 목록용 요약 문자열. firebaseSync._buildSummary 를 순수 함수로 분리(테스트 가능).
// HistoryView 가 '|' 로 split 해 parts[1]/[3]/[4] 를 읽으므로 파트 순서·개수를 바꾸지 않는다 —
// 컵은 6번째 파트를 "덧붙이기만" 한다(스펙 §6.5·§8).
import { countFinishedSoccerMatches } from '../utils/soccerScoring';
import { isCupSession } from '../utils/cup/cupSession';

export function buildFinalizedSummary(gameId, state) {
  const creator = state.gameCreator || state.lastEditor || '?';
  // 테니스: 이벤트/완료경기가 풋살 필드라 0이 되므로 라운드·완료 코트로 요약.
  if (state.sport === '테니스') {
    const rounds = state.rounds || [];
    const done = rounds.reduce((s, r) => s + (r.courts || []).filter(c => c.status === 'done').length, 0);
    return `${gameId} | ${creator} | ${state.phase || '?'} | ${rounds.length}라운드 | 완료 ${done}경기`;
  }
  const soccer = Array.isArray(state.soccerMatches) && state.soccerMatches.length > 0;
  const evtCount = soccer
    ? state.soccerMatches.reduce((s, m) => s + ((m.events || []).length), 0)
    : (state.allEvents || []).length;
  const matchCount = soccer
    ? countFinishedSoccerMatches(state.soccerMatches)
    : (state.completedMatches || []).length;
  const base = `${gameId} | ${creator} | ${state.phase || '?'} | 이벤트 ${evtCount}건 | 완료 ${matchCount}경기`;
  if (!isCupSession(state)) return base;
  // 설정 화면이 cupName 의 '|' 를 막지만(2단계), 여기서도 한 번 더 지킨다.
  return `${base} | 🏆 ${String(state.tournamentId).replace(/\|/g, '｜')}`;
}
