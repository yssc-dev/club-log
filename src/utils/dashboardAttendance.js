// 대시보드 "출석률 TOP 10" 위젯의 데이터 가공 — TeamDashboard에서 분리한 순수 함수.
// 축구 출석은 경기 수가 아니라 경기일자(하루 2~3경기 = 1일) 기준으로 센다.

// 선수별집계 로그 행({date: 'YYYY-MM-DD', name, ...})을 날짜 기반 출석으로 집계.
// 로그가 없으면 null — 호출부는 null이면 목록을 만들지 않는다.
export function buildAttendanceData(plog) {
  if (!plog || plog.length === 0) return null;
  const allDates = new Set();
  const perPlayer = {};
  for (const p of plog) {
    if (!p.date || !p.name) continue;
    allDates.add(p.date);
    if (!perPlayer[p.name]) perPlayer[p.name] = new Set();
    perPlayer[p.name].add(p.date);
  }
  if (allDates.size === 0) return null;
  const playerDates = {};
  for (const [name, dates] of Object.entries(perPlayer)) playerDates[name] = dates.size;
  return { totalDates: allDates.size, playerDates };
}

// 위젯 분기. 축구는 날짜 기반(attendanceData 필수), 풋살은 대시보드 시트의 경기수 기반.
// 축구인데 attendanceData가 없으면 empty — 경기수를 "N일"로 표기하던 폴백은
// 경기수(하루 2~3경기 누적)를 출석일로 오독하게 만들어 제거했다.
export function buildAttendanceView(activeSport, attendanceData, members, maxGames) {
  if (activeSport === "축구") {
    if (!attendanceData) return { mode: "empty", totalDates: 0, list: [] };
    const list = Object.entries(attendanceData.playerDates)
      .map(([name, count]) => ({ name, att: count }))
      .sort((a, b) => b.att - a.att)
      .slice(0, 10);
    return { mode: "dates", totalDates: attendanceData.totalDates, list };
  }
  const list = [...members].filter(p => p.games > 0)
    .sort((a, b) => b.games - a.games)
    .slice(0, 10)
    .map(p => ({ name: p.name, att: p.games }));
  return { mode: "games", totalDates: maxGames, list };
}
