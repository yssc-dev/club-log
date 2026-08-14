#!/usr/bin/env node
// 실행: APPS_SCRIPT_URL=... SHEET_ID=... npx vite-node scripts/migrate/tennisJulyDetail.mjs --team 몽피스 --auth "이름:전화4" [--apply]
// 7월 신규 복식(7/24·27·29·30, 11판) + 단식 상세(9경기)를 로그_테니스매치/선수경기에 적재.
//  - 복식은 buildLegacyDoublesRows(court_id=1). 단식은 court_id=2로 같은 날 복식과 충돌 방지.
//  - 재실행 가드: 삽입할 (game_id|match_id)가 이미 있으면 중단.
//  - 집계(테니스_레거시전적 2026 단식)는 append-only API라 여기서 안 건드림 —
//    아래 dry-run이 출력하는 '차감 후 16행'으로 유저가 시트에서 교체(삭제 후 재붙여넣기).
// 기본 dry-run. --apply로 실제 적재.
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { deriveNameMap, buildLegacyDoublesRows } from '../../src/utils/tennis/legacyDoublesTransform.js';
import { summarizeCourt } from '../../src/utils/tennis/tennisScoring.js';
import { determineCompetition, serializeSets } from '../../src/utils/tennis/tennisRowBuilders.js';
import { TENNIS_SPORT } from '../../src/utils/tennis/tennisSchema.js';

// ── 검증된 데이터 (유저 확인 ①②) ────────────────────────────────
const DOUBLES = [ // {date,a1,a2,b1,b2,scoreA,scoreB}
  { date: '2026-07-24', a1: '성언', a2: '현철', b1: '상국', b2: '재민', scoreA: 6, scoreB: 4 },
  { date: '2026-07-24', a1: '성언', a2: '상국', b1: '재민', b2: '현철', scoreA: 6, scoreB: 5 },
  { date: '2026-07-27', a1: '성언', a2: '두리', b1: '승환', b2: '상국', scoreA: 5, scoreB: 6 }, // 두리=게스트→번외
  { date: '2026-07-27', a1: '승환', a2: '성환', b1: '다빈', b2: '두리', scoreA: 6, scoreB: 2 },
  { date: '2026-07-27', a1: '성환', a2: '다빈', b1: '상국', b2: '두리', scoreA: 6, scoreB: 2 },
  { date: '2026-07-29', a1: '성언', a2: '상국', b1: '철우', b2: '재민', scoreA: 6, scoreB: 4 },
  { date: '2026-07-29', a1: '성언', a2: '재민', b1: '철우', b2: '상국', scoreA: 3, scoreB: 6 },
  { date: '2026-07-29', a1: '성언', a2: '철우', b1: '상국', b2: '재민', scoreA: 6, scoreB: 2 },
  { date: '2026-07-30', a1: '성언', a2: '준태', b1: '재민', b2: '다빈', scoreA: 6, scoreB: 5 },
  { date: '2026-07-30', a1: '성언', a2: '다빈', b1: '재민', b2: '준태', scoreA: 6, scoreB: 1 },
  { date: '2026-07-30', a1: '성언', a2: '재민', b1: '준태', b2: '다빈', scoreA: 6, scoreB: 2 },
];
const SINGLES = [ // {date, a, b, scoreA, scoreB}  (a=왼쪽)
  { date: '2026-07-20', a: '성언', b: '재민', scoreA: 6, scoreB: 4 },
  { date: '2026-07-20', a: '성언', b: '다빈', scoreA: 6, scoreB: 1 },
  { date: '2026-07-20', a: '철우', b: '성언', scoreA: 0, scoreB: 6 },
  { date: '2026-07-22', a: '성언', b: '준태', scoreA: 6, scoreB: 1 },
  { date: '2026-07-22', a: '상국', b: '준철', scoreA: 6, scoreB: 0 },
  { date: '2026-07-22', a: '현철', b: '원희', scoreA: 6, scoreB: 5 },
  { date: '2026-07-22', a: '준철', b: '준태', scoreA: 6, scoreB: 0 },
  { date: '2026-07-27', a: '다빈', b: '성환', scoreA: 6, scoreB: 1 },
  { date: '2026-07-27', a: '성언', b: '상국', scoreA: 6, scoreB: 2 },
];

const args = parseArgs(process.argv.slice(2));
let URL_ = process.env.APPS_SCRIPT_URL;
if (!URL_) { // .env의 VITE_APPS_SCRIPT_URL 폴백
  try { URL_ = (readFileSync(new URL('../../.env', import.meta.url), 'utf8').match(/^VITE_APPS_SCRIPT_URL=(.*)$/m) || [])[1]?.trim(); } catch { /* noop */ }
}
if (!args.offline) {
  if (!URL_) die('APPS_SCRIPT_URL 환경변수(또는 .env VITE_APPS_SCRIPT_URL) 필수');
  if (!args.team) die('--team 필수 (빈 team은 팀 격리 우회 → 전송 거부)');
  if (!args.auth || !args.auth.includes(':')) die('--auth "이름:전화4" 필수');
}
const authToken = `${args.team || ''}:${args.auth || ''}`;
const inputTime = new Date().toISOString().replace('T', ' ').slice(0, 19);

async function post(payload) {
  const resp = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ ...payload, team: args.team, authToken }) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const r = await resp.json();
  if (!r || r.success === false) throw new Error(r?.error || '서버 응답 오류');
  return r;
}

// ── 단식 빌더 (court_id=2) ──────────────────────────────────────
function buildSinglesRows({ team, matches, nameMap, inputTime }) {
  const matchRows = [], playerGameRows = [];
  const report = { byDate: {}, leagueDist: {}, guests: {} };
  const seqByDate = new Map();
  const resolve = (raw) => { const h = nameMap.get(raw); return h ? { name: h.name, grade: h.grade, isMember: true } : { name: raw, grade: '', isMember: false }; };
  for (const m of matches) {
    const n = (seqByDate.get(m.date) || 0) + 1; seqByDate.set(m.date, n);
    const A = resolve(m.a), B = resolve(m.b);
    const memberSet = new Set([A, B].filter(p => p.isMember).map(p => p.name));
    const league = determineCompetition('단식', [A.name], [B.name], memberSet);
    const isTb = (m.scoreA === 6 && m.scoreB === 5) || (m.scoreA === 5 && m.scoreB === 6);
    const set = { a: m.scoreA, b: m.scoreB };
    if (isTb) { if (m.scoreA > m.scoreB) { set.tbA = 1; set.tbB = 0; } else { set.tbA = 0; set.tbB = 1; } }
    const summary = summarizeCourt({ sets: [set], bestOf: 1 });
    let winner = summary.winner, { setsA, setsB } = summary;
    if (!winner) { winner = m.scoreA > m.scoreB ? 'A' : 'B'; setsA = winner === 'A' ? 1 : 0; setsB = winner === 'B' ? 1 : 0; }
    const gameId = `legacy_${m.date}`, matchId = `R${n}_C2`;
    matchRows.push({ team, sport: TENNIS_SPORT, season: 2026, date: m.date, game_id: gameId,
      round_idx: n, court_id: 2, match_idx: n, match_id: matchId, format: '단식', best_of: 1,
      side_a_json: JSON.stringify([A.name]), side_b_json: JSON.stringify([B.name]),
      sets_json: serializeSets([set]), sets_a: setsA, sets_b: setsB, games_a: summary.gamesA, games_b: summary.gamesB,
      winner, league, input_time: inputTime });
    for (const [side, P, O] of [['A', A, B], ['B', B, A]]) {
      const won = winner === side;
      if (!P.isMember) report.guests[P.name] = (report.guests[P.name] || 0) + 1;
      playerGameRows.push({ team, sport: TENNIS_SPORT, season: 2026, date: m.date, game_id: gameId,
        match_id: matchId, round_idx: n, court_id: 2, player: P.name, is_guest: !P.isMember, side,
        format: '단식', best_of: 1, partner: '', opponents_json: JSON.stringify([O.name]),
        result: won ? '승' : '패', sets_won: won ? 1 : 0, sets_lost: won ? 0 : 1,
        games_won: side === 'A' ? summary.gamesA : summary.gamesB, games_lost: side === 'A' ? summary.gamesB : summary.gamesA,
        tb_played: summary.tbPlayed, tb_won: won ? summary.tbPlayed : 0, aces: '', double_faults: '',
        bagels_taken: side === 'A' ? summary.bagelsGivenB : summary.bagelsGivenA,
        bagels_given: side === 'A' ? summary.bagelsGivenA : summary.bagelsGivenB,
        grade_at_date: P.grade, league, input_time: inputTime });
    }
    report.byDate[m.date] = (report.byDate[m.date] || 0) + 1;
    report.leagueDist[league] = (report.leagueDist[league] || 0) + 1;
  }
  return { matchRows, playerGameRows, report };
}

// ── 오프라인 검증용 하드코딩(실측 명부·집계) ───────────────────
const OFFLINE_ROSTER = [
  { name: '박성언', grade: '은배' }, { name: '남현철', grade: '동배' }, { name: '박상국', grade: '은배' },
  { name: '석재민', grade: '동배' }, { name: '이승환', grade: '동배' }, { name: '김성환', grade: '동배' },
  { name: '기다빈', grade: '동배' }, { name: '박철우', grade: '은배' }, { name: '박준태', grade: '은배' },
  { name: '문준철', grade: '동배' }, { name: '김원희', grade: '은배' }, { name: '박정현', grade: '은배' },
  { name: '윤학모', grade: '동배' }, { name: '공윤택', grade: '동배' }, { name: '문형민', grade: '동배' },
  { name: '신대철', grade: '동배' },
];
const OFFLINE_LEGACY = [
  ['박성언', 71, 4], ['박정현', 2, 1], ['남현철', 4, 8], ['문준철', 2, 11], ['박철우', 6, 9], ['박상국', 8, 8],
  ['김원희', 6, 19], ['기다빈', 1, 2], ['박준태', 1, 14], ['공윤택', 0, 10], ['김성환', 5, 4], ['윤학모', 4, 8],
  ['석재민', 1, 6], ['문형민', 0, 3], ['신대철', 2, 5], ['이승환', 1, 5],
].map(([player, wins, losses]) => ({ season: '2026', format: '단식', player, wins, losses }));

// ── 실행 ────────────────────────────────────────────────────────
const roster = args.offline ? OFFLINE_ROSTER : ((await post({ action: 'getTennisRoster' })).players || []);
const { map: nameMap, ambiguous } = deriveNameMap(roster);
if (ambiguous.length) die(`축약명 충돌: ${ambiguous.join(', ')}`);

const dbl = buildLegacyDoublesRows({ team: args.team, matches: DOUBLES, nameMap, inputTime });
const sgl = buildSinglesRows({ team: args.team, matches: SINGLES, nameMap, inputTime });
const matchRows = [...dbl.matchRows, ...sgl.matchRows];
const playerGameRows = [...dbl.playerGameRows, ...sgl.playerGameRows];

// 집계 차감 계산
const legacy = args.offline ? OFFLINE_LEGACY : ((await post({ action: 'getTennisLegacyRecords' })).rows || []);
const agg = new Map(); // 풀네임 → {wins,losses}
for (const r of legacy) if (String(r.season) === '2026' && r.format === '단식') agg.set(r.player, { wins: Number(r.wins) || 0, losses: Number(r.losses) || 0 });
const before = new Map([...agg].map(([k, v]) => [k, { ...v }]));
const resolveName = (raw) => nameMap.get(raw)?.name || raw;
let subW = 0, subL = 0;
for (const m of SINGLES) {
  const winRaw = m.scoreA > m.scoreB ? m.a : m.b, loseRaw = m.scoreA > m.scoreB ? m.b : m.a;
  const wn = resolveName(winRaw), ln = resolveName(loseRaw);
  if (agg.has(wn)) { agg.get(wn).wins -= 1; subW++; }
  if (agg.has(ln)) { agg.get(ln).losses -= 1; subL++; }
}

console.log('=== 이름 매핑(게스트=명부밖) ===');
console.log('  두리 게스트?', !nameMap.has('두리'));
console.log('=== 복식 신규(7/24~30) ===', dbl.report.byMonth, 'league:', dbl.report.leagueDist, 'guests:', dbl.report.guests);
console.log('=== 단식 상세 ===', sgl.report.byDate, 'league:', sgl.report.leagueDist);
console.log(`매치 ${matchRows.length}행 / 선수경기 ${playerGameRows.length}행 (복식 ${dbl.matchRows.length}판 + 단식 ${sgl.matchRows.length}판)`);
console.log(`\n=== 집계 차감(단식) : ${subW}승 ${subL}패 빼기 ===`);
let tw = 0, tl = 0;
for (const [name, v] of agg) {
  const b = before.get(name);
  const changed = b.wins !== v.wins || b.losses !== v.losses;
  tw += v.wins; tl += v.losses;
  console.log(`  ${name}\t${b.wins}-${b.losses} → ${v.wins}-${v.losses}${changed ? '  *' : ''}`);
}
console.log(`  차감 후 합계: ${tw}승 ${tl}패`);
console.log('\n=== 차감 후 붙여넣기용 16행(CSV) — 시트의 기존 2026 단식 16행 삭제 후 이걸로 교체 ===');
for (const [name, v] of agg) console.log(`몽피스,테니스,2026,단식,${name},${v.wins},${v.losses}`);

console.log(`\n[예상 검산] 차감후집계(${tw}-${tl}) + 신규단식로우(${sgl.matchRows.length}-${sgl.matchRows.length}) = ${tw + sgl.matchRows.length}-${tl + sgl.matchRows.length} (원래 114-117이어야 함)`);

if (!args.apply) { console.log('\n[dry-run] 상세 로우 적재하려면 --apply. (집계 16행은 위 CSV로 유저가 시트에서 교체)'); process.exit(0); }

// 재실행 가드: 삽입 키가 이미 있으면 중단
const existing = (await post({ action: 'getTennisPlayerGames' })).rows || [];
const existKeys = new Set(existing.map(r => `${r.game_id || ''}|${r.match_id || ''}`));
const dupes = playerGameRows.map(r => `${r.game_id}|${r.match_id}`).filter(k => existKeys.has(k));
if (dupes.length) die(`이미 존재하는 판 발견(재적재 위험): ${[...new Set(dupes)].join(', ')} — 중단`);

for (const [action, rows] of [['writeTennisMatches', matchRows], ['writeTennisPlayerGames', playerGameRows]]) {
  for (let i = 0; i < rows.length; i += 200) {
    const r = await post({ action, data: { rows: rows.slice(i, i + 200) } });
    console.log(`${action} ${i + 1}~${Math.min(i + 200, rows.length)}/${rows.length} (count=${r.count})`);
  }
}
console.log('\n상세 로우 적재 완료. 이제 집계 16행을 위 CSV로 교체하세요. 그 뒤 검산 스크립트로 최종 확인합니다.');

function parseArgs(argv) { const out = {}; for (let i = 0; i < argv.length; i++) { if (argv[i] === '--apply') out.apply = true; else if (argv[i] === '--offline') out.offline = true; else if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[++i]; } return out; }
function die(msg) { console.error('ERROR:', msg); process.exit(1); }
