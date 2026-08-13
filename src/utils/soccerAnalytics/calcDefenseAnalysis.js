// 수비 분석 (축구 전용): our_defenders_json 기반 개인 실점억제율 + DF 페어 실점 케미.
// 집계 범위 = is_extra 아님 + 수비수 기록이 있는 경기만(레코더 도입 후 — 레거시엔 defenders 없음).
// delta = (본인/페어 부재 경기의 경기당 실점) − (출전 경기의 경기당 실점). 양수 = 억제.
// 베이스라인 표본 0이면 hasBaseline=false·delta=null — pairBaseline 규약과 동일, 소비자는 '–' 표시.
// 한계(의도): GK·상대 강도 미보정 — UI 캡션에 명시.
import { parseActualPlayers } from './parseMembers';

// 정렬 축: 'conceded' = 실점률 Δ, 'clean' = 클린시트율 Δ. 두 Δ는 부호 방향이 같다(+면 억제).
const METRIC_FIELD = { conceded: 'delta', clean: 'cleanDelta' };

// 개인/페어 행 공용 정렬. calcDefenseAnalysis는 실점률 기준 정렬본을 반환하지만,
// 지표 토글·대시보드는 같은 계산 결과를 다른 축으로 다시 세워야 해서 정렬만 분리했다
// (metric을 calcDefenseAnalysis 인자로 받으면 축마다 전체 집계를 다시 돌아야 한다).
// 순수 함수 — 입력 배열 불변.
export function sortDefenseRows(rows, { metric = 'conceded', dir = 'desc' } = {}) {
  const field = METRIC_FIELD[metric] || METRIC_FIELD.conceded;
  // null Δ(베이스라인 없음)는 dir과 무관하게 맨 뒤 — 오염된 비교값을 순위에 올리지 않는다
  return [...(rows || [])].sort((a, b) => {
    const av = a[field], bv = b[field];
    if ((av == null) !== (bv == null)) return av == null ? 1 : -1;
    if (av != null && av !== bv) return dir === 'desc' ? bv - av : av - bv;
    return b.games - a.games
      || (a.name || a.a).localeCompare(b.name || b.a, 'ko')
      || (a.b || '').localeCompare(b.b || '', 'ko');
  });
}

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
  const totalCleanSheets = scope.reduce((s, x) => s + (x.conceded === 0 ? 1 : 0), 0);

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
    const cleanRate = s.games > 0 ? s.cleanSheets / s.games : 0;
    const baselineConcededPerGame = hasBaseline ? (totalConceded - s.conceded) / baseGames : null;
    // 클린시트 Δ는 실점률 Δ와 부호 방향을 맞춘다(+면 억제). 실점률은 '낮을수록 좋음'이라
    // 베이스라인−출전, 클린시트율은 '높을수록 좋음'이라 출전−베이스라인.
    const baselineCleanRate = hasBaseline ? (totalCleanSheets - s.cleanSheets) / baseGames : null;
    return {
      ...s,
      concededPerGame,
      cleanRate,
      baselineConcededPerGame,
      delta: hasBaseline ? baselineConcededPerGame - concededPerGame : null,
      baselineCleanRate,
      cleanDelta: hasBaseline ? cleanRate - baselineCleanRate : null,
      hasBaseline,
    };
  };
  const individuals = sortDefenseRows(
    Object.entries(indiv)
      .map(([name, s]) => ({ name, ...finish(s) }))
      .filter(x => x.games >= individualThreshold),
  );

  const allPairs = Object.entries(pair)
    .map(([key, s]) => { const [a, b] = key.split('|'); return { a, b, ...finish(s) }; })
    .filter(x => x.games >= pairThreshold);

  return {
    scopeMatches: totalMatches,
    totalConceded,
    totalCleanSheets,
    teamConcededPerGame: totalMatches > 0 ? totalConceded / totalMatches : 0,
    teamCleanRate: totalMatches > 0 ? totalCleanSheets / totalMatches : 0,
    individuals,
    pairs: sortDefenseRows(allPairs, { dir: 'desc' }),
    worstPairs: sortDefenseRows(allPairs, { dir: 'asc' }),
  };
}
