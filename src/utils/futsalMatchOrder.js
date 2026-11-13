// 풋살 completedMatches 를 "실제 경기 순서"로 정렬한다.
//
// RTDB는 completedMatches 를 matchId 키 객체(matches/{matchId})로 저장하고 키를 사전순으로 돌려준다.
// 그래서 10경기가 넘는 날은 "P10_C0" < "P1_C0" 이 되어 P10…P16, P1…P9 로 뒤틀렸다(2026-11-13 발견,
// 5월부터 마스터FC 21개 세션). 배열 순서는 보관소 표시·로그_매치 match_idx·밀어내기/자유대진의
// gksHistory[인덱스]·마지막 경기 확정취소가 모두 기대는 값이라 원래 순서로 되살려야 한다.
//
// 순서 키: 자유대진(F) → 대진표(R) → 밀어내기(P), 같은 모드 안에서는 번호 → 코트.
//   혼합 모드는 자유 라운드를 먼저 치르고 대진표로 넘어간다(App.jsx 표시 번호 offset 과 같은 전제).
// 형식을 모르는 matchId 는 맨 뒤에, 서로의 원래 순서를 유지한다(안정 정렬).
// React·firebase 의존 없음.

const MODE_RANK = { F: 0, R: 1, P: 2 };

function orderKey(matchId) {
  const m = String(matchId || '').match(/^([FRP])(\d+)_C(\d+)$/);
  if (!m) return null;
  return [MODE_RANK[m[1]], parseInt(m[2], 10), parseInt(m[3], 10)];
}

/** 원본을 바꾸지 않고 정렬된 새 배열을 돌려준다. */
export function sortFutsalMatchesByPlayOrder(matches) {
  return (matches || [])
    .map((match, i) => ({ match, i, key: orderKey(match?.matchId) }))
    .sort((a, b) => {
      if (!a.key || !b.key) {
        if (a.key) return -1;
        if (b.key) return 1;
        return a.i - b.i;
      }
      return a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2] || a.i - b.i;
    })
    .map(x => x.match);
}
