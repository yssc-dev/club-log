# 테니스 분석·대시보드 대개편 1단계 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 테니스 홈 탭을 대시보드·분석·경기관리·회원관리(beta)로 재편하고, 분석 탭을 "미선택=전체 / 선수 선택=개인" 뷰 전환으로 바꾸며, 지표 테이블에 컬럼 정렬을 추가한다.

**Architecture:** 정렬·뷰 전환 결정·탭 배열을 **순수 함수로 추출**(RTL 부재 → 순수 함수 유닛 + `renderToStaticMarkup` 스모크로 검증). 기존 섹션 컴포넌트·계산 유틸은 재사용, 컴포넌트 배치와 정렬 래핑만 변경. 공유 `TeamDashboard.jsx`는 테니스 분기만 수정.

**Tech Stack:** React 18, Vite, Vitest(jsdom), `renderToStaticMarkup`. 스타일은 `makeStyles(C)` 테마.

## Global Constraints

- **풋살·축구 무영향**: 공유 파일(`TeamDashboard.jsx`)은 `isTennis`/테니스 분기 안에서만 수정. 비테니스 탭 배열·badge·렌더 한 줄도 의미 변경 금지. 기존 `analyticsTabs.smoke.test.jsx` 통과 유지.
- **계산 유틸 로직 무변경**: `tennisAnalytics.js`/`tennisStandings.js`의 build 함수는 수정하지 않는다(정렬은 컴포넌트 계층에서 래핑).
- **시트/Apps Script 무수정**, 상태·동기화 스키마 변경 없음.
- **공용 스타일 무변경**: `makeStyles`의 공용 `ds.th`/`ds.chip` 등은 수정하지 않고 사용처에서 확장.
- 전체 테스트 스위트(현재 820) 통과 유지 + 신규 테스트 추가.
- beta 배지 색: `#a78bfa`(연보라), 배경 `#a78bfa22`. 경기관리 "진행중" 초록 배지(`#22c55e`)와 별개.

---

### Task 1: 정렬 순수 헬퍼 + useSortableRows 훅 + SortHeader

**Files:**
- Create: `src/utils/tennis/sortRows.js`
- Create: `src/utils/tennis/__tests__/sortRows.test.js`
- Create: `src/components/tennis/Sortable.jsx`

**Interfaces:**
- Produces:
  - `defaultDirFor(sampleValue) → 'asc' | 'desc'` — number → `'desc'`, 그 외 → `'asc'`.
  - `nextSort(sort, key, defaultDir) → { key, dir }` — `sort?.key === key`면 dir 토글(asc↔desc), 아니면 `{ key, dir: defaultDir }`.
  - `sortRows(rows, accessor, dir) → Array` — `accessor(row)`로 값 추출, 숫자면 수치 비교·문자면 `localeCompare(…, 'ko')`, `dir==='desc'`면 반전. 안정 정렬(`[...rows]` 후 인덱스 타이브레이크).
  - `useSortableRows(rows, columns, initial=null)` (Sortable.jsx) → `{ sorted, sort, onSort }`. `columns`: `{ [key]: { accessor, type? } }`. `sort` 초기값 `initial`. `onSort(key)`가 `nextSort`로 갱신, `defaultDir`는 `columns[key].type==='text'?'asc':columns[key].type==='num'?'desc':defaultDirFor(accessor(rows[0]))`.
  - `SortHeader({ label, sortKey, sort, onSort, align='center', ds })` (Sortable.jsx) → `<th>` — 클릭 시 `onSort(sortKey)`, 활성 컬럼이면 라벨 뒤 `' ▲'`/`' ▼'`, `cursor:'pointer'`, `userSelect:'none'`, 스타일 `...ds.th`(+ `textAlign:align`).

- [ ] **Step 1: 실패 테스트 작성** — `src/utils/tennis/__tests__/sortRows.test.js`

```js
import { describe, it, expect } from 'vitest';
import { defaultDirFor, nextSort, sortRows } from '../sortRows';

describe('defaultDirFor', () => {
  it('숫자는 desc, 문자는 asc', () => {
    expect(defaultDirFor(5)).toBe('desc');
    expect(defaultDirFor('가')).toBe('asc');
  });
});

describe('nextSort', () => {
  it('다른 key면 defaultDir로 활성화', () => {
    expect(nextSort(null, 'rate', 'desc')).toEqual({ key: 'rate', dir: 'desc' });
    expect(nextSort({ key: 'name', dir: 'asc' }, 'rate', 'desc')).toEqual({ key: 'rate', dir: 'desc' });
  });
  it('같은 key면 토글', () => {
    expect(nextSort({ key: 'rate', dir: 'desc' }, 'rate', 'desc')).toEqual({ key: 'rate', dir: 'asc' });
    expect(nextSort({ key: 'rate', dir: 'asc' }, 'rate', 'desc')).toEqual({ key: 'rate', dir: 'desc' });
  });
});

describe('sortRows', () => {
  const rows = [{ n: '나', v: 2 }, { n: '가', v: 3 }, { n: '다', v: 2 }];
  it('숫자 desc', () => {
    expect(sortRows(rows, r => r.v, 'desc').map(r => r.v)).toEqual([3, 2, 2]);
  });
  it('숫자 asc', () => {
    expect(sortRows(rows, r => r.v, 'asc').map(r => r.v)).toEqual([2, 2, 3]);
  });
  it('한글 asc localeCompare', () => {
    expect(sortRows(rows, r => r.n, 'asc').map(r => r.n)).toEqual(['가', '나', '다']);
  });
  it('동값이면 원래 순서 보존(안정)', () => {
    expect(sortRows(rows, r => r.v, 'desc').map(r => r.n)).toEqual(['가', '나', '다']);
  });
  it('원본 배열 불변', () => {
    const copy = [...rows];
    sortRows(rows, r => r.v, 'desc');
    expect(rows).toEqual(copy);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/utils/tennis/__tests__/sortRows.test.js` → FAIL (모듈 없음)

- [ ] **Step 3: 구현** — `src/utils/tennis/sortRows.js`

```js
// 지표 테이블 컬럼 정렬용 순수 헬퍼. 계산 유틸과 무관, 행 순서만 바꾼다.
export function defaultDirFor(sampleValue) {
  return typeof sampleValue === 'number' ? 'desc' : 'asc';
}

export function nextSort(sort, key, defaultDir) {
  if (sort && sort.key === key) {
    return { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' };
  }
  return { key, dir: defaultDir };
}

export function sortRows(rows, accessor, dir) {
  const mul = dir === 'desc' ? -1 : 1;
  return [...(rows || [])]
    .map((row, i) => [row, i])
    .sort(([a, ai], [b, bi]) => {
      const va = accessor(a);
      const vb = accessor(b);
      let c;
      if (typeof va === 'number' && typeof vb === 'number') c = va - vb;
      else c = String(va).localeCompare(String(vb), 'ko');
      return c !== 0 ? c * mul : ai - bi; // 안정 정렬: 동값이면 원 인덱스
    })
    .map(([row]) => row);
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/utils/tennis/__tests__/sortRows.test.js` → PASS

- [ ] **Step 5: 훅+헤더 구현** — `src/components/tennis/Sortable.jsx`

```jsx
import { useMemo, useState } from 'react';
import { defaultDirFor, nextSort, sortRows } from '../../utils/tennis/sortRows';

// columns: { [key]: { accessor: (row)=>value, type?: 'num'|'text' } }
export function useSortableRows(rows, columns, initial = null) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => {
    if (!sort || !columns[sort.key]) return rows || [];
    return sortRows(rows, columns[sort.key].accessor, sort.dir);
  }, [rows, sort, columns]);
  const onSort = (key) => {
    const col = columns[key];
    const dir = col?.type === 'text' ? 'asc'
      : col?.type === 'num' ? 'desc'
      : defaultDirFor(col ? col.accessor((rows || [])[0] || {}) : 0);
    setSort((s) => nextSort(s, key, dir));
  };
  return { sorted, sort, onSort };
}

export function SortHeader({ label, sortKey, sort, onSort, align = 'center', ds }) {
  const active = sort && sort.key === sortKey;
  const arrow = active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{ ...ds.th, textAlign: align, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      {label}{arrow}
    </th>
  );
}
```

- [ ] **Step 6: 전체 스위트 확인** — Run: `npx vitest run` → 신규 6 케이스 포함 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add src/utils/tennis/sortRows.js src/utils/tennis/__tests__/sortRows.test.js src/components/tennis/Sortable.jsx
git commit -m "feat(tennis): 컬럼 정렬 순수 헬퍼 + useSortableRows 훅/SortHeader"
```

---

### Task 2: 분석 뷰 전환 + 요약 카드 (섹션 선택 순수 함수 포함)

**Files:**
- Create: `src/utils/tennis/analyticsSections.js`
- Create: `src/utils/tennis/__tests__/analyticsSections.test.js`
- Modify: `src/components/tennis/TennisAnalyticsTab.jsx`
- Create: `src/components/tennis/__tests__/tennisAnalyticsTab.smoke.test.jsx`

**Interfaces:**
- Consumes: 기존 섹션 컴포넌트(`DoublesStandingsSection`, `SinglesStandingsSection`, `ChemistrySection`, `HeadToHeadSection`, `MonthlyFormSection`, `TbBagelSection`, `AceDfSection`, `YearlyRecordsSection`)와 build 함수, `buildPlayerSummary`(from `tennisStandings`).
- Produces: `analyticsSectionKeys({ player, format, hasLegacy }) → string[]`.
  - `player` 없음(전체): 복식 `['doublesStandings','chemistry','tb','bagel','acedf']`, 단식 `['singlesStandings','tb','bagel','acedf']`.
  - `player` 있음(개인): 복식 `['summary','partner','h2h','monthly', ...(hasLegacy?['yearly']:[])]`, 단식 `['summary','h2h','monthly', ...(hasLegacy?['yearly']:[])]`.

- [ ] **Step 1: 실패 테스트 작성** — `src/utils/tennis/__tests__/analyticsSections.test.js`

```js
import { describe, it, expect } from 'vitest';
import { analyticsSectionKeys } from '../analyticsSections';

describe('analyticsSectionKeys', () => {
  it('전체(미선택) 복식 = 순위·케미·TB(+베이글)·에이스, 개인섹션 없음', () => {
    const k = analyticsSectionKeys({ player: '', format: '복식', hasLegacy: true });
    expect(k).toEqual(['doublesStandings', 'chemistry', 'tb', 'acedf']);
    expect(k).not.toContain('summary');
    expect(k).not.toContain('partner');
  });
  it('전체 단식 = 단식순위·TB(+베이글)·에이스', () => {
    expect(analyticsSectionKeys({ player: '', format: '단식', hasLegacy: true }))
      .toEqual(['singlesStandings', 'tb', 'acedf']);
  });
  it('개인 복식 = 요약·파트너·상대·월별·연도별, 전체랭킹 없음', () => {
    const k = analyticsSectionKeys({ player: '박성언', format: '복식', hasLegacy: true });
    expect(k).toEqual(['summary', 'partner', 'h2h', 'monthly', 'yearly']);
    expect(k).not.toContain('doublesStandings');
    expect(k).not.toContain('tb');
  });
  it('개인 단식 = 요약·상대·월별·연도별(파트너 없음)', () => {
    expect(analyticsSectionKeys({ player: '박성언', format: '단식', hasLegacy: true }))
      .toEqual(['summary', 'h2h', 'monthly', 'yearly']);
  });
  it('레거시 없으면 yearly 제외', () => {
    expect(analyticsSectionKeys({ player: '박성언', format: '복식', hasLegacy: false }))
      .toEqual(['summary', 'partner', 'h2h', 'monthly']);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/utils/tennis/__tests__/analyticsSections.test.js` → FAIL

- [ ] **Step 3: 순수 함수 구현** — `src/utils/tennis/analyticsSections.js`

```js
// 분석 탭 뷰 전환: 선수 미선택=전체 랭킹, 선택=개인 분석. 렌더가 이 키 목록만 그린다.
// 'tb' 단일 키가 TB+베이글을 함께 대표한다(TbBagelSection이 둘을 한 번에 렌더).
export function analyticsSectionKeys({ player, format, hasLegacy }) {
  if (!player) {
    return format === '복식'
      ? ['doublesStandings', 'chemistry', 'tb', 'acedf']
      : ['singlesStandings', 'tb', 'acedf'];
  }
  const keys = ['summary'];
  if (format === '복식') keys.push('partner');
  keys.push('h2h', 'monthly');
  if (hasLegacy) keys.push('yearly');
  return keys;
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/utils/tennis/__tests__/analyticsSections.test.js` → PASS

- [ ] **Step 5: TennisAnalyticsTab 뷰 전환 개조** — `src/components/tennis/TennisAnalyticsTab.jsx`

변경점:
1. `import { analyticsSectionKeys } from '../../utils/tennis/analyticsSections';` 와 `import { buildPlayerSummary } from '../../utils/tennis/tennisStandings';`(기존 import에 추가).
2. `const [player, setPlayer] = useState(authUserName || '');` → **`useState('')`** (기본 미선택).
3. select 빈 옵션 라벨 `선수 선택` → `전체 랭킹`.
4. 요약 카드 소컴포넌트 추가(개인기록 탭에서 이식한 StatCell 기반):

```jsx
function StatCell({ label, value, C }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: C.gray }}>{label}</div>
      <div style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums', color: C.white }}>{value}</div>
    </div>
  );
}

function SummaryCard({ summary, player, ds, C }) {
  return (
    <>
      <div style={ds.sectionTitle}>{player} 요약</div>
      <div style={ds.card}>
        <div style={{ display: 'flex', marginBottom: 12 }}>
          <StatCell C={C} label="단식" value={`${summary.singles.wins}-${summary.singles.losses}`} />
          <StatCell C={C} label="복식" value={`${summary.doubles.wins}-${summary.doubles.losses}`} />
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

5. 개인 뷰의 파트너별을 `ChemistrySection`에서 분리 — 전체 뷰는 케미만, 개인 뷰는 파트너별만. `ChemistrySection`은 이미 `chemistry`(전체)와 `breakdown`(개인)을 함께 렌더하므로, **prop으로 분기**한다: `<ChemistrySection ... showChemistry showBreakdown />` 플래그 추가(둘 다 기본 true; 하위호환). 전체 뷰엔 `showBreakdown={false}`, 개인 뷰엔 `showChemistry={false}`. (ChemistrySection 내부: `showChemistry && (…케미표…)`, `showBreakdown && player && breakdown.length>0 && (…파트너별…)`.)
6. `summary = useMemo(() => player ? buildPlayerSummary({ rows, player }) : null, [rows, player]);` 추가.
7. 렌더를 `analyticsSectionKeys({ player, format, hasLegacy: legacyRows.length>0 })` 결과 배열을 순회해 키→컴포넌트 매핑으로 교체:

```jsx
const sectionKeys = analyticsSectionKeys({ player, format, hasLegacy: legacyRows.length > 0 });
// ...
{sectionKeys.map((key) => {
  switch (key) {
    case 'doublesStandings': return <DoublesStandingsSection key={key} standings={doublesStandings} ds={ds} />;
    case 'singlesStandings': return <SinglesStandingsSection key={key} standings={singlesStandings} ds={ds} />;
    case 'chemistry':        return <ChemistrySection key={key} chemistry={chemistry} breakdown={[]} player="" showBreakdown={false} ds={ds} C={C} />;
    case 'summary':          return <SummaryCard key={key} summary={summary} player={player} ds={ds} C={C} />;
    case 'partner':          return <ChemistrySection key={key} chemistry={[]} breakdown={partnerBreakdown} player={player} showChemistry={false} ds={ds} C={C} />;
    case 'h2h':              return <HeadToHeadSection key={key} h2h={h2h} player={player} ds={ds} C={C} />;
    case 'monthly':          return <MonthlyFormSection key={key} monthly={monthly} player={player} format={format} ds={ds} C={C} />;
    case 'yearly':           return <YearlyRecordsSection key={key} entries={yearlyRecords} ds={ds} />;
    case 'tb':               return <TbBagelSection key={key} tb={tbRanking} bagel={bagelRanking} ds={ds} C={C} />;
    case 'acedf':            return <AceDfSection key={key} acedf={aceDfRanking} ds={ds} C={C} />;
    default:                 return null;
  }
})}
```

> `'tb'` 단일 키가 TB+베이글을 함께 대표한다(`TbBagelSection`이 둘을 한 컴포넌트에서 렌더). 별도 `'bagel'` 키는 두지 않는다 — `analyticsSectionKeys`·유닛 테스트·이 switch 모두 `'tb'` 하나로 일관.

8. `ChemistrySection` 시그니처에 `showChemistry=true, showBreakdown=true` 기본값 추가하고 내부 렌더를 두 플래그로 가드.

- [ ] **Step 6: 뷰 전환 스모크 테스트** — `src/components/tennis/__tests__/tennisAnalyticsTab.smoke.test.jsx`

```jsx
// 렌더 크래시 방어 + 뷰 전환. TennisSync는 내부 fetch라 renderToStaticMarkup에서 빈 데이터로 그려짐(크래시만 검증).
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider } from '../../../hooks/useTheme';
import TennisAnalyticsTab from '../TennisAnalyticsTab';

vi.mock('../../../services/tennisSync', () => ({
  default: { getPlayerGames: () => Promise.resolve([]), getLegacyRecords: () => Promise.resolve([]), getRoster: () => Promise.resolve([]) },
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true, value: (q) => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});

describe('TennisAnalyticsTab 스모크', () => {
  it('빈 데이터·기본(전체) 상태에서 크래시 없이 렌더', () => {
    const html = renderToStaticMarkup(
      createElement(ThemeProvider, null, createElement(TennisAnalyticsTab, { C: undefined, authUserName: '박성언' }))
    );
    expect(html).toContain('전체 랭킹'); // select 빈 옵션 라벨
  });
});
```

> `C`는 ThemeProvider가 제공하는 실제 색을 컴포넌트가 `useTheme`로 받으면 됨. TennisAnalyticsTab이 `C`를 prop으로 받는 현 시그니처면, 테스트에서 최소 색 객체를 넘긴다(구현자는 `analyticsTabs.smoke.test.jsx`의 방식을 참고해 필요한 색 키를 채운 mock C를 전달). 핵심은 크래시 없이 렌더되고 '전체 랭킹' 문구가 나오는 것.

- [ ] **Step 7: 통과 확인** — Run: `npx vitest run src/utils/tennis/__tests__/analyticsSections.test.js src/components/tennis/__tests__/tennisAnalyticsTab.smoke.test.jsx` → PASS

- [ ] **Step 8: 전체 스위트** — Run: `npx vitest run` → 전부 PASS (개인기록 탭 roster는 아직 존재, 무영향)

- [ ] **Step 9: 커밋**

```bash
git add src/utils/tennis/analyticsSections.js src/utils/tennis/__tests__/analyticsSections.test.js src/components/tennis/TennisAnalyticsTab.jsx src/components/tennis/__tests__/tennisAnalyticsTab.smoke.test.jsx
git commit -m "feat(tennis): 분석 탭 뷰 전환(전체/개인) + 요약 카드 이식"
```

---

### Task 3: 분석 테이블에 컬럼 정렬 적용

**Files:**
- Modify: `src/components/tennis/TennisAnalyticsTab.jsx`

**Interfaces:**
- Consumes: Task 1의 `useSortableRows`, `SortHeader` (from `./Sortable`).

각 섹션 컴포넌트(`DoublesStandingsSection`·`SinglesStandingsSection`·`ChemistrySection`(케미/파트너)·`HeadToHeadSection`·`TbBagelSection`·`AceDfSection`·`YearlyRecordsSection`)에서:
1. `const cols = { … };` 컬럼별 `{ accessor, type }` 정의.
2. `const { sorted, sort, onSort } = useSortableRows(rows, cols);`
3. `<thead>`의 `<th>`들을 `<SortHeader label sortKey={key} sort={sort} onSort={onSort} align ds />`로 교체.
4. `<tbody>`가 `sorted`를 순회.

**정렬 키/타입 매핑(스펙 §4.4):**
- 복식 순위(`DoublesStandingsSection`): `name`(text)·`grade`(text)·`record`(num, `s.wins`)·`rate`(num, `s.rate`). (# 컬럼은 정렬 후 인덱스라 헤더 정렬 제외)
- 단식 순위(`SinglesStandingsSection`): `name`·`leagueTier`(text)·`grade`(text)·`record`(num `wins`)·`rate`(num)·`points`(num).
- 페어 케미(`ChemistrySection` 케미표): `pair`(text, `p.players.join('·')`)·`record`(num `wins`)·`rate`(num).
- 파트너별(`ChemistrySection` breakdown): `partner`(text)·`record`(num `wins`)·`rate`(num).
- 상대전적(`HeadToHeadSection`): `opponent`(text)·`record`(num `wins`)·`rate`(num).
- TB(`TbBagelSection` TB표): `name`(text)·`won`(num `tbWon`)·`rate`(num). 베이글표: `name`(text)·`given`(num)·`taken`(num).
- 에이스·DF(`AceDfSection`): `name`(text)·`aces`(num)·`doubleFaults`(num)·`recordedGames`(num).
- 연도별(`YearlyRecordsSection`): 정렬 미적용(행 수 적고 "통산" 고정 행 포함) — 헤더 그대로 둔다.

**완전 예시 — 복식 순위표(`DoublesStandingsSection`):**

```jsx
import { useSortableRows, SortHeader } from './Sortable';
// ...
function DoublesStandingsSection({ standings, ds }) {
  const cols = {
    name:   { accessor: s => s.name, type: 'text' },
    grade:  { accessor: s => s.grade || '', type: 'text' },
    record: { accessor: s => s.wins, type: 'num' },
    rate:   { accessor: s => s.rate, type: 'num' },
  };
  const { sorted, sort, onSort } = useSortableRows(standings, cols);
  if (!standings.length) return null;
  return (
    <>
      <div style={ds.sectionTitle}>복식 순위 (투몽)</div>
      <div style={ds.card}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...ds.th, textAlign: 'left' }}>#</th>
              <SortHeader label="이름" sortKey="name" sort={sort} onSort={onSort} align="left" ds={ds} />
              <SortHeader label="등급" sortKey="grade" sort={sort} onSort={onSort} ds={ds} />
              <SortHeader label="전적" sortKey="record" sort={sort} onSort={onSort} ds={ds} />
              <SortHeader label="승률" sortKey="rate" sort={sort} onSort={onSort} ds={ds} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => (
              <tr key={s.name}>
                <td style={{ ...ds.td(), textAlign: 'left' }}>{i + 1}</td>
                <td style={{ ...ds.td(true), textAlign: 'left' }}>{s.name}</td>
                <td style={{ ...ds.td(), fontSize: 10 }}>{s.grade}</td>
                <td style={ds.td()}>{s.wins}-{s.losses}</td>
                <td style={ds.td()}>{pct(s.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
```

나머지 표는 동일 패턴(위 매핑대로 `cols` 정의 → `<th>`를 `SortHeader`로 → `sorted` 순회). 셀 렌더는 기존과 동일.

- [ ] **Step 1: 복식 순위표에 정렬 적용** (위 예시)
- [ ] **Step 2: 단식 순위·케미·파트너·상대전적·TB·베이글·에이스 표에 동일 적용** (매핑대로)
- [ ] **Step 3: 렌더 스모크 확인** — Run: `npx vitest run src/components/tennis/__tests__/tennisAnalyticsTab.smoke.test.jsx` → PASS(크래시 없음)
- [ ] **Step 4: 전체 스위트** — Run: `npx vitest run` → PASS
- [ ] **Step 5: 커밋**

```bash
git add src/components/tennis/TennisAnalyticsTab.jsx
git commit -m "feat(tennis): 분석 지표 테이블 컬럼 정렬 적용"
```

---

### Task 4: 탭 재편 (buildMainTabs) + beta 배지 + 개인기록 흡수 + placeholder

**Files:**
- Create: `src/components/dashboard/mainTabs.js`
- Create: `src/components/dashboard/__tests__/mainTabs.test.js`
- Modify: `src/components/dashboard/TeamDashboard.jsx`
- Modify: `src/components/tennis/TennisTabs.jsx`

**Interfaces:**
- Produces: `buildMainTabs({ activeSport, role, pendingCount }) → Array<{ key, label, beta?, badge? }>`.
  - 테니스: `[{key:'tdash',label:'대시보드',beta:true},{key:'records',label:'분석'},{key:'games',label:'경기관리',badge:pendingCount>0}, ...(role==='관리자'?[{key:'members',label:'회원관리',beta:true}]:[])]`.
  - 비테니스: 기존 배열과 동일 — `[{key:'records',label:'대시보드'},{key:'roster',label:activeSport==='축구'?'팀/개인 기록':'개인기록'},{key:'analytics',label:'분석'},{key:'games',label:'경기관리',badge:pendingCount>0}, ...(activeSport==='축구'?[{key:'tournament',label:'대회'}]:[])]`.

- [ ] **Step 1: 실패 테스트 작성** — `src/components/dashboard/__tests__/mainTabs.test.js`

```js
import { describe, it, expect } from 'vitest';
import { buildMainTabs } from '../mainTabs';

const keys = (arr) => arr.map(t => t.key);

describe('buildMainTabs 테니스', () => {
  it('관리자 = 대시보드·분석·경기관리·회원관리, 대시보드/회원관리 beta', () => {
    const t = buildMainTabs({ activeSport: '테니스', role: '관리자', pendingCount: 0 });
    expect(keys(t)).toEqual(['tdash', 'records', 'games', 'members']);
    expect(t.find(x => x.key === 'tdash').beta).toBe(true);
    expect(t.find(x => x.key === 'members').beta).toBe(true);
    expect(keys(t)).not.toContain('roster');
  });
  it('비관리자 = 회원관리 없음', () => {
    expect(keys(buildMainTabs({ activeSport: '테니스', role: '멤버', pendingCount: 0 })))
      .toEqual(['tdash', 'records', 'games']);
  });
  it('진행중 경기 있으면 경기관리 badge', () => {
    const t = buildMainTabs({ activeSport: '테니스', role: '멤버', pendingCount: 2 });
    expect(t.find(x => x.key === 'games').badge).toBe(true);
  });
});

describe('buildMainTabs 비테니스(회귀)', () => {
  it('축구 = records·roster·analytics·games·tournament', () => {
    expect(keys(buildMainTabs({ activeSport: '축구', role: '관리자', pendingCount: 0 })))
      .toEqual(['records', 'roster', 'analytics', 'games', 'tournament']);
  });
  it('풋살 = records·roster·analytics·games (대회 없음)', () => {
    const t = buildMainTabs({ activeSport: '풋살', role: '관리자', pendingCount: 0 });
    expect(keys(t)).toEqual(['records', 'roster', 'analytics', 'games']);
    expect(t.find(x => x.key === 'records').label).toBe('대시보드');
    expect(t.find(x => x.key === 'roster').label).toBe('개인기록');
  });
  it('축구 roster 라벨=팀/개인 기록', () => {
    const t = buildMainTabs({ activeSport: '축구', role: '관리자', pendingCount: 0 });
    expect(t.find(x => x.key === 'roster').label).toBe('팀/개인 기록');
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/components/dashboard/__tests__/mainTabs.test.js` → FAIL

- [ ] **Step 3: 구현** — `src/components/dashboard/mainTabs.js`

```js
// 홈 상단 탭 배열. 테니스만 대시보드·분석·경기관리·회원관리(beta), 그 외는 기존 구성.
export function buildMainTabs({ activeSport, role, pendingCount }) {
  const badge = pendingCount > 0;
  if (activeSport === '테니스') {
    return [
      { key: 'tdash', label: '대시보드', beta: true },
      { key: 'records', label: '분석' },
      { key: 'games', label: '경기관리', badge },
      ...(role === '관리자' ? [{ key: 'members', label: '회원관리', beta: true }] : []),
    ];
  }
  return [
    { key: 'records', label: '대시보드' },
    { key: 'roster', label: activeSport === '축구' ? '팀/개인 기록' : '개인기록' },
    { key: 'analytics', label: '분석' },
    { key: 'games', label: '경기관리', badge },
    ...(activeSport === '축구' ? [{ key: 'tournament', label: '대회' }] : []),
  ];
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/components/dashboard/__tests__/mainTabs.test.js` → PASS

- [ ] **Step 5: TeamDashboard 배선** — `src/components/dashboard/TeamDashboard.jsx`

1. `import { buildMainTabs } from './mainTabs';`
2. 인라인 탭 배열(931-937행 부근)을 `buildMainTabs({ activeSport, role: activeEntry?.role, pendingCount: pendingGames.length })`로 교체. `.filter(Boolean).map(tab => (…))` 유지.
3. map 본문에 beta 배지 span 추가(기존 진행중 배지 아래):

```jsx
{tab.badge && (
  <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "#22c55e22", color: "#22c55e", fontWeight: 700 }}>진행중</span>
)}
{tab.beta && (
  <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "#a78bfa22", color: "#a78bfa", fontWeight: 700, letterSpacing: 0.3 }}>beta</span>
)}
```

(비테니스 탭은 `beta` 미존재 → 미표시. 축구/풋살 무영향.)

- [ ] **Step 6: TennisTabs 개인기록 제거 + placeholder** — `src/components/tennis/TennisTabs.jsx`

1. `roster` 분기(내 전적 카드) **삭제**. `StatCell`·`buildPlayerSummary` import가 이 파일에서 더 안 쓰이면 제거(요약 카드는 Task 2에서 분석으로 이식됨).
2. `tdash`·`members` placeholder 분기 추가:

```jsx
if (activeTab === 'tdash')   return <div style={{ padding: 20, textAlign: 'center', color: C.gray, fontSize: 13 }}>대시보드 · beta</div>;
if (activeTab === 'members') return <div style={{ padding: 20, textAlign: 'center', color: C.gray, fontSize: 13 }}>회원관리 · beta</div>;
```

3. `records`(→`TennisAnalyticsTab`)·`games` 분기 유지. 최종 fallback도 유지.

- [ ] **Step 7: 전체 스위트** — Run: `npx vitest run` → 신규 mainTabs 케이스 포함 전부 PASS, `analyticsTabs.smoke.test.jsx`(비테니스 회귀) PASS

- [ ] **Step 8: 커밋**

```bash
git add src/components/dashboard/mainTabs.js src/components/dashboard/__tests__/mainTabs.test.js src/components/dashboard/TeamDashboard.jsx src/components/tennis/TennisTabs.jsx
git commit -m "feat(tennis): 탭 재편(대시보드·회원관리 beta)+개인기록 흡수+placeholder"
```

---

## 최종 검증 (전 태스크 후)

- [ ] `npx vitest run` — 전체 통과(기존 820 + 신규).
- [ ] `npm run build` — 빌드 성공.
- [ ] 브라우저 스모크(dev 서버): 테니스 홈 탭 = 대시보드(beta)·분석·경기관리·회원관리(beta, 관리자). 분석 진입=전체 랭킹, 선수 선택 시 개인 뷰 전환(요약카드+파트너별/상대/월별/연도별). 지표 헤더 클릭 시 정렬 동작. 대시보드/회원관리 탭=`· beta` placeholder.
- [ ] 축구/풋살 홈 탭 무변경 육안 확인(대시보드·개인기록/팀기록·분석·경기관리[·대회]).

## Self-Review 체크

- 스펙 §4 전 항목 커버: 탭 재편(Task 4)·분석 뷰 전환(Task 2)·개인기록 흡수(Task 4 roster 삭제 + Task 2 요약카드)·컬럼 정렬(Task 1+3)·beta 배지(Task 4)·무영향(Global Constraints + mainTabs 회귀 테스트).
- 타입 일관성: `useSortableRows(rows, cols)`·`SortHeader` 시그니처가 Task 1 정의와 Task 3 사용 일치. `analyticsSectionKeys`가 `'tb'` 단일 키(베이글 포함)로 통일(Task 2 결정).
- 플레이스홀더 없음: 각 태스크에 실제 코드·테스트·명령 포함.
