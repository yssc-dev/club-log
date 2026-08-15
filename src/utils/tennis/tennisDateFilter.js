// 로우가 있는 연도(rows) ∪ 레거시 연도(legacyRows.season)를 내림차순으로.
export function availableYears({ rows, legacyRows }) {
  const ys = new Set();
  for (const r of rows || []) { const y = String(r.date || '').slice(0, 4); if (y) ys.add(y); }
  for (const r of legacyRows || []) { if (r.season) ys.add(String(r.season)); }
  return [...ys].sort().reverse();  // ['2026','2025','2024']
}

// 특정 연도에 로우가 있는 월(YYYY-MM의 MM)들, 오름차순. 로우 없으면 [].
export function availableMonths({ rows, year }) {
  const ms = new Set();
  for (const r of rows || []) {
    const d = String(r.date || '');
    if (d.slice(0, 4) === String(year)) ms.add(d.slice(5, 7));
  }
  return [...ms].filter(Boolean).sort();  // ['01','02',...]
}

// 로우 연도인가(그 연도에 로우가 하나라도 있으면 true=상세 모드, 아니면 레거시 집계 모드).
export function isRowYear({ rows, year }) {
  return (rows || []).some(r => String(r.date || '').slice(0, 4) === String(year));
}

// rows를 기간으로 필터. month는 'MM' 또는 '' (전체월). year는 'YYYY'.
export function filterRowsByPeriod(rows, { year, month }) {
  return (rows || []).filter(r => {
    const d = String(r.date || '');
    if (d.slice(0, 4) !== String(year)) return false;
    if (month && d.slice(5, 7) !== String(month)) return false;
    return true;
  });
}

// 특정 연도의 단식 집계(상세 로우 없는 legacy) → buildSinglesStandings의 legacySingles 형태.
// 로우가 있는 연도(2026)에도 1~7월 집계 같은 부분전적을 W/L로 합산하는 데 쓴다.
export function legacySinglesForYear(legacyRows, year) {
  return (legacyRows || [])
    .filter(r => r && String(r.season) === String(year) && r.format === '단식')
    .map(r => ({ player: r.player, wins: Number(r.wins) || 0, losses: Number(r.losses) || 0 }));
}

// 단식 집계 합산 — 선수별 W/L 합. years(문자열 연도 Set)를 주면 그 연도만,
// 없으면 전 시즌. season은 시트에서 숫자로 올 수 있어 String()으로 강제 비교(대시보드 스코프 버그 방지).
export function aggregateLegacySingles(legacyRows, years) {
  const acc = new Map();
  for (const r of legacyRows || []) {
    if (!r || r.format !== '단식') continue;
    if (years && !years.has(String(r.season))) continue;
    const cur = acc.get(r.player) || { player: r.player, wins: 0, losses: 0 };
    cur.wins += Number(r.wins) || 0;
    cur.losses += Number(r.losses) || 0;
    acc.set(r.player, cur);
  }
  return [...acc.values()];
}

// 레거시 연도 클럽 순위(집계). legacy 필드: player·season·format·wins·losses(확인됨).
export function buildLegacyStandings({ legacyRows, year, format }) {
  const acc = new Map();
  for (const r of legacyRows || []) {
    if (String(r.season) !== String(year)) continue;
    if (format !== undefined && r.format !== format) continue;
    const cur = acc.get(r.player) || { name: r.player, wins: 0, losses: 0 };
    cur.wins += Number(r.wins) || 0;
    cur.losses += Number(r.losses) || 0;
    acc.set(r.player, cur);
  }
  return [...acc.values()]
    .map(p => ({ ...p, games: p.wins + p.losses, rate: (p.wins + p.losses) ? p.wins / (p.wins + p.losses) : 0 }))
    .filter(p => p.games > 0)
    .sort((a, b) => b.rate - a.rate || b.games - a.games || a.name.localeCompare(b.name, 'ko'));
}
