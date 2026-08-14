# 테니스 분석 차트화 설계 (Tier 1~3)

**작성일:** 2026-08-14 · **대상:** 몽피스 테니스 (tennis-league 워크트리)

## 목표
분석·리그 탭의 표/수치를 **SVG 차트**로 시각화. 기존 월별흐름(MonthlyFormSection SVG 라인)을 템플릿으로, 테마 반응형·소표본 우아하게. 데이터 계산기는 재사용(신규 계산기는 레이더 정규화 1개만).

## 공통 원칙
- 신규 파일 `src/components/tennis/tennisCharts.jsx` — 자족적 SVG 차트 컴포넌트 모음(외부 라이브러리 없음, `C` 토큰 사용).
- 스타일: 월별흐름 준용 — `C.accent`(계열), `C.grayDarker`(그리드), 2px 선·4px 점, `C.gray` 라벨, `tabular-nums`.
- **소표본 가드**: 데이터 없으면 "데이터 없음", 값이 0/1개여도 안 터짐.
- **차트는 숫자를 라벨로 병기**(표를 대체하되 정확값 유지). 표를 없앨지/차트+표 병행할지는 각 항목에 명시.
- 접근성: `<svg role="img" aria-label>`.

## 차트 목록

### Tier 1

**1. 개인 프로필 레이더 (`PlayerRadarChart`)** — 개인 뷰, SummaryCard 위에.
- 신규 계산기 `buildPlayerRadar({ rows, roster, player })` → 5축 `[{ axis, value(0~1), raw }]`:
  - 단식 승률·복식 승률(0~1 직접), 포인트·참석일·에이스(로스터 최댓값으로 정규화 → 0~1). 최댓값 0이면 그 축 0.
  - 반환: `{ axes: [{key,label,value,raw}], player }`.
- 렌더: 정오각형 축 + 선수 폴리곤(C.accent, 반투명 fill). 각 꼭짓점에 raw 라벨. 표본이 선수 하나뿐이면 정규화가 1로 쏠릴 수 있음 → 축 라벨에 raw 병기로 오해 방지. SummaryCard(정확 숫자)는 유지.

**2. 상대 전적 가로 바 (`HBarChart` 재사용)** — 개인 뷰, HeadToHeadSection 대체.
- 데이터: `buildHeadToHead`(상대별 wins/losses/rate). 정렬: 승률↓ → 경기수↓.
- 각 행 = 가로 바(길이=승률), 우측 라벨 `{wins}-{losses} ({rate%})`, 좌측 상대명. 색: 승률≥0.5 C.accent, <0.5 C.grayDarker(약한 상대 구분).

**3. 파트너별 가로 바 (`HBarChart` 재사용)** — 개인 뷰(복식), ChemistrySection의 breakdown 대체.
- 데이터: `buildPartnerBreakdown`. 상대전적 바와 동일 컴포넌트.

### Tier 2

**4. 경기 유형 도넛 (`LeagueDonut`)** — 리그 탭, 카운트 텍스트 줄 대체(또는 상단).
- 데이터: `buildLeagueCounts`(투몽/길로틴/번외/전체). 3세그먼트 도넛 + 범례 + 중앙 전체 수. 색: 투몽=C.accent, 길로틴=보조1, 번외=C.grayDarker. 전체 0이면 숨김.

**5. 연도별 바 (`YearlyBarChart`)** — 개인 뷰, YearlyRecordsSection 대체(표는 아래 유지 옵션).
- 데이터: `buildYearlyRecords`(season·wins·losses·rate, 통산 포함). 세로 바(승률) + 바 위 경기수 라벨 + 축에 연도. '통산'은 별도 색/구분.

**6. 에이스·DF 산점도 (`AceDfScatter`)** — 전체 뷰, AceDfSection 대체(또는 병행).
- 데이터: `buildAceDfRanking`(name·aces·doubleFaults·recordedGames). x=에이스, y=DF, 점=선수(이름 라벨). 대각선(에이스=DF) 안내선 — 우하(에이스↑DF↓)=좋은 서버. 점 크기=recordedGames(선택).

### Tier 3

**7. 순위/리더보드 가로 바 (`HBarChart` 재사용)** — 전체 뷰.
- 페어 케미·TB(승률)·베이글(개수) TOP N을 가로 바로. 기존 표는 유지하고 상단에 미니 바 요약(또는 표 대체). 값 라벨 병기.

**8. 대시보드/순위 인라인 미니바** — MiniRankTable·순위표의 승률 칸에 배경 미니바(0~100%). 표 유지 + 시각 힌트.

## 재사용 컴포넌트
- `HBarChart({ rows: [{label, value(0~1), note}], C, ds, colorFor })` — 항목 2·3·7 공용 가로 바.
- 나머지(Radar/Donut/YearlyBar/Scatter)는 전용.

## 배치/토글
- 개인 뷰: 레이더 → SummaryCard → 파트너 바 → 상대 바 → 월별흐름(기존) → 연도 바. (표를 바로 대체, 정확값은 바 라벨/카드로.)
- 전체 뷰: 리그 도넛(리그 탭) · 케미/TB/베이글/에이스 차트.
- 대체 vs 병행: 상대전적·파트너·연도·에이스DF·리그카운트는 **차트로 대체**(값 라벨 병기). 순위표(투몽/길로틴)는 표 유지 + 미니바.

## 테스트
- `buildPlayerRadar` 유닛: 정규화(로스터 최댓값), 빈/단일 표본, 승률 직접.
- 차트 컴포넌트 renderToStaticMarkup 스모크: 픽스처로 크래시 없이 렌더(빈 데이터 포함) — `tennisStandingsSections.smoke` 패턴.
- 회귀: 기존 스위트 그린. 컴포넌트 렌더 검증 공백은 빌드+스모크로 보완(memory `feedback_component_render_verification_gap`).

## 범위 밖
- 새 데이터 수집·시트 변경 없음(기존 계산기 재사용).
- 인터랙션은 월별흐름 수준(호버 툴팁)까지, 과한 애니메이션 지양.
