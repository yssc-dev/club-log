# 축구 분석지표 계산층 분리 (soccerAnalytics)

2026-08-12 · 승인됨

## 배경·목적

축구 분석지표 코드 리뷰에서 15건의 결함이 나왔으나, 계산 모듈(`src/utils/analyticsV2/`)이
풋살과 완전 공유라 수정이 풋살 지표 숫자에 영향을 준다. 풋살 무손상 원칙을 지키면서 축구
지표를 자유롭게 고치기 위해 **계산층을 종목별로 분리**한다(유저 결정). 테니스
(`src/utils/tennis/`)와 같은 종목 전용 디렉토리 패턴.

결정 사항:
- 분리 깊이: **계산층만** (탭 컴포넌트는 공유 유지, `isSoccer`로 네임스페이스 선택)
- 수정 적용: **축구 15건 전부 + 풋살은 크래시 방어 2건만**(숫자 불변)

## 현재 구조 (조사 결과)

- 축구 분석 화면 = PlayerAnalytics가 시트 로그를 `{sport}`로 로드해 4개 공유 탭에 전달:
  PersonalAnalysisTab · SynergyMatrixTab · ChemistryTab · AwardsTab (+ ChemistryTab 안에
  GoldenTrioView · RivalryView 중첩). CrovaGogumaRankTab·gameRecordBuilder는 풋살 전용.
- 이 6개 컴포넌트의 analyticsV2 의존(중첩 포함)은 사실상 디렉토리 전체(22개 모듈).
- analyticsV2 내부 상호 의존: parseMembers(5곳), rankUtils, pairBaseline,
  calcDailyMvp→owngoalPoints(calcMonthlyRanking), calcRadarData→`percentile`
  (../gameStateAnalyzer — orphan 모듈).

## 설계

### 1. 새 모듈: `src/utils/soccerAnalytics/`

- analyticsV2 22개 모듈을 **파일명 그대로** 복사. 내부 상호 임포트 경로만 조정.
- `percentile`은 soccerAnalytics 내부로 인라인(작은 순수 함수)해 orphan
  `gameStateAnalyzer` 의존을 끊는다.
- `__tests__`도 복사해 기준선 유지(페이즈 2에서 수정 항목에 맞춰 갱신).

### 2. 배선: 공유 탭 6곳, 호출부 무변경

각 컴포넌트에서:

```js
import * as futsalCalc from '.../analyticsV2/<module>';   // 기존 유지
import * as soccerCalc from '.../soccerAnalytics/<module>';
const { calcXxx, ... } = isSoccer ? soccerCalc : futsalCalc;  // 컴포넌트 상단 1회
```

- 본문 호출부는 무변경(네임스페이스 접두 호출 방식은 공유 diff가 커져 기각).
- `isSoccer` prop이 없는 3곳(SynergyMatrixTab · GoldenTrioView · RivalryView)에 prop
  추가, 기본값 `false` — 풋살 호출부 무수정으로 안전. 축구 경로 호출부
  (PlayerAnalytics→SynergyMatrixTab, ChemistryTab→GoldenTrioView/RivalryView)에서 전달.

### 3. 페이즈 1 — 분리 (동작 불변)

복사 + 배선만, 로직 수정 없음. 검증: 전체 vitest + 탭 스모크
(`analyticsTabs.smoke.test.jsx`) + 빌드. analyticsV2 원본·테스트 무수정 확인 후 커밋.

### 4. 페이즈 2 — 수정 적용

- **soccerAnalytics**: 코드 리뷰 15건 전부, 항목별 TDD(실패 테스트 → 수정).
  15건 목록은 2026-08-12 코드 리뷰 결과(ReportFindings) 기준 — 요지:
  1. calcPlayerSummary:47 totalSessions 빈 날짜 유입(참석률 과소)
  2. calcDailyMvp:38 축구 데일리 MVP 구조적 사망(hasPointData 게이트) — 탭 쪽 처리
     필요시 AwardsTab의 `isSoccer` 분기(확립된 패턴)로
  3. calcTrends:10 date null 정렬 크래시
  4. calcStreaks:12 date null 정렬 크래시
  5. calcPlayerSummary:84 이벤트 루프 is_extra 미필터(번외 골 인플레이션)
  6. calcStreaks:38 conceded 문자열 '0' 클린시트 연속 끊김
  7. soccerScoring:249 timestamp 없는 이벤트 정렬 비결정 (※ soccerScoring은 원래 축구
     전용 파일 — 분리 대상 아님, 직접 수정)
  8. calcAwards:52 무날짜·무매치ID 골 허위 해트트릭
  9. calcDailyMvp:28 rank_score만 있는 날 전원 공동 MVP
  10. soccerScoring:246 startedAt 없으면 'Invalid Date' 시트 기록 (※ 직접 수정)
  11. calcStreaks:37 keeper_games 문자열 '0' 필드 세션 미스킵
  12. calcVolatility:38 몰빵형·꾸준형 동일 선수 중복 선정
  13. calcAwards:58 공백 포함 이름 해트트릭 귀속 오류
  14. soccerScoring:192 soccerMatches null 가드 누락 (※ 직접 수정)
  15. calcAwards:32 자책 이벤트 존재 시 playerLogs 자책 기록 유실
- **analyticsV2(풋살)**: 3·4번의 크래시 방어만 — 정렬 비교자를 안전하게
  (`(a.date || '').localeCompare(b.date || '')` 계열). 기존 정상 데이터에선 결과 동일,
  지표 숫자 불변. 그 외 원본 무수정.

### 5. 이후 규칙

축구 지표 수식 변경 = `soccerAnalytics`(+`soccerScoring.js`)만. 풋살 숫자 절대 불변.
완료 시 메모리에 기록.

## 테스트 전략

- 페이즈 1: 기존 스위트 그린 = 풋살 불변 증명. soccerAnalytics 복사 테스트 그린 = 복사
  정합성. 스모크로 탭 렌더 확인.
- 페이즈 2: 15건 각각 실패 테스트 먼저(soccerAnalytics/__tests__). 풋살 크래시 방어
  2건은 analyticsV2/__tests__에 신규 테스트(date null 행에서 안 죽고, 정상 데이터 결과
  동일).
- 전 구간 RTL 부재 → jsx 변경분 diff 정독.

## 스코프 외 / 한계

- 복제 유지비: 풋살 쪽 개선이 축구에 자동 반영 안 됨(격리의 대가, 의도된 선택).
- 탭 UI 자체의 종목 분리(전용 탭 세트)는 하지 않음.
- 풋살의 나머지 13건 결함은 이번에 수정하지 않음(무손상 원칙, 추후 별도 결정).
- gameStateAnalyzer orphan 정리는 하지 않음(percentile 인라인만).
