// 축구 전용 분석 계산층 barrel. 탭에서 `import * as soccerCalc from '.../soccerAnalytics'`로 소비.
// analyticsV2와 공개 함수 이름이 1:1 대응해야 탭의 isSoccer 셰도잉 선택이 성립한다.
export * from './calcAssistLinkMatrix';
export * from './calcAssistPairs';
export * from './calcAwards';
export * from './calcDailyMvp';
export * from './calcGkChemistry';
export * from './calcGoldenTrio';
export * from './calcMetricLeaders';
export * from './calcMonthlyRanking';
export * from './calcOpponentBreakdown';
export * from './calcPersonalRecords';
export * from './calcPersonalSynergy';
export * from './calcPlayerSummary';
export * from './calcRadarData';
export * from './calcRivalry';
export * from './calcRoundSlope';
export * from './calcSoloGoalRatio';
export * from './calcStreaks';
export * from './calcSynergyMatrix';
export * from './calcTrends';
export * from './calcVolatility';
export * from './pairBaseline';
export * from './parseMembers';
export * from './rankUtils';
