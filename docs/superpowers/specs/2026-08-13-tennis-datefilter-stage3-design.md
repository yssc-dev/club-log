# 테니스 분석·대시보드 대개편 — 3단계 (날짜 필터) 설계

- 날짜: 2026-08-13
- 대상: 몽피스(테니스). 대개편 3단계(마지막) — 분석 탭 날짜 필터.
- 브랜치/워크트리: `tennis-datefilter` (base = main `7115c41`)
- 선행: 1·2단계 완료(탭 재편·분석 뷰 전환·컬럼 정렬·대시보드). main 반영.

## 1. 배경

분석 탭에 연/월 날짜 필터를 추가해 지표를 기간별로 볼 수 있게 한다. 데이터 실태: **복식 로우 2026.1~**(마이그+앱), **단식 로우 2026.8~**(앱), **레거시(테니스_레거시전적) 2024·2025 연도 집계(승/패)만**(로우 없음). 따라서 로우가 있는 연도(2026)는 상세 지표, 레거시 연도(2024/2025)는 집계 순위만 가능하다.

## 2. 범위

- **포함**: 분석 탭 연/월 필터 UI + 기간 스코핑, 레거시 연도 집계 순위(신규 `buildLegacyStandings`), rows 기간 필터 헬퍼(`filterRowsByPeriod`), 섹션 선택 확장.
- **제외**: 대시보드/경기관리/회원관리 필터(대시보드는 필터 없음 — 유저 결정). 축구/풋살 전부.
- **무변경**: 기존 계산기(`tennisAnalytics.js`/`tennisStandings.js`) 로직 — 필터는 rows 전처리로 처리(신규 `buildLegacyStandings`만 추가). 대시보드·타 탭·타 종목.

## 3. 결정 (2026-08-13 유저)

| 항목 | 결정 |
|---|---|
| 필터 배치 | **분석 탭 전용**(대시보드는 고정, 필터 없음) |
| 기본값 | **올해(2026)** |
| 레거시 연도(2024/2025) | **순위(승/패 집계)만 + 안내**, 로우 기반 섹션 숨김 |
| 연도별전적 카드 | **필터 연도만 표시**(전 섹션이 필터 존중) |

## 4. 설계

### 4.1 신규 순수 함수 — `src/utils/tennis/tennisDateFilter.js`

```js
// 로우가 있는 연도(rows) ∪ 레거시 연도(legacyRows.season)를 내림차순으로.
export function availableYears({ rows, legacyRows }) {
  const ys = new Set();
  for (const r of rows || []) { const y = String(r.date || '').slice(0, 4); if (y) ys.add(y); }
  for (const r of legacyRows || []) { if (r.season) ys.add(String(r.season)); }
  return [...ys].sort().reverse();  // ['2026','2025','2024']
}

// 특정 연도에 로우가 있는 월(YYYY-MM의 MM)들, 오름차순. 로우 없으면 [].
export function availableMonths({ rows, year }) {
  const ms = new Set();
  for (const r of rows || []) {
    const d = String(r.date || '');
    if (d.slice(0, 4) === String(year)) ms.add(d.slice(5, 7));
  }
  return [...ms].filter(Boolean).sort();  // ['01','02',...]
}

// 로우 연도인가(그 연도에 로우가 하나라도 있으면 true=상세 모드, 아니면 레거시 집계 모드).
export function isRowYear({ rows, year }) {
  return (rows || []).some(r => String(r.date || '').slice(0, 4) === String(year));
}

// rows를 기간으로 필터. month는 'MM' 또는 '' (전체월). year는 'YYYY'.
export function filterRowsByPeriod(rows, { year, month }) {
  return (rows || []).filter(r => {
    const d = String(r.date || '');
    if (d.slice(0, 4) !== String(year)) return false;
    if (month && d.slice(5, 7) !== String(month)) return false;
    return true;
  });
}

// 레거시 연도 클럽 순위(집계). legacy 필드: player·season·format·wins·losses(확인됨).
export function buildLegacyStandings({ legacyRows, year, format }) {
  const acc = new Map();
  for (const r of legacyRows || []) {
    if (String(r.season) !== String(year)) continue;
    if (format !== undefined && r.format !== format) continue;
    const cur = acc.get(r.player) || { name: r.player, wins: 0, losses: 0 };
    cur.wins += Number(r.wins) || 0;
    cur.losses += Number(r.losses) || 0;
    acc.set(r.player, cur);
  }
  return [...acc.values()]
    .map(p => ({ ...p, games: p.wins + p.losses, rate: (p.wins + p.losses) ? p.wins / (p.wins + p.losses) : 0 }))
    .filter(p => p.games > 0)
    .sort((a, b) => b.rate - a.rate || b.games - a.games || a.name.localeCompare(b.name, 'ko'));
}
```

### 4.2 섹션 선택 확장 — `src/utils/tennis/analyticsSections.js`

기존 `analyticsSectionKeys({ player, format, hasLegacy })`에 인자 추가: `mode`('row'|'legacy')와 `hasMonth`(특정 월 선택 여부).

```js
export function analyticsSectionKeys({ player, format, hasLegacy, mode = 'row', hasMonth = false }) {
  if (mode === 'legacy') return ['legacyStandings'];   // 레거시 연도: 집계 순위만
  // 이하 기존 로우 모드 로직 …
  if (!player) {
    return format === '복식'
      ? ['doublesStandings', 'chemistry', 'tb', 'acedf']
      : ['singlesStandings', 'tb', 'acedf'];
  }
  const keys = ['summary'];
  if (format === '복식') keys.push('partner');
  keys.push('h2h');
  if (!hasMonth) keys.push('monthly');   // 특정 월 선택 시 월별흐름 무의미 → 숨김
  if (hasLegacy) keys.push('yearly');
  return keys;
}
```

- **레거시 모드**: `['legacyStandings']` 하나. 컴포넌트가 이 키에 안내 문구 포함 렌더.
- **월 선택 시**: `'monthly'` 제외(단일 점).
- `'legacyStandings'`는 신규 렌더 케이스. 기존 키/동작 하위호환(mode 기본 'row', hasMonth 기본 false → 1·2단계 동작 동일).

### 4.3 분석 탭 필터 UI + 모드 분기 — `src/components/tennis/TennisAnalyticsTab.jsx`

**상단 필터 바**(기존 format 토글·선수 select 옆/아래):
- **연도 select**: `availableYears({rows, legacyRows})`, 기본 = 데이터에 2026 있으면 '2026' 아니면 최신 연도. state `year`.
- **월 select**: `isRowYear({rows, year})`일 때만 표시, 옵션 `['전체', ...availableMonths({rows, year})]`, 기본 '전체'. state `month`(''=전체). 레거시 연도면 월 select 숨김+`month=''`.

**모드 파생**: `const mode = isRowYear({ rows, year }) ? 'row' : 'legacy';`

**렌더 분기:**
- **레거시 모드**: `buildLegacyStandings({ legacyRows, year, format })` → 순위표(이름·전적·승률) + 안내 배너("이 해(2024/2025)는 집계 전적만 있습니다. 상세 지표는 2026부터."). format 토글은 유지(레거시에 단식 집계 있으면 반영, 없으면 데이터없음). 선수 select는 레거시 모드에서 의미 없으니 비활성/숨김(선택돼 있어도 순위만).
- **로우 모드**: `const fRows = filterRowsByPeriod(rows, { year, month });` 를 **모든 계산기에 rows 대신 전달**(순위·케미·TB·베이글·에이스·partner·h2h·monthly·summary·yearly). `analyticsSectionKeys({ player, format, hasLegacy: <필터연도 레거시 유무>, mode:'row', hasMonth: !!month })`로 섹션 결정.
  - **yearly(연도별전적)**: 필터 연도만 — `buildYearlyRecords({ legacyRows: filterLegacyByYear, rows: fRows, player, format })`. 단일 연도라 통산 행이 그 연도와 동일하면 통산 생략(중복 방지) — 렌더에서 처리하거나 buildYearlyRecords 입력이 1연도면 통산 스킵. (buildYearlyRecords 로직 무변경 원칙 유지 위해 **렌더 측에서 entries.length<=2일 때 '통산' 행 필터**.)

**필터 상태**: 컴포넌트 로컬 `useState`(year/month). 동기화·저장 불필요(세션 지속 안 함). format/player 전환과 독립 공존.

### 4.4 무손상

- 기존 계산기 로직 무변경(필터는 rows 전처리). `analyticsSectionKeys`는 인자 추가하되 기본값으로 1·2단계 동작 보존(회귀 테스트 `analyticsSections.test.js` 통과 유지, 신규 케이스 추가).
- 대시보드(`TennisDashboard`)·경기관리·회원관리·축구/풋살 무변경.
- 상태·동기화·시트·Apps Script 무변경.

## 5. 테스트

- **`tennisDateFilter.js` 순수 유닛**: `availableYears`(rows∪legacy·내림), `availableMonths`(연도 필터·정렬·로우없으면 []), `isRowYear`, `filterRowsByPeriod`(연/월 경계·month '' 전체), `buildLegacyStandings`(연도·format 필터·정렬·빈값·게스트 무관[레거시는 회원만]).
- **`analyticsSections.test.js` 확장**: mode='legacy'→`['legacyStandings']`; hasMonth=true→monthly 제외; 기본(mode 미지정)은 기존과 동일(회귀).
- **분석 렌더 스모크**: 로우 모드(2026)·레거시 모드(2025) 각각 크래시 없이 렌더(레거시=순위+안내, 로우=기존 섹션). useTheme 하네스 + TennisSync mock(rows/legacyRows 픽스처).
- 전체 스위트(현재 1050) 통과 유지 + 신규.

## 6. 하위 호환·리스크

- `analyticsSectionKeys` 인자 추가는 기본값으로 하위호환(1·2단계 무영향).
- 단식+로우 없는 월(예 2026.03) = 데이터없음 각 섹션 graceful.
- 레거시에 단식 집계 없으면 단식+레거시연도 = 데이터없음(정상).
- 연도별전적 통산-중복은 렌더 측 필터로 처리(계산기 무변경).
- 필터 기본 2026이라 첫 진입이 2026 스코프 — 로우가 전부 2026이라 기존 전체 뷰와 실질 동일, 레거시 카드만 필터 연도로 좁혀짐(유저 결정).
