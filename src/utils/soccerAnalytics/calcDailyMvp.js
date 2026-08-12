// 일일 MVP: 그날 최종포인트 1위. (2026-07-04 사용자 확정)
// 최종포인트 = goals + assists + cleansheets + crova + goguma + 역주행(감점)
//   - 랭크점수(팀순위 배점)는 미포함 — 개인 포인트 축만 합산
//   - goguma는 시트에 음수 저장 → 합산이 곧 차감
//   - 역주행(owngoals) 정규화: 클럽 규칙은 자책 1개 = −2점(선수별집계기록 로그 확인).
//     로그_선수경기에는 개수(양수)와 포인트값(음수)이 혼재 → 양수면 ×(−2), 음수면 그대로.
//   - 완전 동점만 공동 MVP.
// 레거시 방어: 그날 전원 rank_score/crova/goguma가 0이면(포인트 제도 미기록 세션)
// 골 기록이 있어도 그 날짜는 스킵 — 제도 밖 세션에 소급 MVP를 주지 않는다.

// 자책 감점 포인트 (혼재 부호 정규화)
export function owngoalPoints(raw) {
  const og = Number(raw) || 0;
  return og < 0 ? og : -2 * og;
}

export function calcDailyMvp({ playerGameLogs, topN = 5, recentN = 5 }) {
  const byDate = {};
  for (const p of playerGameLogs || []) {
    if (!p.player || !p.date) continue;
    if (!byDate[p.date]) byDate[p.date] = [];
    byDate[p.date].push({
      player: p.player,
      points:
        (Number(p.goals) || 0) + (Number(p.assists) || 0) + (Number(p.cleansheets) || 0) +
        (Number(p.crova) || 0) + (Number(p.goguma) || 0) + owngoalPoints(p.owngoals),
      hasPointData:
        (Number(p.rank_score) || 0) !== 0 || (Number(p.crova) || 0) !== 0 || (Number(p.goguma) || 0) !== 0,
    });
  }

  const counts = {};
  const recent = [];
  let eligibleDates = 0;
  const dates = Object.keys(byDate).sort((a, b) => a.localeCompare(b));
  for (const date of dates) {
    const rows = byDate[date];
    if (!rows.some(r => r.hasPointData)) continue; // 포인트 제도 미기록 세션
    eligibleDates++;
    const maxPoints = Math.max(...rows.map(r => r.points));
    const mvps = rows.filter(r => r.points === maxPoints).map(r => r.player)
      .sort((a, b) => a.localeCompare(b, 'ko'));
    for (const name of mvps) counts[name] = (counts[name] || 0) + 1;
    recent.push({ date, mvps, points: maxPoints });
  }
  recent.reverse(); // 최신순

  const ranking = Object.entries(counts)
    .map(([player, value]) => ({ player, value }))
    .sort((a, b) => b.value - a.value || a.player.localeCompare(b.player, 'ko'))
    .slice(0, topN);

  return { ranking, recent: recent.slice(0, recentN), eligibleDates };
}
