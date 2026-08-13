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
- **순위표 컴포넌트 이동:** `DoublesStandingsSection`·`SinglesStandingsSection`·`LegacyStandingsSection`을 `TennisAnalyticsTab.jsx`에서 이 파일(또는 공용 모듈)로 이동. 분석 탭은 더 이상 사용하지 않는다. (`#` = 정렬해도 유지되는 등수 로직은 그대로 — 길로틴은 이제 incoming이 포인트순이라 `#`=포인트 등수.)

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
- **개인 종합기록에 포인트:** `SummaryCard`에 '포인트' StatCell 추가. 값 = 필터된 rows 기준 `buildSinglesStandings({ rows: fRows, roster, asOfDate: today, sortBy: 'points' })`에서 해당 선수 `points` 조회(없으면 0). 포인트의 단일 소스는 `buildSinglesStandings` 하나로 유지(중복 계산 없음).
- **유지:** 페어 케미(미선택 복식)·파트너별·상대전적·월별흐름·에이스/DF·개인 연도별 전적(커리어, `legacyRows` 직접) 그대로.

### 3.5 대시보드

**파일:** `src/components/tennis/TennisDashboard.jsx`

- `단식 순위 TOP5`(승률순) → **`길로틴 포인트 TOP5`**(포인트순): `buildSinglesStandings({ ..., sortBy: 'points' })`, P 컬럼 유지·강조.
- 나머지(이번달 요약·복식 투몽 TOP5·페어 케미 TOP5·하이라이트) 그대로. `yearSpan` 라벨 유지.
- **알려진 한계(향후):** 대시보드 TOP은 전체 데이터 기준이라, 다년 데이터가 쌓이면 연리셋 리그와 포인트 합산이 어긋날 수 있다. 현재 2026 단일 연도라 전체=올해로 무영향. 정식 연도별 뷰는 리그 탭이 담당. 다년 진입 시 대시보드를 올해 스코프로 조정 검토.

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
| `tennisStandings.js` | `buildSinglesStandings` `sortBy` 옵션 |
| `TennisAnalyticsTab.jsx` | 순위 섹션 이동·제거, 레거시 모드 제거, 연도=로우연도, SummaryCard 포인트 |
| `analyticsSections.js` | `mode`/legacy·standings 키 제거 |
| `TennisDashboard.jsx` | 단식 TOP5 → 길로틴 포인트 TOP5(포인트순) |

## 6. 테스트

- **`buildSinglesStandings` (신규):** `sortBy: 'points'` 시 포인트 내림차순, 동점 타이브레이크(승률→승수→이름). `sortBy: 'rate'`(기본) 기존 정렬 불변.
- **`analyticsSectionKeys` (수정):** 미선택 복식 `['chemistry','tb','acedf']`·단식 `['tb','acedf']`(순위 키 없음); 선수 선택 키 불변; `mode` 인자 제거 확인.
- **`TennisLeague`:** 로우 연도 → 투몽·길로틴 렌더, 길로틴 포인트순; 레거시 연도 → 집계 순위. (RTL 스모크 가능 시; 아니면 계산기 단위 + 육안/빌드.)
- **회귀:** 기존 스위트(1131) 그린 유지. 컴포넌트 렌더 검증 공백은 빌드+diff 정독으로 보완. (memory: `feedback_component_render_verification_gap`)

## 7. 범위 밖

- 회원관리 실기능(명부 편집 write API) — 여전히 placeholder(beta).
- 대시보드 다년 스코프 조정(§3.5 한계) — 2027 진입 시.
- 시트/Apps Script 변경 없음.
