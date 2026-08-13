// Personal Records: 단일 세션 최고치 + GK 최장 무실점
// + keeperSummary(키퍼 누적: 클린시트율·경기당 실점) + rankScore(시즌 누적/평균)
//   — PG(로그_선수경기) 컬럼 재활용. keeperSummary는 개인탭 GK 능력 객관화용,
//     rankScore는 세션 팀순위 배점 누적(승/무/패보다 세밀한 '세션 캐리' 지표).
export function calcPersonalRecords({ playerName, playerLogs }) {
  const empty = {
    mostGoals: null, mostAssists: null, longestCleanSheet: null, bestRankScore: null,
    keeperSummary: null, rankScore: null,
  };
  if (!playerName || !playerLogs) return empty;

  const sessions = playerLogs
    .filter(p => p.player === playerName)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sessions.length === 0) return empty;

  const pickMax = (key) => {
    let best = null;
    for (const s of sessions) {
      const v = Number(s[key]) || 0;
      if (best === null || v > best.value) best = { value: v, date: s.date };
    }
    return best && best.value > 0 ? best : null;
  };

  let cur = 0, curStart = null;
  let best = null;
  for (const s of sessions) {
    if ((s.keeper_games || 0) === 0) continue;
    if ((s.conceded || 0) === 0) {
      if (cur === 0) curStart = s.date;
      cur++;
      if (!best || cur > best.value) best = { value: cur, startDate: curStart, endDate: s.date };
    } else {
      cur = 0; curStart = null;
    }
  }

  // 키퍼 누적 요약 (keeper_games>0 세션만)
  let keeperSessions = 0, keeperGames = 0, keeperConceded = 0, cleanSheets = 0;
  for (const s of sessions) {
    const kg = Number(s.keeper_games) || 0;
    if (kg === 0) continue;
    keeperSessions++;
    keeperGames += kg;
    keeperConceded += Number(s.conceded) || 0;
    cleanSheets += Number(s.cleansheets) || 0;
  }
  const keeperSummary = keeperSessions > 0 ? {
    keeperSessions,
    keeperGames,
    conceded: keeperConceded,
    cleanSheets,
    cleanSheetRate: cleanSheets / keeperSessions,
    concededPerGame: keeperGames > 0 ? keeperConceded / keeperGames : 0,
  } : null;

  // rank_score 시즌 누적/평균
  let rsTotal = 0;
  for (const s of sessions) rsTotal += Number(s.rank_score) || 0;
  const rankScore = sessions.length > 0
    ? { total: rsTotal, avg: rsTotal / sessions.length, sessions: sessions.length }
    : null;

  return {
    mostGoals: pickMax('goals'),
    mostAssists: pickMax('assists'),
    longestCleanSheet: best,
    bestRankScore: pickMax('rank_score'),
    keeperSummary,
    rankScore,
  };
}
