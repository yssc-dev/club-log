// 모닝피스클럽 시트의 2026 복식 판별 기록 → 로그_테니스매치/로그_테니스선수경기 행.
// 스코어→집계는 summarizeCourt를 재사용한다(재발명 금지, 스펙 §4.2).
// 6-5의 tbA/tbB=1은 TB "발생 표식"이다 — 실제 TB 점수는 소스에 없다.
import { TENNIS_SPORT } from './tennisSchema';
import { summarizeCourt } from './tennisScoring';
import { determineCompetition, serializeSets } from './tennisRowBuilders';

export function deriveNameMap(roster, overrides = {}) {
  const map = new Map();
  const ambiguous = new Set();
  for (const m of roster || []) {
    if (!m || !m.name) continue;
    const abbrev = m.name.length >= 3 ? m.name.slice(1) : m.name;
    if (map.has(abbrev)) { ambiguous.add(abbrev); map.delete(abbrev); continue; }
    if (ambiguous.has(abbrev)) continue;
    map.set(abbrev, { name: m.name, grade: m.grade || '' });
  }
  for (const [abbrev, fullName] of Object.entries(overrides)) {
    const member = (roster || []).find(m => m.name === fullName);
    if (member) { map.set(abbrev, { name: member.name, grade: member.grade || '' }); ambiguous.delete(abbrev); }
  }
  return { map, ambiguous: [...ambiguous] };
}

export function parseDoublesTab(rows2d, { expectMonth } = {}) {
  const matches = [];
  const skipped = [];
  (rows2d || []).forEach((row, rowIdx) => {
    const date = String(row?.[1] || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return; // 헤더/빈 행
    const [a1, a2, b1, b2] = [2, 3, 4, 5].map(i => String(row[i] || '').trim());
    const scoreA = row[7] === '' || row[7] === undefined ? null : Number(row[7]);
    const scoreB = row[8] === '' || row[8] === undefined ? null : Number(row[8]);
    if (!a1 || !a2 || !b1 || !b2) { skipped.push({ rowIdx, reason: '선수 누락' }); return; }
    if (scoreA === null || scoreB === null || Number.isNaN(scoreA) || Number.isNaN(scoreB)) {
      skipped.push({ rowIdx, reason: '점수 누락' }); return;
    }
    if (scoreA === scoreB) { skipped.push({ rowIdx, reason: `동점 ${scoreA}-${scoreB}` }); return; }
    if (expectMonth && !date.startsWith(expectMonth)) { skipped.push({ rowIdx, reason: `월 불일치 ${date}` }); return; }
    matches.push({ date, a1, a2, b1, b2, scoreA, scoreB });
  });
  return { matches, skipped };
}

const resolve = (nameMap, raw) => {
  const hit = nameMap.get(raw);
  return hit ? { name: hit.name, grade: hit.grade, isMember: true }
             : { name: raw, grade: '', isMember: false };
};

export function buildLegacyDoublesRows({ team, matches, nameMap, inputTime }) {
  const matchRows = [];
  const playerGameRows = [];
  const report = { byMonth: {}, guests: {}, leagueDist: {}, nonStandardScores: [] };
  const seqByDate = new Map();

  for (const m of matches || []) {
    const n = (seqByDate.get(m.date) || 0) + 1;
    seqByDate.set(m.date, n);

    const sideA = [m.a1, m.a2].map(r => resolve(nameMap, r));
    const sideB = [m.b1, m.b2].map(r => resolve(nameMap, r));
    const memberSet = new Set([...sideA, ...sideB].filter(p => p.isMember).map(p => p.name));
    const league = determineCompetition('복식',
      sideA.map(p => p.name), sideB.map(p => p.name), memberSet);

    const isTb = (m.scoreA === 6 && m.scoreB === 5) || (m.scoreA === 5 && m.scoreB === 6);
    const set = { a: m.scoreA, b: m.scoreB };
    if (isTb) { if (m.scoreA > m.scoreB) { set.tbA = 1; set.tbB = 0; } else { set.tbA = 0; set.tbB = 1; } }
    const summary = summarizeCourt({ sets: [set], bestOf: 1 });

    let winner = summary.winner;
    let { setsA, setsB } = summary;
    if (!winner) { // 6 미만 우세 점수(시간제 판) — 우세승
      winner = m.scoreA > m.scoreB ? 'A' : 'B';
      setsA = winner === 'A' ? 1 : 0;
      setsB = winner === 'B' ? 1 : 0;
      report.nonStandardScores.push({ date: m.date, score: `${m.scoreA}-${m.scoreB}` });
    }

    const gameId = `legacy_${m.date}`;
    const matchId = `R${n}_C1`;
    matchRows.push({
      team, sport: TENNIS_SPORT, season: 2026, date: m.date, game_id: gameId,
      round_idx: n, court_id: 1, match_idx: n, match_id: matchId,
      format: '복식', best_of: 1,
      side_a_json: JSON.stringify(sideA.map(p => p.name)),
      side_b_json: JSON.stringify(sideB.map(p => p.name)),
      sets_json: serializeSets([set]),
      sets_a: setsA, sets_b: setsB, games_a: summary.gamesA, games_b: summary.gamesB,
      winner, league, input_time: inputTime,
    });

    for (const [side, mates, opps] of [['A', sideA, sideB], ['B', sideB, sideA]]) {
      const won = winner === side;
      for (const p of mates) {
        const partner = mates.find(x => x !== p);
        if (!p.isMember) report.guests[p.name] = (report.guests[p.name] || 0) + 1;
        playerGameRows.push({
          team, sport: TENNIS_SPORT, season: 2026, date: m.date, game_id: gameId,
          match_id: matchId, round_idx: n, court_id: 1,
          player: p.name, is_guest: !p.isMember, side, format: '복식', best_of: 1,
          partner: partner.name,
          opponents_json: JSON.stringify(opps.map(x => x.name)),
          result: won ? '승' : '패',
          sets_won: won ? 1 : 0, sets_lost: won ? 0 : 1,
          games_won: side === 'A' ? summary.gamesA : summary.gamesB,
          games_lost: side === 'A' ? summary.gamesB : summary.gamesA,
          tb_played: summary.tbPlayed, tb_won: won ? summary.tbPlayed : 0,
          aces: '', double_faults: '',
          bagels_taken: side === 'A' ? summary.bagelsGivenB : summary.bagelsGivenA,
          bagels_given: side === 'A' ? summary.bagelsGivenA : summary.bagelsGivenB,
          grade_at_date: p.grade, league, input_time: inputTime,
        });
      }
    }

    const month = m.date.slice(0, 7);
    report.byMonth[month] = (report.byMonth[month] || 0) + 1;
    report.leagueDist[league] = (report.leagueDist[league] || 0) + 1;
  }
  return { matchRows, playerGameRows, report };
}
