// 동적 진입선 — analyticsV2/dynamicMin의 축구 셰도우. 계산층은 종목별로 격리돼 있어
// (analyticsV2는 풋살 전용) 교차 import 대신 같은 식을 복사해 둔다.
//
// ★ 적용 범위: 축구 지표의 **기본** 진입선은 여전히 고정값이다(calcMetricLeaders = 10경기 등).
//   동적으로 바뀌는 건 호출부가 인자에 **null을 명시**했을 때뿐이다.
//   - calcRecentHotStreak: 30일 창이 전제라 항상 동적
//   - calcMetricLeaders / calcRoundSlope / calcSoloGoalRatio / calcVolatility:
//     어워드 탭이 '최근 한 달' 모드에서만 null을 넘긴다 (2026-09-04, 유저 요청 "기준경기도 완화").
//     누적 모드는 고정값 그대로라 기존 화면은 무변경.
//   주의: 동적이 항상 '완화'는 아니다 — 하버FC 실측에서 누적 표본(최대 68경기)에는
//   30%가 21경기라 고정 10보다 오히려 엄격했다(통과 32명 → 23명). 창이 좁을 때만 완화된다.
export function dynamicMin(max, ratio = 0.3) {
  return Math.ceil((max || 0) * ratio);
}
