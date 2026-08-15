// 로그_테니스선수경기 행 → 단식 순위표 / 개인 전적 요약.
// 순위는 승률로 매기고 포인트는 별도 컬럼으로 적립한다(스펙 4.5).

import { COMPETITION_SINGLES } from './tennisSchema';
import { deriveLeagueForDate, singlesWinRatesBefore } from './leagueDerivation';
import { calcMatchPoints, DEFAULT_POINT_RULES } from './rankPoints';
import { matchKey } from './tennisAnalytics';

const isSingles = (r) => r.format === '단식' && r.league === COMPETITION_SINGLES;

// legacySingles: 상세 로우 없는 단식 집계 [{player, wins, losses}] — W/L(승률)에만 가산, 포인트 불가.
export function buildSinglesStandings({ rows, roster, asOfDate, pointRules = DEFAULT_POINT_RULES, sortBy = 'rate', legacySingles = [], seedOrder = [] }) {
  const list = (roster || []).filter(m => m && m.name);
  const acc = new Map(list.map(m => [m.name, {
    name: m.name, grade: m.grade || '', games: 0, wins: 0, losses: 0, rate: 0, points: 0,
  }]));

  // 게스트 낀 단식은 애초에 league='미반영'(determineCompetition: 단식은 전원 회원일 때만 길로틴)이라
  // isSingles(league==='길로틴')에서 이미 통째로 빠진다 → 복식처럼 별도 guestMatchKeys 제외가 불필요.
  const singles = (rows || []).filter(r => isSingles(r) && r.is_guest !== true);

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
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'ko');
  const cmp = sortBy === 'points'
    ? (a, b) => b.points - a.points || b.rate - a.rate || b.wins - a.wins || byName(a, b)
    : (a, b) => b.rate - a.rate || b.wins - a.wins || byName(a, b);
  return [...acc.values()]
    .map(x => ({ ...x, leagueTier: finalLeague[x.name] }))
    .sort(cmp);
}

// legacySingles: 상세 로우 없는 단식 집계 [{player, wins, losses}] — 단식 전적/승률에만 가산.
// (에이스/DF/타이브레이크/베이글/출석 등 경기별 지표는 로우만.)
export function buildPlayerSummary({ rows, player, legacySingles = [] }) {
  const mine = (rows || []).filter(r => r.player === player);
  const blank = () => ({ games: 0, wins: 0, losses: 0, rate: 0 });
  const out = {
    singles: blank(), doubles: blank(),
    attendanceDates: 0,
    aces: 0, doubleFaults: 0, tbPlayed: 0, tbWon: 0, bagelsTaken: 0, bagelsGiven: 0,
  };
  const dates = new Set();

  for (const r of mine) {
    dates.add(r.date);
    out.aces += Number(r.aces) || 0;
    out.doubleFaults += Number(r.double_faults) || 0;
    out.tbPlayed += Number(r.tb_played) || 0;
    out.tbWon += Number(r.tb_won) || 0;
    out.bagelsTaken += Number(r.bagels_taken) || 0;
    out.bagelsGiven += Number(r.bagels_given) || 0;

    const bucket = r.format === '복식' ? out.doubles : out.singles;
    bucket.games++;
    if (r.result === '승') bucket.wins++;
    else if (r.result === '패') bucket.losses++;
  }

  // 집계 단식 전적 가산(예: 2026 1~7월) — 단식 버킷의 W/L·게임수에만.
  for (const L of legacySingles || []) {
    if (String(L?.player) !== String(player)) continue;
    out.singles.wins += Number(L.wins) || 0;
    out.singles.losses += Number(L.losses) || 0;
    out.singles.games += (Number(L.wins) || 0) + (Number(L.losses) || 0);
  }

  for (const b of [out.singles, out.doubles]) b.rate = b.games > 0 ? b.wins / b.games : 0;
  out.attendanceDates = dates.size;
  return out;
}
