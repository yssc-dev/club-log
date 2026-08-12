// 공동 순위 랭킹 공용 유틸 (CrovaGogumaRankTab의 buildTop 로직을 공용화).
// rows: [{ player|name, value, ... }] — value 내림차순, 동률은 이름 가나다순.
// 동점자는 같은 rank, 다음 순위는 인원수만큼 건너뜀 (1,1,3).
// limit는 "rank <= limit" 기준 — 공동 순위가 경계에 걸리면 전원 포함.
export function buildRankedTop(rows, { limit = 5 } = {}) {
  const nameOf = (r) => r.player ?? r.name ?? '';
  const arr = [...rows].sort((a, b) =>
    b.value - a.value || nameOf(a).localeCompare(nameOf(b), 'ko'));
  let rank = 0, prevValue = null;
  const ranked = arr.map((row, i) => {
    if (row.value !== prevValue) { rank = i + 1; prevValue = row.value; }
    return { ...row, rank };
  });
  return ranked.filter(r => r.rank <= limit);
}

// gameStateAnalyzer(orphan)에서 인라인 — soccerAnalytics는 orphan 모듈에 의존하지 않는다
export function percentile(values, value, lowerIsBetter = false) {
  if (values.length === 0) return 50;
  const sorted = [...values].sort((a, b) => a - b);
  let rank = sorted.findIndex(v => v >= value);
  if (rank === -1) rank = sorted.length;
  const pct = (rank / sorted.length) * 100;
  return lowerIsBetter ? 100 - pct : pct;
}
