# 테니스 2차 (분석 지표 + 레거시 통합) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 몽피스 테니스에 ① `테니스_레거시전적` 시트+API ② 2026 복식 1~7월 로우 마이그레이션 도구 ③ 분석 탭(복식/단식 지표)을 추가한다.

**Architecture:** 순수 계산기(`src/utils/tennis/`)와 얇은 I/O 셸(`scripts/migrate/*.mjs`, React 탭)을 분리한다. 마이그레이션 변환 로직은 기존 `summarizeCourt`/`determineCompetition`/`serializeSets`를 재사용하고, 분석 탭은 시트 2종(`로그_테니스선수경기`+`테니스_레거시전적`)을 읽어 클라이언트에서 계산한다.

**Tech Stack:** React(Vite)+vitest, Google Apps Script, Node 25 스크립트(`node scripts/migrate/*.mjs`), devDep `xlsx`(SheetJS, 스크립트 전용).

**Spec:** `docs/superpowers/specs/2026-08-10-tennis-phase2-design.md` — 이 플랜과 어긋나면 스펙이 이긴다.

## Global Constraints

- 시트 헤더 배열은 `src/utils/tennis/tennisSchema.js` ↔ `apps-script/Code.js`가 **1:1 순서 일치**해야 한다. 한쪽만 고치면 전 컬럼이 밀린다.
- **풋살/축구 코드·시트 무영향.** 테니스 밖 파일 수정은 이 플랜에 명시된 `TeamDashboard.jsx` 탭 배열 한 곳뿐이며, 반드시 `activeSport === "테니스"` 가드 아래에서만 분기한다.
- 마이그레이션 행의 `aces`/`double_faults`는 **빈 문자열 `''`** — 0 금지. `league`는 고정값 금지, 판마다 `determineCompetition` 판정.
- 로그에 `legacy_` 접두어 game_id가 이미 있으면 마이그레이션은 **중단**한다(재실행 가드). 부분 적재 없음.
- 스크립트는 시작 시 `--team` 비어있지 않음을 단언한다(빈 team은 Apps Script 팀 격리 우회).
- **소스 스프레드시트 ID·회원 실명을 리포에 커밋하지 않는다.** ID는 env/CLI로만.
- `apps-script/Code.js` 수정 시 파일 최상단 changelog에 날짜+수정사항 한 줄 추가. Apps Script 반영은 유저 수동(배포 관리→편집→새 버전).
- 차트(월별 흐름 SVG)를 그리는 태스크는 코드 작성 전 **`dataviz` 스킬을 먼저 로드**한다.
- 커밋 메시지는 기존 스타일: `feat(tennis): …` / `chore(tennis): …` 한국어.
- 테스트 실행: `npx vitest run <파일>` (전체는 `npm test`).

---

### Task 1: 테니스_레거시전적 스키마 + API 배선

**Files:**
- Modify: `src/utils/tennis/tennisSchema.js` (컬럼 배열 추가)
- Modify: `apps-script/Code.js` (시트 상수·헤더·액션 2종·changelog)
- Modify: `src/services/tennisSync.js` (getLegacyRecords/writeLegacyRecords)
- Test: `src/utils/tennis/__tests__/tennisSchema.test.js` (블록 추가)

**Interfaces:**
- Produces: `TENNIS_LEGACY_COLUMNS = ['team','sport','season','format','player','wins','losses']` (tennisSchema.js), `TennisSync.getLegacyRecords(): Promise<row[]>`, `TennisSync.writeLegacyRecords(rows): Promise` — row는 컬럼명 키의 객체.

- [ ] **Step 1: 실패하는 테스트 추가** — `tennisSchema.test.js` 파일 끝에 append:

```js
import { TENNIS_LEGACY_COLUMNS } from '../tennisSchema';

describe('TENNIS_LEGACY_COLUMNS', () => {
  it('레거시전적 7컬럼 — Apps Script TENNIS_LEGACY_HEADERS와 1:1', () => {
    expect(TENNIS_LEGACY_COLUMNS).toEqual(
      ['team', 'sport', 'season', 'format', 'player', 'wins', 'losses']);
  });
});
```

(기존 파일이 이미 `import { … } from '../tennisSchema'`를 쓰고 있으면 그 import에 `TENNIS_LEGACY_COLUMNS`만 추가한다.)

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/utils/tennis/__tests__/tennisSchema.test.js` → FAIL (`TENNIS_LEGACY_COLUMNS` undefined)

- [ ] **Step 3: tennisSchema.js에 추가** — `TENNIS_PLAYER_GAME_COLUMNS` 정의 바로 아래:

```js
// 2024·2025 시즌 집계(로우데이터 없는 연도). 통산 = 이 시트 + 로그 실계산 합산.
export const TENNIS_LEGACY_COLUMNS = [
  'team', 'sport', 'season', 'format', 'player', 'wins', 'losses',
];
```

- [ ] **Step 4: 테스트 통과 확인** — 같은 명령 → PASS

- [ ] **Step 5: apps-script/Code.js 수정** — ① 최상단 changelog에 `// 2026-08-10: 테니스_레거시전적 시트+액션 2종(getTennisLegacyRecords, writeTennisLegacyRecords) 추가` ② 기존 `TENNIS_PLAYER_GAME_HEADERS` 아래:

```js
var TENNIS_LEGACY_SHEET = "테니스_레거시전적";
var TENNIS_LEGACY_HEADERS = [
  "team", "sport", "season", "format", "player", "wins", "losses"
];
```

③ `_ensureTennisSheets`의 `defs` 배열에 `[TENNIS_LEGACY_SHEET, TENNIS_LEGACY_HEADERS]` 추가 ④ 액션 라우팅(`getTennisPlayerGames` 분기 근처)에:

```js
    } else if (action === "getTennisLegacyRecords") {
      return _jsonResponse(_getTennisLegacyRecords(requestTeam));
    } else if (action === "writeTennisLegacyRecords") {
      return _jsonResponse(_writeTennisRows(TENNIS_LEGACY_SHEET, TENNIS_LEGACY_HEADERS, body.data));
```

⑤ 테니스 헬퍼 구역에 (주의: `_readTennisRows`는 `date` 컬럼을 전제하므로 재사용 금지 — 레거시전적엔 date가 없다):

```js
function _getTennisLegacyRecords(team) {
  _ensureTennisSheets();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TENNIS_LEGACY_SHEET);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, rows: [] };
  var values = sheet.getRange(2, 1, lastRow - 1, TENNIS_LEGACY_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    if (team && String(v[0]).trim() !== String(team).trim()) continue;
    var obj = {};
    for (var c = 0; c < TENNIS_LEGACY_HEADERS.length; c++) obj[TENNIS_LEGACY_HEADERS[c]] = v[c];
    out.push(obj);
  }
  return { success: true, rows: out };
}
```

- [ ] **Step 6: tennisSync.js에 메서드 추가** — `writePlayerGames` 아래:

```js
  getLegacyRecords() {
    return _safeRead({ action: "getTennisLegacyRecords" }, "rows", []);
  },

  writeLegacyRecords(rows) {
    return _post({ action: "writeTennisLegacyRecords", data: { rows: rows || [] } });
  },
```

- [ ] **Step 7: 전체 테스트 + 커밋**

```bash
npm test && npx eslint src/utils/tennis/tennisSchema.js src/services/tennisSync.js
git add src/utils/tennis/tennisSchema.js src/utils/tennis/__tests__/tennisSchema.test.js src/services/tennisSync.js apps-script/Code.js
git commit -m "feat(tennis): 테니스_레거시전적 시트 스키마+API 배선"
```

---

### Task 2: 마이그레이션 변환기 (순수 함수)

**Files:**
- Modify: `src/utils/tennis/tennisRowBuilders.js` (`serializeSets`를 export로)
- Create: `src/utils/tennis/legacyDoublesTransform.js`
- Test: `src/utils/tennis/__tests__/legacyDoublesTransform.test.js`

**Interfaces:**
- Consumes: `summarizeCourt({sets, bestOf})` (tennisScoring.js), `determineCompetition(format, sideA, sideB, memberSet)` + `serializeSets(sets)` (tennisRowBuilders.js), `TENNIS_SPORT` (tennisSchema.js)
- Produces:
  - `deriveNameMap(roster, overrides = {})` → `{ map: Map<축약명,{name,grade}>, ambiguous: string[] }` — 축약명 = 3글자 이상 실명의 성 뺀 뒤 2글자(`name.slice(1)`), 2글자 이름은 그대로. 같은 축약명 충돌 시 양쪽 다 `ambiguous`에 넣고 map에서 제외(overrides로만 해소). `overrides`는 `{축약명: 실명}`.
  - `parseDoublesTab(rows2d, { expectMonth })` → `{ matches: [{date,a1,a2,b1,b2,scoreA,scoreB}], skipped: [{rowIdx,reason}] }` — rows2d는 xlsx `sheet_to_json(ws,{header:1,raw:false})` 결과. 열 인덱스: 1=날짜, 2~5=선수, 7=A점수, 8=B점수. 날짜 없음/선수 4명 미만/점수 한쪽이라도 없음/동점 → skipped.
  - `buildLegacyDoublesRows({ team, matches, nameMap, inputTime })` → `{ matchRows, playerGameRows, report }` — report는 `{ byMonth: {'2026-01': n, …}, guests: {이름: 판수}, leagueDist: {투몽: n, 미반영: n}, nonStandardScores: [{date,score}] }`.

- [ ] **Step 1: serializeSets export** — `tennisRowBuilders.js`의 `function serializeSets(sets) {` → `export function serializeSets(sets) {`. Run: `npm test` → 기존 전체 PASS 유지 확인.

- [ ] **Step 2: 실패하는 테스트 작성** — `src/utils/tennis/__tests__/legacyDoublesTransform.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { deriveNameMap, parseDoublesTab, buildLegacyDoublesRows } from '../legacyDoublesTransform';

const roster = [
  { name: '박성언', grade: '금배' }, { name: '김원희', grade: '은배' },
  { name: '공윤택', grade: '동배' }, { name: '조원택', grade: '동배' },
  { name: '남현철', grade: '은배' },
];

describe('deriveNameMap', () => {
  it('성 뺀 2글자 축약명으로 매핑한다', () => {
    const { map } = deriveNameMap(roster);
    expect(map.get('성언')).toEqual({ name: '박성언', grade: '금배' });
    expect(map.get('윤택').name).toBe('공윤택');
    expect(map.get('원택').name).toBe('조원택'); // 원택≠윤택 별개 인물
  });
  it('축약명 충돌은 ambiguous로 빼고 overrides로 해소한다', () => {
    const dup = [...roster, { name: '이성언', grade: '초보자' }];
    const out = deriveNameMap(dup);
    expect(out.map.has('성언')).toBe(false);
    expect(out.ambiguous).toContain('성언');
    const fixed = deriveNameMap(dup, { 성언: '박성언' });
    expect(fixed.map.get('성언').name).toBe('박성언');
  });
});

describe('parseDoublesTab', () => {
  const rows2d = [
    [], ['', '날짜', 'A_P1', 'A_P2', 'B_P1', 'B_P2', '', 'A점수', ' B점수'],
    ['', '2026-02-02 00:00', '성언', '현철', '재민', '원택', '', '6', '4'],
    ['', '2026-02-02 00:00', '학모', '대철', '성환', '두리', '', '', ''],   // 점수 없음
    ['', '2026-02-03 00:00', '성언', '원희', '윤택', '현철', '', '5', '5'], // 동점
  ];
  it('점수 있는 판만 파싱, 나머지는 사유와 함께 skipped', () => {
    const { matches, skipped } = parseDoublesTab(rows2d, { expectMonth: '2026-02' });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ date: '2026-02-02', a1: '성언', scoreA: 6, scoreB: 4 });
    expect(skipped).toHaveLength(2);
  });
});

describe('buildLegacyDoublesRows', () => {
  const { map } = deriveNameMap(roster);
  const base = { team: '몽피스', nameMap: map, inputTime: '2026-08-10 12:00:00' };

  it('6-5는 TB sentinel, 6-0은 베이글, 회원3인+게스트1인은 투몽', () => {
    const matches = [
      { date: '2026-02-02', a1: '성언', a2: '현철', b1: '원희', b2: '두리', scoreA: 6, scoreB: 5 },
      { date: '2026-02-02', a1: '성언', a2: '현철', b1: '원희', b2: '윤택', scoreA: 6, scoreB: 0 },
    ];
    const { matchRows, playerGameRows, report } = buildLegacyDoublesRows({ ...base, matches });

    expect(matchRows[0]).toMatchObject({
      game_id: 'legacy_2026-02-02', round_idx: 1, court_id: 1, match_idx: 1,
      match_id: 'R1_C1', format: '복식', best_of: 1, season: 2026, winner: 'A', league: '투몽',
    });
    expect(matchRows[1].match_id).toBe('R2_C1'); // 판별 유일
    expect(JSON.parse(matchRows[0].sets_json)).toEqual([{ a: 6, b: 5, tbA: 1, tbB: 0 }]);
    expect(JSON.parse(matchRows[1].sets_json)).toEqual([{ a: 6, b: 0 }]);

    const p = playerGameRows.filter(r => r.match_id === 'R1_C1');
    expect(p).toHaveLength(4);
    const seongeon = p.find(r => r.player === '박성언');
    expect(seongeon).toMatchObject({
      is_guest: false, side: 'A', partner: '남현철', result: '승',
      tb_played: 1, tb_won: 1, aces: '', double_faults: '', grade_at_date: '금배',
    });
    expect(JSON.parse(seongeon.opponents_json)).toEqual(['김원희', '두리']);
    const duri = p.find(r => r.player === '두리');
    expect(duri).toMatchObject({ is_guest: true, grade_at_date: '', result: '패', tb_won: 0 });

    const bagel = playerGameRows.find(r => r.match_id === 'R2_C1' && r.player === '김원희');
    expect(bagel.bagels_taken).toBe(1);
    expect(report.leagueDist).toEqual({ 투몽: 2 });
    expect(report.guests).toEqual({ 두리: 1 });
  });

  it('회원 2인 이하는 미반영, 6 미만 우세 점수는 우세승 + nonStandardScores 기록', () => {
    const matches = [
      { date: '2026-03-01', a1: '성언', a2: '두리', b1: '민환', b2: '지웅', scoreA: 5, scoreB: 4 },
    ];
    const { matchRows, playerGameRows, report } = buildLegacyDoublesRows({ ...base, matches });
    expect(matchRows[0].league).toBe('미반영');
    expect(matchRows[0].winner).toBe('A');
    expect(playerGameRows.find(r => r.player === '박성언').result).toBe('승');
    expect(playerGameRows.find(r => r.player === '박성언').sets_won).toBe(1);
    expect(report.nonStandardScores).toEqual([{ date: '2026-03-01', score: '5-4' }]);
    expect(report.leagueDist).toEqual({ 미반영: 1 });
  });
});
```

주의: partner는 실명(`남현철`), opponents_json도 실명/게스트 원문 — **매핑 후 이름**으로 기록한다. tb_won은 이긴 쪽 2명에게만 1.

- [ ] **Step 3: 실패 확인** — Run: `npx vitest run src/utils/tennis/__tests__/legacyDoublesTransform.test.js` → FAIL (module not found)

- [ ] **Step 4: 구현** — `src/utils/tennis/legacyDoublesTransform.js`:

```js
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
```

- [ ] **Step 5: 테스트 통과 확인** — Run: `npx vitest run src/utils/tennis/__tests__/legacyDoublesTransform.test.js` → PASS. 이어서 `npm test` 전체 PASS(특히 기존 `tennisRowBuilders.test.js`).

- [ ] **Step 6: 커밋**

```bash
git add src/utils/tennis/legacyDoublesTransform.js src/utils/tennis/__tests__/legacyDoublesTransform.test.js src/utils/tennis/tennisRowBuilders.js
git commit -m "feat(tennis): 2026 복식 레거시 변환기 — summarizeCourt 재사용, TB sentinel"
```

---

### Task 3: 마이그레이션 스크립트 2종 (I/O 셸)

**Files:**
- Create: `scripts/migrate/tennisLegacyDoubles.mjs`
- Create: `scripts/migrate/tennisLegacyAggregates.mjs`
- Modify: `package.json` (devDep `xlsx` 추가)

**Interfaces:**
- Consumes: Task 2의 `deriveNameMap`/`parseDoublesTab`/`buildLegacyDoublesRows` (`../../src/utils/tennis/legacyDoublesTransform.js`에서 import — 리포는 `"type":"module"`이라 .mjs에서 src ESM import 가능). Apps Script 액션: `getTennisRoster`, `getTennisPlayerGames`, `writeTennisMatches`, `writeTennisPlayerGames`, `writeTennisLegacyRecords`(Task 1).
- Produces: CLI 도구 2종. 실행법(둘 다 동일 패턴):

```
APPS_SCRIPT_URL="..." SHEET_ID="<소스시트ID>" \
  node scripts/migrate/tennisLegacyDoubles.mjs --team 몽피스 --auth "이름:전화4" [--apply] [--override 축약명=실명 ...]
```

- [ ] **Step 1: xlsx 설치** — Run: `npm i -D xlsx` → package.json devDependencies에 추가 확인.

- [ ] **Step 2: 공통 구조로 tennisLegacyDoubles.mjs 작성**

```js
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
  const { matches, skipped } = parseDoublesTab(XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }), { expectMonth: month });
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
```

- [ ] **Step 3: tennisLegacyAggregates.mjs 작성** — 같은 골격(post/parseArgs/die/xlsx 다운로드/nameMap 재사용). 차이만:

```js
// '2024시즌 전적'/'2025시즌 전적' 탭 → 테니스_레거시전적 + 시즌시작순위 표 출력.
// 열: A=이름, B/C=복식 승/패, F/G=단식 승/패 (header:1 인덱스 0,1,2,5,6). 데이터는 3행째부터.
const YEAR_TABS = [{ tab: '2024시즌 전적', season: 2024 }, { tab: '2025시즌 전적', season: 2025 }];
const legacyRows = [];
const unmapped = new Set();
for (const { tab, season } of YEAR_TABS) {
  const rows2d = XLSX.utils.sheet_to_json(wb.Sheets[tab], { header: 1, raw: false });
  for (const row of rows2d.slice(2)) {
    const abbrev = String(row?.[0] || '').trim();
    if (!abbrev || abbrev === '이름') continue;
    const hit = nameMap.get(abbrev);
    const player = hit ? hit.name : abbrev;       // 탈퇴 회원 등 미매핑은 축약명 그대로(표시 전용)
    if (!hit) unmapped.add(abbrev);
    for (const [format, wIdx, lIdx] of [['복식', 1, 2], ['단식', 5, 6]]) {
      const wins = Number(row[wIdx]), losses = Number(row[lIdx]);
      if (Number.isNaN(wins) && Number.isNaN(losses)) continue;
      legacyRows.push({ team: args.team, sport: '테니스', season, format, player,
        wins: wins || 0, losses: losses || 0 });
    }
  }
}
// dry-run: legacyRows 표 + unmapped 목록 출력.
// 시즌시작순위 표: '단식리그 길로틴 전적(1그룹)' → '단식 리그 길로틴 전적(2그룹)' 순서로
// A열(3행째부터, 빈 값 전까지)의 축약명을 nameMap으로 실명 변환해 1..N 순번과 함께 출력만 한다.
// (테니스_회원명부는 진실 소스 — 스크립트가 쓰지 않고 유저가 승인 후 수동 기입. 스펙 §4.3)
// --apply 시: 가드로 getTennisLegacyRecords가 비어있는지 확인(비어있지 않으면 중단) 후
// writeTennisLegacyRecords로 legacyRows 일괄 전송.
```

- [ ] **Step 4: 문법 검증(네트워크 없이)** — Run: `node --check scripts/migrate/tennisLegacyDoubles.mjs && node --check scripts/migrate/tennisLegacyAggregates.mjs` → OK. (top-level await 때문에 실행 검증은 실행 단계에서 dry-run으로.)

- [ ] **Step 5: 커밋**

```bash
git add scripts/migrate/tennisLegacyDoubles.mjs scripts/migrate/tennisLegacyAggregates.mjs package.json package-lock.json
git commit -m "feat(tennis): 레거시 마이그레이션 스크립트 — dry-run 게이트, legacy_ 가드"
```

---

### Task 4: 분석 계산기 (순수 함수)

**Files:**
- Create: `src/utils/tennis/tennisAnalytics.js`
- Test: `src/utils/tennis/__tests__/tennisAnalytics.test.js`

**Interfaces:**
- Consumes: `COMPETITION_DOUBLES` (tennisSchema.js). 입력 `rows`는 `로그_테니스선수경기` 행(시트 읽기 결과 — 빈 셀은 `''`), `legacyRows`는 `테니스_레거시전적` 행, `roster`는 `getTennisRoster` 결과.
- Produces (전부 export, 인자는 단일 객체):
  - `buildDoublesStandings({ rows, roster })` → `[{name, grade, games, wins, losses, rate}]` 승률↓·승수↓·이름순. **`league === '투몽'` 행만**(미반영·게스트 제외), 명부 전원 포함(0판도 표시).
  - `buildPairChemistry({ rows, minGames = 3 })` → `[{players: [이름,이름](정렬), games, wins, losses, rate, hasGuest}]` — 복식 전 행(미반영 포함) 대상, `game_id|match_id|side`로 판 중복 제거, `games >= minGames`만, 승률↓.
  - `buildPartnerBreakdown({ rows, player })` → `[{partner, games, wins, losses, rate, isGuestPartner}]` — player의 복식 행에서 partner별 집계, 판수↓.
  - `buildHeadToHead({ rows, player, format })` → `[{opponent, games, wins, losses, rate}]` — player 행의 `opponents_json`(JSON 문자열) 파싱, 상대 개인별 집계, 판수↓. format이 없으면(undefined) 단·복식 전체.
  - `buildMonthlyForm({ rows, player, format })` → `[{month: '2026-01', games, wins, rate}]` 월 오름차순.
  - `buildTbRanking({ rows, roster })` → `[{name, tbPlayed, tbWon, rate}]` — 회원만, `tbPlayed >= 1`만, rate↓.
  - `buildBagelRanking({ rows, roster })` → `[{name, given, taken}]` — 회원만, given↓.
  - `buildAceDfRanking({ rows, roster })` → `[{name, aces, doubleFaults, recordedGames}]` — **`r.aces === '' || r.aces === null || r.aces === undefined` 행은 미기록으로 제외**(마이그레이션 행), 회원만, recordedGames>0만.
  - `buildYearlyRecords({ legacyRows, rows, player, format })` → `[{season: '2024'|'2025'|'2026'|'통산', wins, losses, rate}]` — legacy는 `season`/`format`/`player` 매칭, 로그는 연도별 집계, 통산=합산.

- [ ] **Step 1: 실패하는 테스트 작성** — `src/utils/tennis/__tests__/tennisAnalytics.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  buildDoublesStandings, buildPairChemistry, buildPartnerBreakdown, buildHeadToHead,
  buildMonthlyForm, buildTbRanking, buildBagelRanking, buildAceDfRanking, buildYearlyRecords,
} from '../tennisAnalytics';

const roster = [{ name: '갑', grade: '금배' }, { name: '을', grade: '은배' }, { name: '병', grade: '동배' }];

// 복식 1판 = 4행 헬퍼. overrides로 판별 필드 덮어쓰기.
let seq = 0;
function doublesMatch({ date = '2026-01-10', a = ['갑', '을'], b = ['병', '정'], winner = 'A',
  league = '투몽', guests = ['정'], over = {} } = {}) {
  const matchId = `R${++seq}_C1`;
  const mk = (player, side, mates, opps) => ({
    date, season: 2026, game_id: `legacy_${date}`, match_id: matchId, format: '복식', league,
    player, side, is_guest: guests.includes(player),
    partner: mates.find(x => x !== player),
    opponents_json: JSON.stringify(opps),
    result: (winner === side) ? '승' : '패',
    tb_played: 0, tb_won: 0, bagels_given: 0, bagels_taken: 0,
    aces: '', double_faults: '', ...over,
  });
  return [...a.map(p => mk(p, 'A', a, b)), ...b.map(p => mk(p, 'B', b, a))];
}

describe('buildDoublesStandings', () => {
  it('투몽 행만 집계하고 게스트·미반영은 제외, 명부 전원 표시', () => {
    const rows = [
      ...doublesMatch({ winner: 'A' }),
      ...doublesMatch({ league: '미반영', winner: 'B' }), // 순위표에서 무시
    ];
    const out = buildDoublesStandings({ rows, roster });
    expect(out.find(x => x.name === '갑')).toMatchObject({ games: 1, wins: 1, rate: 1 });
    expect(out.find(x => x.name === '병')).toMatchObject({ games: 1, losses: 1 });
    expect(out.some(x => x.name === '정')).toBe(false);
  });
});

describe('buildPairChemistry', () => {
  it('판 단위 중복 제거 + minGames 필터 + 미반영 포함', () => {
    const rows = [
      ...doublesMatch({ winner: 'A' }), ...doublesMatch({ winner: 'A' }),
      ...doublesMatch({ winner: 'B', league: '미반영' }),
    ];
    const out = buildPairChemistry({ rows, minGames: 3 });
    expect(out).toHaveLength(2); // 갑·을 3판, 병·정 3판 — 4행짜리 판이 1로 세어짐
    expect(out.find(p => p.players.join('') === '갑을')).toMatchObject({ games: 3, wins: 2, hasGuest: false });
    expect(out.find(p => p.players.includes('정')).hasGuest).toBe(true);
  });
});

describe('buildHeadToHead / buildPartnerBreakdown / buildMonthlyForm', () => {
  const rows = [
    ...doublesMatch({ date: '2026-01-10', winner: 'A' }),
    ...doublesMatch({ date: '2026-02-11', winner: 'B' }),
  ];
  it('상대전적은 상대편에 섰던 판을 개인 단위로 센다', () => {
    const h2h = buildHeadToHead({ rows, player: '갑', format: '복식' });
    expect(h2h.find(x => x.opponent === '병')).toMatchObject({ games: 2, wins: 1, losses: 1 });
  });
  it('파트너별 성적', () => {
    expect(buildPartnerBreakdown({ rows, player: '갑' })[0])
      .toMatchObject({ partner: '을', games: 2, wins: 1 });
  });
  it('월별 폼', () => {
    expect(buildMonthlyForm({ rows, player: '갑', format: '복식' })).toEqual([
      { month: '2026-01', games: 1, wins: 1, rate: 1 },
      { month: '2026-02', games: 1, wins: 0, rate: 0 },
    ]);
  });
});

describe('buildTbRanking / buildBagelRanking / buildAceDfRanking', () => {
  it('TB·베이글 합산, 에이스는 빈값(미기록) 행 제외', () => {
    const rows = [
      ...doublesMatch({ over: { tb_played: 1 } }).map(r => ({ ...r, tb_won: r.side === 'A' ? 1 : 0 })),
      ...doublesMatch({ over: { bagels_given: 1 } }).map(r => r.side === 'A' ? r : { ...r, bagels_given: 0, bagels_taken: 1 }),
      ...doublesMatch({ over: { aces: 3, double_faults: 1 } }),
    ];
    expect(buildTbRanking({ rows, roster })[0]).toMatchObject({ name: '갑', tbPlayed: 1, tbWon: 1, rate: 1 });
    expect(buildBagelRanking({ rows, roster }).find(x => x.name === '병')).toMatchObject({ taken: 1 });
    const ace = buildAceDfRanking({ rows, roster }).find(x => x.name === '갑');
    expect(ace).toMatchObject({ aces: 3, doubleFaults: 1, recordedGames: 1 }); // 빈값 2판 제외
  });
});

describe('buildYearlyRecords', () => {
  it('레거시+로그+통산 합산', () => {
    const legacyRows = [
      { season: 2024, format: '복식', player: '갑', wins: 10, losses: 5 },
      { season: 2025, format: '복식', player: '갑', wins: 20, losses: 10 },
      { season: 2025, format: '단식', player: '갑', wins: 7, losses: 3 },
    ];
    const rows = doublesMatch({ winner: 'A' });
    const out = buildYearlyRecords({ legacyRows, rows, player: '갑', format: '복식' });
    expect(out).toEqual([
      { season: '2024', wins: 10, losses: 5, rate: 10 / 15 },
      { season: '2025', wins: 20, losses: 10, rate: 20 / 30 },
      { season: '2026', wins: 1, losses: 0, rate: 1 },
      { season: '통산', wins: 31, losses: 15, rate: 31 / 46 },
    ]);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/utils/tennis/__tests__/tennisAnalytics.test.js` → FAIL (module not found)

- [ ] **Step 3: 구현** — `src/utils/tennis/tennisAnalytics.js`. 뼈대(각 함수는 위 Produces 계약을 정확히 따른다):

```js
// 분석 탭 계산기. 입력은 시트 행 그대로 — 빈 셀은 ''로 들어온다.
// aces/double_faults의 ''은 "미기록"(마이그레이션 행)이므로 0으로 강제하지 말 것.
import { COMPETITION_DOUBLES } from './tennisSchema';

const isDoubles = (r) => r.format === '복식';
const memberNames = (roster) => new Set((roster || []).map(m => m.name));
const rate = (w, g) => (g > 0 ? w / g : 0);

export function buildDoublesStandings({ rows, roster }) {
  const acc = new Map((roster || []).filter(m => m?.name).map(m =>
    [m.name, { name: m.name, grade: m.grade || '', games: 0, wins: 0, losses: 0, rate: 0 }]));
  for (const r of rows || []) {
    if (!isDoubles(r) || r.league !== COMPETITION_DOUBLES || r.is_guest === true) continue;
    const cur = acc.get(r.player);
    if (!cur) continue;
    cur.games++;
    if (r.result === '승') cur.wins++; else if (r.result === '패') cur.losses++;
    cur.rate = rate(cur.wins, cur.games);
  }
  return [...acc.values()].sort((a, b) =>
    b.rate - a.rate || b.wins - a.wins || String(a.name).localeCompare(String(b.name), 'ko'));
}

export function buildPairChemistry({ rows, minGames = 3 }) {
  const seen = new Set();
  const acc = new Map();
  for (const r of rows || []) {
    if (!isDoubles(r) || !r.partner) continue;
    const dedupe = `${r.game_id}|${r.match_id}|${r.side}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const players = [r.player, r.partner].sort((a, b) => a.localeCompare(b, 'ko'));
    const key = players.join('|');
    const cur = acc.get(key) || { players, games: 0, wins: 0, losses: 0, rate: 0, hasGuest: false };
    cur.games++;
    if (r.result === '승') cur.wins++; else if (r.result === '패') cur.losses++;
    cur.hasGuest = cur.hasGuest || r.is_guest === true; // 파트너의 게스트 여부는 그 파트너 행에서 잡힌다
    cur.rate = rate(cur.wins, cur.games);
    acc.set(key, cur);
  }
  return [...acc.values()].filter(p => p.games >= minGames).sort((a, b) => b.rate - a.rate || b.games - a.games);
}
// …buildPartnerBreakdown / buildHeadToHead(JSON.parse는 try-catch로 감싸 손상 행 무시) /
// buildMonthlyForm(month = String(r.date).slice(0,7)) / buildTbRanking / buildBagelRanking /
// buildAceDfRanking(빈값 행 제외 후 Number() 합산) /
// buildYearlyRecords(legacy season 문자열화 + 로그 연도 = String(r.season || r.date).slice(0,4)) —
// 전부 위 Produces 계약대로. Number() 변환은 시트가 숫자를 숫자로 주지만 문자열 방어를 겸한다.
```

주의: `buildPairChemistry`의 hasGuest는 side 대표 행 1개만 보므로 부족하다 — **파트너가 게스트인 경우**를 잡으려면 dedupe 전에 `pairGuest = r.is_guest === true || (같은 판 같은 side의 파트너 행 is_guest)`가 필요하다. 간단한 구현: 행을 먼저 `game_id|match_id|side`로 그룹핑해 [행, 파트너행] 쌍을 만들고 그룹당 1회 집계한다(테스트의 `hasGuest: true` 케이스가 이를 검증한다).

- [ ] **Step 4: 테스트 통과 확인** — Run: `npx vitest run src/utils/tennis/__tests__/tennisAnalytics.test.js` → PASS, 이어 `npm test` 전체 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/utils/tennis/tennisAnalytics.js src/utils/tennis/__tests__/tennisAnalytics.test.js
git commit -m "feat(tennis): 분석 계산기 — 케미/상대전적/월별/TB/베이글/에이스/연도별"
```

---

### Task 5: 분석 탭 UI + 배선

**Files:**
- Create: `src/components/tennis/TennisAnalyticsTab.jsx`
- Modify: `src/components/tennis/TennisTabs.jsx` (records 분기 위임, 기존 순위표 코드 제거)
- Modify: `src/components/dashboard/TeamDashboard.jsx:939-944` (탭 배열 — 테니스 가드 분기만)

**Interfaces:**
- Consumes: Task 4 전 함수 + `buildSinglesStandings`(tennisStandings.js) + `TennisSync.getPlayerGames/getRoster/getLegacyRecords`.
- Produces: `<TennisAnalyticsTab C={C} authUserName={string} />`.

- [ ] **Step 1: dataviz 스킬 로드** — 월별 흐름 SVG 라인차트를 그리기 전에 `dataviz` 스킬을 Skill 툴로 로드하고 그 지침(색·축·툴팁 규칙)을 따른다.

- [ ] **Step 2: TennisAnalyticsTab.jsx 작성** — 구조(스타일은 기존 `makeStyles(C)`의 `ds.section/ds.card/ds.sectionTitle/ds.th/ds.td` 재사용, TennisTabs.jsx의 기존 표 마크업 관례를 따른다):

```jsx
// 분석 탭 본문. 시트 2종(로그_테니스선수경기 + 테니스_레거시전적)을 읽어 클라이언트에서 계산한다.
// 경기 중 화면과 무관 — 당일/누적 경계(스펙 §2)를 지킨다.
import { useEffect, useMemo, useState } from 'react';
import TennisSync from '../../services/tennisSync';
import { buildSinglesStandings } from '../../utils/tennis/tennisStandings';
import {
  buildDoublesStandings, buildPairChemistry, buildPartnerBreakdown, buildHeadToHead,
  buildMonthlyForm, buildTbRanking, buildBagelRanking, buildAceDfRanking, buildYearlyRecords,
} from '../../utils/tennis/tennisAnalytics';
import { makeStyles } from '../../styles/theme';

export default function TennisAnalyticsTab({ C, authUserName }) {
  const ds = makeStyles(C);
  const [rows, setRows] = useState([]);
  const [legacyRows, setLegacyRows] = useState([]);
  const [roster, setRoster] = useState([]);
  const [format, setFormat] = useState('복식');           // 복식 기본 (스펙 §5)
  const [player, setPlayer] = useState(authUserName || '');

  useEffect(() => {
    TennisSync.getPlayerGames().then(setRows);
    TennisSync.getLegacyRecords().then(setLegacyRows);
    TennisSync.getRoster().then(setRoster);
  }, []);
  // 섹션별 useMemo 계산 → 카드 렌더. 섹션 구성(스펙 §5 표):
  //   [복식] 개인성적(buildDoublesStandings + 연도별 buildYearlyRecords) / 케미(buildPairChemistry
  //          + 선수 선택 시 buildPartnerBreakdown) / 상대전적 / 월별 흐름(SVG) / TB·베이글 / 에이스·DF
  //   [단식] 길로틴 순위표(buildSinglesStandings — TennisTabs에서 흡수) + 포인트 + 연도별 / 상대전적
  //          / 월별 / TB·베이글 / 에이스·DF   ※ 포인트 컬럼은 단식 뷰 전용(스펙 §5)
  // 에이스/DF 카드 캡션: "2026.8~ 앱 기록 기준" / 레거시 연도별 섹션은 legacyRows 비면 숨김(스펙 §7).
  // 선수 선택 드롭다운 모집단: roster 이름 (기본 authUserName).
}
```

- [ ] **Step 3: TennisTabs.jsx 개편** — ① `records` 분기 전체를 `return <TennisAnalyticsTab C={C} authUserName={authUserName} />;`로 교체 ② 이제 안 쓰는 `buildSinglesStandings` import·`standings` useMemo·순위표 JSX 제거(roster 탭이 쓰는 `rows`/`buildPlayerSummary` 로드는 유지) ③ 상단에 `import TennisAnalyticsTab from './TennisAnalyticsTab';` 추가. **선언 순서를 육안 검증**(컴포넌트 렌더 크래시는 빌드가 못 잡는다 — 기존 메모리 규칙).

- [ ] **Step 4: TeamDashboard.jsx 탭 배열 수정** — 940행 근처, 테니스 가드 분기만:

```jsx
          { key: "records", label: activeSport === "테니스" ? "분석" : "대시보드" },
          { key: "roster", label: activeSport === "축구" ? "팀/개인 기록" : "개인기록" },
          activeSport !== "테니스" && { key: "analytics", label: "분석" },
```

(테니스는 analytics 탭이 "준비 중"만 보여주던 상태 — 제거하고 records가 분석이 된다. 풋살/축구 탭 구성은 변화 없음을 diff로 확인.)

- [ ] **Step 5: 검증** — Run: `npm test && npm run lint && npm run build` → 전부 통과. 이어 **브라우저 스모크**(렌더 검증 공백 규칙): `npm run dev` 후 테니스 팀으로 진입해 ① 분석 탭이 복식 기본으로 뜨고 토글·선수 선택이 동작 ② 개인기록 탭 정상 ③ 풋살 팀 대시보드/분석 탭 정상(무영향 확인).

- [ ] **Step 6: 커밋**

```bash
git add src/components/tennis/TennisAnalyticsTab.jsx src/components/tennis/TennisTabs.jsx src/components/dashboard/TeamDashboard.jsx
git commit -m "feat(tennis): 분석 탭 — 복식/단식 토글, 길로틴 순위표 흡수"
```

---

### Task 6: 실행 절차 (코드 아님 — 배포·마이그레이션 런북)

**Files:** 없음(운영 절차). 실행 주체: 세션 + 유저.

- [ ] **Step 1: 배포** — `npm run build` 확인 후 push → GitHub Actions 자동 배포. (커밋·push는 유저 확인 후.)
- [ ] **Step 2: Apps Script 반영(유저)** — Code.js 변경분을 Apps Script 편집기에 붙여넣고 **배포 관리→편집→새 버전**(새 배포 금지 — URL 고정). 반영 후 앱에서 테니스 탭이 열리면 `_ensureTennisSheets`가 `테니스_레거시전적` 시트를 자동 생성.
- [ ] **Step 3: 레거시 집계 적재** — `tennisLegacyAggregates.mjs` dry-run → 유저가 리포트(행 표·미매핑 목록) 승인 → `--apply`. 시즌시작순위 표가 함께 출력되면 **유저가 테니스_회원명부에 수동 기입**(진실 소스 — 스크립트가 쓰지 않음). 기입 전 소급 효과 고지: 시드가 생기면 이후 기록될 단식 경기의 리그 배정 기준이 된다(현재 단식 로그 0건이므로 포인트 델타 0 — 스펙 §4.3).
- [ ] **Step 4: 복식 499판 적재** — `tennisLegacyDoubles.mjs` dry-run → 유저가 매핑 표·게스트 목록·league 분포·월별 검산 승인 → `--apply`. 실패로 중간에 끊기면 legacy_ 가드가 재실행을 막으므로, 시트에서 legacy_ 행 수동 삭제 후 재실행.
- [ ] **Step 5: 확인** — 분석 탭에서 복식 순위·케미·월별 그래프에 1~7월 데이터가 보이는지, 개인기록 탭 누적 수치가 커졌는지(의도된 결과 — 스펙 §5), 소스 시트 공유 제한(유저 직접).

---

## Self-Review 결과

- **Spec coverage**: §4.1 레거시 시트(Task 1·3), §4.2 마이그레이션 규칙 전부(Task 2·3 — determineCompetition/TB sentinel/빈값 aces/round_idx 순번/가드/preflight), §4.3 시즌시작순위(Task 3·6 — 수동 기입+소급 고지), §5 화면(Task 5 — 포인트 단식 전용 반영), §6 데이터 흐름(Task 5), §7 에러(가드·safeRead 폴백·legacy 숨김), §8 테스트(Task 2·4), §9 범위 밖 — 침범 없음.
- **Placeholder scan**: Task 4 Step 3과 Task 5 Step 2의 축약 주석은 Produces 계약(정확한 시그니처·정렬·필터)이 본문에 있으므로 구현 지시로 충분하다고 판단. 그 외 TBD 없음.
- **Type consistency**: `TENNIS_LEGACY_COLUMNS`·`getLegacyRecords`·`buildLegacyDoublesRows`의 반환 필드명이 Task 1→3→4→5에서 동일함을 재확인. `serializeSets` export는 Task 2 Step 1에서 선행.
