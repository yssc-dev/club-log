# 테니스 경기 입력·로그 개선 설계

- 날짜: 2026-08-12
- 대상: 몽피스(테니스)
- 선행: `2026-08-06-tennis-mode-design.md`, `2026-08-10-tennis-phase2-design.md`

## 1. 배경과 목표

세 가지 개선을 한 작업으로 묶는다(모두 경기 입력·로그 품질).

1. **과거 날짜 경기 입력** — 경기 생성 시 날짜를 오늘 대신 과거로 지정해, 놓친 날/정기모임 외 매치를 앱으로 기록.
2. **input_time을 KST로** — 현재 `new Date().toISOString()`(UTC)으로 쌓여 한국시간과 9시간 어긋남. 앞으로 KST로 기록.
3. **전송자(input_by) 로그** — 누가 마감·전송했는지 로그에 남긴다. 매치·선수경기 로그 둘 다.

## 2. 확정된 결정 (2026-08-12 유저)

| 항목 | 결정 |
|---|---|
| 과거 날짜 범위 | 오늘까지(미래 차단). 과거는 자유 |
| 중복 처리 | 그 날짜에 기존 테니스 로그가 있으면 **경고 표시**(막지 않음) |
| 전송자 위치 | **매치 로그 + 선수경기 로그 둘 다** `input_by` 컬럼 |
| input_time 소급 | **안 함** — 앞으로만 KST. 기존 UTC 로그(499판+8월~)는 그대로(분석 미사용 감사로그) |

## 3. 과거 날짜 경기 입력

- **UI**: `TennisAttendeeSelector`(참석자 설정 화면) 상단에 날짜 선택 `<input type="date" max={오늘}>`. 기본값 = 오늘(KST). 미래 날짜 차단.
- **리듀서**: `SET_GAME_DATE { date }` 신규 — `phase === 'setup'`에서만, `gameDate`와 `season`(=`Number(date.slice(0,4))`) 갱신.
- **중복 경고**: 날짜 선택 시 `TennisSync.getPlayerGames(date, date)` 1회 조회 → rows > 0이면 "이 날짜에 이미 N판 기록됨" 안내(오렌지, 막지 않음). setup 단계의 일회성 조회로, "경기 중 화면은 시트 조회 안 함" 원칙의 의도된 예외.
- **gameId 무변경**: `g_${Date.now()}`(식별자). 테니스 경기 카드(TennisTabs)·로그·분석은 모두 `state.gameDate`를 쓰므로 과거 날짜가 정확히 반영된다.
- 로그의 `date`/`season`은 `state.gameDate` 기반이라 자동 정확.

## 4. input_time KST

- 신규 유틸 `nowKST()` → `'YYYY-MM-DD HH:mm:ss'` 한국시간 문자열. 구현은 타임존 명시 방식(`Intl`/`toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })` 또는 UTC+9 오프셋 — KST는 DST 없음). 포맷·타임존을 유닛테스트로 검증.
- `TennisApp.handleSubmitRecords`의 `inputTime = new Date().toISOString()...`을 `nowKST()`로 교체.
- 마이그레이션 스크립트(`tennisLegacyDoubles.mjs` 등)의 inputTime도 일관성 위해 KST로(적재 시각이라 실질 영향은 없음).
- **소급 없음**: 기존 UTC 로그는 그대로 둔다. input_time은 테니스 분석에서 읽지 않음(감사 전용 — 코드 확인 완료).

## 5. 전송자 input_by

- **스키마 확장**(끝에 추가, 헤더 1:1 규칙):
  - `tennisSchema.js` `TENNIS_MATCH_COLUMNS` 끝에 `'input_by'`(21→22칸), `TENNIS_PLAYER_GAME_COLUMNS` 끝에 `'input_by'`(29→30칸).
  - `apps-script/Code.js` `TENNIS_MATCH_HEADERS` / `TENNIS_PLAYER_GAME_HEADERS` 끝에 `"input_by"` — **컬럼 순서 1:1 동일**. 상단 changelog에 날짜+내용. **Apps Script 반영은 유저 수동**(배포 관리→편집→새 버전).
- **값**: 마감(전송) 누른 사람 = `authUser?.name`. `TennisApp.handleSubmitRecords`에서 `inputBy`를 rowBuilders에 전달.
- **rowBuilders**: `buildTennisMatchRows`/`buildTennisPlayerGameRows`에 `inputBy` 인자 추가, 행에 `input_by: inputBy || ''`.
- **하위 호환**: 기존 로그 행(499판+8월~)은 `input_by` 빈값. Apps Script `_tennisRowToArray`가 헤더 순서로 뽑고 없으면 빈값이라, 스키마에 컬럼만 늘어도 기존 데이터·읽기 경로 안전. 마이그레이션 스크립트/legacyDoublesTransform은 `input_by`를 안 넣어도 빈값 적재(수정 불필요, 단 스키마 순서 확인).

## 6. 동기화·범위

- **새 상태 필드 없음**: `gameDate`/`season`은 이미 META 등록. `input_by`는 로그 전용(state 아님). **firebaseSyncDiff 무변경**.
- 풋살/축구 무영향: 테니스 파일 + `apps-script/Code.js` 테니스 헤더만.
- 분석 탭·랭킹 무변경(input_by/input_time은 분석 미사용, date는 기존과 동일 의미).

## 7. 하위 호환

- 진행 중 기존 경기: `SET_GAME_DATE` 없이도 기존 `gameDate`(오늘) 유지. 정상.
- 기존 로그: `input_by` 빈값, `input_time` UTC 그대로. 읽기·분석 무영향.
- Apps Script 미반영 상태에서 앱이 `input_by` 포함 행을 보내면? `_tennisRowToArray`가 새 헤더를 모르면 그 값이 누락될 뿐(기존 컬럼은 정상). 반영 후 정상 기록. → **배포 순서**: 앱 배포 후 유저가 Apps Script 반영. 그 사이 마감분은 input_by 유실 가능 → 유저에게 "앱 배포 직후 Apps Script 반영" 안내.

## 8. 테스트

- `nowKST()`: 포맷(`YYYY-MM-DD HH:mm:ss`) + 타임존(고정 UTC 입력 → KST 출력) 유닛테스트.
- 리듀서 `SET_GAME_DATE`: setup-only, season 갱신, playing에서 no-op.
- rowBuilders: `input_by`가 매치·선수경기 행에 들어가는지, 미전달 시 빈값.
- 스키마 1:1: `tennisSchema.test.js`에 컬럼 수/순서 단언 갱신(Code.js는 vitest import 불가 → 수동 대조를 리뷰에서 확인).
- UI 스모크: 날짜 선택·미래 차단·중복 경고 표시, 과거 날짜로 마감 시 로그 date/input_by 확인(운영 전송은 스모크 제외).

## 9. 범위 밖

- input_time 소급 수정.
- 대량 과거 마이그레이션(시트 기반) 스크립트 증분화 — 별도.
- 전송자 기반 분석/필터(감사 기록만).
