// 연속 기록: 득점 세션 / GK 무실점 세션
// sessionDates(클럽 전체 세션 날짜 목록, calcPlayerSummary.sessionDates) 제공 시:
//   결석 세션(그 날짜에 본인 PG 행 없음)이 두 스트릭 모두를 끊는다 — "클럽 세션 연속" 의미.
//   참석했지만 필드로만 뛴 세션은 GK 스트릭을 끊지 않음(기존 의미 유지).
// 미제공 시 기존 동작(본인 PG 행 순서 기준) — 결석이 스트릭을 잇는 과대 표시 있음.
export function calcStreaks({ playerName, playerLogs, sessionDates = null }) {
  const empty = { current: 0, best: 0 };
  if (!playerName || !playerLogs) return { scoringStreak: empty, cleanSheetStreak: empty };

  const rows = playerLogs
    .filter(p => p.player === playerName)
    .sort((a, b) => a.date.localeCompare(b.date));

  // 순회 단위: sessionDates가 있으면 클럽 세션 전체(결석=null 슬롯), 없으면 본인 행만
  let sessions;
  if (Array.isArray(sessionDates) && sessionDates.length > 0) {
    const byDate = {};
    for (const r of rows) byDate[r.date] = r;
    sessions = [...sessionDates]
      .filter(d => d)
      .sort((a, b) => a.localeCompare(b))
      .map(d => byDate[d] || null); // null = 결석
  } else {
    sessions = rows;
  }

  let curScore = 0, bestScore = 0;
  for (const s of sessions) {
    if (s === null) { curScore = 0; continue; } // 결석 → 절단
    if ((s.goals || 0) >= 1) { curScore++; if (curScore > bestScore) bestScore = curScore; }
    else curScore = 0;
  }

  let curCs = 0, bestCs = 0;
  for (const s of sessions) {
    if (s === null) { curCs = 0; continue; } // 결석 → 절단
    if ((s.keeper_games || 0) === 0) continue; // 참석했지만 필드만 → 유지
    if ((s.conceded || 0) === 0) { curCs++; if (curCs > bestCs) bestCs = curCs; }
    else curCs = 0;
  }

  return {
    scoringStreak: { current: curScore, best: bestScore },
    cleanSheetStreak: { current: curCs, best: bestCs },
  };
}
