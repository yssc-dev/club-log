// 상대팀별 개인 수비 기록 (축구 전용): 선수 × 상대팀의 경기당 실점 + 그 상대팀 수비수 중 순위.
//
// our_defenders_json이 있는 경기만 집계된다 — 앱 전환 이전 구간엔 이 필드가 없어
// 자동으로 앱 기록 구간만 잡힌다(상대팀별로 한울 18 · 터틀파크 17 · 아이콘 16경기 수준).
// 소수 상대(시청·길벗 등)는 1~3경기뿐이라 화면은 '수비 기록 없음'을 자주 띄우게 된다.
//
// 한계(의도): 실점은 팀 전체 결과라 개인 공로로 분리되지 않는다. GK·상대 전력 미보정.
import { rankMap } from './rankUtils';

export function calcOpponentDefense({ matchLogs } = {}) {
  const cells = {}; // name → opponent → { games, conceded }
  const byOpponent = {}; // opponent → [{ name, ... }]

  for (const m of matchLogs || []) {
    if (m.is_extra) continue;
    const opp = String(m.opponent_team_name || '').trim();
    if (!opp) continue;
    let defenders = [];
    try { defenders = JSON.parse(m.our_defenders_json || '[]'); } catch { defenders = []; }
    if (!Array.isArray(defenders) || defenders.length === 0) continue;
    const conceded = Number(m.opponent_score) || 0;
    for (const name of [...new Set(defenders)]) {
      if (!name) continue;
      if (!cells[name]) cells[name] = {};
      if (!cells[name][opp]) cells[name][opp] = { games: 0, conceded: 0 };
      cells[name][opp].games++;
      cells[name][opp].conceded += conceded;
    }
  }

  for (const name of Object.keys(cells)) {
    for (const [opp, s] of Object.entries(cells[name])) {
      if (!byOpponent[opp]) byOpponent[opp] = [];
      byOpponent[opp].push({ name, ...s, concededPerGame: s.conceded / s.games });
    }
  }

  // 실점 적을수록 1위. 동점은 공동 순위(다음 순위는 건너뜀).
  const rankByOpp = {};
  const rankedByOpp = {};
  for (const [opp, rows] of Object.entries(byOpponent)) {
    rankByOpp[opp] = rankMap(rows, r => r.concededPerGame, { lowerIsBetter: true });
    // 차트가 '내 위아래 순위'를 그리려면 순위 정렬된 전체 목록이 필요하다
    rankedByOpp[opp] = rows
      .map(r => ({ ...r, rank: rankByOpp[opp].get(r.name) }))
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'ko'));
  }

  const byPlayer = {};
  for (const name of Object.keys(cells)) {
    byPlayer[name] = Object.keys(cells[name])
      .map(opp => {
        const pool = byOpponent[opp].length;
        const rank = rankByOpp[opp].get(name);
        const s = cells[name][opp];
        return { opponent: opp, ...s, concededPerGame: s.conceded / s.games, rank, pool };
      })
      .sort((a, b) => b.games - a.games || a.opponent.localeCompare(b.opponent, 'ko'));
  }
  return { byPlayer, byOpponent: rankedByOpp };
}
