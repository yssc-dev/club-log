// PersonalAnalysisTab 레이더 6축 백분위 계산 (순수 함수).
//
// 이전 구현의 999 센티널 문제 해소:
//   표본 없는 축(fieldRounds=0 → defense, keeperRounds=0 → keeping)을 999로
//   모집단에 밀어넣으면 ① 다른 선수의 역백분위가 부풀고 ② 표본 없는 선수 본인이
//   해당 축에서 유의미해 보이는 점수(예: 키퍼 0경기인데 70점)를 받는다.
//   → 표본 없는 축은 모집단에서 제외하고, 그 선수의 축 점수는 null (UI '–' 표시,
//     유형 판정 평균에서도 제외).
//
// 축 순서는 PersonalAnalysisTab AXES와 동일:
//   [scoring, creativity, defense, keeping, attendance, winRate]
import { percentile } from './rankUtils';

export function buildRadarPopulations(playerSummary, ratedPlayers, totalSessions) {
  const pops = { scoring: [], creativity: [], defense: [], keeping: [], attendance: [], winRate: [] };
  for (const name of ratedPlayers) {
    const s = playerSummary[name];
    if (!s) continue;
    pops.scoring.push(s.rounds > 0 ? s.goals / s.rounds : 0);
    pops.creativity.push(s.rounds > 0 ? s.assists / s.rounds : 0);
    if (s.fieldRounds > 0) pops.defense.push(s.avgConceded);
    if (s.keeperRounds > 0) pops.keeping.push(s.conceded / s.keeperRounds);
    pops.attendance.push(totalSessions > 0 ? s.games / totalSessions : 0);
    pops.winRate.push(s.winRate);
  }
  return pops;
}

export function calcRadarValues(pops, s, totalSessions) {
  if (!s) return { values: [null, null, null, null, null, null], raw: {} };
  const raw = {
    scoring: s.rounds > 0 ? s.goals / s.rounds : 0,
    creativity: s.rounds > 0 ? s.assists / s.rounds : 0,
    defense: s.fieldRounds > 0 ? s.avgConceded : null,
    keeping: s.keeperRounds > 0 ? s.conceded / s.keeperRounds : null,
    attendance: totalSessions > 0 ? s.games / totalSessions : 0,
    winRate: s.winRate,
    chaosRate: s.rounds > 0 ? Math.abs(s.ownGoals || 0) / s.rounds : 0,
  };
  const values = [
    percentile(pops.scoring, raw.scoring),
    percentile(pops.creativity, raw.creativity),
    raw.defense == null ? null : percentile(pops.defense, raw.defense, true),
    raw.keeping == null ? null : percentile(pops.keeping, raw.keeping, true),
    percentile(pops.attendance, raw.attendance),
    percentile(pops.winRate, raw.winRate),
  ];
  return { values, raw };
}

// 레이더 백분위 기반 유형 배지. null 축(표본 없음)은 평균에서 제외.
export function getPlayerType(values) {
  const [scoring, creativity] = values;
  if (scoring != null && creativity != null) {
    if (scoring >= 70 && scoring > creativity * 1.5) return { label: "킬러", color: "#ef4444" };
    if (creativity >= 70 && creativity > scoring * 1.5) return { label: "메이커", color: "#3b82f6" };
  }
  const present = values.filter(v => v != null);
  if (present.length > 0) {
    const avg = present.reduce((a, b) => a + b, 0) / present.length;
    if (avg >= 60) return { label: "올라운더", color: "#22c55e" };
  }
  return { label: "", color: "" };
}
