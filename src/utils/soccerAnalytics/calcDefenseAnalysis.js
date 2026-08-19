// 수비 분석 (축구 전용): our_defenders_json 기반 개인 실점억제율 + DF 페어 실점 케미.
// 집계 범위 = is_extra 아님 + 수비수 기록이 있는 경기만(레코더 도입 후 — 레거시엔 defenders 없음).
//
// delta = '같은 상대에서의' 부재 대비 억제. 상대 버킷별로
//   부재 기준선 = (그 상대 팀실점 − 본인 출전분) / (그 상대 팀경기 − 본인 출전경기)
// 를 잡고, 본인 출전 경기수로 가중합한 기대 실점과 실제를 비교한다. 양수 = 억제.
// 상대를 무시하면 어려운 상대만 맡은 수비수가 과대 처벌된다
// (실측: 팀 기준선이 한울 0.56 vs 터틀파크 1.65로 3배 차이 — 미보정 순위는
//  '누가 한울전에 많이 나왔나'를 상당 부분 반영했다).
// 그 상대 경기를 전부 뛴 버킷은 부재 표본이 없어 매칭에서 뺀다. 매칭 표본이 0이면
// hasBaseline=false·delta=null — pairBaseline 규약과 동일, 소비자는 '–' 표시.
// 상대팀명이 없는 데이터는 단일 버킷으로 떨어져 옛 전체-부재 수식과 정확히 일치한다.
// 한계(의도): GK 미보정 — UI 캡션에 명시.
import { parseActualPlayers } from './parseMembers';

// 지표별 정렬 축.
//   delta     = 부재 대비 억제. 두 지표 모두 '클수록 좋음'으로 부호를 맞춰 놓았다.
//   raw       = 생값. 여기서 극성이 갈린다 — 실점률은 낮을수록, 클린시트율은 높을수록 좋다.
// rawBetter가 필요한 이유가 이것: by:'raw'에서도 dir:'desc'가 항상 BEST를 뜻하게 흡수한다.
const METRIC_AXES = {
  conceded: { delta: 'delta', raw: 'concededPerGame', rawBetter: 'lower' },
  clean: { delta: 'cleanDelta', raw: 'cleanRate', rawBetter: 'higher' },
};

const comboLabel = (r) => r.name || (r.members || []).join('·');

// 개인/조합 행 공용 정렬. calcDefenseAnalysis는 실점률 Δ 기준 정렬본을 반환하지만,
// 지표 토글·대시보드는 같은 계산 결과를 다른 축으로 다시 세워야 해서 정렬만 분리했다
// (metric을 calcDefenseAnalysis 인자로 받으면 축마다 전체 집계를 다시 돌아야 한다).
// dir:'desc' = BEST 먼저, 'asc' = WORST 먼저 — by/metric과 무관하게 일관.
// 순수 함수 — 입력 배열 불변.
export function sortDefenseRows(rows, { metric = 'conceded', dir = 'desc', by = 'delta' } = {}) {
  const axis = METRIC_AXES[metric] || METRIC_AXES.conceded;
  const field = by === 'raw' ? axis.raw : axis.delta;
  // 생값이 '낮을수록 좋음'이면 BEST=오름차순이므로 비교 방향을 뒤집는다
  const flip = by === 'raw' && axis.rawBetter === 'lower';
  // null Δ(베이스라인 없음)는 dir과 무관하게 맨 뒤 — 오염된 비교값을 순위에 올리지 않는다
  return [...(rows || [])].sort((a, b) => {
    const av = a[field], bv = b[field];
    if ((av == null) !== (bv == null)) return av == null ? 1 : -1;
    if (av != null && av !== bv) {
      const best = flip ? av - bv : bv - av;
      return dir === 'desc' ? best : -best;
    }
    return b.games - a.games || comboLabel(a).localeCompare(comboLabel(b), 'ko');
  });
}

export function calcDefenseAnalysis({ matchLogs, individualThreshold = 8, pairThreshold = 5, trioThreshold = 3 }) {
  const scope = [];
  for (const m of matchLogs || []) {
    if (m.is_extra) continue;
    const dfs = [...new Set(parseActualPlayers(m.our_defenders_json))];
    if (dfs.length === 0) continue;
    dfs.sort((a, b) => a.localeCompare(b, 'ko'));
    scope.push({
      dfs,
      conceded: Number(m.opponent_score) || 0,
      opponent: String(m.opponent_team_name || '').trim(),
    });
  }
  const totalMatches = scope.length;
  const totalConceded = scope.reduce((s, x) => s + x.conceded, 0);
  const totalCleanSheets = scope.reduce((s, x) => s + (x.conceded === 0 ? 1 : 0), 0);

  // 상대별 팀 스탯 — 보정 기준선의 재료이자 캡션의 '상대별 팀 실점' 표기용
  const oppStats = {};
  for (const { opponent, conceded } of scope) {
    const o = (oppStats[opponent] ??= { g: 0, c: 0, cs: 0 });
    o.g++; o.c += conceded; if (conceded === 0) o.cs++;
  }

  const indiv = {};
  const pair = {};
  const trio = {};
  const bump = (map, key, conceded, opponent) => {
    if (!map[key]) map[key] = { games: 0, conceded: 0, cleanSheets: 0, byOpp: {} };
    const s = map[key];
    s.games++; s.conceded += conceded;
    if (conceded === 0) s.cleanSheets++;
    const o = (s.byOpp[opponent] ??= { g: 0, c: 0, cs: 0 });
    o.g++; o.c += conceded; if (conceded === 0) o.cs++;
  };
  for (const { dfs, conceded, opponent } of scope) {
    for (const d of dfs) bump(indiv, d, conceded, opponent);
    for (let i = 0; i < dfs.length; i++)
      for (let j = i + 1; j < dfs.length; j++) {
        bump(pair, `${dfs[i]}|${dfs[j]}`, conceded, opponent);
        // 3인까지만 — 4인은 백4 고정 팀에서 '그 경기 자체'와 같아져 반복이 거의 없다
        for (let k = j + 1; k < dfs.length; k++) bump(trio, `${dfs[i]}|${dfs[j]}|${dfs[k]}`, conceded, opponent);
      }
  }

  const finish = (s) => {
    const concededPerGame = s.games > 0 ? s.conceded / s.games : 0;
    const cleanRate = s.games > 0 ? s.cleanSheets / s.games : 0;
    // 상대 버킷별 부재 기준선을 본인 출전 경기수로 가중합해 '기대'를 만든다.
    // 그 상대 경기를 전부 뛴 버킷(baseG=0)은 부재 표본이 없어 실제·기대 양쪽에서 뺀다 —
    // 그래서 Δ의 분모(matched)는 드물게 games보다 작을 수 있고, 그때 표시용 생값
    // (concededPerGame, 전 경기 기준)과 Δ의 실제항이 미세하게 어긋난다(의도).
    let matched = 0, actConceded = 0, actClean = 0, expConceded = 0, expClean = 0;
    for (const [opp, o] of Object.entries(s.byOpp)) {
      const t = oppStats[opp];
      const baseG = t.g - o.g;
      if (baseG <= 0) continue;
      matched += o.g;
      actConceded += o.c; actClean += o.cs;
      expConceded += o.g * ((t.c - o.c) / baseG);
      expClean += o.g * ((t.cs - o.cs) / baseG);
    }
    const hasBaseline = matched > 0;
    const baselineConcededPerGame = hasBaseline ? expConceded / matched : null;
    // 클린시트 Δ는 실점률 Δ와 부호 방향을 맞춘다(+면 억제). 실점률은 '낮을수록 좋음'이라
    // 기대−실제, 클린시트율은 '높을수록 좋음'이라 실제−기대.
    const baselineCleanRate = hasBaseline ? expClean / matched : null;
    return {
      games: s.games, conceded: s.conceded, cleanSheets: s.cleanSheets,
      concededPerGame,
      cleanRate,
      baselineConcededPerGame,
      delta: hasBaseline ? baselineConcededPerGame - actConceded / matched : null,
      baselineCleanRate,
      cleanDelta: hasBaseline ? actClean / matched - baselineCleanRate : null,
      hasBaseline,
    };
  };
  const individuals = sortDefenseRows(
    Object.entries(indiv)
      .map(([name, s]) => ({ name, ...finish(s) }))
      .filter(x => x.games >= individualThreshold),
  );

  // 조합 행은 인원수와 무관하게 members 배열로 통일 — 2인/3인을 같은 정렬·렌더 경로에 태운다
  const buildCombos = (map, threshold) => Object.entries(map)
    .map(([key, s]) => ({ members: key.split('|'), ...finish(s) }))
    .filter(x => x.games >= threshold);

  const allPairs = buildCombos(pair, pairThreshold);
  const allTrios = buildCombos(trio, trioThreshold);

  return {
    scopeMatches: totalMatches,
    totalConceded,
    totalCleanSheets,
    teamConcededPerGame: totalMatches > 0 ? totalConceded / totalMatches : 0,
    teamCleanRate: totalMatches > 0 ? totalCleanSheets / totalMatches : 0,
    // 상대별 팀 기준선(경기수 많은 순) — 캡션의 '상대별 팀 실점' 표기용
    opponents: Object.entries(oppStats)
      .map(([opponent, o]) => ({ opponent, games: o.g, concededPerGame: o.c / o.g, cleanRate: o.cs / o.g }))
      .sort((a, b) => b.games - a.games || a.opponent.localeCompare(b.opponent, 'ko')),
    individuals,
    pairs: sortDefenseRows(allPairs, { dir: 'desc' }),
    worstPairs: sortDefenseRows(allPairs, { dir: 'asc' }),
    trios: sortDefenseRows(allTrios, { dir: 'desc' }),
    worstTrios: sortDefenseRows(allTrios, { dir: 'asc' }),
  };
}
