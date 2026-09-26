# 마스터스컵 3단계 — 대회 순위표·개인기록·경기일별 결과 (구현 계획)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대회 상세 화면(`CupDetail`)에 시트 로그에서 파생한 **누적 순위표(승점 + 참석·다득점·무실점 가점 → 골득실)**, **개인기록(골·어시·클린시트·자책·참석횟수)**, **경기일별 결과·가점 내역**을 보여준다. 저장·마감·Apps Script·당일 경기 화면은 바꾸지 않는다.

**Architecture:** 시트 캐시에 원본 노드를 공유하는 alias 뷰 2종(`cupMatchLog`·`cupEventLog`, 반환만 `tournament_id` 있는 행)을 두고, `CupDetail`이 그 두 뷰를 읽어 순수 함수 모듈 `src/utils/cup/cupRecords.js`(`selectCupRows` → `calcCupStandings`·`calcCupPlayerRecords`·`collectPlayedPairs`)로 계산한 결과를 표시 전용 컴포넌트 3개(`CupStandingsTable`·`CupPlayerRecordsTable`·`CupDayResults`)에 넘긴다. 잠금은 기존 `isLocked(cup, playedPairs)`에 로그 파생 집합을 넘겨 OR 한다.

**Tech Stack:** React 19 + Vite, vitest(jsdom, `createRoot`+`act` 실렌더 하네스, `vi.mock` 모듈 목), 정적 가드 테스트(`fs.readFileSync` + 정규식).

**Spec:** `docs/superpowers/specs/2026-09-26-masters-cup-s3-records-design.md` (전 절). 상위: `docs/superpowers/specs/2026-09-16-masters-cup-design.md` v2.1 §3(잠금)·§4.5·§4.6.

## Global Constraints

- 대상 팀은 마스터FC(풋살). 하버FC·빅마스터FC(축구)·몽피스(테니스)는 동작 변화 0. **수정 금지:** `src/App.jsx`, `apps-script/`, `src/utils/analyticsV2/`(import 는 허용), `src/utils/soccerAnalytics/`, `src/services/cupSync.js`, `src/utils/cup/cupEntity.js`(`isLocked` 시그니처 그대로 사용), `src/components/tournament/`, 축구·테니스 경로 전부.
- 시트 캐시: alias 는 `ADAPTERS` 에 넣지 않는다(별도 `ALIASES`). `datasetsOf`·`refreshAll`·`status`·마감 재적재 대상은 늘지 않는다. alias 전용 RTDB 노드는 생기지 않는다(경로는 항상 원본 데이터셋 키). 기존 `sheetCache.test.js` 의 `datasetsOf('풋살')` 7종 단언(350행 부근)이 그대로 통과해야 한다.
- `SheetCache.get(...)` 호출은 반드시 `{ sport: '풋살' }` 를 명시한다(`AuthUtil.mode` 는 대시보드 종목 토글을 따라오지 않는다).
- 골/자책 이벤트 행은 어떤 키로도 중복 제거하지 않는다. 임시 라운드(`is_extra` — boolean `true` 또는 문자열 `'TRUE'`)는 경기·이벤트 모두 제외.
- 이름 비교는 `cleanPlayerName`(cupEntity), 팀명 비교는 `normalizeTeamName`(cupEntity), 경기 키는 `${date}|${game_id}|${normalizeMatchId(match_id,'풋살')}`.
- 사용자 노출 문구의 시트명은 실제 이름만(로그_매치·로그_이벤트·로그_선수경기). 약칭 금지.
- RTDB 는 빈 배열을 저장하지 않는다 — `cup.teams`·`t.players` 는 `|| []` 로 방어(normalizeCup 이 이미 하지만 컴포넌트·계산기는 다시 방어).
- 순수 계산 모듈(`cupRecords.js`)은 React·firebase 를 import 하지 않는다(`cupEntity.js`·`matchIdNormalizer.js`·`analyticsV2/parseMembers.js` 만).
- 커밋 접두 한국어 `feat(cup):`/`fix(cup):`/`test(cup):`/`docs:`. 트레일러 필수:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  ```
- `git` 명령은 단일 명령으로(`&&` 체인 금지 — 저장소 가드가 거부). 작업은 전용 브랜치 `feat/cup-s3-records` 의 워크트리 안에서만(§0). main 에 직접 커밋 금지.
- lint 기존 에러 2건(`src/services/appSync.js:13`, `src/services/tennisSync.js:16`)은 범위 밖. 테스트 기준선 **226 파일 / 2036 개**(main 0cf0d40). 새 테스트는 전부 더해지기만 한다.
- 각 Task 끝에 `npx vitest run <해당 파일>` 통과 + 커밋. Task 7 에서 전체 `npm test`·`npm run lint`·`npm run build`.

---

### Task 0: 워크트리·브랜치 준비

**Files:** 없음(환경).

- [ ] **Step 1: 워크트리 생성**

```bash
git -C /Users/rh/Desktop/python_dev/footsal_webapp worktree add .claude/worktrees/cup-s3 -b feat/cup-s3-records main
```

- [ ] **Step 2: 워크트리에서 의존성·기준선 확인**

```bash
cd /Users/rh/Desktop/python_dev/footsal_webapp/.claude/worktrees/cup-s3
npm ci --silent
npx vitest run --reporter=dot 2>&1 | tail -4
```
Expected: `Test Files 226 passed`, `Tests 2036 passed`. 이후 모든 Task 는 이 워크트리 안에서 실행하고 `git branch --show-current` 가 `feat/cup-s3-records` 인지 매 Task 시작 시 확인한다.

---

### Task 1: `cupRecords.js` — 헬퍼·입력 선별·잠금 파생

**Files:**
- Create: `src/utils/cup/cupRecords.js`
- Test: `src/utils/__tests__/cupRecords.test.js`

**Interfaces:**
- Consumes: `normalizeMatchId(raw, sport)`(`src/utils/matchIdNormalizer.js`), `parseMembersWithAbsent(json) → { players, absent, actual }`(`src/utils/analyticsV2/parseMembers.js`), `cleanPlayerName(name)`·`normalizeTeamName(name)`(`src/utils/cup/cupEntity.js`).
- Produces (이후 Task 가 그대로 쓰는 export):
  - `isExtraRow(row) → boolean`
  - `matchKeyOf(row) → string`
  - `selectCupRows({ matchRows, eventRows, cupId }) → { matchRows, eventRows }`
  - `collectPlayedPairs(matchRows, cupId) → Set<string>`
  - 내부 공용(다음 Task 가 같은 파일 안에서 사용): `num(v)`, `teamOf(v)`, `nameOf(v)`, `membersOf(json) → string[]`, `byKo(a,b)`, `rosterOf(cup) → Map<teamName, Set<player>>`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/utils/__tests__/cupRecords.test.js`:

```js
// src/utils/__tests__/cupRecords.test.js
// 마스터스컵 3단계 스펙 §3 — 순수 계산 규칙 고정. fixture 열 이름은 로그_매치·로그_이벤트 실제 열.
import { describe, it, expect } from 'vitest';
import {
  isExtraRow, matchKeyOf, selectCupRows, collectPlayedPairs,
} from '../cup/cupRecords';

const A5 = ['a1', 'a2', 'a3', 'a4', 'a5'];
const B5 = ['b1', 'b2', 'b3', 'b4', 'b5'];
export const M = (over = {}) => ({
  team: '마스터FC', sport: '풋살', mode: '대회', tournament_id: 'CUP', date: '2026-10-01', game_id: 'g1', match_idx: 1,
  round_idx: 1, court_id: 0, match_id: 'R1_C0', our_team_name: '팀A', opponent_team_name: '팀B',
  our_members_json: JSON.stringify(A5), opponent_members_json: JSON.stringify(B5),
  our_score: 0, opponent_score: 0, our_gk: 'a1', opponent_gk: 'b1', formation: '', our_defenders_json: '[]',
  is_extra: false, input_time: '', ...over,
});
export const E = (over = {}) => ({
  team: '마스터FC', sport: '풋살', mode: '대회', tournament_id: 'CUP', date: '2026-10-01', match_id: 'R1_C0',
  our_team: '팀A', opponent: '팀B', event_type: 'goal', player: 'a2', related_player: '', concede_gk: 'b1',
  position: '', input_time: '', game_id: 'g1', ...over,
});

describe('isExtraRow / matchKeyOf', () => {
  it('boolean true 와 문자열 TRUE 둘 다 임시 라운드', () => {
    expect(isExtraRow(M({ is_extra: true }))).toBe(true);
    expect(isExtraRow(M({ is_extra: 'TRUE' }))).toBe(true);
    expect(isExtraRow(M({ is_extra: 'true' }))).toBe(true);
    expect(isExtraRow(M({ is_extra: false }))).toBe(false);
    expect(isExtraRow(M({ is_extra: 'FALSE' }))).toBe(false);
    expect(isExtraRow(M({ is_extra: '' }))).toBe(false);
    expect(isExtraRow(null)).toBe(false);
  });
  it('경기 키는 date|game_id|정규화 match_id', () => {
    expect(matchKeyOf(M())).toBe('2026-10-01|g1|R1_C0');
    expect(matchKeyOf(M({ match_id: '1라운드 매치1' }))).toBe('2026-10-01|g1|R1_C0');
    expect(matchKeyOf(E())).toBe(matchKeyOf(M()));
  });
});

describe('selectCupRows', () => {
  it('다른 대회·정규 행은 경기·이벤트 모두 제외', () => {
    const { matchRows, eventRows } = selectCupRows({
      matchRows: [M(), M({ tournament_id: 'OTHER', match_id: 'R1_C1' }), M({ tournament_id: '', mode: '기본', match_id: 'R2_C0' })],
      eventRows: [E(), E({ tournament_id: 'OTHER' }), E({ tournament_id: '' })],
      cupId: 'CUP',
    });
    expect(matchRows).toHaveLength(1);
    expect(eventRows).toHaveLength(1);
  });
  it('임시 라운드 경기와 그 경기의 이벤트를 함께 걷어낸다(문자열 TRUE 포함)', () => {
    const { matchRows, eventRows } = selectCupRows({
      matchRows: [M(), M({ match_id: 'R2_C0', is_extra: true }), M({ match_id: 'R3_C0', is_extra: 'TRUE' })],
      eventRows: [E(), E({ match_id: 'R2_C0' }), E({ match_id: 'R3_C0' })],
      cupId: 'CUP',
    });
    expect(matchRows.map(r => r.match_id)).toEqual(['R1_C0']);
    expect(eventRows.map(r => r.match_id)).toEqual(['R1_C0']);
  });
  it('로그_매치에 짝이 없는 이벤트는 남기고, 골 이벤트는 중복 제거하지 않는다', () => {
    const { eventRows } = selectCupRows({ matchRows: [M()], eventRows: [E(), E(), E({ match_id: 'R9_C0' })], cupId: 'CUP' });
    expect(eventRows).toHaveLength(3);
  });
  it('tournament_id 가 숫자로 들어와도 문자열 cupId 와 맞춘다', () => {
    const { matchRows } = selectCupRows({ matchRows: [M({ tournament_id: 2026 })], eventRows: [], cupId: '2026' });
    expect(matchRows).toHaveLength(1);
  });
  it('입력이 undefined 여도 빈 배열', () => {
    expect(selectCupRows({ cupId: 'CUP' })).toEqual({ matchRows: [], eventRows: [] });
  });
});

describe('collectPlayedPairs', () => {
  it('홈·원정 순서 무관 같은 키, 임시 라운드·다른 대회 제외, "팀 A" 공백 정규화', () => {
    const pairs = collectPlayedPairs([
      M(), M({ our_team_name: '팀B', opponent_team_name: '팀A', match_id: 'R2_C0' }),
      M({ our_team_name: '팀 A', opponent_team_name: '팀C', match_id: 'R3_C0' }),
      M({ opponent_team_name: '팀C', is_extra: true, match_id: 'R4_C0' }),
      M({ tournament_id: 'OTHER', our_team_name: '팀X', opponent_team_name: '팀Y' }),
    ], 'CUP');
    expect([...pairs].sort()).toEqual(['팀A|팀B', '팀A|팀C']);
  });
  it('빈 입력은 빈 Set', () => {
    expect(collectPlayedPairs(undefined, 'CUP').size).toBe(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/utils/__tests__/cupRecords.test.js`
Expected: FAIL — `Failed to resolve import "../cup/cupRecords"`.

- [ ] **Step 3: 구현**

`src/utils/cup/cupRecords.js`:

```js
// src/utils/cup/cupRecords.js
// 마스터스컵 3단계 — 대회 누적 순위표·개인기록·경기일별 내역의 순수 계산.
// 스펙: docs/superpowers/specs/2026-09-26-masters-cup-s3-records-design.md §3.
// 입력은 시트 캐시 컵 뷰(cupMatchLog/cupEventLog) 행 + 대회 엔티티(팀명·players).
// React/firebase 를 import 하지 않는다(테스트·vite-node 양쪽에서 쓰인다).
import { normalizeMatchId } from '../matchIdNormalizer';
import { parseMembersWithAbsent } from '../analyticsV2/parseMembers';
import { cleanPlayerName, normalizeTeamName } from './cupEntity';

// 경기일당 등록 팀원 참석이 이 수 이상이면 참석 가점 +1
export const ATTEND_BONUS_MIN = 7;
// 이긴 팀의 득점−실점이 이 수 이상이면 다득점 가점 +1
export const MARGIN_BONUS_MIN = 3;

// is_extra 는 세션 저장값(boolean) 또는 시트 경유 문자열('TRUE')로 온다 — 둘 다 임시 라운드.
export function isExtraRow(row) {
  const v = row?.is_extra;
  return v === true || String(v ?? '').trim().toUpperCase() === 'TRUE';
}

// 경기 키. 로그_이벤트 match_id 는 표준형, 로그_매치 match_id 는 세션 원값 — 양쪽 다 정규화해 잇는다.
export function matchKeyOf(row) {
  const mid = normalizeMatchId(row?.match_id ?? '', '풋살') ?? '';
  return `${row?.date ?? ''}|${row?.game_id ?? ''}|${mid}`;
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const teamOf = (v) => normalizeTeamName(v);
const nameOf = (v) => cleanPlayerName(v);
const byKo = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'ko');
const sameCup = (row, cupId) => String(row?.tournament_id ?? '') === String(cupId ?? '');

// 명단 JSON → 정규화된 이름 배열. 휴식(absent) 포함 — 참석은 "왔는가"다. 빈 이름·중복 제거.
function membersOf(json) {
  const { players } = parseMembersWithAbsent(json);
  return [...new Set(players.map(nameOf).filter(Boolean))];
}

// 대회 엔티티 → Map<정규화 팀명, Set<정규화 선수명>>. RTDB 빈 배열 누락 방어.
function rosterOf(cup) {
  const out = new Map();
  for (const t of cup?.teams || []) {
    const name = teamOf(t?.name);
    if (!name) continue;
    if (!out.has(name)) out.set(name, new Set());
    for (const p of t?.players || []) { const n = nameOf(p); if (n) out.get(name).add(n); }
  }
  return out;
}

/**
 * 그 대회의 행만 남기고 임시 라운드를 경기·이벤트에서 함께 걷어낸다.
 * 로그_매치에 짝이 없는 이벤트는 남긴다(부분 실패 재전송 중인 날의 골이 사라지면 안 된다).
 * 골/자책 이벤트는 어떤 키로도 중복 제거하지 않는다.
 */
export function selectCupRows({ matchRows = [], eventRows = [], cupId }) {
  const mine = (matchRows || []).filter(r => r && sameCup(r, cupId));
  const extraKeys = new Set(mine.filter(isExtraRow).map(matchKeyOf));
  return {
    matchRows: mine.filter(r => !isExtraRow(r)),
    eventRows: (eventRows || []).filter(e => e && sameCup(e, cupId) && !extraKeys.has(matchKeyOf(e))),
  };
}

// 잠금 파생용 — 그 대회의 (임시 라운드 아닌) 치른 팀 쌍 "A|B"(정렬). isLocked(cup, playedPairs) 의 두 번째 인자.
export function collectPlayedPairs(matchRows, cupId) {
  const out = new Set();
  for (const r of matchRows || []) {
    if (!r || !sameCup(r, cupId) || isExtraRow(r)) continue;
    const home = teamOf(r.our_team_name), away = teamOf(r.opponent_team_name);
    if (!home || !away) continue;
    out.add([home, away].sort(byKo).join('|'));
  }
  return out;
}

export const _internal = { num, teamOf, nameOf, byKo, membersOf, rosterOf, sameCup };
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/utils/__tests__/cupRecords.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/utils/cup/cupRecords.js src/utils/__tests__/cupRecords.test.js
git commit -m "feat(cup): cupRecords — 컵 행 선별(임시 라운드 경기·이벤트 동시 제외)·경기 키·치른 팀 쌍 (3단계 스펙 §3.1·§3.4)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `calcCupStandings` — 누적 순위표 + 경기일별 내역

**Files:**
- Modify: `src/utils/cup/cupRecords.js` (Task 1 의 `_internal` 위에 함수 추가)
- Test: `src/utils/__tests__/cupRecords.test.js` (describe 추가)

**Interfaces:**
- Consumes: Task 1 의 `num`·`teamOf`·`membersOf`·`byKo`·`rosterOf`·`matchKeyOf`, `ATTEND_BONUS_MIN`·`MARGIN_BONUS_MIN`.
- Produces: `calcCupStandings({ matchRows, cup }) → { standings, days }`
  - `standings[i] = { name, registered, games, wins, draws, losses, gf, ga, gd, points, bonusAttend, bonusMargin, bonusClean, bonus, total }` (합계 → 골득실 → 다득점 → 팀명 정렬)
  - `days[i] = { date, matches: [{ key, matchId, home, away, homeScore, awayScore, homeBonus:{margin,clean}, awayBonus:{margin,clean} }], teams: { [name]: { registered, present, guests, bonusAttend, points, bonusMargin, bonusClean } } }` (date 오름차순, matches 는 match_idx 오름차순)

- [ ] **Step 1: 실패하는 테스트 추가**

`src/utils/__tests__/cupRecords.test.js` 의 import 에 `calcCupStandings` 를 더하고 파일 끝에 추가:

```js
const A7 = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'];
const B6 = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];
export const CUP = {
  meta: { id: 'CUP', name: 'CUP', sport: '풋살', status: 'active', createdAt: 1, createdBy: '', updatedAt: 1, lockedAt: null },
  teams: [
    { id: 't1', name: '팀A', captain: '', players: A7, order: 0 },
    { id: 't2', name: '팀B', captain: '', players: B6, order: 1 },
    { id: 't3', name: '팀C', captain: '', players: ['c1'], order: 2 },
  ],
};
const row = (standings, name) => standings.find(s => s.name === name);
const stand = (rows) => calcCupStandings({ matchRows: selectCupRows({ matchRows: rows, eventRows: [], cupId: 'CUP' }).matchRows, cup: CUP });

describe('calcCupStandings — 경기 단위 승점·가점', () => {
  it('0:0 → 양 팀 무 1점 + 무실점 1점', () => {
    const { standings } = stand([M({ our_score: 0, opponent_score: 0 })]);
    expect(row(standings, '팀A')).toMatchObject({ games: 1, draws: 1, points: 1, bonusClean: 1, bonusMargin: 0, bonusAttend: 0, total: 2 });
    expect(row(standings, '팀B')).toMatchObject({ games: 1, draws: 1, points: 1, bonusClean: 1, total: 2 });
  });
  it('2:0 → 이긴 팀 3 + 무실점 1, 진 팀 0', () => {
    const { standings } = stand([M({ our_score: 2, opponent_score: 0 })]);
    expect(row(standings, '팀A')).toMatchObject({ wins: 1, points: 3, bonusMargin: 0, bonusClean: 1, total: 4, gf: 2, ga: 0, gd: 2 });
    expect(row(standings, '팀B')).toMatchObject({ losses: 1, points: 0, bonusClean: 0, total: 0, gd: -2 });
  });
  it('0:1 → 원정 승 3 + 무실점 1', () => {
    const { standings } = stand([M({ our_score: 0, opponent_score: 1 })]);
    expect(row(standings, '팀B')).toMatchObject({ wins: 1, points: 3, bonusClean: 1, total: 4 });
    expect(row(standings, '팀A')).toMatchObject({ losses: 1, total: 0 });
  });
  it('3:0 → 다득점 1 + 무실점 1 (합계 5)', () => {
    const { standings } = stand([M({ our_score: 3, opponent_score: 0 })]);
    expect(row(standings, '팀A')).toMatchObject({ points: 3, bonusMargin: 1, bonusClean: 1, bonus: 2, total: 5 });
  });
  it('4:1 → 다득점만(합계 4), 3:1 → 가점 없음(합계 3)', () => {
    expect(row(stand([M({ our_score: 4, opponent_score: 1 })]).standings, '팀A')).toMatchObject({ bonusMargin: 1, bonusClean: 0, total: 4 });
    expect(row(stand([M({ our_score: 3, opponent_score: 1 })]).standings, '팀A')).toMatchObject({ bonusMargin: 0, bonusClean: 0, total: 3 });
  });
  it('스코어가 문자열로 와도 숫자로 센다', () => {
    const { standings } = stand([M({ our_score: '3', opponent_score: '0' })]);
    expect(row(standings, '팀A')).toMatchObject({ gf: 3, total: 5 });
  });
});

describe('calcCupStandings — 경기일 단위 참석 가점', () => {
  it('등록 팀원 6명 참석은 0, 7명은 +1', () => {
    const six = stand([M({ our_members_json: JSON.stringify(A7.slice(0, 6)) })]);
    expect(row(six.standings, '팀A').bonusAttend).toBe(0);
    const seven = stand([M({ our_members_json: JSON.stringify(A7) })]);
    expect(row(seven.standings, '팀A').bonusAttend).toBe(1);
    expect(seven.days[0].teams['팀A']).toMatchObject({ registered: true, present: 7, bonusAttend: 1, guests: [] });
  });
  it('같은 날짜에 세션(game_id)이 둘이어도 경기일당 1, 다른 날짜면 날짜마다', () => {
    const sameDay = stand([
      M({ our_members_json: JSON.stringify(A7) }),
      M({ game_id: 'g2', match_id: 'R1_C0', our_members_json: JSON.stringify(A7) }),
    ]);
    expect(row(sameDay.standings, '팀A').bonusAttend).toBe(1);
    expect(sameDay.days).toHaveLength(1);
    const twoDays = stand([
      M({ our_members_json: JSON.stringify(A7) }),
      M({ date: '2026-10-08', game_id: 'g2', our_members_json: JSON.stringify(A7) }),
    ]);
    expect(row(twoDays.standings, '팀A').bonusAttend).toBe(2);
    expect(twoDays.days.map(d => d.date)).toEqual(['2026-10-01', '2026-10-08']);
  });
  it('용병 이동: A 등록 팀원이 B 명단으로 뛰면 A 참석에 들어가고 B 참석에는 안 들어간다(서라현 예시)', () => {
    // A 명단 6명(a1~a6), B 명단 = 등록 6명 + a7. a7 은 A 등록 팀원.
    const { standings, days } = stand([M({
      our_members_json: JSON.stringify(A7.slice(0, 6)),
      opponent_members_json: JSON.stringify([...B6, 'a7']),
    })]);
    expect(row(standings, '팀A').bonusAttend).toBe(1);   // 등록 7명이 그날 왔다
    expect(row(standings, '팀B').bonusAttend).toBe(0);   // 등록 팀원은 6명뿐
    expect(days[0].teams['팀A']).toMatchObject({ present: 7, guests: [] });
    expect(days[0].teams['팀B']).toMatchObject({ present: 6, guests: ['a7'] });
  });
  it('휴식 라운드 선수도 참석으로 센다({players, absent} 형식)', () => {
    const { standings } = stand([M({ our_members_json: JSON.stringify({ players: A7, absent: ['a7'] }) })]);
    expect(row(standings, '팀A').bonusAttend).toBe(1);
  });
  it('이름 장식(★)·공백은 등록 팀원과 같은 사람으로 본다', () => {
    const { standings } = stand([M({ our_members_json: JSON.stringify(['a1 ★', ' a2', 'a3', 'a4', 'a5', 'a6', 'a7']) })]);
    expect(row(standings, '팀A').bonusAttend).toBe(1);
  });
  it('미등록 팀명은 registered:false 이고 7명이 와도 참석 가점이 없다', () => {
    const { standings, days } = stand([M({ our_team_name: '팀X', our_members_json: JSON.stringify(['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7']) })]);
    expect(row(standings, '팀X')).toMatchObject({ registered: false, bonusAttend: 0, games: 1 });
    expect(days[0].teams['팀X']).toMatchObject({ registered: false, present: 0, guests: [] });
  });
  it('그날 경기가 없는 등록 팀도 days.teams 에 나오고 참석 0', () => {
    const { days } = stand([M()]);
    expect(days[0].teams['팀C']).toMatchObject({ registered: true, present: 0, bonusAttend: 0, points: 0 });
  });
});

describe('calcCupStandings — 합산·정렬·출력 모양', () => {
  it('두 경기일·같은 조합 재대결을 모두 합산한다', () => {
    const { standings } = stand([
      M({ our_score: 1, opponent_score: 0 }),
      M({ match_id: 'R2_C0', match_idx: 2, our_score: 0, opponent_score: 2 }),
      M({ date: '2026-10-08', game_id: 'g2', our_score: 1, opponent_score: 1 }),
    ]);
    expect(row(standings, '팀A')).toMatchObject({ games: 3, wins: 1, draws: 1, losses: 1, gf: 2, ga: 3, gd: -1, points: 4, bonusClean: 1, total: 5 });
    expect(row(standings, '팀B')).toMatchObject({ games: 3, wins: 1, draws: 1, losses: 1, gf: 3, ga: 2, gd: 1, points: 4, bonusClean: 1, total: 5 });
  });
  it('정렬: 합계 → 골득실 → 다득점 → 팀명', () => {
    // A 1:0 B (A 4점, gd+1, gf1) / C 2:0 B (C 4점, gd+2) → C, A
    const s1 = stand([M({ our_score: 1, opponent_score: 0 }), M({ our_team_name: '팀C', our_members_json: '["c1"]', match_id: 'R1_C1', match_idx: 2, our_score: 2, opponent_score: 0 })]).standings;
    expect(s1.map(s => s.name)).toEqual(['팀C', '팀A', '팀B']);
    // A 3:2 B (3점, gd+1, gf3) / C 2:1 B (3점, gd+1, gf2) → A, C
    const s2 = stand([M({ our_score: 3, opponent_score: 2 }), M({ our_team_name: '팀C', our_members_json: '["c1"]', match_id: 'R1_C1', match_idx: 2, our_score: 2, opponent_score: 1 })]).standings;
    expect(s2.map(s => s.name)).toEqual(['팀A', '팀C', '팀B']);
    // A 1:0 B / C 1:0 B → 완전 동률 → 팀명 순 A, C
    const s3 = stand([M({ our_score: 1, opponent_score: 0 }), M({ our_team_name: '팀C', our_members_json: '["c1"]', match_id: 'R1_C1', match_idx: 2, our_score: 1, opponent_score: 0 })]).standings;
    expect(s3.map(s => s.name)).toEqual(['팀A', '팀C', '팀B']);
  });
  it('0경기 등록 팀은 전부 0으로 마지막에', () => {
    const { standings } = stand([M({ our_score: 1, opponent_score: 0 })]);
    expect(standings[standings.length - 1]).toMatchObject({ name: '팀C', registered: true, games: 0, total: 0, gd: 0 });
  });
  it('경기가 없으면 등록 팀만 0으로, days 는 빈 배열', () => {
    const { standings, days } = calcCupStandings({ matchRows: [], cup: CUP });
    expect(standings.map(s => s.name)).toEqual(['팀A', '팀B', '팀C']);
    expect(days).toEqual([]);
  });
  it('days.matches 는 match_idx 오름차순이고 경기 가점을 양쪽에 단다', () => {
    const { days } = stand([
      M({ match_idx: 2, match_id: 'R2_C0', our_score: 0, opponent_score: 0 }),
      M({ match_idx: 1, match_id: 'R1_C0', our_score: 3, opponent_score: 0 }),
    ]);
    expect(days[0].matches.map(m => m.matchId)).toEqual(['R1_C0', 'R2_C0']);
    expect(days[0].matches[0]).toMatchObject({ home: '팀A', away: '팀B', homeScore: 3, awayScore: 0, homeBonus: { margin: 1, clean: 1 }, awayBonus: { margin: 0, clean: 0 }, key: '2026-10-01|g1|R1_C0' });
    expect(days[0].matches[1]).toMatchObject({ homeBonus: { margin: 0, clean: 1 }, awayBonus: { margin: 0, clean: 1 } });
    expect(days[0].teams['팀A']).toMatchObject({ points: 4, bonusMargin: 1, bonusClean: 2 });
  });
  it('cup 이 teams 없이 와도(RTDB 빈 배열 누락) 행의 팀만으로 계산한다', () => {
    const { standings } = calcCupStandings({ matchRows: [M({ our_score: 1, opponent_score: 0 })], cup: { meta: { id: 'CUP' } } });
    expect(standings.map(s => s.name)).toEqual(['팀A', '팀B']);
    expect(standings[0]).toMatchObject({ registered: false, total: 4 });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/utils/__tests__/cupRecords.test.js`
Expected: FAIL — `calcCupStandings is not a function` (또는 import 에서 undefined).

- [ ] **Step 3: 구현**

`src/utils/cup/cupRecords.js` 의 `export const _internal` 줄 **위에** 추가:

```js
function newTeamStat(name, registered) {
  return { name, registered, games: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, points: 0, bonusAttend: 0, bonusMargin: 0, bonusClean: 0, bonus: 0, total: 0 };
}
function newDayTeam(registered) {
  return { registered, present: 0, guests: [], bonusAttend: 0, points: 0, bonusMargin: 0, bonusClean: 0 };
}

/**
 * 대회 누적 순위표 + 경기일별 내역. matchRows 는 selectCupRows 를 거친(그 대회·임시 라운드 제외) 행.
 * 승점 3/1/0 + 가점(경기일 참석 등록 팀원 7명↑ / 3점차↑ 승리 / 무실점) → 합계 → 골득실 → 다득점 → 팀명.
 * 참석은 "등록 팀원이 그날 어느 명단에든 있는가"로 원소속 팀에 센다(용병 이동 시 옮겨간 팀에는 안 센다).
 */
export function calcCupStandings({ matchRows = [], cup }) {
  const roster = rosterOf(cup);
  const stats = new Map();
  const ensure = (name) => {
    if (!stats.has(name)) stats.set(name, newTeamStat(name, roster.has(name)));
    return stats.get(name);
  };
  for (const name of roster.keys()) ensure(name);

  // 경기일 버킷: date → { date, matches, attendees:Set(그날 온 전원), lists:Map(팀→Set(그 팀 명단으로 뛴 사람)), teams:Map }
  const dayMap = new Map();
  const dayOf = (date) => {
    if (!dayMap.has(date)) dayMap.set(date, { date, matches: [], attendees: new Set(), lists: new Map(), teams: new Map() });
    return dayMap.get(date);
  };
  const dayTeam = (day, name) => {
    if (!day.teams.has(name)) day.teams.set(name, newDayTeam(roster.has(name)));
    return day.teams.get(name);
  };
  const dayList = (day, name) => {
    if (!day.lists.has(name)) day.lists.set(name, new Set());
    return day.lists.get(name);
  };

  const ordered = [...(matchRows || [])].filter(Boolean)
    .sort((a, b) => byKo(a.date, b.date) || num(a.match_idx) - num(b.match_idx));

  for (const r of ordered) {
    const home = teamOf(r.our_team_name), away = teamOf(r.opponent_team_name);
    if (!home || !away) continue;
    const hs = num(r.our_score), as = num(r.opponent_score);
    const h = ensure(home), a = ensure(away);
    const day = dayOf(String(r.date ?? ''));
    const dh = dayTeam(day, home), da = dayTeam(day, away);

    h.games++; a.games++;
    h.gf += hs; h.ga += as; a.gf += as; a.ga += hs;
    const homeBonus = { margin: 0, clean: as === 0 ? 1 : 0 };
    const awayBonus = { margin: 0, clean: hs === 0 ? 1 : 0 };
    let hp = 0, ap = 0;
    if (hs > as) { h.wins++; a.losses++; hp = 3; if (hs - as >= MARGIN_BONUS_MIN) homeBonus.margin = 1; }
    else if (hs < as) { a.wins++; h.losses++; ap = 3; if (as - hs >= MARGIN_BONUS_MIN) awayBonus.margin = 1; }
    else { h.draws++; a.draws++; hp = 1; ap = 1; }
    h.points += hp; a.points += ap;
    h.bonusMargin += homeBonus.margin; h.bonusClean += homeBonus.clean;
    a.bonusMargin += awayBonus.margin; a.bonusClean += awayBonus.clean;
    dh.points += hp; dh.bonusMargin += homeBonus.margin; dh.bonusClean += homeBonus.clean;
    da.points += ap; da.bonusMargin += awayBonus.margin; da.bonusClean += awayBonus.clean;

    day.matches.push({ key: matchKeyOf(r), matchId: String(r.match_id ?? ''), home, away, homeScore: hs, awayScore: as, homeBonus, awayBonus });
    for (const p of membersOf(r.our_members_json)) { day.attendees.add(p); dayList(day, home).add(p); }
    for (const p of membersOf(r.opponent_members_json)) { day.attendees.add(p); dayList(day, away).add(p); }
  }

  // 경기일 단위 참석 가점 — 등록 팀마다, 그날 온 등록 팀원 수로.
  const days = [...dayMap.values()].sort((x, y) => byKo(x.date, y.date)).map(day => {
    for (const [name, players] of roster) {
      const dt = dayTeam(day, name);
      let present = 0;
      for (const p of players) if (day.attendees.has(p)) present++;
      dt.present = present;
      dt.guests = [...(day.lists.get(name) || [])].filter(p => !players.has(p)).sort(byKo);
      if (present >= ATTEND_BONUS_MIN) { dt.bonusAttend = 1; ensure(name).bonusAttend++; }
    }
    const teams = {};
    for (const [name, dt] of day.teams) teams[name] = dt;
    return { date: day.date, matches: day.matches, teams };
  });

  const standings = [...stats.values()].map(s => {
    const gd = s.gf - s.ga;
    const bonus = s.bonusAttend + s.bonusMargin + s.bonusClean;
    return { ...s, gd, bonus, total: s.points + bonus };
  }).sort((x, y) => y.total - x.total || y.gd - x.gd || y.gf - x.gf || byKo(x.name, y.name));

  return { standings, days };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/utils/__tests__/cupRecords.test.js`
Expected: PASS (9 + 19 = 28 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/utils/cup/cupRecords.js src/utils/__tests__/cupRecords.test.js
git commit -m "feat(cup): calcCupStandings — 승점+가점(경기일 참석 등록 팀원 7명↑·3점차↑·무실점)→골득실 누적 순위표와 경기일별 내역 (3단계 스펙 §3.2)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `calcCupPlayerRecords` — 개인기록

**Files:**
- Modify: `src/utils/cup/cupRecords.js`
- Test: `src/utils/__tests__/cupRecords.test.js`

**Interfaces:**
- Consumes: Task 1 의 `num`·`nameOf`·`membersOf`·`byKo`·`rosterOf`.
- Produces: `calcCupPlayerRecords({ matchRows, eventRows, cup }) → [{ name, team, guest, goals, assists, cleanSheets, ownGoals, days }]` (골 → 어시 → 클린시트 → 이름 정렬, 등록 팀원 전원 포함).

- [ ] **Step 1: 실패하는 테스트 추가**

import 에 `calcCupPlayerRecords` 를 더하고 파일 끝에 추가:

```js
const recs = (rows, events) => {
  const sel = selectCupRows({ matchRows: rows, eventRows: events, cupId: 'CUP' });
  return calcCupPlayerRecords({ matchRows: sel.matchRows, eventRows: sel.eventRows, cup: CUP });
};
const rec = (list, name) => list.find(r => r.name === name);

describe('calcCupPlayerRecords', () => {
  it('골·어시·자책골은 로그_이벤트에서', () => {
    const list = recs([M()], [
      E({ player: 'a2', related_player: 'a3' }), E({ player: 'a2' }), E({ event_type: 'owngoal', player: 'b1', related_player: '' }),
    ]);
    expect(rec(list, 'a2')).toMatchObject({ goals: 2, assists: 0, ownGoals: 0 });
    expect(rec(list, 'a3')).toMatchObject({ goals: 0, assists: 1 });
    expect(rec(list, 'b1')).toMatchObject({ ownGoals: 1, goals: 0 });
  });
  it('클린시트는 로그_매치 GK 열·경기 단위: 2:0 은 홈 GK 만, 0:0 은 양쪽', () => {
    const list = recs([
      M({ our_score: 2, opponent_score: 0 }),
      M({ match_id: 'R2_C0', match_idx: 2, our_score: 0, opponent_score: 0 }),
    ], []);
    expect(rec(list, 'a1').cleanSheets).toBe(2);
    expect(rec(list, 'b1').cleanSheets).toBe(1);
  });
  it('GK 열이 비어 있으면 클린시트를 아무에게도 주지 않는다', () => {
    const list = recs([M({ our_gk: '', opponent_gk: '', our_score: 0, opponent_score: 0 })], []);
    expect(list.every(r => r.cleanSheets === 0)).toBe(true);
  });
  it('원정 명단·원정 GK 로만 뛴 선수도 참석·클린시트가 잡힌다', () => {
    const list = recs([M({ our_score: 0, opponent_score: 1, opponent_gk: 'b6', opponent_members_json: JSON.stringify(B6) })], []);
    expect(rec(list, 'b6')).toMatchObject({ cleanSheets: 1, days: 1, team: '팀B', guest: false });
  });
  it('참석횟수는 라운드 수가 아니라 날짜 수', () => {
    const list = recs([
      M(), M({ match_id: 'R2_C0', match_idx: 2 }), M({ date: '2026-10-08', game_id: 'g2' }),
    ], []);
    expect(rec(list, 'a1').days).toBe(2);
  });
  it('휴식 라운드에 있던 선수도 그날 참석', () => {
    const list = recs([M({ our_members_json: JSON.stringify({ players: A5, absent: ['a5'] }) })], []);
    expect(rec(list, 'a5').days).toBe(1);
  });
  it('등록 팀원 전원이 0 기록으로도 나온다, 등록 안 된 이름은 용병', () => {
    const list = recs([M({ opponent_members_json: JSON.stringify([...B5, 'z1']) })], []);
    expect(rec(list, 'c1')).toMatchObject({ team: '팀C', guest: false, goals: 0, days: 0 });
    expect(rec(list, 'z1')).toMatchObject({ team: '', guest: true, days: 1 });
  });
  it('이름 장식·공백은 같은 사람', () => {
    const list = recs([M({ our_members_json: JSON.stringify(['a1 ★', 'a2']) })], [E({ player: ' a2 ' })]);
    expect(rec(list, 'a1').days).toBe(1);
    expect(rec(list, 'a2')).toMatchObject({ goals: 1, days: 1 });
    expect(list.filter(r => r.name.includes('★'))).toHaveLength(0);
  });
  it('임시 라운드의 골은 selectCupRows 를 거치면 빠진다', () => {
    const list = recs([M(), M({ match_id: 'R2_C0', is_extra: true })], [E(), E({ match_id: 'R2_C0' })]);
    expect(rec(list, 'a2').goals).toBe(1);
  });
  it('정렬: 골 → 어시 → 클린시트 → 이름', () => {
    const list = recs([M({ our_score: 1, opponent_score: 0 })], [
      E({ player: 'b2', related_player: 'b3' }), E({ player: 'a4', related_player: 'a3' }), E({ player: 'a3' }),
    ]);
    // a3: 1골 1어시 / a4·b2: 1골 0어시 → 이름 순 a4, b2 / a1: 0골 CS1 / b3: 0골 1어시
    expect(list.slice(0, 3).map(r => r.name)).toEqual(['a3', 'a4', 'b2']);
    expect(list[3].name).toBe('b3');
    expect(list[4].name).toBe('a1');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/utils/__tests__/cupRecords.test.js`
Expected: FAIL — `calcCupPlayerRecords is not a function`.

- [ ] **Step 3: 구현**

`src/utils/cup/cupRecords.js` 의 `export const _internal` 줄 **위에** 추가:

```js
/**
 * 대회 개인기록. 골·어시·자책골은 로그_이벤트, 클린시트는 로그_매치 GK 열(경기 단위, 당일 세션 화면과 같은 정의),
 * 참석횟수는 어느 팀 명단에든(휴식 포함) 등장한 날짜 수. 등록 팀원 전원 ∪ 로그에 등장한 이름.
 */
export function calcCupPlayerRecords({ matchRows = [], eventRows = [], cup }) {
  const roster = rosterOf(cup);
  const teamByPlayer = new Map();
  for (const [team, players] of roster) for (const p of players) if (!teamByPlayer.has(p)) teamByPlayer.set(p, team);

  const recs = new Map();
  const ensure = (name) => {
    if (!recs.has(name)) {
      recs.set(name, { name, team: teamByPlayer.get(name) || '', guest: !teamByPlayer.has(name), goals: 0, assists: 0, cleanSheets: 0, ownGoals: 0, dates: new Set() });
    }
    return recs.get(name);
  };
  for (const p of teamByPlayer.keys()) ensure(p);

  for (const r of matchRows || []) {
    if (!r) continue;
    const date = String(r.date ?? '');
    const hs = num(r.our_score), as = num(r.opponent_score);
    for (const p of membersOf(r.our_members_json)) ensure(p).dates.add(date);
    for (const p of membersOf(r.opponent_members_json)) ensure(p).dates.add(date);
    const hg = nameOf(r.our_gk), ag = nameOf(r.opponent_gk);
    if (hg && as === 0) ensure(hg).cleanSheets++;
    if (ag && hs === 0) ensure(ag).cleanSheets++;
  }
  for (const e of eventRows || []) {
    if (!e) continue;
    const type = String(e.event_type ?? '');
    const p = nameOf(e.player);
    if (type === 'goal') {
      if (p) ensure(p).goals++;
      const a = nameOf(e.related_player);
      if (a) ensure(a).assists++;
    } else if (type === 'owngoal') {
      if (p) ensure(p).ownGoals++;
    }
  }

  return [...recs.values()]
    .map(({ dates, ...rec }) => ({ ...rec, days: dates.size }))
    .sort((x, y) => y.goals - x.goals || y.assists - x.assists || y.cleanSheets - x.cleanSheets || byKo(x.name, y.name));
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/utils/__tests__/cupRecords.test.js`
Expected: PASS (28 + 10 = 38 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/utils/cup/cupRecords.js src/utils/__tests__/cupRecords.test.js
git commit -m "feat(cup): calcCupPlayerRecords — 골·어시·자책(로그_이벤트)·클린시트(로그_매치 GK, 경기 단위)·참석 날짜 수, 등록 팀원 전원 포함 (3단계 스펙 §3.3)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 시트 캐시 alias 뷰 `cupMatchLog`·`cupEventLog`

**Files:**
- Modify: `src/services/sheetCache.js` — `ADAPTERS` 상수 아래(약 95행)에 `ALIASES`·`_resolve` 추가, `_adapter` 제거, `get`(약 196행)·`refresh`(약 268행)·`status`(약 311행) 호출부 교체, `_aliasesForTest` 추가(약 341행)
- Test: `src/services/__tests__/sheetCache.alias.test.js`

**Interfaces:**
- Produces: `SheetCache.get('cupMatchLog', { sport: '풋살' })` → 풋살 로그_매치 중 `tournament_id` 있는 행(모든 대회). `SheetCache.get('cupEventLog', { sport: '풋살' })` 동일. `SheetCache._aliasesForTest() → ALIASES`.
- 불변: `SheetCache.datasetsOf('풋살')` 결과 불변(7종), 캐시 경로 `cache/{팀}/풋살/matchLog/all` 공유.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/services/__tests__/sheetCache.alias.test.js` (목 설정은 `sheetCache.rowFilter.test.js` 와 같은 구조):

```js
// src/services/__tests__/sheetCache.alias.test.js
// 3단계 스펙 §4.1 — 컵 alias 뷰(cupMatchLog/cupEventLog)는 원본 노드를 공유하고 반환만 컵 행으로 거른다.
// 정규 뷰 ∪ 컵 뷰 = 전체, 교집합 없음. alias 는 datasetsOf/refreshAll/status 대상이 아니다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  store: new Map(),
  fetchCounts: { matchLog: 0, eventLog: 0 },
  auth: { team: '마스터FC', mode: '풋살' },
  settings: {},
}));

vi.mock('../../config/firebase', () => ({ firebaseDb: {} }));
vi.mock('firebase/database', () => ({
  ref: (_db, path) => ({ path }),
  get: async (r) => (h.store.has(r.path) ? { val: () => h.store.get(r.path) } : { val: () => null }),
  set: async (r, value) => {
    const v = { ...value };
    if (v.version && v.version.__sv) v.version = Date.now();
    h.store.set(r.path, v);
  },
  remove: async (r) => { h.store.delete(r.path); },
  serverTimestamp: () => ({ __sv: true }),
}));
vi.mock('../authUtil', () => ({ default: { getStored: () => h.auth } }));
vi.mock('../../config/settings', () => ({ getEffectiveSettings: () => h.settings }));
vi.mock('../tennisSync', () => ({ default: {} }));

const REG = { team: '마스터FC', sport: '풋살', mode: '기본', tournament_id: '', date: '2026-09-13', match_id: 'R1_C0', our_team_name: '팀A', opponent_team_name: '팀B', our_score: 1, opponent_score: 0, is_extra: false };
const CUP = { ...REG, mode: '대회', tournament_id: '마스터스컵 2026', date: '2026-10-01' };
const REG_EV = { team: '마스터FC', sport: '풋살', mode: '기본', tournament_id: '', date: '2026-09-13', match_id: 'R1_C0', event_type: 'goal', player: '김철수' };
const CUP_EV = { ...REG_EV, mode: '대회', tournament_id: '마스터스컵 2026', date: '2026-10-01' };

vi.mock('../appSync', () => ({
  default: {
    getMatchLog: () => { h.fetchCounts.matchLog++; return Promise.resolve({ rows: [REG, CUP] }); },
    getEventLog: () => { h.fetchCounts.eventLog++; return Promise.resolve({ rows: [REG_EV, CUP_EV] }); },
    getPlayerGameLog: () => Promise.resolve({ rows: [] }),
    getPointLog: () => Promise.resolve([]),
    getPlayerLog: () => Promise.resolve([]),
    getLatestDeltas: () => Promise.resolve({}),
    getCumulativeBonus: () => Promise.resolve({ crova: {}, goguma: {} }),
  },
}));

import SheetCache from '../sheetCache';

beforeEach(() => {
  h.store.clear();
  h.fetchCounts = { matchLog: 0, eventLog: 0 };
  h.auth = { team: '마스터FC', mode: '풋살' };
  h.settings = {};
  SheetCache._resetForTest();
});

describe('alias 레지스트리', () => {
  it('datasetsOf(풋살) 에 alias 가 없다(재적재·상태 대상 불변)', () => {
    const ds = SheetCache.datasetsOf('풋살');
    expect(ds).not.toContain('cupMatchLog');
    expect(ds).not.toContain('cupEventLog');
    expect(ds).toHaveLength(7);
  });
  it('alias 는 존재하는 원본 어댑터를 가리키고 rowFilter 를 갖는다; 축구·테니스에는 없다', () => {
    const aliases = SheetCache._aliasesForTest();
    const adapters = SheetCache._adaptersForTest();
    expect(Object.keys(aliases['풋살']).sort()).toEqual(['cupEventLog', 'cupMatchLog']);
    for (const [k, a] of Object.entries(aliases['풋살'])) {
      expect(adapters['풋살'][a.alias], k).toBeDefined();
      expect(typeof a.rowFilter, k).toBe('function');
    }
    expect(aliases['축구']).toBeUndefined();
    expect(aliases['테니스']).toBeUndefined();
  });
  it('축구에서 cupMatchLog 를 부르면 빈 배열(어댑터 없음과 동일)', async () => {
    expect(await SheetCache.get('cupMatchLog', { sport: '축구' })).toEqual([]);
  });
});

describe('컵 뷰 반환·경로 공유', () => {
  it('L3 폴백: 컵 행만 돌려주고 노드는 원본 경로에 전체 행', async () => {
    const rows = await SheetCache.get('cupMatchLog', { sport: '풋살' });
    expect(rows).toEqual([CUP]);
    expect(h.store.get('cache/마스터FC/풋살/matchLog/all').count).toBe(2);
    expect([...h.store.keys()].some(k => k.includes('cupMatchLog'))).toBe(false);
  });
  it('정규 뷰 ∪ 컵 뷰 = 전체, 교집합 없음, L3 는 1회', async () => {
    const reg = await SheetCache.get('matchLog', { sport: '풋살' });
    const cup = await SheetCache.get('cupMatchLog', { sport: '풋살' });
    expect(reg).toEqual([REG]);
    expect(cup).toEqual([CUP]);
    expect(h.fetchCounts.matchLog).toBe(1);
  });
  it('in-flight 공유: 두 뷰를 동시에 불러도 L3 1회, 각자 자기 필터', async () => {
    const [reg, cup] = await Promise.all([
      SheetCache.get('eventLog', { sport: '풋살' }),
      SheetCache.get('cupEventLog', { sport: '풋살' }),
    ]);
    expect(reg).toEqual([REG_EV]);
    expect(cup).toEqual([CUP_EV]);
    expect(h.fetchCounts.eventLog).toBe(1);
  });
  it('L2 히트: L1 을 비워도 L3 를 치지 않고 컵 행만', async () => {
    await SheetCache.get('cupMatchLog', { sport: '풋살' });
    SheetCache._resetForTest();
    const rows = await SheetCache.get('cupMatchLog', { sport: '풋살' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tournament_id: '마스터스컵 2026', date: '2026-10-01' });
    expect(h.fetchCounts.matchLog).toBe(1);
  });
  it('refresh(alias): 원본 경로 재적재, rows 는 컵 행만', async () => {
    const r = await SheetCache.refresh('cupMatchLog', { sport: '풋살' });
    expect(r.ok).toBe(true);
    expect(r.rows).toEqual([CUP]);
    expect(h.store.get('cache/마스터FC/풋살/matchLog/all').count).toBe(2);
    expect(h.fetchCounts.matchLog).toBe(1);
  });
  it('alias 로 읽어도 원본 어댑터 객체의 rowFilter 는 바뀌지 않는다', async () => {
    await SheetCache.get('cupMatchLog', { sport: '풋살' });
    const adapter = SheetCache._adaptersForTest()['풋살'].matchLog;
    expect(adapter.rowFilter(REG)).toBe(true);
    expect(adapter.rowFilter(CUP)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/services/__tests__/sheetCache.alias.test.js`
Expected: FAIL — `SheetCache._aliasesForTest is not a function`, 컵 뷰가 `[]`.

- [ ] **Step 3: 구현**

(a) `src/services/sheetCache.js` 의 `const ADAPTERS = { ... };` 블록 **바로 아래**에 추가:

```js
// 풋살 컵 뷰(마스터스컵 3단계 스펙 §4.1): 원본 로그 노드를 공유하고 반환만 컵 행(tournament_id 있음)으로
// 거른다. ADAPTERS 에 넣지 않는다 — datasetsOf/refreshAll/status/마감 재적재가 ADAPTERS 만 순회하므로
// alias 가 재적재·상태 표시 대상으로 늘어나지 않고, 기존 커버리지 테스트(풋살 7종)도 그대로다.
const isCupRow = (row) => !!row?.tournament_id;
const ALIASES = {
  '풋살': {
    cupMatchLog: { alias: 'matchLog', rowFilter: isCupRow },
    cupEventLog: { alias: 'eventLog', rowFilter: isCupRow },
  },
};

// dataset → { adapter, sourceDataset } | null. alias 면 원본 어댑터에 alias 의 rowFilter 를 덮어 쓴 **사본**과
// 원본 데이터셋 키를 돌려준다(원본 객체는 건드리지 않는다). 경로는 반드시 sourceDataset 으로 만들어야
// alias 전용 RTDB 노드가 생기지 않는다.
function _resolve(sport, dataset) {
  const alias = ALIASES[sport]?.[dataset];
  if (alias) {
    const src = ADAPTERS[sport]?.[alias.alias];
    return src ? { adapter: { ...src, rowFilter: alias.rowFilter }, sourceDataset: alias.alias } : null;
  }
  const src = ADAPTERS[sport]?.[dataset];
  return src ? { adapter: src, sourceDataset: dataset } : null;
}
```

(b) 기존 `function _adapter(sport, dataset) { return ADAPTERS[sport]?.[dataset] || null; }` 를 **삭제**한다.

(c) `get()` 첫 줄들을 교체:

```js
  async get(dataset, { sport } = {}) {
    const { team, sport: sp, settings } = _ctx(sport);
    const resolved = _resolve(sp, dataset);
    if (!resolved) return [];
    const { adapter, sourceDataset } = resolved;
    if (DISABLED) return _applyRowFilter(adapter, await _fetchValue(adapter, settings), settings);

    const path = _pathFor(adapter, team, sp, sourceDataset);
```
(이하 `get()` 본문은 그대로 — `adapter`·`path` 변수명이 동일하다.)

(d) `refresh()` 첫 줄들을 교체:

```js
  async refresh(dataset, { sport } = {}) {
    const { team, sport: sp, settings } = _ctx(sport);
    const resolved = _resolve(sp, dataset);
    if (!resolved) return { ok: true, rows: [] };
    const { adapter, sourceDataset } = resolved;
    // 롤백 스위치(§14): true 면 캐시(L2/L1) 자체를 건드리지 않는다 — get() 이
    // 이미 매번 L3 직행이라 여기서 재적재할 대상이 없다.
    if (DISABLED) return { ok: true, rows: [] };
    const path = _pathFor(adapter, team, sp, sourceDataset);
```
(이하 그대로.)

(e) `status()` 안의 `const path = _pathFor(_adapter(sp, dataset), team, sp, dataset);` 를

```js
      const path = _pathFor(_resolve(sp, dataset).adapter, team, sp, dataset);
```
로 교체(`datasetsOf` 가 `ADAPTERS` 키만 주므로 `_resolve` 는 항상 non-null).

(f) `_adaptersForTest()` 아래에 추가:

```js
  // 테스트 전용 — alias 레지스트리 원본. 프로덕션 코드에서는 쓰지 않는다.
  _aliasesForTest() {
    return ALIASES;
  },
```

- [ ] **Step 4: 통과 확인 (alias + 기존 캐시 테스트 전부)**

Run: `npx vitest run src/services/__tests__/`
Expected: PASS — `sheetCache.alias.test.js` 10개 포함, `sheetCache.test.js`·`sheetCache.rowFilter.test.js`·`sheetCacheCore.test.js` 회귀 없음.

- [ ] **Step 5: 커밋**

```bash
git add src/services/sheetCache.js src/services/__tests__/sheetCache.alias.test.js
git commit -m "feat(cup): 시트 캐시 alias 뷰 cupMatchLog·cupEventLog — 원본 노드 공유, 반환만 컵 행. ALIASES 별도 레지스트리로 datasetsOf/재적재/상태 대상 불변 (3단계 스펙 §4.1)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 표시 컴포넌트 3종

**Files:**
- Create: `src/components/cup/CupStandingsTable.jsx`, `src/components/cup/CupPlayerRecordsTable.jsx`, `src/components/cup/CupDayResults.jsx`
- Test: `src/components/cup/__tests__/CupRecordsViews.render.test.jsx`

**Interfaces:**
- Consumes: Task 2·3 의 출력 모양(`standings[]`, `days[]`, `records[]`). `useTheme().C`(`C.gray`·`C.white`·`C.card`·`C.borderColor`).
- Produces (Task 6 이 렌더):
  - `<CupStandingsTable standings={standings} finished={boolean} />`
  - `<CupPlayerRecordsTable records={records} />`
  - `<CupDayResults days={days} />`
  - DOM 훅: `table[data-role="cup-standings"]`, `tr[data-role="cup-standing-row"][data-team]`, `table[data-role="cup-player-records"]`, `tr[data-role="cup-player-row"][data-player]`, `div[data-role="cup-day"][data-date]`, `button[data-role="cup-day-toggle"]`, `div[data-role="cup-day-match"]`, `div[data-role="cup-day-team"][data-team]`.

- [ ] **Step 1: 실패하는 렌더 테스트 작성**

`src/components/cup/__tests__/CupRecordsViews.render.test.jsx`:

```jsx
// src/components/cup/__tests__/CupRecordsViews.render.test.jsx
// 3단계 스펙 §5 — 순위표·개인기록·경기일별 결과 표시 컴포넌트 실렌더(계산 결과를 props 로 직접 준다).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';
import CupStandingsTable from '../CupStandingsTable';
import CupPlayerRecordsTable from '../CupPlayerRecordsTable';
import CupDayResults from '../CupDayResults';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); container.remove(); });
async function mount(el) {
  await act(async () => { root = createRoot(container); root.render(createElement(ThemeProvider, null, el)); });
}
const click = async (el) => { await act(async () => { el.click(); }); };

const S = (over = {}) => ({ name: '팀A', registered: true, games: 2, wins: 1, draws: 1, losses: 0, gf: 4, ga: 1, gd: 3, points: 4, bonusAttend: 1, bonusMargin: 1, bonusClean: 1, bonus: 3, total: 7, ...over });

describe('CupStandingsTable', () => {
  it('열 순서·행 순서·가점 내역·1위 강조 문구', async () => {
    await mount(createElement(CupStandingsTable, { standings: [S(), S({ name: '팀B', registered: false, total: 1, points: 1, bonus: 0, bonusAttend: 0, bonusMargin: 0, bonusClean: 0, gd: -3 })], finished: false }));
    const ths = [...container.querySelectorAll('thead th')].map(t => t.textContent);
    expect(ths).toEqual(['순위', '팀', '경기', '승', '무', '패', '득실', '승점', '가점', '합계']);
    const rows = [...container.querySelectorAll('tr[data-role="cup-standing-row"]')];
    expect(rows.map(r => r.dataset.team)).toEqual(['팀A', '팀B']);
    expect(rows[0].textContent).toContain('참석 1 · 다득점 1 · 무실점 1');
    expect(rows[0].textContent).toContain('+3');
    expect(rows[1].textContent).toContain('(미등록)');
    expect(container.textContent).not.toContain('우승');
  });
  it('finished 면 1위에 🏆 우승', async () => {
    await mount(createElement(CupStandingsTable, { standings: [S()], finished: true }));
    expect(container.querySelector('tr[data-role="cup-standing-row"]').textContent).toContain('🏆 우승');
  });
});

describe('CupPlayerRecordsTable', () => {
  it('열·행·용병 표시', async () => {
    await mount(createElement(CupPlayerRecordsTable, { records: [
      { name: 'a2', team: '팀A', guest: false, goals: 3, assists: 1, cleanSheets: 0, ownGoals: 0, days: 2 },
      { name: 'z1', team: '', guest: true, goals: 0, assists: 0, cleanSheets: 1, ownGoals: 1, days: 1 },
    ] }));
    const ths = [...container.querySelectorAll('thead th')].map(t => t.textContent);
    expect(ths).toEqual(['선수', '팀', '골', '어시', '클린시트', '자책', '참석']);
    const rows = [...container.querySelectorAll('tr[data-role="cup-player-row"]')];
    expect(rows.map(r => r.dataset.player)).toEqual(['a2', 'z1']);
    expect(rows[0].textContent).toContain('팀A');
    expect(rows[1].textContent).toContain('용병');
  });
});

describe('CupDayResults', () => {
  const days = [
    { date: '2026-10-01', matches: [{ key: 'k1', matchId: 'R1_C0', home: '팀A', away: '팀B', homeScore: 3, awayScore: 0, homeBonus: { margin: 1, clean: 1 }, awayBonus: { margin: 0, clean: 0 } }],
      teams: { '팀A': { registered: true, present: 7, guests: [], bonusAttend: 1, points: 3, bonusMargin: 1, bonusClean: 1 }, '팀B': { registered: true, present: 6, guests: ['a7'], bonusAttend: 0, points: 0, bonusMargin: 0, bonusClean: 0 } } },
    { date: '2026-10-08', matches: [{ key: 'k2', matchId: 'R1_C0', home: '팀B', away: '팀A', homeScore: 0, awayScore: 0, homeBonus: { margin: 0, clean: 1 }, awayBonus: { margin: 0, clean: 1 } }],
      teams: { '팀A': { registered: true, present: 5, guests: [], bonusAttend: 0, points: 1, bonusMargin: 0, bonusClean: 1 }, '팀B': { registered: true, present: 5, guests: [], bonusAttend: 0, points: 1, bonusMargin: 0, bonusClean: 1 } } },
  ];
  it('최신 날짜가 위에 펼쳐지고 나머지는 접힘; 토글로 열린다', async () => {
    await mount(createElement(CupDayResults, { days }));
    const cards = [...container.querySelectorAll('div[data-role="cup-day"]')];
    expect(cards.map(c => c.dataset.date)).toEqual(['2026-10-08', '2026-10-01']);
    expect(cards[0].querySelector('div[data-role="cup-day-match"]')).not.toBeNull();
    expect(cards[1].querySelector('div[data-role="cup-day-match"]')).toBeNull();
    await click(cards[1].querySelector('button[data-role="cup-day-toggle"]'));
    expect(container.querySelector('div[data-role="cup-day"][data-date="2026-10-01"] div[data-role="cup-day-match"]')).not.toBeNull();
    await click(cards[0].querySelector('button[data-role="cup-day-toggle"]'));
    expect(container.querySelector('div[data-role="cup-day"][data-date="2026-10-08"] div[data-role="cup-day-match"]')).toBeNull();
  });
  it('경기 줄에 스코어·가점 배지, 팀 줄에 등록 참석·용병·✓/✗', async () => {
    await mount(createElement(CupDayResults, { days: [days[0]] }));
    const match = container.querySelector('div[data-role="cup-day-match"]');
    expect(match.textContent).toContain('팀A');
    expect(match.textContent).toContain('3 : 0');
    expect(match.textContent).toContain('+1 다득점');
    expect(match.textContent).toContain('+1 무실점');
    const teamA = container.querySelector('div[data-role="cup-day-team"][data-team="팀A"]');
    const teamB = container.querySelector('div[data-role="cup-day-team"][data-team="팀B"]');
    expect(teamA.textContent).toContain('등록 7명 참석');
    expect(teamA.textContent).toContain('✓ +1');
    expect(teamB.textContent).toContain('등록 6명 참석');
    expect(teamB.textContent).toContain('용병 1명(a7)');
    expect(teamB.textContent).toContain('✗');
  });
  it('days 가 비면 아무것도 그리지 않는다', async () => {
    await mount(createElement(CupDayResults, { days: [] }));
    expect(container.querySelectorAll('div[data-role="cup-day"]')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/cup/__tests__/CupRecordsViews.render.test.jsx`
Expected: FAIL — `Failed to resolve import "../CupStandingsTable"`.

- [ ] **Step 3: 구현**

`src/components/cup/CupStandingsTable.jsx`:

```jsx
// src/components/cup/CupStandingsTable.jsx
// 대회 누적 순위표(3단계 스펙 §5). calcCupStandings().standings 를 그대로 받아 그린다 — 계산하지 않는다.
import { useTheme } from '../../hooks/useTheme';

const COLS = ['순위', '팀', '경기', '승', '무', '패', '득실', '승점', '가점', '합계'];

export default function CupStandingsTable({ standings = [], finished = false }) {
  const { C } = useTheme();
  const th = { padding: "6px 4px", fontSize: 11, color: C.gray, fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" };
  const td = (bold = false) => ({ padding: "6px 4px", fontSize: 13, color: C.white, textAlign: "center", fontWeight: bold ? 700 : 400, whiteSpace: "nowrap", verticalAlign: "top" });
  const gdText = (gd) => (gd > 0 ? `+${gd}` : String(gd));
  return (
    <div style={{ overflowX: "auto" }}>
      <table data-role="cup-standings" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{COLS.map(c => <th key={c} style={th}>{c}</th>)}</tr></thead>
        <tbody>
          {standings.map((s, i) => {
            const first = i === 0;
            return (
              <tr key={s.name} data-role="cup-standing-row" data-team={s.name}
                style={{ background: first ? "rgba(255,149,0,0.10)" : "transparent", borderTop: `1px solid ${C.borderColor}` }}>
                <td style={td(first)}>{i + 1}</td>
                <td style={{ ...td(first), textAlign: "left" }}>
                  {s.name}
                  {!s.registered && <span style={{ fontSize: 11, color: C.gray }}> (미등록)</span>}
                  {first && finished && <span style={{ marginLeft: 4, fontSize: 12 }}>🏆 우승</span>}
                </td>
                <td style={td()}>{s.games}</td>
                <td style={td()}>{s.wins}</td>
                <td style={td()}>{s.draws}</td>
                <td style={td()}>{s.losses}</td>
                <td style={td()}>{gdText(s.gd)}</td>
                <td style={td()}>{s.points}</td>
                <td style={td()}>
                  {s.bonus}
                  <div style={{ fontSize: 10, color: C.gray, whiteSpace: "nowrap" }}>참석 {s.bonusAttend} · 다득점 {s.bonusMargin} · 무실점 {s.bonusClean}</div>
                </td>
                <td style={td(true)}>{s.total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

`src/components/cup/CupPlayerRecordsTable.jsx`:

```jsx
// src/components/cup/CupPlayerRecordsTable.jsx
// 대회 개인기록 표(3단계 스펙 §5). calcCupPlayerRecords() 결과를 그대로 그린다 — 전원 표시, 골순.
import { useTheme } from '../../hooks/useTheme';

const COLS = ['선수', '팀', '골', '어시', '클린시트', '자책', '참석'];

export default function CupPlayerRecordsTable({ records = [] }) {
  const { C } = useTheme();
  const th = { padding: "6px 4px", fontSize: 11, color: C.gray, fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" };
  const td = { padding: "6px 4px", fontSize: 13, color: C.white, textAlign: "center", whiteSpace: "nowrap" };
  return (
    <div style={{ overflowX: "auto" }}>
      <table data-role="cup-player-records" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{COLS.map(c => <th key={c} style={th}>{c}</th>)}</tr></thead>
        <tbody>
          {records.map(r => (
            <tr key={r.name} data-role="cup-player-row" data-player={r.name} style={{ borderTop: `1px solid ${C.borderColor}` }}>
              <td style={{ ...td, textAlign: "left" }}>{r.name}</td>
              <td style={{ ...td, color: C.gray, fontSize: 12 }}>{r.guest ? '용병' : r.team}</td>
              <td style={{ ...td, fontWeight: r.goals > 0 ? 700 : 400 }}>{r.goals}</td>
              <td style={td}>{r.assists}</td>
              <td style={td}>{r.cleanSheets}</td>
              <td style={td}>{r.ownGoals}</td>
              <td style={td}>{r.days}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

`src/components/cup/CupDayResults.jsx`:

```jsx
// src/components/cup/CupDayResults.jsx
// 경기일별 결과·가점 내역(3단계 스펙 §5). calcCupStandings().days(date 오름차순)를 받아 최신 날짜가 위에
// 오도록 뒤집어 접이식 카드로 그린다. 첫(최신) 카드만 기본 펼침. 펼침 상태는 "기본값과 반대로 토글된 날짜"
// 집합으로 들고 있어 days 가 바뀌어도(재조회) 상태를 재설정할 필요가 없다.
import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';

function Badges({ bonus }) {
  const items = [];
  if (bonus?.margin) items.push('+1 다득점');
  if (bonus?.clean) items.push('+1 무실점');
  if (items.length === 0) return null;
  return <span style={{ fontSize: 10, color: "var(--app-green)", marginLeft: 4 }}>{items.join(' ')}</span>;
}

export default function CupDayResults({ days = [] }) {
  const { C } = useTheme();
  const [toggled, setToggled] = useState(() => new Set());
  const flip = (date) => setToggled(prev => { const n = new Set(prev); if (n.has(date)) n.delete(date); else n.add(date); return n; });
  const ordered = [...days].reverse();
  const card = { background: C.card, borderRadius: 14, padding: 12, border: `1px solid ${C.borderColor}`, marginBottom: 8 };
  const toggleBtn = { background: "transparent", border: "none", color: C.white, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: 0, width: "100%", textAlign: "left" };

  return (
    <div>
      {ordered.map((day, i) => {
        const isOpen = (i === 0) !== toggled.has(day.date);
        const teams = Object.entries(day.teams || {}).map(([name, t]) => ({ name, ...t }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        return (
          <div key={day.date} data-role="cup-day" data-date={day.date} style={card}>
            <button data-role="cup-day-toggle" aria-expanded={isOpen} onClick={() => flip(day.date)} style={toggleBtn}>
              {day.date} · {day.matches.length}경기 {isOpen ? '▾' : '▸'}
            </button>
            {isOpen && (
              <div style={{ marginTop: 8 }}>
                {day.matches.map(m => (
                  <div key={m.key} data-role="cup-day-match" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "4px 0", fontSize: 13, color: C.white, borderTop: `1px solid ${C.borderColor}` }}>
                    <span style={{ flex: 1, textAlign: "right" }}>{m.home}<Badges bonus={m.homeBonus} /></span>
                    <span style={{ fontWeight: 700, minWidth: 48, textAlign: "center" }}>{m.homeScore} : {m.awayScore}</span>
                    <span style={{ flex: 1, textAlign: "left" }}><Badges bonus={m.awayBonus} />{m.away}</span>
                  </div>
                ))}
                <div style={{ marginTop: 8, fontSize: 12, color: C.gray }}>
                  {teams.map(t => (
                    <div key={t.name} data-role="cup-day-team" data-team={t.name} style={{ padding: "2px 0" }}>
                      {t.name}{' '}
                      {t.registered ? `등록 ${t.present}명 참석` : '미등록 팀'}
                      {t.guests.length > 0 && ` + 용병 ${t.guests.length}명(${t.guests.join(', ')})`}
                      {t.registered && (t.bonusAttend ? <span style={{ color: "var(--app-green)", marginLeft: 4 }}>✓ +1</span> : <span style={{ marginLeft: 4 }}>✗</span>)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/components/cup/__tests__/CupRecordsViews.render.test.jsx`
Expected: PASS (6 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/components/cup/CupStandingsTable.jsx src/components/cup/CupPlayerRecordsTable.jsx src/components/cup/CupDayResults.jsx src/components/cup/__tests__/CupRecordsViews.render.test.jsx
git commit -m "feat(cup): 표시 컴포넌트 — 누적 순위표(가점 내역·우승)·개인기록 표·경기일별 결과 접이식 카드 (3단계 스펙 §5)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `CupDetail` 배선 — 읽기·계산·세 섹션·잠금 OR·안내 문구·정적 가드

**Files:**
- Modify: `src/components/cup/CupDetail.jsx` (import 블록, 컴포넌트 상단 state/effect, `locked` 계산, 헤더 부제 39행 부근, 시작 버튼 섹션 아래에 세 섹션 삽입)
- Modify: `src/components/cup/CupTeamEditor.jsx:61-64` (잠금 안내 문구)
- Modify: `src/components/__tests__/cupWiring.guard.test.js` (describe 추가)
- Test: `src/components/cup/__tests__/CupDetail.render.test.jsx`

**Interfaces:**
- Consumes: `SheetCache.get(dataset, { sport })`(Task 4 alias), `selectCupRows`·`calcCupStandings`·`calcCupPlayerRecords`·`collectPlayedPairs`(Task 1~3), 표시 컴포넌트 3종(Task 5), 기존 `isLocked(cup, playedPairs)`.
- Produces: DOM 훅 `[data-role="cup-records-loading"]`, `[data-role="cup-records-error"]`, `button[data-role="cup-records-retry"]`, `[data-role="cup-records-empty"]`.

- [ ] **Step 1: 실패하는 렌더 테스트 작성**

`src/components/cup/__tests__/CupDetail.render.test.jsx`:

```jsx
// src/components/cup/__tests__/CupDetail.render.test.jsx
// 3단계 스펙 §4.2·§5 — 대회 상세가 컵 뷰 2종을 읽어 순위표·개인기록·경기일별 결과를 그리고,
// 로그가 있으면 lockedAt 없이도 잠긴다. sheetCache·cupSync 는 목.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';

const h = vi.hoisted(() => ({ matchRows: [], eventRows: [], fail: false, calls: [] }));
vi.mock('../../../services/sheetCache', () => ({
  default: {
    get: (dataset, opts) => {
      h.calls.push([dataset, opts]);
      if (h.fail) return Promise.reject(new Error('boom'));
      if (dataset === 'cupMatchLog') return Promise.resolve(h.matchRows);
      if (dataset === 'cupEventLog') return Promise.resolve(h.eventRows);
      return Promise.resolve([]);
    },
  },
}));
vi.mock('../../../services/cupSync', () => ({
  default: {
    listCups: () => Promise.resolve([]), loadCup: () => Promise.resolve(null), createCup: () => Promise.resolve(null),
    saveTeams: () => Promise.resolve(), setStatus: () => Promise.resolve(), deleteCup: () => Promise.resolve(), markLocked: () => Promise.resolve(),
  },
}));

import CupDetail from '../CupDetail';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => {
  h.matchRows = []; h.eventRows = []; h.fail = false; h.calls = [];
  container = document.createElement('div'); document.body.appendChild(container);
});
afterEach(() => { act(() => root?.unmount()); container.remove(); });

const A7 = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'];
const B6 = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];
const cup = (extra = {}) => ({
  meta: { id: '컵2026', name: '컵2026', sport: '풋살', status: 'active', createdAt: 1, createdBy: '', updatedAt: 1, lockedAt: null, ...extra },
  teams: [
    { id: 't1', name: '팀A', captain: '', players: A7, order: 0 },
    { id: 't2', name: '팀B', captain: '', players: B6, order: 1 },
    { id: 't3', name: '팀C', captain: '', players: ['c1'], order: 2 },
  ],
});
const M = (over = {}) => ({
  team: '마스터FC', sport: '풋살', mode: '대회', tournament_id: '컵2026', date: '2026-10-01', game_id: 'g1', match_idx: 1,
  match_id: 'R1_C0', our_team_name: '팀A', opponent_team_name: '팀B',
  our_members_json: JSON.stringify(A7), opponent_members_json: JSON.stringify(B6),
  our_score: 3, opponent_score: 0, our_gk: 'a1', opponent_gk: 'b1', is_extra: false, ...over,
});
const E = (over = {}) => ({ team: '마스터FC', sport: '풋살', mode: '대회', tournament_id: '컵2026', date: '2026-10-01', game_id: 'g1', match_id: 'R1_C0', event_type: 'goal', player: 'a2', related_player: 'a3', ...over });

const BASE = { teamName: '마스터FC', members: [...A7, ...B6, 'c1'], pendingGames: [], isAdmin: true, onStartGame: vi.fn(), onContinueGame: vi.fn(), onBack: vi.fn(), onChanged: vi.fn() };
async function mount(props = {}) {
  await act(async () => { root = createRoot(container); root.render(createElement(ThemeProvider, null, createElement(CupDetail, { ...BASE, cup: cup(), ...props }))); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}
const click = async (el) => { await act(async () => { el.click(); }); await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const btn = (txt) => [...container.querySelectorAll('button')].find(b => b.textContent.trim().includes(txt));

describe('CupDetail 기록 섹션', () => {
  it('컵 뷰 2종을 풋살로 명시해 읽는다', async () => {
    await mount();
    expect(h.calls.map(c => c[0]).sort()).toEqual(['cupEventLog', 'cupMatchLog']);
    for (const [, opts] of h.calls) expect(opts).toEqual({ sport: '풋살' });
  });
  it('행이 있으면 순위표·개인기록·경기일별 카드가 그려지고 1위가 첫 행', async () => {
    h.matchRows = [M()];
    h.eventRows = [E(), E({ related_player: '' }), E({ player: 'a4', related_player: '' })];
    await mount();
    const rows = [...container.querySelectorAll('tr[data-role="cup-standing-row"]')];
    // A: 3:0 승 3 + 다득점 1 + 무실점 1 + 등록 7명 참석 1 = 6 / C: 0경기(gd 0) / B: 0점 gd −3 → A, C, B
    expect(rows.map(r => r.dataset.team)).toEqual(['팀A', '팀C', '팀B']);
    expect(rows[0].textContent).toContain('참석 1 · 다득점 1 · 무실점 1');
    const players = [...container.querySelectorAll('tr[data-role="cup-player-row"]')];
    expect(players[0].dataset.player).toBe('a2');
    expect(players[0].textContent).toContain('2');
    expect(container.querySelector('div[data-role="cup-day"][data-date="2026-10-01"]')).not.toBeNull();
    expect(container.textContent).toContain('경기일별 풀리그');
    expect(container.textContent).not.toContain('풀리그 1회전');
  });
  it('행이 없으면 안내 문구, 개인기록·경기일별 섹션 없음', async () => {
    await mount();
    expect(container.querySelector('[data-role="cup-records-empty"]').textContent).toContain('아직 마감된 경기가 없습니다');
    expect(container.textContent).not.toContain('개인기록');
    expect(container.querySelector('table[data-role="cup-player-records"]')).toBeNull();
  });
  it('다른 대회 행만 있으면 이 대회에는 경기가 없다', async () => {
    h.matchRows = [M({ tournament_id: '컵2025' })];
    await mount();
    expect(container.querySelector('[data-role="cup-records-empty"]')).not.toBeNull();
  });
  it('읽기 실패 → 실패 문구 + 다시 시도; 팀 편집은 여전히 가능; 재시도로 복구', async () => {
    h.fail = true;
    await mount();
    expect(container.querySelector('[data-role="cup-records-error"]').textContent).toContain('기록을 불러오지 못했습니다');
    expect(btn('팀 편집')).toBeDefined();
    h.fail = false; h.matchRows = [M()];
    await click(container.querySelector('button[data-role="cup-records-retry"]'));
    expect(container.querySelector('table[data-role="cup-standings"]')).not.toBeNull();
    expect(container.querySelector('[data-role="cup-records-error"]')).toBeNull();
  });
  it('lockedAt 이 없어도 로그 행이 있으면 🔒 잠김', async () => {
    h.matchRows = [M()];
    await mount();
    expect(container.textContent).toContain('🔒 잠김');
    expect(btn('대회 삭제').disabled).toBe(true);
  });
  it('lockedAt 도 없고 행도 없으면 잠기지 않는다', async () => {
    await mount();
    expect(container.textContent).not.toContain('🔒 잠김');
  });
  it('종료된 대회는 1위에 🏆 우승', async () => {
    h.matchRows = [M()];
    await mount({ cup: cup({ status: 'finished' }) });
    expect(container.querySelector('tr[data-role="cup-standing-row"]').textContent).toContain('🏆 우승');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/cup/__tests__/CupDetail.render.test.jsx`
Expected: FAIL — `h.calls` 가 비어 있음(`[]`), 순위표 없음.

- [ ] **Step 3: `CupDetail.jsx` 수정**

(a) import 블록을 다음으로 교체:

```jsx
// src/components/cup/CupDetail.jsx
// 대회 상세 — 스펙 §6.1: 시작·이어서·팀 관리·상태·삭제. 3단계(2026-09-26 스펙 §4.2·§5): 컵 뷰 2종을 읽어
// 누적 순위표·개인기록·경기일별 결과를 그리고, 잠금은 lockedAt OR 로그 파생(collectPlayedPairs).
import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import CupSync from '../../services/cupSync';
import SheetCache from '../../services/sheetCache';
import { validateTeams, isLocked } from '../../utils/cup/cupEntity';
import { isCupSession } from '../../utils/cup/cupSession';
import { selectCupRows, calcCupStandings, calcCupPlayerRecords, collectPlayedPairs } from '../../utils/cup/cupRecords';
import CupTeamEditor from './CupTeamEditor';
import CupStandingsTable from './CupStandingsTable';
import CupPlayerRecordsTable from './CupPlayerRecordsTable';
import CupDayResults from './CupDayResults';
```

(b) 컴포넌트 본문에서 `const locked = isLocked(cup);` 줄을 **삭제**하고, `const [editing, setEditing] = useState(...)` 줄 바로 아래에 추가:

```jsx
  const cupId = cup.meta.id;
  // 컵 뷰 읽기. sport 를 명시한다 — AuthUtil.mode 는 대시보드 종목 토글을 따라오지 않는다(겸직팀 함정).
  // alive 플래그로 대회 전환·언마운트 뒤 늦게 도착한 응답을 폐기한다. retry 는 "다시 시도" 카운터.
  const [records, setRecords] = useState({ status: 'loading', matchRows: [], eventRows: [] });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!cupId) return undefined;
    let alive = true;
    setRecords(r => ({ ...r, status: 'loading' }));
    Promise.all([
      SheetCache.get('cupMatchLog', { sport: '풋살' }),
      SheetCache.get('cupEventLog', { sport: '풋살' }),
    ]).then(([matchRows, eventRows]) => {
      if (alive) setRecords({ status: 'ok', matchRows: matchRows || [], eventRows: eventRows || [] });
    }).catch(() => {
      if (alive) setRecords({ status: 'error', matchRows: [], eventRows: [] });
    });
    return () => { alive = false; };
  }, [cupId, retry]);

  const computed = useMemo(() => {
    const sel = selectCupRows({ matchRows: records.matchRows, eventRows: records.eventRows, cupId });
    const { standings, days } = calcCupStandings({ matchRows: sel.matchRows, cup });
    return {
      hasMatches: sel.matchRows.length > 0,
      standings, days,
      players: calcCupPlayerRecords({ matchRows: sel.matchRows, eventRows: sel.eventRows, cup }),
      playedPairs: collectPlayedPairs(records.matchRows, cupId),
    };
  }, [records.matchRows, records.eventRows, cupId, cup]);
  const locked = isLocked(cup, computed.playedPairs);
```

(c) 헤더 부제 `{cup.teams.length}팀 · 풀리그 1회전` 를 `{cup.teams.length}팀 · 경기일별 풀리그` 로 교체.

(d) 시작 버튼 섹션(`{isAdmin && (... 오늘 컵 경기 시작 ...)}`) **바로 아래**, `팀 관리` 섹션 **위**에 삽입:

```jsx
      <div style={section}>
        <div style={title}>순위표 (누적)</div>
        {records.status === 'loading' && <div data-role="cup-records-loading" style={{ color: C.gray, fontSize: 13, padding: 8 }}>기록 불러오는 중…</div>}
        {records.status === 'error' && (
          <div data-role="cup-records-error" style={{ ...card, color: "var(--app-red)", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span>기록을 불러오지 못했습니다</span>
            <button data-role="cup-records-retry" onClick={() => setRetry(n => n + 1)} style={btn("var(--app-bg-row)", C.white, { width: "auto", padding: "6px 10px", fontSize: 12 })}>다시 시도</button>
          </div>
        )}
        {records.status === 'ok' && (computed.hasMatches
          ? <div style={card}><CupStandingsTable standings={computed.standings} finished={!active} /></div>
          : <div data-role="cup-records-empty" style={{ color: C.gray, fontSize: 13, padding: 8 }}>아직 마감된 경기가 없습니다</div>)}
      </div>

      {records.status === 'ok' && computed.hasMatches && (
        <>
          <div style={section}>
            <div style={title}>개인기록</div>
            <div style={card}><CupPlayerRecordsTable records={computed.players} /></div>
          </div>
          <div style={section}>
            <div style={title}>경기일별 결과</div>
            <CupDayResults days={computed.days} />
          </div>
        </>
      )}
```

(`section`·`title`·`card`·`btn`·`active` 는 이미 컴포넌트 안에 정의돼 있다. `btn(bg, fg, extra)` 시그니처 그대로.)

- [ ] **Step 4: `CupTeamEditor.jsx` 잠금 안내 문구**

61~64행의 잠금 안내를 다음으로 교체:

```jsx
      {locked && (
        <div style={{ ...card, background: "rgba(255,149,0,0.10)", color: "var(--app-orange)", fontSize: 12 }}>
          🔒 첫 경기 마감 후 팀명·팀 수는 바꿀 수 없습니다. 팀원·팀장은 수정할 수 있습니다. 팀원을 빼면 지난 경기일 참석 가점이 바뀔 수 있습니다.
        </div>
      )}
```

- [ ] **Step 5: 정적 가드 추가**

`src/components/__tests__/cupWiring.guard.test.js` 파일 끝에 추가:

```js
describe('CupDetail.jsx — 컵 뷰 읽기는 종목을 명시한다 (3단계 스펙 §4.2)', () => {
  const src = read('components/cup/CupDetail.jsx');
  it('SheetCache.get 호출은 전부 cup 뷰 + sport 풋살', () => {
    const calls = src.match(/SheetCache\.get\([^)]*\)/g) || [];
    expect(calls.length).toBe(2);
    for (const c of calls) expect(c).toMatch(/sport:\s*'풋살'/);
    expect(src).toMatch(/SheetCache\.get\('cupMatchLog'/);
    expect(src).toMatch(/SheetCache\.get\('cupEventLog'/);
  });
  it('잠금은 로그 파생 집합을 isLocked 에 넘긴다', () => {
    expect(src).toMatch(/isLocked\(cup, computed\.playedPairs\)/);
    expect(src).not.toMatch(/isLocked\(cup\)/);
  });
});
```

- [ ] **Step 6: 통과 확인 (컵 컴포넌트·가드 전부)**

Run: `npx vitest run src/components/cup src/components/__tests__/cupWiring.guard.test.js`
Expected: PASS — `CupDetail.render.test.jsx` 8개, `CupRecordsViews` 6개, 기존 `CupListTab`·`CupTeamEditor`·`CupAttendeePicker` 렌더 테스트 회귀 없음(`CupTeamEditor.render.test.jsx:111` 의 `toContain('첫 경기 마감 후 팀명·팀 수는 바꿀 수 없습니다')` 는 문구를 덧붙였을 뿐이라 통과).

**Step 6 전에 반드시:** `CupListTab.render.test.jsx` 는 `sheetCache` 를 목하지 않는다 — `CupDetail` 이 이제 `SheetCache` 를 import 하므로 실제 모듈(→ `config/firebase` 의 `initializeApp`)이 테스트에서 로드된다. 저장소 `.env` 가 vitest 에도 로드돼 초기화 자체는 통과하지만 실제 firebase 모듈을 테스트에 들이지 않기 위해, `CupListTab.render.test.jsx` 의 `vi.mock('../../../services/cupSync', …)` 블록 **바로 아래**에 다음 목을 추가한다(테스트 파일만 수정, 단언 변경 없음):

```js
// CupDetail 이 3단계부터 SheetCache 를 읽는다 — 이 테스트는 목록·상세 배선만 보므로 빈 컵 뷰로 고정.
vi.mock('../../../services/sheetCache', () => ({ default: { get: () => Promise.resolve([]) } }));
```

- [ ] **Step 7: 커밋**

```bash
git add src/components/cup/CupDetail.jsx src/components/cup/CupTeamEditor.jsx src/components/__tests__/cupWiring.guard.test.js src/components/cup/__tests__/CupDetail.render.test.jsx src/components/cup/__tests__/CupListTab.render.test.jsx
git commit -m "feat(cup): 대회 상세에 누적 순위표·개인기록·경기일별 결과 — 컵 뷰 2종 읽기(풋살 명시)·로그 파생 잠금 OR·재시도·부제 문구·팀원 제거 경고 (3단계 스펙 §4.2·§5)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: 전체 검증·문서·머지 준비

**Files:**
- Modify: `docs/superpowers/specs/2026-09-26-masters-cup-s3-records-design.md:4` (상태 줄)
- Modify: `docs/superpowers/specs/2026-09-16-masters-cup-design.md:4` (상태 줄)

- [ ] **Step 1: 전체 테스트·lint·빌드**

```bash
npx vitest run --reporter=dot 2>&1 | tail -4
npm run lint 2>&1 | tail -6
npm run build 2>&1 | tail -3
```
Expected: 테스트 파일 226 + 4(`cupRecords`·`sheetCache.alias`·`CupRecordsViews`·`CupDetail`) = **230 파일**, 테스트 2036 + 38 + 10 + 6 + 8 + 2(가드) = **2100 개** 전부 통과. lint 는 기존 에러 2건(`appSync.js:13`, `tennisSync.js:16`)만. build 성공.

- [ ] **Step 2: 불변식 정적 확인**

```bash
git diff main --stat -- src/App.jsx apps-script src/utils/analyticsV2 src/utils/soccerAnalytics src/services/cupSync.js src/utils/cup/cupEntity.js src/components/tournament
```
Expected: 출력 없음(바이트 동일).

- [ ] **Step 3: 스펙 상태 갱신**

`2026-09-26-masters-cup-s3-records-design.md` 4행을
```
- 상태: 구현 완료(feat/cup-s3-records, 2026-09-26). 배포·스모크는 §12 절차.
```
로, `2026-09-16-masters-cup-design.md` 4행의 "3단계(…)는 … 설계 확정(2026-09-26)" 을 "3단계(…) 구현 완료(2026-09-26, `2026-09-26-masters-cup-s3-records-design.md`)" 로 바꾼다.

- [ ] **Step 4: 커밋**

```bash
git add docs/superpowers/specs/2026-09-26-masters-cup-s3-records-design.md docs/superpowers/specs/2026-09-16-masters-cup-design.md
git commit -m "docs: 마스터스컵 3단계(순위표·개인기록·경기일별 결과) 구현 완료 상태 반영

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 5: 머지 전 리뷰로 인계**

브랜치 `feat/cup-s3-records` 를 머지하기 전에 superpowers:requesting-code-review 로 리뷰하고(프로젝트 규칙: 위험 변경은 adversarial-code-review 5렌즈 — 이 변경은 시트 캐시 공용 경로를 만졌으므로 해당), 지적 반영 후 superpowers:finishing-a-development-branch 로 main 머지·워크트리 정리. 배포 후 사용자 스모크: 대회 상세 열기 → 순위표/개인기록/경기일별 카드 확인 → 컵 마감 직후 순위 갱신 확인 → 겸직 화면(축구 탭)에서 대회 탭 무변화 확인.
