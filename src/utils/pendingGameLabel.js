import { countFinishedSoccerMatches } from './soccerScoring';
import { isCupSession } from './cup/cupSession';

// 대시보드 "진행중인 경기" 목록에서 각 경기의 진행도 요약 라벨을 만든다.
// 모드별로 완료 매치/경기를 세는 소스 필드가 다르므로 단일 지점에서 분기한다:
//   - 축구(soccer): soccerMatches 중 status === "finished" (휴식 경기 포함 — 인앱 헤더 finishedCount와 동일).
//                    축구 state엔 completedMatches가 없어(빈 배열) 이 필드로 세면 항상 0이 되는 버그가 있었다.
//   - 풋살 대진표(schedule): 라운드 진행도(현재/전체).
//   - 풋살 자유대진/밀어내기(free/push) 및 폴백: completedMatches 길이.
// 컵 세션(스펙 §6.1)은 🏆 접두를 붙여 정규 세션과 구분한다.
function baseLabel(g) {
  if (g.matchMode === "soccer") {
    return `${countFinishedSoccerMatches(g.soccerMatches)}경기 완료`;
  }
  const totalRounds = (g.schedule || []).length;
  if (g.matchMode === "schedule" && totalRounds > 0) {
    const curRound = (g.currentRoundIdx || 0) + 1;
    return `${curRound}/${totalRounds} 라운드`;
  }
  const completedCount = (g.completedMatches || []).length;
  return `${completedCount}매치 완료`;
}

export function pendingGameProgressLabel(gs) {
  const g = gs || {}; // undefined/null 모두 방어 (호출부 game.state가 비어있을 수 있음)
  const label = baseLabel(g);
  return isCupSession(g) ? `🏆 ${label}` : label;
}
