// 재미 어워드: 해트트릭(경기 단위 3골) / 키퍼(클린시트·실점률) / 자책 랭킹
// (세션 3골 '불꽃'은 2026-07-03 사용자 결정으로 제거 — 하루 합산 3골은 지표 의미 없음)
// hatTricks는 로그_이벤트 (player, date, match_id) 단위 3골 이상 — 진짜 경기 단위 해트트릭.
//   골 이벤트는 dedupe 금지(동일 선수 연속골 실존) — 행 수 그대로 카운트.
// owngoal은 로그_이벤트에 owngoal 이벤트가 하나라도 있으면 그쪽을 진실 소스로 사용.
// (배열이 비어있지 않다는 것만으로 폴백을 막으면 owngoal 미기록 데이터셋에서 PG 누적이 유실됨)
// 없으면 폴백으로 playerLogs.owngoals 컬럼 합산.
// 키퍼 지표(2026-11-13 변경): 키퍼 경기 수·실점 = GK가 기록된 로그_매치 사이드(calcGkFieldSplit) —
//   지표 Top5·개인분석·키퍼 vs 필드 카드와 같은 숫자. 레거시 GK 미기록 경기는 빠진다.
//   클린시트 수 = PG cleansheets(무실점 세션 0/1) 누적, 실점률 = 실점 / 키퍼 경기 (경기당, 낮을수록 좋음).
//   실점률 나쁜 순 = 같은 컷, 내림차순.
// minKeeperGames 생략(null) 시 동적: 최다 키퍼경기의 30%(올림) — dynamicMin 참조.
// 축구(soccerAnalytics/calcAwards)는 고정 4 유지 — 명시 인자로 넘기면 그 값 사용.
import { calcGkFieldSplit } from './calcGkFieldSplit';
import { dynamicMin } from './dynamicMin';

export function calcAwards({ playerLogs, eventLogs, matchLogs = [], topN = {}, minKeeperGames = null }) {
  const limits = {
    hatTrick: topN.hatTrick ?? 5,
    cleanSheet: topN.cleanSheet ?? 5,
    stingiest: topN.stingiest ?? 5,
    leakiest: topN.leakiest ?? 5,
    owngoal: topN.owngoal ?? 3,
  };

  // 키퍼 경기수·실점 = GK가 기록된 로그_매치 사이드만(calcGkFieldSplit) — 지표 Top5·개인분석과 같은 숫자
  //   (2026-11-13 유저 결정 A: 레거시 GK 미기록 경기는 키퍼 지표에서 제외).
  // 클린시트 수 = PG cleansheets(무실점 세션) 누적 — 세션 단위 포인트 항목이라 PG 유지.
  const keeper = {}, own = {};
  const ensureKeeper = (name) => keeper[name] || (keeper[name] = { keeperGames: 0, conceded: 0, cleanSheets: 0 });
  for (const [name, sp] of Object.entries(calcGkFieldSplit({ matchLogs }).perPlayer)) {
    if (sp.gk.games === 0) continue;
    const a = ensureKeeper(name);
    a.keeperGames = sp.gk.games;
    a.conceded = sp.gk.goalsAgainst;
  }
  for (const p of playerLogs || []) {
    if ((Number(p.keeper_games) || 0) <= 0) continue;
    const cs = Number(p.cleansheets) || 0;
    if (cs > 0) ensureKeeper(p.player).cleanSheets += cs;
  }

  const hasOwngoalEvents = (eventLogs || []).some(e => e.event_type === 'owngoal');
  if (hasOwngoalEvents) {
    for (const e of eventLogs) {
      if (e.event_type !== 'owngoal') continue;
      const name = e.player;
      if (!name) continue;
      own[name] = (own[name] || 0) + 1;
    }
  } else {
    for (const p of playerLogs || []) {
      const og = Number(p.owngoals) || 0;
      if (og > 0) own[p.player] = (own[p.player] || 0) + og;
    }
  }

  // 경기 단위 해트트릭: (player, date, match_id)별 goal 이벤트 수 >= 3
  const goalsPerMatch = {};
  for (const e of eventLogs || []) {
    if (e.event_type !== 'goal') continue;
    if (!e.player) continue;
    const key = `${e.player}\u0000${e.date || ''}\u0000${e.match_id || ''}`;
    goalsPerMatch[key] = (goalsPerMatch[key] || 0) + 1;
  }
  const hat = {};
  for (const [key, cnt] of Object.entries(goalsPerMatch)) {
    if (cnt < 3) continue;
    const player = key.split('\u0000')[0];
    hat[player] = (hat[player] || 0) + 1;
  }

  const toList = (map, key, limit) =>
    Object.entries(map)
      .map(([player, value]) => ({ player, [key]: value }))
      .sort((a, b) => b[key] - a[key] || a.player.localeCompare(b.player, 'ko'))
      .slice(0, limit);

  // 키퍼 행: player + 누적 + 실점률(경기당)
  const keeperRows = Object.entries(keeper).map(([player, a]) => ({
    player,
    keeperGames: a.keeperGames,
    conceded: a.conceded,
    cleanSheets: a.cleanSheets,
    concededRate: a.keeperGames > 0 ? a.conceded / a.keeperGames : null,
  }));

  // 클린시트 수: 누적 무실점 세션 많은 순 (동률은 실점률 낮은 순 → 이름)
  const cleanSheetKings = keeperRows
    .filter(r => r.cleanSheets > 0)
    .sort((a, b) =>
      b.cleanSheets - a.cleanSheets ||
      (a.concededRate ?? Infinity) - (b.concededRate ?? Infinity) ||
      a.player.localeCompare(b.player, 'ko'))
    .slice(0, limits.cleanSheet);

  // 실점률: 경기당 실점 적은 순 (소표본 컷, 동률은 표본 많은 순 → 이름)
  const maxKeeperGames = keeperRows.reduce((m, r) => Math.max(m, r.keeperGames), 0);
  const resolvedMinKeeperGames = minKeeperGames ?? dynamicMin(maxKeeperGames);
  const stingiest = keeperRows
    .filter(r => r.keeperGames > 0 && r.keeperGames >= resolvedMinKeeperGames)
    .sort((a, b) =>
      a.concededRate - b.concededRate ||
      b.keeperGames - a.keeperGames ||
      a.player.localeCompare(b.player, 'ko'))
    .slice(0, limits.stingiest);

  // 실점률 나쁜 순: 경기당 실점 많은 순 (같은 소표본 컷, 동률은 표본 많은 순 → 이름)
  const leakiest = keeperRows
    .filter(r => r.keeperGames > 0 && r.keeperGames >= resolvedMinKeeperGames)
    .sort((a, b) =>
      b.concededRate - a.concededRate ||
      b.keeperGames - a.keeperGames ||
      a.player.localeCompare(b.player, 'ko'))
    .slice(0, limits.leakiest);

  return {
    hatTricks: toList(hat, 'count', limits.hatTrick),
    keepers: { cleanSheetKings, stingiest, leakiest },
    owngoalKings: toList(own, 'total', limits.owngoal),
    thresholds: { minKeeperGames: resolvedMinKeeperGames, maxKeeperGames },
  };
}
