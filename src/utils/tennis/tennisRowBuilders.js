// 마감된 테니스 경기 상태 → 시트 2종 행.
// ★ 승자가 정해지지 않은 판(winner === null)은 버린다. 로그에 넣으면 승률이 오염된다.
// match_id 포맷은 R{round}_C{court} — matchRowBuilder.js의 parseMatchIdFutsal과 같은 형식이지만
// 격리를 위해 그 파일을 import하지 않는다.

import { TENNIS_SPORT, COMPETITION_SINGLES, COMPETITION_DOUBLES, COMPETITION_NONE } from './tennisSchema';
import { summarizeCourt } from './tennisScoring';

export function determineCompetition(format, sideA, sideB, memberSet) {
  const all = [...(sideA || []), ...(sideB || [])];
  const memberCount = all.filter(n => memberSet && memberSet.has(n)).length;
  if (format === '단식') {
    return memberCount === all.length && all.length === 2 ? COMPETITION_SINGLES : COMPETITION_NONE;
  }
  if (format === '복식') {
    return all.length === 4 && memberCount >= 3 ? COMPETITION_DOUBLES : COMPETITION_NONE;
  }
  return COMPETITION_NONE;
}

// 완료된 코트만 (roundIdx, court, summary) 형태로 평탄화. match_idx는 그날 일련번호.
function finishedCourts(state) {
  const out = [];
  for (const round of (state.rounds || [])) {
    for (const court of (round.courts || [])) {
      const summary = summarizeCourt(court);
      if (!summary.winner) continue;
      out.push({ roundIdx: round.roundIdx, court, summary });
    }
  }
  return out.map((x, i) => ({ ...x, matchIdx: i + 1 }));
}

export function serializeSets(sets) {
  return JSON.stringify((sets || []).map(s => {
    const o = { a: s.a || 0, b: s.b || 0 };
    if ((s.tbA || 0) > 0 || (s.tbB || 0) > 0) { o.tbA = s.tbA || 0; o.tbB = s.tbB || 0; }
    return o;
  }));
}

export function buildTennisMatchRows({ team, state, inputTime, inputBy, memberSet }) {
  if (!state) return [];
  return finishedCourts(state).map(({ roundIdx, court, summary, matchIdx }) => ({
    team,
    sport: TENNIS_SPORT,
    season: state.season,
    date: state.gameDate || '',
    game_id: state.gameId || '',
    round_idx: roundIdx,
    court_id: court.courtId,
    match_idx: matchIdx,
    match_id: `R${roundIdx}_C${court.courtId}`,
    format: court.format,
    best_of: court.bestOf,
    side_a_json: JSON.stringify(court.sideA || []),
    side_b_json: JSON.stringify(court.sideB || []),
    sets_json: serializeSets(court.sets),
    sets_a: summary.setsA,
    sets_b: summary.setsB,
    games_a: summary.gamesA,
    games_b: summary.gamesB,
    winner: summary.winner,
    league: determineCompetition(court.format, court.sideA, court.sideB, memberSet),
    input_time: inputTime || '',
    input_by: inputBy || '',
  }));
}

export function buildTennisPlayerGameRows({ team, state, inputTime, inputBy, memberSet, gradeByPlayer }) {
  if (!state) return [];
  const rows = [];

  for (const { roundIdx, court, summary, matchIdx } of finishedCourts(state)) {
    const league = determineCompetition(court.format, court.sideA, court.sideB, memberSet);
    const matchId = `R${roundIdx}_C${court.courtId}`;

    for (const side of ['A', 'B']) {
      const mine = side === 'A' ? (court.sideA || []) : (court.sideB || []);
      const theirs = side === 'A' ? (court.sideB || []) : (court.sideA || []);

      for (const player of mine) {
        const isGuest = !(memberSet && memberSet.has(player));
        const st = (court.stats && court.stats[player]) || {};
        rows.push({
          team,
          sport: TENNIS_SPORT,
          season: state.season,
          date: state.gameDate || '',
          game_id: state.gameId || '',
          match_id: matchId,
          round_idx: roundIdx,
          court_id: court.courtId,
          player,
          is_guest: isGuest,
          side,
          format: court.format,
          best_of: court.bestOf,
          partner: mine.filter(n => n !== player)[0] || '',
          opponents_json: JSON.stringify(theirs),
          result: summary.winner === side ? '승' : '패',
          sets_won: side === 'A' ? summary.setsA : summary.setsB,
          sets_lost: side === 'A' ? summary.setsB : summary.setsA,
          games_won: side === 'A' ? summary.gamesA : summary.gamesB,
          games_lost: side === 'A' ? summary.gamesB : summary.gamesA,
          tb_played: summary.tbPlayed,
          tb_won: side === 'A' ? summary.tbWonA : summary.tbWonB,
          aces: st.aces || 0,
          double_faults: st.df || 0,
          bagels_taken: side === 'A' ? summary.bagelsGivenB : summary.bagelsGivenA,
          bagels_given: side === 'A' ? summary.bagelsGivenA : summary.bagelsGivenB,
          // 용병은 명부에 없어 등급이 없다. 빈 문자열로 두고 rankPoints가 건너뛰게 한다.
          grade_at_date: isGuest ? '' : ((gradeByPlayer && gradeByPlayer[player]) || ''),
          league,
          input_time: inputTime || '',
          input_by: inputBy || '',
        });
      }
    }
  }
  return rows;
}
