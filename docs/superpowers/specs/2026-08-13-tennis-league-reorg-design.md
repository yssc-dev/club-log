# 테니스 리그·분석 개편 설계

**작성일:** 2026-08-13
**대상:** 몽피스 테니스 모드 (footsal_webapp, tennis-league 워크트리)

## 1. 목표

테니스 화면을 **5탭 구조**로 재편한다: `대시보드 · 리그 · 분석 · 회원관리 · 경기관리`.
- **리그**를 독립 탭으로 분리하고, **투몽리그(복식)**·**길로틴리그(단식 포인트)** 두 정식 순위를 그 안에 둔다. 둘 다 **연도 단위** 집계.
- 길로틴 단식은 **포인트 순위**(포인트 내림차순)를 1급 지표로 노출한다. 지금까지 P는 승률순 순위표의 한 컬럼일 뿐이었다.
- **개인 종합기록**(분석의 선수 선택 뷰)에 **포인트**를 추가한다.
- **분석 탭**은 정식 순위를 리그 탭으로 넘기고, 심화·개인 지표 중심으로 남긴다.

## 2. 배경 / 현행

- 몽피스 자체 규정: 월별 전적으로 1/2그룹을 가르는 **길로틴 리그(단식)**, 그리고 **투몽리그(복식)**. (memory: `project_tennis_club_rules`)
- 현재 탭: `대시보드(tdash) · 분석(records) · 회원관리(members, 관리자·beta) · 경기관리(games)`.
- 현재 순위는 **분석 탭** 안에 있다:
  - 복식 순위(투몽): `buildDoublesStandings` — 승률순, 등급.
  - 단식 순위(길로틴): `buildSinglesStandings` — **승률순 정렬**, P는 컬럼. 리그(흑기사 BK / 흑장미 BR)·등급 표시.
- 포인트 규칙(`rankPoints.js`, 단식 전용): 기본승 +1, 같은 리그 승률 업셋 +2, 흑장미가 흑기사 이김 +3(같은/다른 리그라 +2와 상호배타), 하위 등급이 상위 등급 이김 +5. 최대 9점. 게스트는 등급 없음.
- 날짜 필터(`tennisDateFilter.js`): `availableYears`, `availableMonths`, `isRowYear`, `filterRowsByPeriod`, `buildLegacyStandings`. 레거시 연도(2024/2025)는 집계 전적만 존재.

## 3. 변경 사항

### 3.1 탭 구조

**파일:** `src/components/dashboard/mainTabs.js`, `src/components/tennis/TennisTabs.jsx`, `src/components/dashboard/TeamDashboard.jsx`

- 테니스 탭 배열: `tdash(대시보드) · league(리그) · records(분석) · members(회원관리, 관리자·beta) · games(경기관리)`.
  - `league` 키 신설, `tdash` 바로 뒤에 삽입.
- `TennisTabs`: `activeTab === 'league'` → `<TennisLeague C={C} />` 분기 추가.
- 초기/스포츠 전환 `activeTab`은 **'tdash' 유지**(기존 로직 불변). `league`는 테니스 전용 키라 타 종목에 누수 없음. (memory: `project_teamdashboard_activetab_shared`)

### 3.2 리그 탭 (신규 컴포넌트 `TennisLeague.jsx`)

**파일:** `src/components/tennis/TennisLeague.jsx` (신규)

- 데이터: `TennisSync.getPlayerGames()`(rows), `getLegacyRecords()`(legacyRows), `getRoster()`(roster) — 대시보드/분석과 동일 로드 패턴.
- **연도 selector:** `availableYears({ rows, legacyRows })`(내림차순). 기본값 = 올해(목록에 있으면), 없으면 목록 첫 값.
- **상단 라벨:** 각 순위 제목에 `· {year}년` 접미사.
- **로우 연도**(`isRowYear` true):
  - 투몽리그(복식): `buildDoublesStandings({ rows: yearRows, roster })` → 승률순, 등급.
  - 길로틴리그(단식): `buildSinglesStandings({ rows: yearRows, roster, asOfDate: today, sortBy: 'points' })` → **포인트순**, `#` = 포인트 등수, 리그(BK/BR) 뱃지, 승률·전적 컬럼.
  - `yearRows = filterRowsByPeriod(rows, { year, month: '' })`.
- **레거시 연도**(로우 없음, 알려진 레거시 연도):
  - `buildLegacyStandings({ legacyRows, year, format: '복식' })` / `... format: '단식' })` → 집계 순위(#/이름/전적/승률). 포인트·리그 그룹 없음.
- **순위표 컴포넌트 공용 추출(이동 아님):** `DoublesStandingsSection`·`SinglesStandingsSection`·`LegacyStandingsSection`을 `TennisAnalyticsTab.jsx`에서 신규 공용 모듈 **`src/components/tennis/tennisStandingsSections.jsx`**로 옮겨 named export. `TennisLeague`가 여기서 import한다. (`#` = 정렬해도 유지되는 등수 로직은 그대로 — 길로틴은 이제 incoming이 포인트순이라 `#`=포인트 등수.)
  - **[적대적 리뷰 E-2/C-1]** `LegacyStandingsSection`은 현재 `TennisAnalyticsTab.jsx`의 유일한 named export이고 `tennisAnalyticsTab.smoke.test.jsx:7`가 이를 import한다. 추출 시 그 스모크 테스트의 import 경로를 새 모듈로 갱신해야 한다(§6).
  - **[적대적 리뷰 A-2]** `SinglesStandingsSection`의 리그 뱃지 렌더는 방어적으로: `s.leagueTier === LEAGUE_BR ? 'BR' : s.leagueTier === LEAGUE_BK ? 'BK' : '-'` (기존 `=== '흑기사' ? 'BK' : 'BR'`는 undefined를 'BR'로 오표시).

### 3.3 `buildSinglesStandings` 정렬 옵션

**파일:** `src/utils/tennis/tennisStandings.js`

- 시그니처에 `sortBy = 'rate'` 추가: `buildSinglesStandings({ rows, roster, asOfDate, pointRules, sortBy })`.
  - `'rate'`(기본, 기존 동작 보존): `b.rate - a.rate || b.wins - a.wins || name`.
  - `'points'`: `b.points - a.points || b.rate - a.rate || b.wins - a.wins || name`. (동점 타이브레이크 = 승률 → 승수 → 이름)
- 포인트 계산 로직 자체는 불변.

### 3.4 분석 탭 재편

**파일:** `src/components/tennis/TennisAnalyticsTab.jsx`, `src/utils/tennis/analyticsSections.js`

- **정식 순위 제거:** `doublesStandings`·`singlesStandings` 섹션 렌더를 없앤다(리그 탭 이관).
- **연도 selector = 로우 연도만:** `availableYears({ rows, legacyRows: [] })`. 레거시 연도(2024/2025)는 분석 selector에서 제외 → `mode === 'legacy'` 분기·안내문·`LegacyStandingsSection` 렌더 제거. (레거시 클럽 순위는 리그 탭 소유.)
- **`analyticsSectionKeys` 정리:** `mode` 파라미터·legacy 분기 제거. 미선택 뷰:
  - 복식: `['chemistry', 'tb', 'acedf']`
  - 단식: `['tb', 'acedf']`
  - 선수 선택 뷰(불변): `['summary', (복식 시)'partner', 'h2h', (월 미선택 시)'monthly', (레거시 있으면)'yearly']`.
- **[적대적 리뷰 E-4] `mode` 정리는 한 번에:** `TennisAnalyticsTab.jsx`에서 (1) `const mode = isRowYear(...)` 파생 제거, (2) `mode === 'row'` JSX 게이트(월/선수 select)는 항상 참이므로 무조건 렌더로 전환, (3) `mode === 'legacy'` 안내 배너 제거, (4) `analyticsSectionKeys(...)` 호출에서 `mode` 인자·`useMemo` deps에서 `mode` 제거, (5) 미사용된 `isRowYear` import 제거. 이 중 하나라도 빠지면 `ReferenceError: mode is not defined` 또는 dead 코드가 남는다.
- **개인 종합기록에 포인트:** `SummaryCard`에 '포인트' StatCell 추가. **모든 선수 선택 뷰(복식·단식 공통)에 표시** — 카드는 종합기록이고 포인트는 그 사람의 단식(길로틴) 누적이다.
  - **[적대적 리뷰 C-3/B] 재계산 금지·dead memo 제거:** 값은 기존 `singlesStandings` useMemo를 `sortBy: 'points'`로 유지해 그 결과에서 `find(s => s.name === player)?.points ?? 0`으로 조회(로스터 선수는 모두 `points:0`로 선시드되어 안전). 렌더에서 빠진 `doublesStandings` useMemo는 삭제(죽은 계산).
- **유지:** 페어 케미(미선택 복식)·파트너별·상대전적·월별흐름·에이스/DF·개인 연도별 전적(커리어, `legacyRows` 직접) 그대로.

### 3.5 대시보드

**파일:** `src/components/tennis/TennisDashboard.jsx`

- `단식 순위 TOP5`(승률순) → **`단식 포인트 TOP5`**(포인트순): `buildSinglesStandings({ ..., sortBy: 'points' })`. P 컬럼 유지(별도 강조 스타일 없음).
- **[적대적 리뷰 B] 이름은 중립("단식 포인트")으로:** 대시보드 TOP은 전체 데이터 누적(연도 미스코프)이므로, 연리셋 리그명 "길로틴리그"를 붙이면 오해를 부른다. 연도별 정식 리그 순위는 **리그 탭**이 소유하고, 대시보드는 통산 스냅샷이다. 이름을 "단식 포인트 TOP5"로 두면 통산 누적이라는 의미가 정직하다.
- 나머지(이번달 요약·복식 투몽 TOP5·페어 케미 TOP5·하이라이트) 그대로. `yearSpan` 라벨 유지.

### 3.6 공용 포맷 유틸 추출 — `pct`

**파일:** `src/utils/tennis/tennisFormat.js` (신규)

- **[적대적 리뷰 C-2]** `pct = (r) => r > 0 ? \`${Math.round(r*100)}%\` : '-'`가 `TennisDashboard.jsx`·`TennisAnalyticsTab.jsx`에 중복 존재. 신규 `TennisLeague`/`tennisStandingsSections`도 필요 → 3중복 방지 위해 공용 util로 추출.
- `export const pct`. `TennisDashboard`·`TennisAnalyticsTab`의 로컬 정의는 삭제하고 import로 대체. (순수함수·동일 구현이라 회귀 위험 없음.)
- `StatCell`은 리그 탭이 쓰지 않으므로 추출 대상 아님(YAGNI).

## 4. 데이터 / 불변식 (유지)

- 포인트: 단식 전용, `calcMatchPoints`. 리그·승률은 **경기일 직전값** 사용(`deriveLeagueForDate`, `singlesWinRatesBefore`).
- 매치 페어링 키: `game_id|match_id`.
- 로스터 밖(용병/탈퇴)은 순위표 제외; 게스트(`is_guest`)는 단식 순위에서 제외.
- 시트 진실 소스 수정 없음(읽기 전용 분석).

## 5. 파일 영향 요약

| 파일 | 변경 |
|------|------|
| `mainTabs.js` | `league` 탭 추가 |
| `TennisTabs.jsx` | `league` 분기 → `TennisLeague` |
| `TennisLeague.jsx` | **신규**: 연도 selector + 투몽/길로틴/레거시 순위 |
| `tennisStandingsSections.jsx` | **신규(공용)**: Doubles/Singles/Legacy 순위 섹션(분석탭에서 추출) |
| `tennisFormat.js` | **신규(공용)**: `pct` |
| `tennisStandings.js` | `buildSinglesStandings` `sortBy` 옵션 |
| `TennisAnalyticsTab.jsx` | 순위 섹션 공용추출·제거, 레거시/`mode` 정리, 연도=로우연도, SummaryCard 포인트, `pct` import화 |
| `analyticsSections.js` | `mode`/legacy·standings 키 제거 |
| `TennisDashboard.jsx` | 단식 TOP5 → 단식 포인트 TOP5(포인트순), `pct` import화 |

**갱신 필요 테스트(적대적 리뷰 E-1/E-2/E-3):**
| 테스트 | 변경 |
|--------|------|
| `analyticsSections.test.js` | 미선택 단언 `['doublesStandings','chemistry','tb','acedf']`→`['chemistry','tb','acedf']`, `['singlesStandings','tb','acedf']`→`['tb','acedf']`; legacy 모드 테스트(라인 29-32) 제거 |
| `tennisAnalyticsTab.smoke.test.jsx` | `LegacyStandingsSection` import 경로를 `tennisStandingsSections`로 변경 |
| `tennisDashboard.smoke.test.jsx` | `'단식 순위 TOP 5'` → `'단식 포인트 TOP 5'` |

## 6. 테스트

- **`buildSinglesStandings` (신규):** `sortBy: 'points'` 시 포인트 내림차순, 동점 타이브레이크(승률→승수→이름). `sortBy: 'rate'`(기본) 기존 정렬 불변.
- **`analyticsSectionKeys` (수정):** 미선택 복식 `['chemistry','tb','acedf']`·단식 `['tb','acedf']`(순위 키 없음); 선수 선택 키 불변; `mode` 인자 제거 확인. **기존 테스트 갱신**: 미선택 단언 2건 교체, legacy 모드 테스트 제거(§5 표).
- **`TennisLeague`:** 로우 연도 → 투몽·길로틴 렌더, 길로틴 포인트순; 레거시 연도 → 집계 순위. (renderToStaticMarkup 스모크 — 기존 `tennisDashboard.smoke` 패턴 준용: TennisSync mock + 픽스처.)
- **스모크 임포트/문자열 갱신(회귀 방지):** `tennisAnalyticsTab.smoke`의 `LegacyStandingsSection` import 경로, `tennisDashboard.smoke`의 타이틀 문자열(§5 표).
- **회귀:** 위 갱신 반영 후 전체 스위트 그린 유지. 컴포넌트 렌더 검증 공백은 빌드+diff 정독으로 보완. (memory: `feedback_component_render_verification_gap`)

## 6.1 적대적 리뷰 반영 요약 (스펙 리뷰 4렌즈)

- **E-1(Critical)** 기존 `analyticsSections.test.js`가 삭제될 동작을 단언 → 테스트 갱신 태스크로 명시(§5/§6).
- **E-2·C-1(Important)** `LegacyStandingsSection` named export를 스모크가 import → 공용 모듈 추출 + import 경로 갱신(§3.2/§5).
- **E-3(Important)** 대시보드 스모크 타이틀 문자열 → 갱신(§3.5/§5).
- **E-4(Important)** `mode` 정리 순서 함정 → 5단계 동시 정리 명시(§3.4).
- **B(Important)** 대시보드 리그명 오해 → 중립 "단식 포인트 TOP5"(§3.5).
- **C-2(Important)** `pct` 3중복 → 공용 util(§3.6).
- **C-3(Minor)** 개인 포인트 재계산 → 기존 memo 재사용(§3.4).
- **A-2(Minor)** `leagueTier` 방어적 렌더(§3.2).
- **비이슈 확인:** `sortBy='rate'` 기본 회귀 없음(E-5), `league` 탭 스포츠 전환 안전(E-6).

## 6.2 알려진 한계 (행동 안 함)

- **[A-1] 연초 첫 세션 승률 업셋 미발화:** year-scoped rows에서 그 해 첫 경기일은 `singlesWinRatesBefore`가 비어(이전 경기 없음) 전원 흑기사로 파생되어, 리그/승률 업셋(+2/+3)이 안 붙고 기본승·등급 업셋만 적립. **기존 분석탭도 동일**(year-filter 공유). 완화책 `seasonStartRank`(시즌시작순위 수동 기입)는 백로그(memory `project_tennis_backlog`). 2026은 앱 최초 연도라 이전 데이터 자체가 없어 흑기사 시작이 자연스러움 → 본 개편 범위 밖, 문서화만.
- **[A-3=B] 대시보드 통산 누적 vs 리그 연도:** 다년 진입 시 대시보드(통산)와 리그 탭(연도)의 포인트가 다를 수 있음. 중립 이름으로 의미 분리(§3.5). 2027 진입 시 재검토.

## 7. 범위 밖

- 회원관리 실기능(명부 편집 write API) — 여전히 placeholder(beta).
- 대시보드 다년 스코프 조정(§3.5 한계) — 2027 진입 시.
- 시트/Apps Script 변경 없음.
