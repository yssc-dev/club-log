// 풋살 분석 계산층 barrel — 탭의 종목 셰도잉(`isSoccer ? soccerCalc : futsalCalc`)이
// `import * as futsalCalc`로 소비한다. 순수 재수출만: 여기에 로직을 넣지 말 것.
// soccerAnalytics/index.js와 공개 이름이 1:1 대응해야 셰도잉 선택이 성립한다.
export * from './calcAssistLinkMatrix';
export * from './calcAssistPairs';
export * from './calcAwards';
export * from './calcDailyMvp';
export * from './calcGkChemistry';
export * from './calcFieldDefense'; // 풋살 전용 — 셰도잉 목록 밖(futsalCalc.calcFieldDefense로 직접 호출)
export * from './calcGkFieldSplit'; // 풋살 전용 — 셰도잉 목록 밖(futsalCalc.calcGkFieldSplit로 직접 호출)
export * from './calcGoldenTrio';
export * from './calcMetricLeaders';
export * from './calcMonthlyRanking';
export * from './calcPersonalRecords';
export * from './calcPersonalSynergy';
export * from './calcPlayerSummary';
export * from './calcRadarData';
export * from './calcRecentForm'; // 풋살 전용 — 셰도잉 목록 밖(futsalCalc.calcRecentForm로 직접 호출)
export * from './calcRecentHotStreak'; // 대시보드 최상단 카드 — 양쪽에 같은 이름으로 존재(셰도잉 대응)
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
