// 재미 어워드: 해트트릭(경기 단위 3골) / 키퍼(클린시트·실점률) / 자책 랭킹
// (세션 3골 '불꽃'은 2026-07-03 사용자 결정으로 제거 — 하루 합산 3골은 지표 의미 없음)
// hatTricks는 로그_이벤트 (player, date, match_id) 단위 3골 이상 — 진짜 경기 단위 해트트릭.
//   골 이벤트는 dedupe 금지(동일 선수 연속골 실존) — 행 수 그대로 카운트.
// owngoal은 로그_이벤트에 owngoal 이벤트가 하나라도 있으면 그쪽을 진실 소스로 사용.
// (배열이 비어있지 않다는 것만으로 폴백을 막으면 owngoal 미기록 데이터셋에서 PG 누적이 유실됨)
// 없으면 폴백으로 playerLogs.owngoals 컬럼 합산.
// 키퍼 지표는 PG(로그_선수경기)의 누적 컬럼을 권위 소스로 사용:
//   keeper_games(키퍼로 뛴 경기 수), conceded(실점 합), cleansheets(무실점 세션 0/1).
//   클린시트 수 = Σcleansheets, 실점률 = Σconceded / Σkeeper_games (경기당, 낮을수록 좋음).
export function calcAwards({ playerLogs, eventLogs, topN = {}, minKeeperGames = 4 }) {
  const limits = {
    hatTrick: topN.hatTrick ?? 5,
    cleanSheet: topN.cleanSheet ?? 5,
    stingiest: topN.stingiest ?? 5,
    owngoal: topN.owngoal ?? 3,
  };

  const keeper = {}, own = {};
  for (const p of playerLogs || []) {
    const name = p.player;
    // 키퍼 누적: 키퍼로 한 경기라도 뛴 세션만 합산
    const kg = Number(p.keeper_games) || 0;
    if (kg > 0) {
      const a = keeper[name] || (keeper[name] = { keeperGames: 0, conceded: 0, cleanSheets: 0 });
      a.keeperGames += kg;
      a.conceded += Number(p.conceded) || 0;
      a.cleanSheets += Number(p.cleansheets) || 0;
    }
  }

  // 자책 병합: 이벤트 로그가 커버하는 날짜는 이벤트가 권위(그날 자책 0건도 사실),
  // 이벤트 미커버 날짜는 playerLogs.owngoals로 보충 — 이진 스위치로 전 구간을 버리면
  // 이벤트 로그 기간 밖의 자책 기록이 유실된다.
  const eventDates = new Set((eventLogs || []).map(e => e.date).filter(Boolean));
  for (const e of eventLogs || []) {
    if (e.event_type !== 'owngoal') continue;
    const name = e.player;
    if (!name) continue;
    own[name] = (own[name] || 0) + 1;
  }
  for (const p of playerLogs || []) {
    if (!p.player) continue; // 이벤트 루프와 동일 가드 — undefined 키 랭킹 방지
    if (p.date && eventDates.has(p.date)) continue;
    const og = Number(p.owngoals) || 0;
    if (og > 0) own[p.player] = (own[p.player] || 0) + og;
  }

  // 경기 단위 해트트릭: (player, date, match_id)별 goal 이벤트 수 >= 3
  const goalsPerMatch = {}; // key → { player, cnt } — 이름을 키에서 재파싱하면 공백 포함 이름이 잘린다
  for (const e of eventLogs || []) {
    if (e.event_type !== 'goal') continue;
    if (!e.player) continue;
    // match_id(R1_C1형)는 날짜 간 반복되므로 date·match_id 둘 다 있어야 경기를 식별한다 —
    // 하나라도 없으면 같은 키로 다른 경기 골이 합산돼 허위 해트트릭이 된다.
    if (!e.date || !e.match_id) continue;
    const key = `${e.player}|${e.date || ''}|${e.match_id || ''}`;
    if (!goalsPerMatch[key]) goalsPerMatch[key] = { player: e.player, cnt: 0 };
    goalsPerMatch[key].cnt++;
  }
  const hat = {};
  for (const { player, cnt } of Object.values(goalsPerMatch)) {
    if (cnt < 3) continue;
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
      a.concededRate - b.concededRate ||
      a.player.localeCompare(b.player, 'ko'))
    .slice(0, limits.cleanSheet);

  // 실점률: 경기당 실점 적은 순 (소표본 컷, 동률은 표본 많은 순 → 이름)
  const stingiest = keeperRows
    .filter(r => r.keeperGames >= minKeeperGames)
    .sort((a, b) =>
      a.concededRate - b.concededRate ||
      b.keeperGames - a.keeperGames ||
      a.player.localeCompare(b.player, 'ko'))
    .slice(0, limits.stingiest);

  return {
    hatTricks: toList(hat, 'count', limits.hatTrick),
    keepers: { cleanSheetKings, stingiest },
    owngoalKings: toList(own, 'total', limits.owngoal),
  };
}
