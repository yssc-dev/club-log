// 로그_테니스선수경기 행 → 단식 순위표 / 개인 전적 요약.
// 순위는 승률로 매기고 포인트는 별도 컬럼으로 적립한다(스펙 4.5).

import { COMPETITION_SINGLES, COMPETITION_DOUBLES } from './tennisSchema';
import { deriveLeagueForDate, singlesWinRatesBefore } from './leagueDerivation';
import { calcMatchPoints, DEFAULT_POINT_RULES } from './rankPoints';

const isSingles = (r) => r.format === '단식' && r.league === COMPETITION_SINGLES;

export function buildSinglesStandings({ rows, roster, asOfDate, pointRules = DEFAULT_POINT_RULES }) {
  const list = (roster || []).filter(m => m && m.name);
  const acc = new Map(list.map(m => [m.name, {
    name: m.name, grade: m.grade || '', games: 0, wins: 0, losses: 0, rate: 0, points: 0,
  }]));

  const singles = (rows || []).filter(r => isSingles(r) && r.is_guest !== true);

  for (const r of singles) {
    const cur = acc.get(r.player);
    if (!cur) continue;               // 로스터 밖(용병/탈퇴)은 순위표에 넣지 않는다
    cur.games++;
    if (r.result === '승') cur.wins++;
    else if (r.result === '패') cur.losses++;
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
    const leagueMap = deriveLeagueForDate({ rows: singles, dateISO: date, roster: list });
    const rates = singlesWinRatesBefore(singles, date);
    const rateOf = (n) => rates.get(n)?.rate ?? 0;

    const pairs = new Map();
    for (const r of dayRows) {
      const k = `${r.game_id || ''}|${r.match_id}`;
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

  const finalLeague = deriveLeagueForDate({ rows: singles, dateISO: asOfDate, roster: list });
  return [...acc.values()]
    .map(x => ({ ...x, leagueTier: finalLeague[x.name] }))
    .sort((a, b) => b.rate - a.rate || b.wins - a.wins || String(a.name).localeCompare(String(b.name), 'ko'));
}

export function buildPlayerSummary({ rows, player }) {
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

  for (const b of [out.singles, out.doubles]) b.rate = b.games > 0 ? b.wins / b.games : 0;
  out.attendanceDates = dates.size;
  return out;
}
