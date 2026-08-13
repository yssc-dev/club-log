# 테니스 날짜필터 3단계 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 분석 탭에 연/월 날짜 필터를 추가한다. 로우 연도(2026)는 기간 스코핑된 상세 지표, 레거시 연도(2024/2025)는 집계 순위만+안내.

**Architecture:** 신규 순수 필터 유틸(`tennisDateFilter.js`) + `analyticsSectionKeys` 확장(mode/hasMonth) + `TennisAnalyticsTab`에 필터 UI·모드 분기. 기존 계산기는 rows 전처리(filterRowsByPeriod)로 재사용, 로직 무변경.

**Tech Stack:** React 18, Vite, Vitest(jsdom), renderToStaticMarkup.

## Global Constraints

- **필터는 분석 탭 전용**. 대시보드(`TennisDashboard`)·경기관리·회원관리·축구/풋살 무변경.
- **기존 계산기(`tennisAnalytics.js`/`tennisStandings.js`) 로직 무변경** — 필터는 rows 전처리. 신규 계산기는 `buildLegacyStandings`(새 파일)만.
- `analyticsSectionKeys` 인자 추가는 **기본값으로 1·2단계 동작 보존**(회귀 테스트 통과).
- 필터 기본값 = 올해(2026, 데이터에 있으면) 아니면 최신 연도.
- Test runner Vitest, 전체 스위트(현재 1050) green 유지 + 신규.
- 레거시 행 필드: `player·season·format·wins·losses`(확인됨). 로우 행: `date`(YYYY-MM-DD)·`player`·`format`·`result` 등.

---

### Task 1: tennisDateFilter.js 순수 유틸

**Files:**
- Create: `src/utils/tennis/tennisDateFilter.js`
- Create: `src/utils/tennis/__tests__/tennisDateFilter.test.js`

**Interfaces (Produces):**
- `availableYears({ rows, legacyRows }) → string[]` (rows date연도 ∪ legacy season, 내림차순)
- `availableMonths({ rows, year }) → string[]` (그 연도 로우의 'MM', 오름차순; 없으면 [])
- `isRowYear({ rows, year }) → boolean`
- `filterRowsByPeriod(rows, { year, month }) → rows[]` (month ''=전체월)
- `buildLegacyStandings({ legacyRows, year, format }) → [{ name, wins, losses, games, rate }]` (승률↓·경기↓·이름↑)

- [ ] **Step 1: 실패 테스트 작성** — `src/utils/tennis/__tests__/tennisDateFilter.test.js`

```js
import { describe, it, expect } from 'vitest';
import { availableYears, availableMonths, isRowYear, filterRowsByPeriod, buildLegacyStandings } from '../tennisDateFilter';

const rows = [
  { date: '2026-01-05', player: 'A', format: '복식', result: '승' },
  { date: '2026-03-10', player: 'B', format: '복식', result: '패' },
  { date: '2026-08-02', player: 'A', format: '단식', result: '승' },
];
const legacy = [
  { player: 'A', season: '2025', format: '복식', wins: 10, losses: 5 },
  { player: 'B', season: '2025', format: '복식', wins: 3, losses: 7 },
  { player: 'A', season: '2024', format: '복식', wins: 2, losses: 1 },
];

describe('availableYears', () => {
  it('rows∪legacy 연도 내림차순', () => {
    expect(availableYears({ rows, legacyRows: legacy })).toEqual(['2026', '2025', '2024']);
  });
});
describe('availableMonths', () => {
  it('그 연도 로우의 월 오름차순', () => {
    expect(availableMonths({ rows, year: '2026' })).toEqual(['01', '03', '08']);
  });
  it('로우 없는 연도는 빈배열', () => {
    expect(availableMonths({ rows, year: '2025' })).toEqual([]);
  });
});
describe('isRowYear', () => {
  it('로우 있으면 true', () => { expect(isRowYear({ rows, year: '2026' })).toBe(true); });
  it('레거시연도 false', () => { expect(isRowYear({ rows, year: '2025' })).toBe(false); });
});
describe('filterRowsByPeriod', () => {
  it('연도 필터', () => { expect(filterRowsByPeriod(rows, { year: '2026', month: '' })).toHaveLength(3); });
  it('연+월 필터', () => {
    const r = filterRowsByPeriod(rows, { year: '2026', month: '03' });
    expect(r).toHaveLength(1); expect(r[0].player).toBe('B');
  });
  it('다른 연도 제외', () => { expect(filterRowsByPeriod(rows, { year: '2025', month: '' })).toHaveLength(0); });
});
describe('buildLegacyStandings', () => {
  it('연도+format 집계·정렬(승률↓)', () => {
    const s = buildLegacyStandings({ legacyRows: legacy, year: '2025', format: '복식' });
    expect(s.map(x => x.name)).toEqual(['A', 'B']);   // A 10/15=0.67 > B 3/10=0.3
    expect(s[0]).toMatchObject({ name: 'A', wins: 10, losses: 5, games: 15 });
    expect(s[0].rate).toBeCloseTo(10 / 15);
  });
  it('다른 연도/포맷은 제외', () => {
    expect(buildLegacyStandings({ legacyRows: legacy, year: '2024', format: '복식' }).map(x => x.name)).toEqual(['A']);
    expect(buildLegacyStandings({ legacyRows: legacy, year: '2025', format: '단식' })).toEqual([]);
  });
  it('빈 legacy 안전', () => { expect(buildLegacyStandings({ legacyRows: [], year: '2025', format: '복식' })).toEqual([]); });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/utils/tennis/__tests__/tennisDateFilter.test.js` → FAIL
- [ ] **Step 3: 구현** — `src/utils/tennis/tennisDateFilter.js` (스펙 §4.1 코드 그대로)
- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/utils/tennis/__tests__/tennisDateFilter.test.js` → PASS
- [ ] **Step 5: 전체 스위트** — Run: `npx vitest run` → PASS
- [ ] **Step 6: 커밋** — `git add src/utils/tennis/tennisDateFilter.js src/utils/tennis/__tests__/tennisDateFilter.test.js && git commit -m "feat(tennis): 날짜필터 유틸 — availableYears/Months·isRowYear·filterRowsByPeriod·buildLegacyStandings"`

---

### Task 2: analyticsSectionKeys 확장 (mode/hasMonth)

**Files:**
- Modify: `src/utils/tennis/analyticsSections.js`
- Modify: `src/utils/tennis/__tests__/analyticsSections.test.js`

**Interface:** `analyticsSectionKeys({ player, format, hasLegacy, mode = 'row', hasMonth = false })`
- `mode === 'legacy'` → `['legacyStandings']`.
- row 모드: 기존 로직 + `hasMonth`면 `'monthly'` 제외.
- 기본값(mode 미지정='row', hasMonth 미지정=false)으로 기존 호출 하위호환.

- [ ] **Step 1: 테스트 갱신(신규 케이스 추가)** — `src/utils/tennis/__tests__/analyticsSections.test.js`

기존 케이스 유지 + 추가:
```js
it('legacy 모드 = legacyStandings만', () => {
  expect(analyticsSectionKeys({ player: '', format: '복식', hasLegacy: true, mode: 'legacy' })).toEqual(['legacyStandings']);
  expect(analyticsSectionKeys({ player: '박성언', format: '단식', hasLegacy: true, mode: 'legacy' })).toEqual(['legacyStandings']);
});
it('월 선택 시(hasMonth) 개인뷰에서 monthly 제외', () => {
  const k = analyticsSectionKeys({ player: '박성언', format: '복식', hasLegacy: true, mode: 'row', hasMonth: true });
  expect(k).toEqual(['summary', 'partner', 'h2h', 'yearly']);
  expect(k).not.toContain('monthly');
});
it('mode/hasMonth 미지정 시 기존과 동일(하위호환)', () => {
  expect(analyticsSectionKeys({ player: '박성언', format: '복식', hasLegacy: true }))
    .toEqual(['summary', 'partner', 'h2h', 'monthly', 'yearly']);
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/utils/tennis/__tests__/analyticsSections.test.js` → FAIL(신규 케이스)
- [ ] **Step 3: 구현** — `src/utils/tennis/analyticsSections.js` (스펙 §4.2 코드)
- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/utils/tennis/__tests__/analyticsSections.test.js` → PASS(기존+신규)
- [ ] **Step 5: 전체 스위트** — Run: `npx vitest run` → PASS
- [ ] **Step 6: 커밋** — `git add src/utils/tennis/analyticsSections.js src/utils/tennis/__tests__/analyticsSections.test.js && git commit -m "feat(tennis): analyticsSectionKeys에 mode(legacy)/hasMonth 확장"`

---

### Task 3: 분석 탭 필터 UI + 모드 분기

**Files:**
- Modify: `src/components/tennis/TennisAnalyticsTab.jsx`
- Modify: `src/components/tennis/__tests__/tennisAnalyticsTab.smoke.test.jsx`

**Consumes:** Task1 `tennisDateFilter`, Task2 확장 `analyticsSectionKeys`.

**현재 구조(참고):** 메인 컴포넌트 `export default function TennisAnalyticsTab({ C: propC })`(~479행). state `format`(복식 기본)·`player`(''). 계산기 useMemo들(doublesStandings/singlesStandings/chemistry/partnerBreakdown/h2h/monthly/tb/bagel/acedf/yearly/summary)이 `rows`를 씀. `sectionKeys = useMemo(analyticsSectionKeys({player,format,hasLegacy}))`. 상단바에 format chips + player select. `sectionKeys.map(switch)`가 섹션 렌더.

**변경 상세:**

- [ ] **Step 1: import + 필터 state/파생 추가**

상단 import에 추가: `import { availableYears, availableMonths, isRowYear, filterRowsByPeriod, buildLegacyStandings } from '../../utils/tennis/tennisDateFilter';`

메인 컴포넌트 state/파생(계산기 useMemo들 **위에**):
```js
const [year, setYear] = useState('');    // '' = 기본(올해/최신)
const [month, setMonth] = useState('');  // '' = 전체월
const years = useMemo(() => availableYears({ rows, legacyRows }), [rows, legacyRows]);
const now = new Date();
const curYear = String(now.getFullYear());
const effYear = year || (years.includes(curYear) ? curYear : (years[0] || curYear));
const mode = isRowYear({ rows, year: effYear }) ? 'row' : 'legacy';
const monthOpts = useMemo(() => availableMonths({ rows, year: effYear }), [rows, effYear]);
const fRows = useMemo(() => filterRowsByPeriod(rows, { year: effYear, month }), [rows, effYear, month]);
const fLegacy = useMemo(() => (legacyRows || []).filter(r => String(r.season) === String(effYear)), [legacyRows, effYear]);
const legacyStandings = useMemo(() => buildLegacyStandings({ legacyRows, year: effYear, format }), [legacyRows, effYear, format]);
```

- [ ] **Step 2: 계산기 useMemo들의 `rows`를 `fRows`로 교체**

`doublesStandings`,`singlesStandings`,`chemistry`,`partnerBreakdown`,`h2h`,`monthly`,`tbRanking`,`bagelRanking`,`aceDfRanking`,`summary`,`yearlyRecords` 의 `rows` 인자 → `fRows`, deps의 `rows` → `fRows`. **`yearlyRecords`는** `buildYearlyRecords({ legacyRows: fLegacy, rows: fRows, player, format })`(연도 스코핑), deps `[fLegacy, fRows, player, format]`.

`yearly` 통산-중복 방지(단일 연도): 렌더 직전 파생
```js
const yearlyDisplay = useMemo(() => {
  const real = yearlyRecords.filter(e => e.season !== '통산');
  return real.length <= 1 ? real : yearlyRecords;   // 실연도 1개면 통산 행 제거
}, [yearlyRecords]);
```

- [ ] **Step 3: sectionKeys에 mode/hasMonth/hasLegacy 반영**

```js
const sectionKeys = useMemo(
  () => analyticsSectionKeys({ player, format, hasLegacy: yearlyDisplay.length > 0, mode, hasMonth: !!month }),
  [player, format, yearlyDisplay, mode, month]);
```

- [ ] **Step 4: 상단 필터 바에 연/월 select 추가**

기존 format chips + player select 있는 상단 flex에, **연도 select**(항상)와 **월 select**(mode==='row'일 때만) 추가:
```jsx
<select value={effYear} onChange={e => { setYear(e.target.value); setMonth(''); }} style={{ ...selectStyle }}>
  {years.map(y => <option key={y} value={y}>{y}</option>)}
</select>
{mode === 'row' && (
  <select value={month} onChange={e => setMonth(e.target.value)} style={{ ...selectStyle }}>
    <option value="">전체월</option>
    {monthOpts.map(m => <option key={m} value={m}>{Number(m)}월</option>)}
  </select>
)}
```
(selectStyle은 기존 player select의 인라인 스타일 재사용.)

- [ ] **Step 5: 렌더 분기 — 레거시 모드 배너 + legacyStandings 케이스**

`sectionKeys.map(switch)` 앞에, mode==='legacy'면 안내 배너 렌더:
```jsx
{mode === 'legacy' && (
  <div style={{ ...ds.card, fontSize: 12, color: C.gray, marginBottom: 10 }}>
    {effYear}년은 집계 전적만 있습니다. 상세 지표(케미·타이브레이크·월별 등)는 2026년부터 제공됩니다.
  </div>
)}
```
switch에 케이스 추가:
```jsx
case 'legacyStandings': return <LegacyStandingsSection key={key} standings={legacyStandings} year={effYear} format={format} ds={ds} C={C} />;
case 'yearly':          return <YearlyRecordsSection key={key} entries={yearlyDisplay} ds={ds} />;  // yearlyRecords→yearlyDisplay
```
(기존 'yearly' 케이스는 `yearlyDisplay`를 넘기도록 수정.)

**신규 소컴포넌트 `LegacyStandingsSection`**(파일 내, 기존 `DoublesStandingsSection` 패턴·정적 표):
```jsx
function LegacyStandingsSection({ standings, year, format, ds, C }) {
  return (
    <>
      <div style={ds.sectionTitle}>{year} {format} 순위 (집계)</div>
      {standings.length === 0 ? (
        <div style={{ ...ds.card, color: C.gray, fontSize: 12, textAlign: 'center' }}>데이터 없음</div>
      ) : (
        <div style={ds.card}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...ds.th, textAlign: 'left' }}>#</th>
              <th style={{ ...ds.th, textAlign: 'left' }}>이름</th>
              <th style={ds.th}>전적</th>
              <th style={ds.th}>승률</th>
            </tr></thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.name}>
                  <td style={{ ...ds.td(), textAlign: 'left' }}>{i + 1}</td>
                  <td style={{ ...ds.td(true), textAlign: 'left' }}>{s.name}</td>
                  <td style={ds.td()}>{s.wins}-{s.losses}</td>
                  <td style={ds.td()}>{pct(s.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
```
(`pct`는 파일 상단 기존 헬퍼 재사용.)

- [ ] **Step 6: 스모크 테스트 확장** — `src/components/tennis/__tests__/tennisAnalyticsTab.smoke.test.jsx`

기존 스모크(빈데이터) 유지 + 로우/레거시 데이터 케이스 추가. TennisSync mock을 rows(2026)·legacyRows(2025) 픽스처 반환하도록. useEffect가 SSR 미실행이라 초기 렌더만 검증되므로, **모드 분기 함수(isRowYear 등)와 렌더 안전성**은 최소로: 빈데이터에서 크래시 없이 렌더 + 연도 select 존재(`toContain` 검증 곤란하면 최소 크래시-free 유지). 레거시 모드 렌더 안전성은 `LegacyStandingsSection`을 픽스처로 직접 renderToStaticMarkup(계산기+렌더 조합, 2단계 F1 방식)해 '집계'/이름 표시 검증.

- [ ] **Step 7: 포커스+전체 테스트** — Run: `npx vitest run src/components/tennis/__tests__/tennisAnalyticsTab.smoke.test.jsx` → PASS; `npx vitest run` → 전부 PASS
- [ ] **Step 8: 커밋** — `git add src/components/tennis/TennisAnalyticsTab.jsx src/components/tennis/__tests__/tennisAnalyticsTab.smoke.test.jsx && git commit -m "feat(tennis): 분석 탭 연/월 날짜필터 + 레거시 연도 집계 모드"`

---

## 최종 검증 (전 태스크 후)

- [ ] `npx vitest run` — 전체 통과(1050 + 신규).
- [ ] `npm run build` — 성공.
- [ ] 브라우저 스모크: 분석 탭에 연/월 select. 2026 선택=상세 지표(월 필터 동작), 2025 선택=집계 순위+안내(케미/TB 등 숨김). 대시보드·경기관리·축구/풋살 무변경.

## Self-Review 체크

- 스펙 §4 커버: 필터유틸(Task1)·섹션확장(Task2)·UI+모드분기(Task3).
- 타입 일관성: buildLegacyStandings 반환/analyticsSectionKeys 시그니처 일치. fRows가 모든 계산기에 전달.
- 무손상: 기존 계산기 로직 무변경, analyticsSectionKeys 하위호환, 대시보드/타종목 무변경.
- 레거시 모드는 player select 무의미하나 숨기지 않아도 순위만 나옴(sectionKeys가 legacyStandings만) — 무해.
