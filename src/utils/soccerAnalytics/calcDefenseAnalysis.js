// 수비 분석 (축구 전용): our_defenders_json 기반 개인 「수비력」 + DF 2인/3인 조합.
// 집계 범위 = is_extra 아님 + 수비수 기록이 있는 경기만(레코더 도입 후 — 레거시엔 defenders 없음).
//
// delta(수비력) = 그날 평균 실점 − 내가 수비수로 선 경기 평균 실점. 양수 = 그날 평균보다 덜 먹힘.
//   그날 평균 = 그 경기일 범위 내 전체 경기(수비수 기록 있는 경기)의 경기당 실점. 본인 경기 포함.
//   baselineConcededPerGame = 내가 뛴 경기마다 그날 평균을 붙여 낸 평균(경기 수 가중).
// cleanDelta = 내 무실점률 − 그날 무실점률(같은 방식). 부호 방향은 delta 와 같다(+면 좋음).
// 마스터FC 풋살 「수비력」(analyticsV2/calcFieldDefense)과 같은 정의 — 2026-11-12 유저 결정
// ("상대가 누구든 상관없다"). 그 전엔 '같은 상대에서의 부재 대비' 보정이었으나 폐기했다.
// 한계(의도): 상대·GK 미보정 — UI 캡션에 명시.
// ★ 2026-11-12 같은 날 후속 결정: 화면의 개인 순위는 delta 가 아니라 생값(경기당 실점) — 아래 individuals 주석.
import { parseActualPlayers } from './parseMembers';
import { expandIntraMatchRows } from './expandIntraMatchRows';
import { dynamicMin } from './dynamicMin';

// 진입선(2026-11-12 유저 결정): 경기 수가 아니라 「함께(수비수로) 선 경기일 수」 기준.
// 하버FC는 하루 여러 경기를 쿼터 단위로 돌려 "5경기"가 1~2일치인 경우가 많다 — 독립 표본은 경기일.
// 단계(개인/2인/3인)별 최다 경기일 × 30% 올림(dynamicMin). 3인은 표본이 얇아 최소 2일 + 3경기를 함께 건다.
const TRIO_MIN_DATES_FLOOR = 2;

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

// *Threshold = 경기 수 진입선(명시 호출부용, 기본 0), *MinDates = 경기일 진입선(기본 null = 동적 30%).
export function calcDefenseAnalysis({
  matchLogs, individualThreshold = null, pairThreshold = 0, trioThreshold = 3,
  individualMinDates = 0, pairMinDates = null, trioMinDates = null,
}) {
  const scope = [];
  // 자체전 행은 A·B 두 시점 행으로 펼친다(상대 버킷 '자체전'). 비자체전 행은 그대로 — 하버FC 무영향.
  for (const m of expandIntraMatchRows(matchLogs || [])) {
    if (m.is_extra) continue;
    const dfs = [...new Set(parseActualPlayers(m.our_defenders_json))];
    if (dfs.length === 0) continue;
    dfs.sort((a, b) => a.localeCompare(b, 'ko'));
    scope.push({
      dfs,
      conceded: Number(m.opponent_score) || 0,
      opponent: String(m.opponent_team_name || '').trim(),
      date: String(m.date || ''),
    });
  }
  const totalMatches = scope.length;

  // 상대별 팀 스탯 — 팀 합계와 opponents(상대별 팀 실점 표기용) 재료. 수비력 기준선과는 무관(그날 평균 사용).
  // 팀 합계(totalConceded 등)도 여기서 파생해 scope를 한 번만 돈다.
  const oppStats = {};
  for (const { opponent, conceded } of scope) {
    const o = (oppStats[opponent] ??= { g: 0, c: 0, cs: 0 });
    o.g++; o.c += conceded; if (conceded === 0) o.cs++;
  }
  const totalConceded = Object.values(oppStats).reduce((s, o) => s + o.c, 0);
  const totalCleanSheets = Object.values(oppStats).reduce((s, o) => s + o.cs, 0);

  // 경기일별 팀 실점 — 수비력 기준선(그날 평균)의 재료
  const dayStats = {};
  for (const { date, conceded } of scope) {
    const d = (dayStats[date] ??= { g: 0, c: 0, cs: 0 });
    d.g++; d.c += conceded; if (conceded === 0) d.cs++;
  }

  const indiv = {};
  const pair = {};
  const trio = {};
  const bump = (map, key, conceded, opponent, date) => {
    if (!map[key]) map[key] = { games: 0, conceded: 0, cleanSheets: 0, dates: new Set(), baseC: 0, baseCs: 0 };
    const s = map[key];
    s.games++; s.conceded += conceded; s.dates.add(date);
    const day = dayStats[date];
    s.baseC += day.c / day.g; s.baseCs += day.cs / day.g;
    if (conceded === 0) s.cleanSheets++;
  };
  for (const { dfs, conceded, opponent, date } of scope) {
    for (const d of dfs) bump(indiv, d, conceded, opponent, date);
    for (let i = 0; i < dfs.length; i++)
      for (let j = i + 1; j < dfs.length; j++) {
        bump(pair, `${dfs[i]}|${dfs[j]}`, conceded, opponent, date);
        // 3인까지만 — 4인은 백4 고정 팀에서 '그 경기 자체'와 같아져 반복이 거의 없다
        for (let k = j + 1; k < dfs.length; k++) bump(trio, `${dfs[i]}|${dfs[j]}|${dfs[k]}`, conceded, opponent, date);
      }
  }

  const finish = (s) => {
    const concededPerGame = s.games > 0 ? s.conceded / s.games : 0;
    const cleanRate = s.games > 0 ? s.cleanSheets / s.games : 0;
    const hasBaseline = s.games > 0;
    const baselineConcededPerGame = hasBaseline ? s.baseC / s.games : null;
    const baselineCleanRate = hasBaseline ? s.baseCs / s.games : null;
    return {
      games: s.games, dates: s.dates.size, conceded: s.conceded, cleanSheets: s.cleanSheets,
      concededPerGame,
      cleanRate,
      baselineConcededPerGame,
      delta: hasBaseline ? baselineConcededPerGame - concededPerGame : null,
      baselineCleanRate,
      cleanDelta: hasBaseline ? cleanRate - baselineCleanRate : null,
      hasBaseline,
    };
  };
  const maxDates = (map) => Object.values(map).reduce((mx, s) => Math.max(mx, s.dates.size), 0);
  const minDates = {
    individual: individualMinDates ?? dynamicMin(maxDates(indiv)),   // 기본 0 — 개인은 경기 수 진입선만
    pair: pairMinDates ?? dynamicMin(maxDates(pair)),
    trio: trioMinDates ?? Math.max(TRIO_MIN_DATES_FLOOR, dynamicMin(maxDates(trio))),
  };

  // 개인 진입선(2026-11-12 유저 결정): 수비수로 선 경기 수 ≥ 가장 많이 뛴 수비수의 경기 수 × 30% 올림
  // (처음엔 "전체 경기 × 30%"였으나 통과 5명뿐이라 같은 날 최다 기준으로 변경 — 풋살 지표 Top5와 같은 규약).
  // 개인 순위는 생값(경기당 실점 = 총실점 ÷ 수비수 경기) 오름차순 — "그날 평균 대비" 같은 보정값은
  // 직관적이지 않다는 유저 판단으로 화면 순위에서 내렸다(delta 필드는 계산만 남음).
  const maxIndividualGames = Object.values(indiv).reduce((mx, s) => Math.max(mx, s.games), 0);
  const individualMinGames = individualThreshold ?? dynamicMin(maxIndividualGames);
  const individuals = sortDefenseRows(
    Object.entries(indiv)
      .map(([name, s]) => ({ name, ...finish(s) }))
      .filter(x => x.games >= individualMinGames && x.dates >= minDates.individual),
    { metric: 'conceded', by: 'raw', dir: 'desc' },
  );

  // 조합 행은 인원수와 무관하게 members 배열로 통일 — 2인/3인을 같은 정렬·렌더 경로에 태운다
  const buildCombos = (map, threshold, dateMin) => Object.entries(map)
    .map(([key, s]) => ({ members: key.split('|'), ...finish(s) }))
    .filter(x => x.games >= threshold && x.dates >= dateMin);

  const allPairs = buildCombos(pair, pairThreshold, minDates.pair);
  const allTrios = buildCombos(trio, trioThreshold, minDates.trio);

  return {
    scopeMatches: totalMatches,
    scopeDates: new Set(scope.map(x => x.date)).size,
    // 화면 캡션용 진입선 — { individual, pair, trio } 경기일 수 + 단계별 최다 경기일
    minDates,
    individualMinGames,
    maxIndividualGames,
    maxDates: { individual: maxDates(indiv), pair: maxDates(pair), trio: maxDates(trio) },
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
