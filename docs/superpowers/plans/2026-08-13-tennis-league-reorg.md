# 테니스 리그·분석 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 테니스 화면을 5탭(대시보드·리그·분석·회원관리·경기관리)으로 재편하고, 길로틴 단식 포인트 순위를 리그 탭에 1급 지표로 노출한다.

**Architecture:** 순위 섹션 컴포넌트를 공용 모듈로 추출해 신규 `리그` 탭과 재편된 `분석` 탭이 공유. `buildSinglesStandings`에 정렬 옵션(`sortBy`)을 더해 포인트순 정렬을 지원. 계산기(계층 파생·포인트)는 불변, 표현/배치만 재구성.

**Tech Stack:** React 18 (함수형·훅), Vite, Vitest + renderToStaticMarkup 스모크. 데이터는 `TennisSync`(Apps Script)·`useTheme`.

## Global Constraints

- 읽기 전용 분석 — Google 시트/Apps Script 쓰기 없음.
- 포인트는 **단식(길로틴) 전용**, `calcMatchPoints` 계산 로직 불변.
- `sortBy` 기본값은 `'rate'` — 기존 호출부·테스트 동작을 정확히 보존.
- `pct`의 단일 소스는 `src/utils/tennis/tennisFormat.js` (중복 정의 금지).
- 스키마 상수(verbatim): `LEAGUE_BK = '흑기사'`, `LEAGUE_BR = '흑장미'`, `COMPETITION_SINGLES = '길로틴'`, `COMPETITION_DOUBLES = '투몽'`.
- 테니스 탭 키·순서: `tdash · league · records · members(관리자·beta) · games`. `league`는 테니스 전용 키.
- 변경 대상 테스트는 명시적으로 갱신하고, 그 외 전체 스위트는 그린 유지.
- 컴포넌트 JSX 변경은 선언 순서 육안 + diff 정독 (RTL 하네스 공백 보완, memory `feedback_component_render_verification_gap`).

---

### Task 1: `buildSinglesStandings` 정렬 옵션 (`sortBy`)

**Files:**
- Modify: `src/utils/tennis/tennisStandings.js:10,72-75`
- Test: `src/utils/tennis/__tests__/tennisStandings.test.js`

**Interfaces:**
- Produces: `buildSinglesStandings({ rows, roster, asOfDate, pointRules, sortBy })` — `sortBy: 'rate'|'points'`, 기본 `'rate'`. 반환 배열 shape 불변(`{name, grade, games, wins, losses, rate, points, leagueTier}`).

- [ ] **Step 1: 포인트 정렬 실패 테스트 추가**

`tennisStandings.test.js`의 `describe('buildSinglesStandings', ...)` 안에 추가:

```js
it("sortBy:'points'는 포인트 내림차순, 동점은 승률→승수→이름", () => {
  // a(동배)가 b(은배)를 이김 → a: 1+5=6점, b: 0점. 승률은 a=1 > b=0.
  const rows = [
    pg({ player: 'a', result: '승', grade_at_date: '동배', match_id: 'R1_C1', side: 'A' }),
    pg({ player: 'b', result: '패', grade_at_date: '은배', match_id: 'R1_C1', side: 'B' }),
  ];
  const s = buildSinglesStandings({ rows, roster, asOfDate: '2026-12-31', sortBy: 'points' });
  expect(s.map(x => x.name)).toEqual(['a', 'b']);
  expect(s[0].points).toBe(6);
});

it("sortBy 미지정(기본 rate)은 기존 승률 정렬을 보존", () => {
  // b가 포인트는 더 높지만(업셋) a의 승률이 더 높으면 rate 기본은 a가 먼저.
  const rows = [
    pg({ player: 'a', result: '승', grade_at_date: '은배', match_id: 'R1_C1', side: 'A' }),
    pg({ player: 'b', result: '패', grade_at_date: '은배', match_id: 'R1_C1', side: 'B' }),
    pg({ player: 'a', result: '승', date: '2026-03-02', grade_at_date: '은배', match_id: 'R2_C1', side: 'A' }),
    pg({ player: 'b', result: '패', date: '2026-03-02', grade_at_date: '은배', match_id: 'R2_C1', side: 'B' }),
  ];
  const s = buildSinglesStandings({ rows, roster, asOfDate: '2026-12-31' });
  expect(s[0].name).toBe('a'); // rate 1.0 > 0
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/utils/tennis/__tests__/tennisStandings.test.js`
Expected: FAIL — `sortBy:'points'` 케이스는 아직 rate 정렬이라 통과할 수도 있으나, points 정렬을 강제하는 케이스가 rate와 어긋나는 데이터에서 실패. (실패하지 않으면 Step 3 후에도 그린이어야 하므로 진행)

- [ ] **Step 3: `sortBy` 구현**

`tennisStandings.js` 시그니처 변경 (line 10):

```js
export function buildSinglesStandings({ rows, roster, asOfDate, pointRules = DEFAULT_POINT_RULES, sortBy = 'rate' }) {
```

마지막 return의 `.sort(...)` 교체 (현재 line 72-74):

```js
  const finalLeague = deriveLeagueForDate({ rows: singles, dateISO: asOfDate, roster: list });
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'ko');
  const cmp = sortBy === 'points'
    ? (a, b) => b.points - a.points || b.rate - a.rate || b.wins - a.wins || byName(a, b)
    : (a, b) => b.rate - a.rate || b.wins - a.wins || byName(a, b);
  return [...acc.values()]
    .map(x => ({ ...x, leagueTier: finalLeague[x.name] }))
    .sort(cmp);
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/utils/tennis/__tests__/tennisStandings.test.js`
Expected: PASS (신규 2건 포함 전체 그린)

- [ ] **Step 5: 커밋**

```bash
git add src/utils/tennis/tennisStandings.js src/utils/tennis/__tests__/tennisStandings.test.js
git commit -m "feat(tennis): buildSinglesStandings sortBy 옵션(points/rate)"
```

---

### Task 2: `pct` 공용 유틸 추출

**Files:**
- Create: `src/utils/tennis/tennisFormat.js`
- Modify: `src/components/tennis/TennisDashboard.jsx:10`, `src/components/tennis/TennisAnalyticsTab.jsx:16`
- Test: `src/utils/tennis/__tests__/tennisFormat.test.js`

**Interfaces:**
- Produces: `export const pct` — `(r) => r > 0 ? '<round(r*100)>%' : '-'`. Task 3·5가 import.

- [ ] **Step 1: 실패 테스트 작성**

Create `src/utils/tennis/__tests__/tennisFormat.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { pct } from '../tennisFormat';

describe('pct', () => {
  it('양수 비율은 반올림 퍼센트', () => {
    expect(pct(0.5)).toBe('50%');
    expect(pct(1)).toBe('100%');
    expect(pct(0.333)).toBe('33%');
  });
  it('0 이하는 하이픈', () => {
    expect(pct(0)).toBe('-');
    expect(pct(-1)).toBe('-');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/utils/tennis/__tests__/tennisFormat.test.js`
Expected: FAIL — `tennisFormat` 모듈 없음.

- [ ] **Step 3: 유틸 생성**

Create `src/utils/tennis/tennisFormat.js`:

```js
// 승률 등 비율(0~1) → 반올림 퍼센트 문자열. 0 이하는 '-'.
export const pct = (r) => r > 0 ? `${Math.round(r * 100)}%` : '-';
```

- [ ] **Step 4: 중복 정의 import로 대체**

`TennisDashboard.jsx`: line 10 `const pct = ...` 삭제. 상단 import 블록에 추가:

```js
import { pct } from '../../utils/tennis/tennisFormat';
```

`TennisAnalyticsTab.jsx`: line 16 `const pct = ...` 삭제. 상단 import 블록에 동일 추가.

- [ ] **Step 5: 테스트 통과 + 회귀 확인**

Run: `npx vitest run src/utils/tennis/__tests__/tennisFormat.test.js src/components/tennis/__tests__/tennisDashboard.smoke.test.jsx src/components/tennis/__tests__/tennisAnalyticsTab.smoke.test.jsx`
Expected: PASS (스모크가 pct 경로를 렌더하므로 회귀 확인됨)

- [ ] **Step 6: 커밋**

```bash
git add src/utils/tennis/tennisFormat.js src/utils/tennis/__tests__/tennisFormat.test.js src/components/tennis/TennisDashboard.jsx src/components/tennis/TennisAnalyticsTab.jsx
git commit -m "refactor(tennis): pct 공용 유틸 추출(3중복 방지)"
```

---

### Task 3: 순위 섹션 공용 모듈 추출 (`tennisStandingsSections.jsx`)

**Files:**
- Create: `src/components/tennis/tennisStandingsSections.jsx`
- Modify: `src/components/tennis/TennisAnalyticsTab.jsx` (세 컴포넌트 정의 삭제 → import)
- Modify: `src/components/tennis/__tests__/tennisAnalyticsTab.smoke.test.jsx:7`

**Interfaces:**
- Consumes: `pct`(Task 2), `useSortableRows`/`SortHeader`(`./Sortable`), `LEAGUE_BK`/`LEAGUE_BR`(`../../utils/tennis/tennisSchema`).
- Produces: named exports `DoublesStandingsSection`, `SinglesStandingsSection`, `LegacyStandingsSection` — props/렌더 기존과 동일(SinglesStandingsSection의 리그 뱃지만 방어적).

- [ ] **Step 1: 공용 모듈 생성**

Create `src/components/tennis/tennisStandingsSections.jsx`. `TennisAnalyticsTab.jsx`의 현재 `DoublesStandingsSection`(line 50-90), `SinglesStandingsSection`(line 93-139), `LegacyStandingsSection`(line 484-514) **세 함수를 verbatim 이동**하되, 파일 상단에 아래 import를 두고, `SinglesStandingsSection`의 리그 뱃지 셀만 방어적으로 교체.

파일 상단:

```jsx
// 투몽/길로틴/레거시 순위표 — 리그 탭·(구)분석탭 공용. 정렬 시 #(등수) 유지.
import { useMemo } from 'react';
import { useSortableRows, SortHeader } from './Sortable';
import { pct } from '../../utils/tennis/tennisFormat';
import { LEAGUE_BK, LEAGUE_BR } from '../../utils/tennis/tennisSchema';
```

`SinglesStandingsSection` 내 현재:

```jsx
<td style={{ ...ds.td(), fontSize: 10 }}>{s.leagueTier === '흑기사' ? 'BK' : 'BR'}</td>
```

교체(방어적 — undefined를 'BR'로 오표시하지 않음):

```jsx
<td style={{ ...ds.td(), fontSize: 10 }}>{s.leagueTier === LEAGUE_BR ? 'BR' : s.leagueTier === LEAGUE_BK ? 'BK' : '-'}</td>
```

세 함수 모두 `export function`으로 내보낸다(현재 Doubles/Singles는 로컬이나, 공용화하며 export).

- [ ] **Step 2: 분석탭에서 정의 삭제 후 import**

`TennisAnalyticsTab.jsx`: `DoublesStandingsSection`·`SinglesStandingsSection`·`LegacyStandingsSection` 세 함수 정의(상기 라인) 삭제. 상단 import 블록에 추가:

```js
import { DoublesStandingsSection, SinglesStandingsSection, LegacyStandingsSection } from './tennisStandingsSections';
```

(이 시점에는 분석탭이 여전히 세 섹션을 렌더하므로 import 필수. sectionKeys 정리는 Task 4.) 삭제로 인해 `TennisAnalyticsTab.jsx`가 더 이상 쓰지 않는 import가 생기면(예: `SortHeader`가 남은 섹션에서 여전히 쓰이는지 확인) 육안 점검하되, 남은 섹션들(Chemistry/H2H/TbBagel/AceDf)이 `useSortableRows`/`SortHeader`를 계속 쓰므로 해당 import는 유지.

- [ ] **Step 3: 스모크 import 경로 갱신**

`tennisAnalyticsTab.smoke.test.jsx` line 7:

```js
import TennisAnalyticsTab, { LegacyStandingsSection } from '../TennisAnalyticsTab';
```

교체:

```js
import TennisAnalyticsTab from '../TennisAnalyticsTab';
import { LegacyStandingsSection } from '../tennisStandingsSections';
```

- [ ] **Step 4: 회귀 확인 (동작 불변)**

Run: `npx vitest run src/components/tennis/__tests__/tennisAnalyticsTab.smoke.test.jsx`
Expected: PASS (섹션 위치만 이동, 렌더 동일)

- [ ] **Step 5: 빌드 확인 (선언 순서·미사용 import)**

Run: `npx vite build`
Expected: 성공 (TDZ/미사용 import 없음)

- [ ] **Step 6: 커밋**

```bash
git add src/components/tennis/tennisStandingsSections.jsx src/components/tennis/TennisAnalyticsTab.jsx src/components/tennis/__tests__/tennisAnalyticsTab.smoke.test.jsx
git commit -m "refactor(tennis): 순위 섹션 공용 모듈 추출 + leagueTier 방어 렌더"
```

---

### Task 4: 분석탭 재편 (순위 제거·`mode` 정리·개인 포인트)

**Files:**
- Modify: `src/utils/tennis/analyticsSections.js`
- Modify: `src/components/tennis/TennisAnalyticsTab.jsx`
- Test: `src/utils/tennis/__tests__/analyticsSections.test.js`

**Interfaces:**
- Consumes: `buildSinglesStandings({..., sortBy:'points'})`(Task 1) — 개인 포인트 조회.
- Produces: `analyticsSectionKeys({ player, format, hasLegacy, hasMonth })` — `mode` 파라미터 제거. 미선택 복식 `['chemistry','tb','acedf']`·단식 `['tb','acedf']`.

- [ ] **Step 1: `analyticsSectionKeys` 테스트 갱신 (실패 상태로)**

`analyticsSections.test.js` 편집:
- line 7: `expect(k).toEqual(['doublesStandings', 'chemistry', 'tb', 'acedf']);` → `expect(k).toEqual(['chemistry', 'tb', 'acedf']);`
- line 12-13: `.toEqual(['singlesStandings', 'tb', 'acedf'])` → `.toEqual(['tb', 'acedf'])`
- line 29-32 (`'legacy 모드 = legacyStandings만'` it 블록 전체) 삭제.
- line 33-37 (`hasMonth`) 의 인자에서 `mode: 'row'` 제거: `{ player: '박성언', format: '복식', hasLegacy: true, hasMonth: true }`.

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/utils/tennis/__tests__/analyticsSections.test.js`
Expected: FAIL — 아직 구현이 옛 키를 반환.

- [ ] **Step 3: `analyticsSections.js` 재작성**

전체 교체:

```js
// 분석 탭 뷰 전환: 선수 미선택=부가 리더보드, 선택=개인 분석. 정식 순위는 리그 탭 소유.
// 'tb' 단일 키가 TB+베이글을 함께 대표한다(TbBagelSection이 둘을 한 번에 렌더).
// hasMonth: 특정 월 선택 시 monthly 제외. 기본 false.
export function analyticsSectionKeys({ player, format, hasLegacy, hasMonth = false }) {
  if (!player) {
    return format === '복식'
      ? ['chemistry', 'tb', 'acedf']
      : ['tb', 'acedf'];
  }
  const keys = ['summary'];
  if (format === '복식') keys.push('partner');
  keys.push('h2h');
  if (!hasMonth) keys.push('monthly');   // 특정 월 선택 시 월별흐름 무의미 → 숨김
  if (hasLegacy) keys.push('yearly');
  return keys;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/utils/tennis/__tests__/analyticsSections.test.js`
Expected: PASS

- [ ] **Step 5: `TennisAnalyticsTab.jsx` 재편 (한 번에 — ReferenceError 방지)**

다음을 **모두** 적용:

1. **연도 selector 로우연도만** (현재 line 539):
```js
const years = useMemo(() => availableYears({ rows, legacyRows: [] }), [rows]);
```

2. **`mode` 파생 삭제** (현재 line 543-545 전체 삭제).

3. **`legacyStandings` memo 삭제** (현재 line 548).

4. **`doublesStandings` memo 삭제** (현재 line 550-551) — 렌더에서 빠지므로 죽은 계산.

5. **`singlesStandings` memo를 포인트순으로** (현재 line 553-554) — 개인 포인트 조회용으로 유지:
```js
const singlesStandings = useMemo(
  () => buildSinglesStandings({ rows: fRows, roster, asOfDate: today, sortBy: 'points' }), [fRows, roster, today]);
```

6. **`sectionKeys` 호출에서 `mode` 제거** (현재 line 580-582):
```js
const sectionKeys = useMemo(
  () => analyticsSectionKeys({ player, format, hasLegacy: yearlyRecords.length > 0, hasMonth: !!month }),
  [player, format, yearlyRecords, month]);
```

7. **월/선수 select의 `mode === 'row'` 게이트 제거** (현재 line 607-612, 613-622) — 무조건 렌더로:
```jsx
<select value={month} onChange={e => setMonth(e.target.value)} style={{ ...selectStyle }}>
  <option value="">전체월</option>
  {monthOpts.map(m => <option key={m} value={m}>{Number(m)}월</option>)}
</select>
<select
  value={player}
  onChange={e => setPlayer(e.target.value)}
  style={{ marginLeft: 'auto', ...selectStyle }}
>
  <option value="">전체 랭킹</option>
  {rosterNames.map(n => <option key={n} value={n}>{n}</option>)}
</select>
```

8. **레거시 안내 배너 삭제** (현재 line 625-629 `{mode === 'legacy' && ...}` 블록).

9. **렌더 switch에서 순위/레거시 케이스 삭제** (현재 line 633-634, 641) — `doublesStandings`·`singlesStandings`·`legacyStandings` case 3줄 제거.

10. **미사용 import 정리**: `isRowYear`, `buildLegacyStandings` (더 이상 안 씀), `DoublesStandingsSection`·`SinglesStandingsSection`·`LegacyStandingsSection` (렌더 안 함) 제거. `buildSinglesStandings`는 유지(개인 포인트). `availableYears`·`availableMonths`·`filterRowsByPeriod` 유지.

11. **개인 포인트 전달**: `summary` 렌더 case에 포인트 추가:
```jsx
case 'summary': return summary ? <SummaryCard key={key} summary={summary} player={player} points={singlesStandings.find(s => s.name === player)?.points ?? 0} ds={ds} C={C} /> : null;
```

- [ ] **Step 6: `SummaryCard`에 포인트 셀 추가**

`SummaryCard` 시그니처와 첫 StatCell 행 수정(모든 선수 뷰 공통 표시):

```jsx
function SummaryCard({ summary, player, points = 0, ds, C }) {
  return (
    <>
      <div style={ds.sectionTitle}>{player} 요약</div>
      <div style={ds.card}>
        <div style={{ display: 'flex', marginBottom: 12 }}>
          <StatCell C={C} label="단식" value={`${summary.singles.wins}-${summary.singles.losses}`} />
          <StatCell C={C} label="복식" value={`${summary.doubles.wins}-${summary.doubles.losses}`} />
          <StatCell C={C} label="포인트" value={points} />
          <StatCell C={C} label="출석" value={`${summary.attendanceDates}일`} />
        </div>
        <div style={{ display: 'flex' }}>
          <StatCell C={C} label="에이스" value={summary.aces} />
          <StatCell C={C} label="더블폴트" value={summary.doubleFaults} />
          <StatCell C={C} label="타이브레이크" value={`${summary.tbWon}/${summary.tbPlayed}`} />
          <StatCell C={C} label="베이글" value={`${summary.bagelsGiven}/${summary.bagelsTaken}`} />
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 7: 회귀 + 빌드 확인**

Run: `npx vitest run src/utils/tennis/__tests__/analyticsSections.test.js src/components/tennis/__tests__/tennisAnalyticsTab.smoke.test.jsx && npx vite build`
Expected: PASS + 빌드 성공. (스모크는 `'전체 랭킹'` 라벨을 계속 확인 — 선수 select 무조건 렌더로 유효)

- [ ] **Step 8: 커밋**

```bash
git add src/utils/tennis/analyticsSections.js src/utils/tennis/__tests__/analyticsSections.test.js src/components/tennis/TennisAnalyticsTab.jsx
git commit -m "refactor(tennis): 분석탭 재편 — 순위 리그탭 이관·mode 정리·개인 포인트"
```

---

### Task 5: 리그 탭 신설 + 배선

**Files:**
- Create: `src/components/tennis/TennisLeague.jsx`
- Modify: `src/components/dashboard/mainTabs.js:6-11`
- Modify: `src/components/tennis/TennisTabs.jsx`
- Test: `src/components/tennis/__tests__/tennisLeague.smoke.test.jsx`

**Interfaces:**
- Consumes: `DoublesStandingsSection`/`SinglesStandingsSection`/`LegacyStandingsSection`(Task 3), `buildDoublesStandings`(`tennisAnalytics`), `buildSinglesStandings`(Task 1), `availableYears`/`filterRowsByPeriod`/`isRowYear`/`buildLegacyStandings`(`tennisDateFilter`).
- Produces: `<TennisLeague C={C} />` default export.

- [ ] **Step 1: `TennisLeague.jsx` 생성**

```jsx
// 리그 탭 — 투몽리그(복식)·길로틴리그(단식 포인트), 연도 단위. 정적·비인터랙티브.
import { useEffect, useMemo, useState } from 'react';
import TennisSync from '../../services/tennisSync';
import { buildDoublesStandings } from '../../utils/tennis/tennisAnalytics';
import { buildSinglesStandings } from '../../utils/tennis/tennisStandings';
import { availableYears, isRowYear, filterRowsByPeriod, buildLegacyStandings } from '../../utils/tennis/tennisDateFilter';
import { DoublesStandingsSection, SinglesStandingsSection, LegacyStandingsSection } from './tennisStandingsSections';
import { makeStyles } from '../../styles/theme';
import { useTheme } from '../../hooks/useTheme';

export default function TennisLeague({ C: propC }) {
  const { C: themeC } = useTheme();
  const C = propC ?? themeC;
  const ds = makeStyles(C);
  const [rows, setRows] = useState([]);
  const [legacyRows, setLegacyRows] = useState([]);
  const [roster, setRoster] = useState([]);

  useEffect(() => {
    TennisSync.getPlayerGames().then(setRows);
    TennisSync.getLegacyRecords().then(setLegacyRows);
    TennisSync.getRoster().then(setRoster);
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const years = useMemo(() => availableYears({ rows, legacyRows }), [rows, legacyRows]);
  const curYear = String(new Date().getFullYear());
  const [year, setYear] = useState('');
  const effYear = year || (years.includes(curYear) ? curYear : (years[0] || curYear));
  const isRow = isRowYear({ rows, year: effYear });

  const yearRows = useMemo(() => filterRowsByPeriod(rows, { year: effYear, month: '' }), [rows, effYear]);
  const doubles = useMemo(() => buildDoublesStandings({ rows: yearRows, roster }), [yearRows, roster]);
  const singles = useMemo(() => buildSinglesStandings({ rows: yearRows, roster, asOfDate: today, sortBy: 'points' }), [yearRows, roster, today]);
  const legacyDoubles = useMemo(() => buildLegacyStandings({ legacyRows, year: effYear, format: '복식' }), [legacyRows, effYear]);
  const legacySingles = useMemo(() => buildLegacyStandings({ legacyRows, year: effYear, format: '단식' }), [legacyRows, effYear]);

  const periodLabel = `${effYear}년`;
  const selectStyle = {
    background: C.cardLight, color: C.white, border: `1px solid ${C.borderColor}`,
    borderRadius: 8, padding: '5px 10px', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
  };

  return (
    <div style={ds.section}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <select value={effYear} onChange={e => setYear(e.target.value)} style={selectStyle}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {isRow ? (
        <>
          <SinglesStandingsSection standings={singles} periodLabel={periodLabel} ds={ds} />
          <DoublesStandingsSection standings={doubles} periodLabel={periodLabel} ds={ds} />
        </>
      ) : (
        <>
          <LegacyStandingsSection standings={legacySingles} year={effYear} format="단식" ds={ds} C={C} />
          <LegacyStandingsSection standings={legacyDoubles} year={effYear} format="복식" ds={ds} C={C} />
        </>
      )}
      {years.length === 0 && (
        <div style={{ ...ds.card, color: C.gray, fontSize: 12, textAlign: 'center' }}>데이터 없음</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `mainTabs.js`에 리그 탭 추가**

`buildMainTabs`의 테니스 분기(현재 line 5-11) 배열에 `tdash` 다음으로 삽입:

```js
    return [
      { key: 'tdash', label: '대시보드' },
      { key: 'league', label: '리그' },
      { key: 'records', label: '분석' },
      ...(role === '관리자' ? [{ key: 'members', label: '회원관리', beta: true }] : []),
      { key: 'games', label: '경기관리', badge },
    ];
```

- [ ] **Step 3: `TennisTabs.jsx`에 분기 추가**

상단 import에 추가:

```js
import TennisLeague from './TennisLeague';
```

`if (activeTab === 'tdash')` 분기 바로 아래에 추가:

```jsx
  if (activeTab === 'league') {
    return <TennisLeague C={C} />;
  }
```

- [ ] **Step 4: 리그 탭 스모크 테스트 작성**

Create `src/components/tennis/__tests__/tennisLeague.smoke.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider } from '../../../hooks/useTheme';
import TennisLeague from '../TennisLeague';

vi.mock('../../../services/tennisSync', () => ({
  default: {
    getPlayerGames: () => Promise.resolve([]),
    getLegacyRecords: () => Promise.resolve([]),
    getRoster: () => Promise.resolve([]),
  },
}));
Object.defineProperty(window, 'matchMedia', {
  writable: true, value: (q) => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});

describe('TennisLeague 스모크', () => {
  it('빈 데이터에서 크래시 없이 렌더', () => {
    const html = renderToStaticMarkup(
      createElement(ThemeProvider, null, createElement(TennisLeague, { C: undefined }))
    );
    // 빈 데이터(연도 없음) → "데이터 없음" 안내
    expect(html).toContain('데이터 없음');
  });
});
```

- [ ] **Step 5: 테스트 + 빌드 확인**

Run: `npx vitest run src/components/tennis/__tests__/tennisLeague.smoke.test.jsx && npx vite build`
Expected: PASS + 빌드 성공.

- [ ] **Step 6: 커밋**

```bash
git add src/components/tennis/TennisLeague.jsx src/components/dashboard/mainTabs.js src/components/tennis/TennisTabs.jsx src/components/tennis/__tests__/tennisLeague.smoke.test.jsx
git commit -m "feat(tennis): 리그 탭 신설(투몽·길로틴 포인트, 연도 단위) + 배선"
```

---

### Task 6: 대시보드 단식 포인트 TOP5

**Files:**
- Modify: `src/components/tennis/TennisDashboard.jsx:75,117`
- Test: `src/components/tennis/__tests__/tennisDashboard.smoke.test.jsx:32`

**Interfaces:**
- Consumes: `buildSinglesStandings({..., sortBy:'points'})`(Task 1).

- [ ] **Step 1: 대시보드 스모크 타이틀 단언 갱신 (실패 상태로)**

`tennisDashboard.smoke.test.jsx` line 32:

```js
expect(html).toContain('단식 순위 TOP 5');
```

교체:

```js
expect(html).toContain('단식 포인트 TOP 5');
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/tennis/__tests__/tennisDashboard.smoke.test.jsx`
Expected: FAIL — 아직 소스가 옛 타이틀.

- [ ] **Step 3: 단식 순위 → 포인트순 + 타이틀 변경**

`TennisDashboard.jsx` singles memo(현재 line 75):

```js
const singles = useMemo(() => buildSinglesStandings({ rows, roster, asOfDate: today, sortBy: 'points' }).slice(0, 5), [rows, roster, today]);
```

`MiniRankTable` 단식 타이틀(현재 line 117):

```jsx
<MiniRankTable title={`단식 포인트 TOP 5${yearSpan ? ` · ${yearSpan}` : ''}`} rows={singles.map(s => ({ ...s, _key: s.name }))} ds={ds}
```

(P 컬럼 등 나머지 cols 정의는 그대로.)

- [ ] **Step 4: 테스트 통과 + 회귀 확인**

Run: `npx vitest run src/components/tennis/__tests__/tennisDashboard.smoke.test.jsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/components/tennis/TennisDashboard.jsx src/components/tennis/__tests__/tennisDashboard.smoke.test.jsx
git commit -m "feat(tennis): 대시보드 단식 포인트 TOP5(포인트순)"
```

---

## Self-Review

**1. Spec coverage:**
- §3.1 탭 구조 → Task 5 (mainTabs·TennisTabs). ✓
- §3.2 리그 탭 → Task 5 (TennisLeague) + Task 3 (공용 섹션·방어 렌더). ✓
- §3.3 sortBy → Task 1. ✓
- §3.4 분석 재편(순위 제거·mode·SummaryCard 포인트·연도) → Task 4 (+Task 3 추출). ✓
- §3.5 대시보드 단식 포인트 TOP5 → Task 6. ✓
- §3.6 pct 유틸 → Task 2. ✓
- §6 테스트 갱신(E-1/E-2/E-3) → Task 3(smoke import)·Task 4(analyticsSections)·Task 6(dashboard string). ✓

**2. Placeholder scan:** 모든 스텝에 실제 코드/명령 포함, TBD 없음. verbatim 이동(Task 3)은 원본 라인 지정 + 유일 수정(leagueTier) 명시.

**3. Type consistency:** `buildSinglesStandings` `sortBy` 파라미터명 Task 1·4·5·6 일치. 섹션 컴포넌트명 Task 3 정의 = Task 4·5 소비 일치. `SummaryCard` `points` prop Task 4 내부 일관.

## Execution Handoff

계획 완료. SDD(subagent-driven-development)로 Task 1→6 순차 실행. Task 간 의존: Task 2(pct)는 Task 3·5 이전, Task 1(sortBy)은 Task 4·5·6 이전, Task 3(추출)은 Task 4·5 이전. 순번대로 실행하면 충족.
