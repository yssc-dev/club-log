// 동적 진입선 — analyticsV2/dynamicMin의 축구 셰도우. 계산층은 종목별로 격리돼 있어
// (analyticsV2는 풋살 전용) 교차 import 대신 같은 식을 복사해 둔다.
//
// ★ 적용 범위 주의: 축구 지표의 기본 진입선은 여전히 고정값이다(calcMetricLeaders = 10경기).
//   이 함수를 쓰는 건 calcRecentHotStreak 하나뿐 — 30일 창에서는 고정 10경기 게이트를 걸면
//   통과자가 거의 남지 않아, 창 안의 최대 표본에 비례하는 컷이 유일하게 성립하기 때문이다.
//   다른 축구 지표로 넓히려면 별도 판단이 필요하다.
export function dynamicMin(max, ratio = 0.3) {
  return Math.ceil((max || 0) * ratio);
}
