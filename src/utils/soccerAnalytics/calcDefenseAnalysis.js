// 수비 분석 (축구 전용): our_defenders_json 기반 개인 실점억제율 + DF 페어 실점 케미.
// 집계 범위 = is_extra 아님 + 수비수 기록이 있는 경기만(레코더 도입 후 — 레거시엔 defenders 없음).
// delta = (본인/페어 부재 경기의 경기당 실점) − (출전 경기의 경기당 실점). 양수 = 억제.
// 베이스라인 표본 0이면 hasBaseline=false·delta=null — pairBaseline 규약과 동일, 소비자는 '–' 표시.
// 한계(의도): GK·상대 강도 미보정 — UI 캡션에 명시.
import { parseActualPlayers } from './parseMembers';

export function calcDefenseAnalysis({ matchLogs, individualThreshold = 8, pairThreshold = 5 }) {
  const scope = [];
  for (const m of matchLogs || []) {
    if (m.is_extra) continue;
    const dfs = [...new Set(parseActualPlayers(m.our_defenders_json))];
    if (dfs.length === 0) continue;
    dfs.sort((a, b) => a.localeCompare(b, 'ko'));
    scope.push({ dfs, conceded: Number(m.opponent_score) || 0 });
  }
  const totalMatches = scope.length;
  const totalConceded = scope.reduce((s, x) => s + x.conceded, 0);

  const indiv = {};
  const pair = {};
  const bump = (map, key, conceded) => {
    if (!map[key]) map[key] = { games: 0, conceded: 0, cleanSheets: 0 };
    const s = map[key];
    s.games++; s.conceded += conceded;
    if (conceded === 0) s.cleanSheets++;
  };
  for (const { dfs, conceded } of scope) {
    for (const d of dfs) bump(indiv, d, conceded);
    for (let i = 0; i < dfs.length; i++)
      for (let j = i + 1; j < dfs.length; j++) bump(pair, `${dfs[i]}|${dfs[j]}`, conceded);
  }

  const finish = (s) => {
    const baseGames = totalMatches - s.games;
    const hasBaseline = baseGames > 0;
    const concededPerGame = s.games > 0 ? s.conceded / s.games : 0;
    const baselineConcededPerGame = hasBaseline ? (totalConceded - s.conceded) / baseGames : null;
    return {
      ...s,
      concededPerGame,
      cleanRate: s.games > 0 ? s.cleanSheets / s.games : 0,
      baselineConcededPerGame,
      delta: hasBaseline ? baselineConcededPerGame - concededPerGame : null,
      hasBaseline,
    };
  };
  // null delta(베이스라인 없음)는 best/worst 어느 쪽에서도 맨 뒤 — 오염된 비교값을 순위에 올리지 않는다
  const cmp = (dir) => (a, b) => {
    const av = a.delta, bv = b.delta;
    if ((av == null) !== (bv == null)) return av == null ? 1 : -1;
    if (av != null && av !== bv) return dir === 'desc' ? bv - av : av - bv;
    return b.games - a.games
      || (a.name || a.a).localeCompare(b.name || b.a, 'ko')
      || (a.b || '').localeCompare(b.b || '', 'ko');
  };

  const individuals = Object.entries(indiv)
    .map(([name, s]) => ({ name, ...finish(s) }))
    .filter(x => x.games >= individualThreshold)
    .sort(cmp('desc'));

  const allPairs = Object.entries(pair)
    .map(([key, s]) => { const [a, b] = key.split('|'); return { a, b, ...finish(s) }; })
    .filter(x => x.games >= pairThreshold);

  return {
    scopeMatches: totalMatches,
    totalConceded,
    teamConcededPerGame: totalMatches > 0 ? totalConceded / totalMatches : 0,
    individuals,
    pairs: [...allPairs].sort(cmp('desc')),
    worstPairs: [...allPairs].sort(cmp('asc')),
  };
}
