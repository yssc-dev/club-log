// 로그_테니스선수경기 행 → 단식 순위표 / 개인 전적 요약.
// 길로틴(단식) 순위는 승률↓→승수↓로 매기고(이름은 기준 제외, 동률은 명부 순서 — 유저 확정 2026-08-28) 포인트는 별도 컬럼으로 적립한다.
// 복식 순위표도 같은 기준(tennisAnalytics.byRateWins). 페어·파트너·성적표 등 지표 표는 다승 우선.

import { COMPETITION_SINGLES } from './tennisSchema';
import { deriveLeagueForDate, singlesWinRatesBefore } from './leagueDerivation';
import { calcMatchPoints, DEFAULT_POINT_RULES } from './rankPoints';
import { matchKey, guestCountByMatch, isLeagueRow } from './tennisAnalytics';


// legacySingles: 상세 로우 없는 단식 집계 [{player, wins, losses}] — W/L(승률)에만 가산, 포인트 불가.
// sortBy: 'rate'(기본, 승률↓→승수↓ = 길로틴 순위) | 'points'(포인트↓→승률↓→승수↓, 개인지표 포인트 조회용). 이름은 기준 제외.
export function buildSinglesStandings({ rows, roster, asOfDate, pointRules = DEFAULT_POINT_RULES, sortBy = 'rate', legacySingles = [], seedOrder = [] }) {
  const list = (roster || []).filter(m => m && m.name);
  const acc = new Map(list.map(m => [m.name, {
    name: m.name, grade: m.grade || '', games: 0, wins: 0, losses: 0, rate: 0, points: 0,
  }]));

  // 길로틴 성립 = 회원끼리(게스트 0명) 단식 — 구성 기준(leagueRule.js), 시트 라벨 무관.
  const guestCounts = guestCountByMatch(rows);
  const singles = (rows || []).filter(r => r.format === '단식' && isLeagueRow(r, guestCounts));

  for (const r of singles) {
    const cur = acc.get(r.player);
    if (!cur) continue;               // 로스터 밖(용병/탈퇴)은 순위표에 넣지 않는다
    cur.games++;
    if (r.result === '승') cur.wins++;
    else if (r.result === '패') cur.losses++;
    cur.rate = cur.games > 0 ? cur.wins / cur.games : 0;
  }

  // 집계 전적(예: 2026 1~7월) 가산 — 전적/승률에만 반영. 포인트는 로우 기반이라 아래 루프에서 로우만 쌓는다.
  for (const L of legacySingles || []) {
    const cur = acc.get(L?.player);
    if (!cur) continue;
    const lw = Number(L.wins) || 0;
    const ll = Number(L.losses) || 0;
    cur.wins += lw;
    cur.losses += ll;
    cur.games += lw + ll;   // 로우 게임수에 집계분 증분(재대입 아님 — 미결 행 유실 방지, buildPlayerSummary와 일치)
    cur.rate = cur.games > 0 ? cur.wins / cur.games : 0;
  }

  // 포인트는 같은 판(match_id + date)의 양쪽 행을 짝지어야 계산된다.
  // 리그/승률은 그 경기일 직전 값을 써야 하므로 날짜별로 한 번씩만 파생한다.
  const byDate = new Map();
  for (const r of singles) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  }

  for (const [date, dayRows] of [...byDate.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
    const leagueMap = deriveLeagueForDate({ rows: singles, dateISO: date, roster: list, seedOrder, seasonAggregate: legacySingles });
    // upset 판정 승률도 티어와 동일 기준(상세+그 해 집계)으로 — 일관성.
    const rates = singlesWinRatesBefore(singles, date, legacySingles);
    const rateOf = (n) => rates.get(n)?.rate ?? 0;

    const pairs = new Map();
    for (const r of dayRows) {
      const k = matchKey(r);
      if (!pairs.has(k)) pairs.set(k, []);
      pairs.get(k).push(r);
    }

    for (const rowsOfMatch of pairs.values()) {
      if (rowsOfMatch.length !== 2) continue;
      const winnerRow = rowsOfMatch.find(x => x.result === '승');
      const loserRow = rowsOfMatch.find(x => x.result === '패');
      if (!winnerRow || !loserRow) continue;
      const target = acc.get(winnerRow.player);
      if (!target) continue;
      target.points += calcMatchPoints({
        format: '단식',
        league: COMPETITION_SINGLES,
        winner: {
          name: winnerRow.player, grade: winnerRow.grade_at_date,
          leagueTier: leagueMap[winnerRow.player], winRate: rateOf(winnerRow.player),
          isGuest: winnerRow.is_guest === true,
        },
        loser: {
          name: loserRow.player, grade: loserRow.grade_at_date,
          leagueTier: leagueMap[loserRow.player], winRate: rateOf(loserRow.player),
          isGuest: loserRow.is_guest === true,
        },
      }, pointRules);
    }
  }

  const finalLeague = deriveLeagueForDate({ rows: singles, dateISO: asOfDate, roster: list, seedOrder, seasonAggregate: legacySingles });
  const cmp = sortBy === 'points'
    ? (a, b) => b.points - a.points || b.rate - a.rate || b.wins - a.wins
    : (a, b) => b.rate - a.rate || b.wins - a.wins;
  return [...acc.values()]
    .map(x => ({ ...x, leagueTier: finalLeague[x.name] }))
    .sort(cmp);
}

// 종목 전적을 리그(길로틴 단식/투몽 복식) vs 번외(그 외)로 분리 집계.
//  - 리그 판정은 리그탭(buildSinglesStandings/buildDoublesStandings)과 동일 기준(isLeagueRow):
//    단식은 회원끼리, 복식은 회원 3명 이상(게스트 ≤1) — 참가자 구성 기준, 라벨 무관.
//  - wins/losses/rate/games = 리그, extra* = 번외. 레이더는 singles.rate(=리그)를 그대로 소비.
//  - legacySingles: 상세 로우 없는 단식 집계 [{player, wins, losses}] — 단식 '리그' 전적에만 가산.
//  - 에이스/DF/타이브레이크/베이글은 종목 상세 총계(리그+번외 로우, 레거시엔 경기별 값 없음).
export function buildPlayerSummary({ rows, player, legacySingles = [] }) {
  const all = rows || [];
  const guests = guestCountByMatch(all);         // 판(game_id|match_id)별 게스트 수 — 리그 성립 판정 입력
  const mine = all.filter(r => r.player === player);

  const blank = () => ({
    games: 0, wins: 0, losses: 0, rate: 0,                       // 리그
    extraGames: 0, extraWins: 0, extraLosses: 0, extraRate: 0,   // 번외
    aces: 0, doubleFaults: 0, tbPlayed: 0, tbWon: 0, bagelsGiven: 0, bagelsTaken: 0,
  });
  const out = {
    singles: blank(), doubles: blank(),
    attendanceDates: 0,
    aces: 0, doubleFaults: 0, tbPlayed: 0, tbWon: 0, bagelsTaken: 0, bagelsGiven: 0, // 합산 총계(하위호환)
  };
  const dates = new Set();

  // 리그 성립 판정은 tennisAnalytics.isLeagueRow(선수 성적표와 공유)

  for (const r of mine) {
    dates.add(r.date);
    const a = Number(r.aces) || 0, df = Number(r.double_faults) || 0;
    const tp = Number(r.tb_played) || 0, tw = Number(r.tb_won) || 0;
    const bg = Number(r.bagels_given) || 0, bt = Number(r.bagels_taken) || 0;
    out.aces += a; out.doubleFaults += df; out.tbPlayed += tp; out.tbWon += tw;
    out.bagelsGiven += bg; out.bagelsTaken += bt;

    const bucket = r.format === '복식' ? out.doubles : out.singles;
    bucket.aces += a; bucket.doubleFaults += df; bucket.tbPlayed += tp; bucket.tbWon += tw;
    bucket.bagelsGiven += bg; bucket.bagelsTaken += bt;

    const league = isLeagueRow(r, guests);
    if (league) {
      bucket.games++;
      if (r.result === '승') bucket.wins++;
      else if (r.result === '패') bucket.losses++;
    } else {
      bucket.extraGames++;
      if (r.result === '승') bucket.extraWins++;
      else if (r.result === '패') bucket.extraLosses++;
    }
  }

  // 집계 단식 전적 가산(예: 2026 1~7월) — 단식 '리그' W/L·게임수에만.
  for (const L of legacySingles || []) {
    if (String(L?.player) !== String(player)) continue;
    out.singles.wins += Number(L.wins) || 0;
    out.singles.losses += Number(L.losses) || 0;
    out.singles.games += (Number(L.wins) || 0) + (Number(L.losses) || 0);
  }

  for (const b of [out.singles, out.doubles]) {
    b.rate = b.games > 0 ? b.wins / b.games : 0;
    b.extraRate = b.extraGames > 0 ? b.extraWins / b.extraGames : 0;
  }
  out.attendanceDates = dates.size;
  return out;
}
