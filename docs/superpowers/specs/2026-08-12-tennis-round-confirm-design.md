# 테니스 경기 플로우 개편 설계 — 라운드 확정 + 마감 2단계화

- 날짜: 2026-08-12
- 대상: 몽피스(테니스). 기준 패턴은 풋살 schedule 모드의 확정/마감 플로우.
- 선행: `2026-08-06-tennis-mode-design.md`(1차), `2026-08-10-tennis-phase2-design.md`(2차)

## 1. 배경과 목표

현재 테니스는 라운드 탭 자유 이동·자유 추가에, 하단 "경기 마감" 버튼이 즉시 시트 전송까지 해버린다. 미완료 코트는 "전송되지 않고 버려집니다" 경고 후 폐기된다. 이를 풋살과 같은 구조로 바꾼다:

1. **라운드 확정 게이트** — 라운드의 모든 코트가 완료되어야 하단 "라운드 확정"을 누를 수 있고, 확정해야 다음 라운드를 추가할 수 있다.
2. **이전 라운드 열람·수정** — 확정된 라운드는 읽기 전용으로 언제든 열람, "확정취소" 후 수정 가능.
3. **경기 마감 상단 이동 + 2단계화** — 상단 pill "경기 마감"은 전 라운드 확정 시 활성, 누르면 전송이 아니라 **기록 확인(summary) 화면**으로 전환. 거기서 관리자가 "기록확정(구글시트 전송)"을 결정하고, 성공 후 "아카이브 저장"으로 마무리한다.

## 2. 확정된 결정 (2026-08-12 유저)

| 항목 | 결정 |
|---|---|
| 미완료 코트가 있는 라운드의 확정 | **차단** — 버튼 비활성 + 미완료 코트 안내. 자동 폐기 없음(수동 삭제 또는 기록 완료 요구) |
| 기존 "미완료 N개 버려집니다" 경고 | 폐지 — 게이트 구조상 발생 불가 |
| 아카이브 조회 화면(테니스판 HistoryView) | 범위 밖 — 저장까지만. 데이터는 쌓이므로 후속에서 화면만 추가 |
| 분석 탭 기간 필터·개인/전체 뷰 분리 | 후순위(별도 스펙) — 이 작업과 무관 |

## 3. 상태 모델

- **신규 필드** `confirmedRounds: {}` — `{ [roundIdx: number]: true }`, 풋살(`useGameReducer.js:41`)과 동일 형태.
- **phase 확장**: `'setup' → 'playing' → 'summary' → 'done'`. `'summary'`가 신규(마감 후 확인 화면). `FINALIZE`는 시트 전송 성공 시에만 디스패치(기존과 동일), `phase='done'`은 아카이브 직전 상태.
- **동기화 등록 5곳** (사전 매핑 완료):
  1. `firebaseSyncDiff.js` `TENNIS_WHOLE_REPLACE_FIELDS`(현재 `['rounds','guests']`)에 `confirmedRounds` 추가
  2. `reconstructState`에 `confirmedRounds: raw.confirmedRounds` 복원식 (기본값 땜질 금지 — 기존 주석 규칙)
  3. `normalizeTennisMatch.js`에 `confirmedRounds` `{}` 기본값 보정 (**하위 호환의 단일 지점** — 진행 중인 기존 경기 복원 시 undefined → `{}`)
  4. `useTennisReducer.js` `tennisInitialState`에 선언
  5. `tennisSyncCoverage.test.js` 분류 가드 자동 통과 확인(TENNIS_WHOLE_REPLACE는 allSets에 포함됨)
- phase는 기존 META_FIELDS 등록 필드라 값 추가만으로 동기화 무수정.

## 4. 리듀서 액션

- **`CONFIRM_ROUND { roundIdx }`** — 가드: 해당 라운드의 **모든 코트가 `status==='done'`** 이 아니면 no-op(상태 그대로 반환). 통과 시 `confirmedRounds[roundIdx]=true`.
- **`UNCONFIRM_ROUND { roundIdx }`** — `confirmedRounds`에서 키 삭제. (풋살과 달리 스냅샷 이동/복원이 없다 — 테니스는 코트 데이터가 rounds 안에 그대로 있으므로 플래그만 지우면 기존 수정 경로(되돌리기/설정수정)가 부활한다.)
- **`SET_PHASE { phase }`** 신규 — `'summary'`↔`'playing'` 왕복에 사용. 허용 값 화이트리스트(`'playing'|'summary'`) 밖이면 no-op.
- 기존 코트 편집 액션들(INCREMENT_*, END_SET, UNDO, EDIT_COURT_SETTINGS, DELETE_COURT 등)은 **확정된 라운드에 대해 리듀서 레벨에서 차단**한다(`confirmedRounds[roundIdx]` 체크 후 no-op). UI 차단만으로는 실시간 동기화 다중 탭 환경에서 뚫린다.

## 5. 화면

### 5.1 하단 바 (TennisConfirmBar 교체)

보는 라운드(`viewingRoundIdx`) 기준 3상태:
- **미확정 + 모든 코트 done** → "라운드 N 확정" (파랑, 활성)
- **미확정 + 미완료 코트 존재** → 버튼 비활성 + "미완료 코트: C4 — 삭제하거나 기록을 완료하세요" 안내(오렌지)
- **확정됨** → "라운드 N 확정취소" (회색/주황)

기존 "경기 마감" 버튼과 "미완료 N개 버려집니다" 경고는 하단에서 제거.

### 5.2 확정된 라운드의 읽기 전용화

- `TennisCourtCard`(DoneCourtCard): 확정 라운드에서는 되돌리기·설정수정 버튼 숨김, 대신 "확정된 라운드 — 수정하려면 확정취소" 안내 문구.
- 라운드 탭 이동(`TennisRoundNav`)은 기존 라운드 간 자유 유지(열람 요구사항).
- **'+ 라운드' 게이트**: 마지막 라운드가 확정된 경우에만 활성(비활성 시 흐림 처리). '+ 코트'는 미확정 라운드에서만 노출.

### 5.3 경기 마감 (상단) + summary 화면

- 경기 진행 화면 상단 탭바(참석명단·오늘 결과·개인기록·경기삭제) 행에 **"경기 마감" pill 추가**. 활성 조건: `rounds.length >= 1 && 모든 rounds가 confirmedRounds에 존재`. 클릭 → `phase='summary'`.
- **summary 화면** (phase==='summary' 분기, 신규 컴포넌트 `TennisSummaryView`):
  - 상단 "← 경기로 돌아가기" (phase='playing' 복귀)
  - 라운드별 판 기록 나열: 대진(단/복식), 세트 스코어(TB 포함), 에이스/DF 요약 — 기존 "오늘 결과" 탭의 렌더 관례 재사용
  - **"기록확정 (구글시트 전송)"**: `teamContext.role !== '관리자'`면 비활성+"(관리자만)" 표기(풋살 관례). 클릭 시 기존 전송 체인 그대로(`buildTennisMatchRows`+`buildTennisPlayerGameRows` → `TennisSync.writeMatches`/`writePlayerGames` 병렬, 하나라도 실패 시 alert+미확정 유지, 전부 성공 시 `FINALIZE`(gameFinalized=true))
  - **"아카이브 저장"**: `gameFinalized===true`일 때만 활성. `FirebaseSync.saveFinalized` → `clearState` → 메뉴 복귀(풋살 Archive 버튼과 동일 순서, clearState 실패 시 active 보존 alert 관례 포함)
- 기존 `TennisApp`의 `handleFinalize`(하단 마감 즉시 전송)는 summary의 "기록확정"으로 이동하고, 하단 경로는 제거.

## 6. 하위 호환

- 진행 중인 기존 경기(예: 2026-08-07 게임): `confirmedRounds` undefined → normalize에서 `{}` → 전 라운드 미확정으로 표시. 미완료 코트를 정리하고 R1부터 확정하면 새 흐름에 합류.
- 이미 마감·전송된 과거 경기는 영향 없음(active에서 이미 제거됨).
- 풋살/축구 코드는 무수정 — 테니스 파일(TennisApp/useTennisReducer/tennis 컴포넌트/normalize/firebaseSyncDiff의 테니스 상수)만 변경.

## 7. 에러 처리

- 전송 실패: 기존 규칙 유지 — 미확정 유지, 재전송 유도, 부분 성공 시에도 gameFinalized false.
- 아카이브 중 clearState 실패: active 보존 + 안내(풋살 관례).
- 리듀서 가드(no-op) 덕에 동기화로 늦게 도착한 확정 라운드 편집 액션은 조용히 무시된다.

## 8. 테스트

- 리듀서: CONFIRM_ROUND(미완료 코트 존재 시 거부/전 코트 done 시 확정), UNCONFIRM_ROUND, 확정 라운드 편집 액션 차단(no-op), SET_PHASE 왕복.
- normalize: confirmedRounds 누락 → `{}` 보정.
- 동기화: tennisSyncCoverage 분류 통과, expandStateForRtdb/reconstructState 왕복에 confirmedRounds 포함.
- 게이트 파생 로직(마감 활성 조건, + 라운드 활성 조건)은 순수 헬퍼로 분리해 유닛테스트.
- UI: 브라우저 스모크(하단 바 3상태, summary 진입/복귀, 비관리자 전송 버튼 비활성) — 렌더 검증 공백 규칙.

## 9. 범위 밖

- 테니스 아카이브 조회 화면(HistoryView 대응) — 저장 데이터는 이번에 쌓이기 시작, 화면은 후속.
- 분석 탭 기간 필터(연/월) + 전체 랭킹/개인 분석 뷰 분리 — 별도 스펙으로 후속.
- 풋살의 스냅샷형 completedMatches/gksHistory 같은 구조 이식 — 테니스는 불필요(코트 데이터가 rounds에 상주).
