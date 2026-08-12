// C5: 시너지매트릭스 본인 row 발췌. 모든 동료 + 케미/승률 메트릭.
// 반환:
//   partners: 함께 뛴 모든 동료 (games > 0). UI 가 직접 정렬·필터.
//   best/worst: 하위호환용 — winRate 기준 topN 정렬 슬라이스.
//
// 각 entry:
//   { partner, games, wins, draws, losses, winRate, liftSymmetric, isLowSample }
//   - winRate: 함께 뛴 매치 안에서의 승률 (= "이 사람과 뛰면 이길 확률")
//   - liftSymmetric: 두 사람 개인 평균 승률 대비 함께 뛸 때 추가 효과 (= "둘만의 호흡")
//   - isLowSample: games < matrix.minRounds (UI 가 회색 처리)

export function calcPersonalSynergy({ matrix, player, topN = 3 }) {
  if (!matrix || !matrix.cells || !player) return { partners: [], best: [], worst: [] };
  const minRounds = matrix.minRounds ?? 1;
  const partners = [];
  for (const other of matrix.players || []) {
    if (other === player) continue;
    const [a, b] = [player, other].sort((x, y) => x.localeCompare(y, 'ko'));
    const cell = matrix.cells[`${a}|${b}`];
    if (!cell || cell.games === 0) continue;
    partners.push({
      partner: other,
      games: cell.games,
      wins: cell.wins,
      draws: cell.draws,
      losses: cell.losses,
      winRate: cell.winRate,
      liftSymmetric: cell.liftSymmetric ?? 0,
      baselineUnavailable: cell.baselineUnavailable ?? false,
      isLowSample: cell.games < minRounds,
    });
  }
  // 하위호환: 표본 충분(>= minRounds)한 동료만 best/worst topN 슬라이스
  const eligible = partners.filter(p => !p.isLowSample);
  const best = [...eligible].sort((a, b) =>
    b.winRate - a.winRate ||
    b.games - a.games ||
    a.partner.localeCompare(b.partner, 'ko')
  ).slice(0, topN);
  const worst = [...eligible].sort((a, b) =>
    a.winRate - b.winRate ||
    b.games - a.games ||
    a.partner.localeCompare(b.partner, 'ko')
  ).slice(0, topN);
  return { partners, best, worst };
}
