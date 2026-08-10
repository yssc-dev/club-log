#!/usr/bin/env node
// 모닝피스클럽 시트 '2024시즌 전적'/'2025시즌 전적' → 테니스_레거시전적 적재.
// 시즌시작순위는 출력만(시트에 쓰지 않음, 스펙 §4.3). 기본 dry-run, --apply로 적재.
// 가드: getTennisLegacyRecords가 비어있지 않으면 중단(재실행은 유저가 시트에서 수동 삭제 후).
import process from 'node:process';
import * as XLSX from 'xlsx';
import { deriveNameMap }
  from '../../src/utils/tennis/legacyDoublesTransform.js';

const YEAR_TABS = [
  { tab: '2024시즌 전적', season: 2024 },
  { tab: '2025시즌 전적', season: 2025 },
];
// 시즌 시작 순위 표 탭: A열 3행째부터 빈 값 전까지가 순위 목록
const RANK_TABS = ['단식리그 길로틴 전적(1그룹)', '단식 리그 길로틴 전적(2그룹)'];

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

// 2) 명부 → 이름 매핑 (복식 스크립트와 동일 패턴)
const roster = (await post({ action: 'getTennisRoster' })).players || [];
const overrides = Object.fromEntries((args.override || []).map(s => s.split('=')));
const { map: nameMap, ambiguous } = deriveNameMap(roster, overrides);
if (ambiguous.length) die(`축약명 충돌: ${ambiguous.join(', ')} — --override 축약명=실명 으로 해소 후 재실행`);

// 3) YEAR_TABS 파싱 → legacyRows 누적
// 열 인덱스: A=이름(0), B=복식승(1), C=복식패(2), F=단식승(5), G=단식패(6). 데이터는 3행째(index 2)부터.
const legacyRows = [];
const unmapped = new Set();

for (const { tab, season } of YEAR_TABS) {
  const ws = wb.Sheets[tab];
  if (!ws) { console.warn(`탭 없음: ${tab} — 건너뜀`); continue; }
  // null→'' 정규화: raw:false에서 행 중간 빈 셀이 null로 올 수 있어 Number(null)=0 오인 방지.
  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
  const rows2d = rawRows.map(row => row.map(cell => (cell === null ? '' : cell)));

  for (const row of rows2d.slice(2)) {
    const abbrev = String(row?.[0] || '').trim();
    if (!abbrev || abbrev === '이름') continue;
    const hit = nameMap.get(abbrev);
    const player = hit ? hit.name : abbrev; // 탈퇴 회원 등 미매핑은 축약명 그대로(표시 전용)
    if (!hit) unmapped.add(abbrev);

    for (const [format, wIdx, lIdx] of [['복식', 1, 2], ['단식', 5, 6]]) {
      const rawW = row[wIdx] ?? '';
      const rawL = row[lIdx] ?? '';
      const wins = Number(rawW);
      const losses = Number(rawL);
      // 둘 다 NaN이면 해당 포맷 기록 없음 — 건너뜀
      if (Number.isNaN(wins) && Number.isNaN(losses)) continue;
      legacyRows.push({
        team: args.team, sport: '테니스', season, format, player,
        wins: Number.isNaN(wins) ? 0 : wins,
        losses: Number.isNaN(losses) ? 0 : losses,
      });
    }
  }
}

// 4) dry-run 출력 (항상)
console.log('=== 레거시 전적 (dry-run) ===');
for (const r of legacyRows)
  console.log(`  ${r.season} ${r.format} ${r.player}: ${r.wins}승 ${r.losses}패`);
console.log(`총 ${legacyRows.length}행`);
if (unmapped.size) console.log('미매핑(탈퇴·미등록 등):', [...unmapped].join(', '));
else console.log('미매핑: 없음');

// 5) 시즌시작순위 표 출력만 (시트에 쓰지 않음 — 테니스_회원명부는 진실 소스, 유저 수동 기입)
for (const tabName of RANK_TABS) {
  const ws = wb.Sheets[tabName];
  if (!ws) { console.log(`\n=== 시즌시작순위: ${tabName} ===\n  (탭 없음 — 건너뜀)`); continue; }
  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
  const rows2d = rawRows.map(row => row.map(cell => (cell === null ? '' : cell)));
  console.log(`\n=== 시즌시작순위: ${tabName} ===`);
  let rank = 1;
  for (const row of rows2d.slice(2)) {
    const abbrev = String(row?.[0] || '').trim();
    if (!abbrev) break; // 빈 A열이 나오면 순위 목록 끝
    const hit = nameMap.get(abbrev);
    const name = hit ? hit.name : abbrev;
    console.log(`  ${rank}. ${name}${hit ? '' : ' (미매핑)'}`);
    rank++;
  }
  if (rank === 1) console.log('  (항목 없음)');
}

if (!args.apply) { console.log('\ndry-run 완료 — 적재하려면 --apply'); process.exit(0); }

// 6) 재실행 가드: 이미 레거시 전적이 있으면 중단
const existingResp = await post({ action: 'getTennisLegacyRecords' });
const existingRows = existingResp.rows || [];
if (existingRows.length)
  die(`테니스_레거시전적이 이미 ${existingRows.length}행 있음 — 시트에서 수동 삭제 후 재실행`);

// 7) 일괄 전송 (배치 200행)
for (let i = 0; i < legacyRows.length; i += 200) {
  const batch = legacyRows.slice(i, i + 200);
  const r = await post({ action: 'writeTennisLegacyRecords', data: { rows: batch } });
  console.log(`writeTennisLegacyRecords ${i + 1}~${Math.min(i + 200, legacyRows.length)}/${legacyRows.length} (count=${r.count})`);
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
