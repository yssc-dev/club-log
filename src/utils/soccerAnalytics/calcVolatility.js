// 변동성 분석: 경기당 G+A의 표준편차로 컨디션 편차 측정.
// - 몰빵형(streaky): std 큰 선수 — 몰아치는 타입
// - 꾸준형(consistent): std 작은 선수 — 안정적인 타입 (단, 평균 G+A가 의미있는 선수만)
//
// 표본 신뢰도: minGames 미만은 양쪽 랭킹 모두 제외.
// 분산은 표본 공식(÷(n-1)) — 선수마다 세션 수가 달라 모집단 공식은 소표본 std를 과소추정.
// 꾸준형은 평균 G+A가 전체 중앙값 이상인 선수 중에서만 (0골 0어시인 사람이 1위 되는 거 방지).
// 중앙값은 짝수 n에서 두 중간값 평균 (경계 판정엔 영향 없음 — 후보가 항상 모집단 구성원이므로).
export function calcVolatility({ playerLogs, minGames = 5, topN = 3 }) {
  const perPlayer = {};
  for (const p of playerLogs || []) {
    const name = p.player;
    if (!name) continue;
    const ga = (Number(p.goals) || 0) + (Number(p.assists) || 0);
    if (!perPlayer[name]) perPlayer[name] = [];
    perPlayer[name].push(ga);
  }

  const stats = Object.entries(perPlayer)
    .filter(([, arr]) => arr.length >= minGames)
    .map(([player, arr]) => {
      const n = arr.length;
      const mean = arr.reduce((s, v) => s + v, 0) / n;
      const variance = n > 1 ? arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
      const std = Math.sqrt(variance);
      return { player, games: n, mean, std };
    });

  if (stats.length === 0) return { streaky: [], consistent: [] };

  // 꾸준형 후보 = 평균 G+A가 전체 중앙값 이상 (영양가 있는 꾸준함)
  const sortedMeans = [...stats].map(s => s.mean).sort((a, b) => a - b);
  const mid = Math.floor(sortedMeans.length / 2);
  const median = sortedMeans.length % 2 === 0
    ? (sortedMeans[mid - 1] + sortedMeans[mid]) / 2
    : sortedMeans[mid];

  const streaky = [...stats]
    .sort((a, b) => b.std - a.std || a.player.localeCompare(b.player, 'ko'))
    .slice(0, topN);

  const consistent = stats
    .filter(s => s.mean >= median)
    .sort((a, b) => a.std - b.std || a.player.localeCompare(b.player, 'ko'))
    .slice(0, topN);

  return { streaky, consistent };
}
