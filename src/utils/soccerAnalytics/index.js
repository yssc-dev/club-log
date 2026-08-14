// 축구 전용 분석 계산층 barrel. 탭에서 `import * as soccerCalc from '.../soccerAnalytics'`로 소비.
// 탭이 `isSoccer ? soccerCalc : futsalCalc`로 '분해하는' 이름만 analyticsV2와 1:1 대응하면 된다
// (그 이름이 한쪽에만 있으면 undefined가 되어 런타임에 터진다).
// 축구 전용 함수는 컴포넌트가 직접 import하므로 대응 대상이 아니다 —
// calcDefenseAnalysis / calcOpponentBreakdown / calcOpponentLeaders가 그 경우.
export * from './calcAssistLinkMatrix';
export * from './calcAssistPairs';
export * from './calcAwards';
export * from './calcDailyMvp';
export * from './calcDefenseAnalysis';
export * from './calcGkChemistry';
export * from './calcGoldenTrio';
export * from './calcMetricLeaders';
export * from './calcMonthlyRanking';
export * from './appEraScope';
export * from './calcOpponentBreakdown';
export * from './calcOpponentLeaders';
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
