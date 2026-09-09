// 축구 골 입력의 순수 로직. FormationRecorder(라이브 기록)와 SoccerMatchView(확정 경기)가
// 공유해 두 화면의 표기가 갈라지지 않게 한다.

// 골 입력 중 선수를 탭했을 때 기록할 이벤트. null 이면 탭을 무시한다.
//
// ★ 본인 어시(득점자 == 어시)는 기록하지 않는다. 풋살은 CourtRecorder.applyAssistRole 의
//   `if (myCompose.scorer === player) return;` 로 막고 있었는데 축구에만 이 가드가 없어
//   같은 선수를 두 번 탭하면 "주건호(골)/주건호(어시)" 가 기록됐다.
//   탭을 무시하면 안내 문구가 남아 다른 선수를 탭하거나 "노어시" 를 누르면 된다.
export function goalEventFromTap(goalFlow, name) {
  if (!goalFlow) return null;
  if (goalFlow.type === 'selectAssist') {
    if (name === goalFlow.scorer) return null;
    return { type: 'goal', player: goalFlow.scorer, assist: name };
  }
  if (goalFlow.type === 'selectScorer') {
    if (name === goalFlow.assister) return null;
    return { type: 'goal', player: name, assist: goalFlow.assister };
  }
  return null;
}

// 이벤트 목록의 골 표기. 어시가 없으면 득점자만 적는다.
export function goalLabel(player, assist) {
  return assist ? `${player}(골)/${assist}(어시)` : `${player}(골)`;
}
