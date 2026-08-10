#!/usr/bin/env node
// 모닝피스클럽 시트 'N월 복식 기록'(2026 1~7월) → 로그_테니스매치/로그_테니스선수경기 적재.
// 기본 dry-run: 매핑·게스트·league 분포·판수 검산 리포트만 출력. --apply로 실제 적재.
// 가드: 로그에 legacy_ game_id가 이미 있으면 중단(재적재는 유저가 시트에서 수동 삭제 후).
import process from 'node:process';
import * as XLSX from 'xlsx';
import { deriveNameMap, parseDoublesTab, buildLegacyDoublesRows }
  from '../../src/utils/tennis/legacyDoublesTransform.js';

const EXPECTED_BY_MONTH = { '2026-01': 73, '2026-02': 80, '2026-03': 97, '2026-04': 76, '2026-05': 57, '2026-06': 59, '2026-07': 57 };
const TABS = [1, 2, 3, 4, 5, 6, 7].map(m => ({ tab: `${m}월 복식 기록`, month: `2026-0${m}` }));

const args = parseArgs(process.argv.slice(2));
const URL_ = process.env.APPS_SCRIPT_URL;
const SHEET_ID = process.env.SHEET_ID;
if (!URL_ || !SHEET_ID) die('APPS_SCRIPT_URL, SHEET_ID 환경변수 필수');
if (!args.team) die('--team 필수 — 빈 team은 Apps Script 팀 격리를 우회한다(전송 거부)');
if (!args.auth || !args.auth.includes(':')) die('--auth "이름:전화4" 필수');
const authToken = `${args.team}:${args.auth}`;

async function post(payload) {
  const resp = await fetch(URL_, {
    method: 'POST', headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ ...payload, team: args.team, authToken }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const r = await resp.json();
  if (!r || r.success === false) throw new Error(r?.error || '서버 응답 오류');
  return r;
}

// 1) 소스 xlsx 1회 다운로드
const buf = await (await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`)).arrayBuffer();
const wb = XLSX.read(buf, { type: 'array' });

// 2) 명부 → 이름 매핑
const roster = (await post({ action: 'getTennisRoster' })).players || [];
const overrides = Object.fromEntries((args.override || []).map(s => s.split('=')));
const { map: nameMap, ambiguous } = deriveNameMap(roster, overrides);
if (ambiguous.length) die(`축약명 충돌: ${ambiguous.join(', ')} — --override 축약명=실명 으로 해소 후 재실행`);

// 3) 탭 파싱 → 변환
const allMatches = [];
const allSkipped = [];
for (const { tab, month } of TABS) {
  const ws = wb.Sheets[tab];
  if (!ws) die(`탭 없음: ${tab}`);
  // null→'' 정규화: raw:false에서 빈 셀은 보통 undefined를 반환하지만
  // 행 중간의 빈 셀이 null로 올 수 있어 Number(null)=0 오인 방지.
  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
  const rows2d = rawRows.map(row => row.map(cell => (cell === null ? '' : cell)));
  const { matches, skipped } = parseDoublesTab(rows2d, { expectMonth: month });
  allMatches.push(...matches);
  allSkipped.push(...skipped.map(s => ({ ...s, tab })));
}
const inputTime = new Date().toISOString().replace('T', ' ').slice(0, 19);
const { matchRows, playerGameRows, report } = buildLegacyDoublesRows({ team: args.team, matches: allMatches, nameMap, inputTime });

// 4) dry-run 리포트 (항상 출력)
console.log('=== 이름 매핑 ===');
for (const [ab, v] of [...nameMap].sort()) console.log(`  ${ab} → ${v.name} (${v.grade || '-'})`);
console.log('=== 게스트(명부 밖, is_guest=true) ===', report.guests);
console.log('=== league 분포 ===', report.leagueDist);
console.log('=== 월별 판수 (기대치 대비) ===');
for (const [month, cnt] of Object.entries(report.byMonth))
  console.log(`  ${month}: ${cnt}판 ${EXPECTED_BY_MONTH[month] === cnt ? 'OK' : `!! 기대 ${EXPECTED_BY_MONTH[month]}`}`);
console.log('=== 제외 행 ===', allSkipped.length ? allSkipped : '없음');
console.log('=== 비표준 점수(우세승 처리) ===', report.nonStandardScores.length ? report.nonStandardScores : '없음');
console.log(`매치 ${matchRows.length}행 / 선수경기 ${playerGameRows.length}행`);

if (!args.apply) { console.log('\ndry-run 완료 — 적재하려면 --apply'); process.exit(0); }

// 5) 재실행 가드 → 적재 (매치 먼저, 200행 배치)
const existing = (await post({ action: 'getTennisPlayerGames' })).rows || [];
if (existing.some(r => String(r.game_id || '').startsWith('legacy_')))
  die('로그에 legacy_ 행이 이미 있음 — 수동 삭제 후 재실행');
for (const [action, rows] of [['writeTennisMatches', matchRows], ['writeTennisPlayerGames', playerGameRows]]) {
  for (let i = 0; i < rows.length; i += 200) {
    const r = await post({ action, data: { rows: rows.slice(i, i + 200) } });
    console.log(`${action} ${i + 1}~${Math.min(i + 200, rows.length)}/${rows.length} (count=${r.count})`);
  }
}
console.log('적재 완료');

function parseArgs(argv) {
  const out = { override: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') out.apply = true;
    else if (argv[i] === '--override') out.override.push(argv[++i]);
    else if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[++i];
  }
  return out;
}
function die(msg) { console.error(msg); process.exit(1); }
