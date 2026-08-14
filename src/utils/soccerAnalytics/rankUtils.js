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

// 이름 → 순위 맵. buildRankedTop과 같은 공동 순위 규약(1,1,3)이지만 잘라내지 않고,
// 낮을수록 좋은 축(실점률 등)도 받는다. 개인 화면에서 "내가 몇 위인지" 조회용.
export function rankMap(rows, valueOf, { lowerIsBetter = false } = {}) {
  const nameOf = (r) => r.player ?? r.name ?? '';
  const arr = [...(rows || [])].sort((a, b) => {
    const d = lowerIsBetter ? valueOf(a) - valueOf(b) : valueOf(b) - valueOf(a);
    return d || nameOf(a).localeCompare(nameOf(b), 'ko');
  });
  const map = new Map();
  let rank = 0, prev = null;
  arr.forEach((row, i) => {
    const v = valueOf(row);
    if (v !== prev) { rank = i + 1; prev = v; }
    map.set(nameOf(row), rank);
  });
  return map;
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
