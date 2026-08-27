# 몽피스(테니스) 마감 경기 자동 업로드·아카이브 설계

- 날짜: 2026-08-27
- 대상: 테니스 종목, `autoUpload` 설정을 켠 팀만 (현재 대상 = 몽피스)
- 상태: 설계 승인 완료 (2026-08-27 등급 스냅샷 반영)

## 1. 배경

테니스 경기는 사람이 앱에서 두 단계를 직접 눌러야 마무리된다.

1. `handleSubmitRecords` (`src/TennisApp.jsx:88`) — 시트 2종(`로그_테니스매치`, `로그_테니스선수경기`) 전송 후 `FINALIZE`
2. `handleArchive` (`src/TennisApp.jsx:121`) — `finalized` 노드 보관 후 `active` 노드 삭제

앱은 100% 브라우저 클라이언트라 아무도 앱을 열지 않으면 아무 일도 일어나지 않는다. 실제로 2026-08-27 기준 `games/몽피스/active`에 8건이 방치돼 있다(전부 `phase:"setup"`, 2026-08-05 ~ 08-26).

## 2. 목표 / 비목표

**목표**

- 매일 오전 10시(KST), 마감된 테니스 경기를 사람 개입 없이 구글 시트 업로드 + 아카이브까지 처리
- 기능은 팀설정 체크박스로 켠 팀에만 적용
- 다른 팀(마스터FC·하버FC)과 다른 종목(풋살·축구) 코드/데이터에 **영향 0**

**비목표**

- `phase:"setup"`/`playing` 경기 정리 — 방치된 8건은 영구히 손대지 않는다
- 라운드 미확정 경기 자동 마감 — 사람이 "경기 마감"을 누른 것만 대상
- 시트 중복 행 자동 제거 — 기존 규칙대로 사람이 수동 처리 (프로젝트 결정 유지)

## 3. 결정 요약

| 항목 | 결정 | 이유 |
|---|---|---|
| 실행 주체 | GitHub Actions cron (`0 1 * * *` UTC = KST 10:00) | 앱의 행 빌더를 그대로 재사용 → 20칸 스키마 이중화 없음 |
| 대상 조건 | `sport==='테니스'` **AND** `phase ∈ {summary, done}` | 사용자가 "마감" 의사를 명시한 것만 |
| 기능 스위치 | `settings/{team}/테니스/overrides/autoUpload` | 팀·종목 단위 격리 |
| 인증 | `TENNIS_BOT_TOKEN` (팀:이름:뒷4자리) | Apps Script `_parseAuthToken`이 회원인증 시트 실재 계정 요구 |
| 등급 | 경기 생성 시 `state.gradeSnapshot`에 명부 등급 스냅샷 | 업로드 시점의 명부 조회 의존을 제거 (§5-2) |
| 정시성 | 10:00~10:40 허용 | GH Actions cron은 정시 보장 없음. Apps Script 트리거(±15분)는 행 빌더 ES5 복제 비용이 커서 기각 |

## 4. 아키텍처

```
GitHub Actions (cron 0 1 * * *)
        │
        └─ npx vite-node scripts/tennisAutoUpload.mjs
                 │
                 ├─(1) GET  {DB}/settings.json                       → autoUpload=true 팀 수집
                 ├─(2) GET  {DB}/games/{team}/active.json            → reconstructState + normalizeTennisMatch
                 ├─(3) selectAutoTargets()  ← 순수 함수, vitest 대상
                 │     ※ 등급은 state.gradeSnapshot에서 꺼낸다 — 명부 조회 없음(§5-2)
                 ├─(4) POST {APPS_SCRIPT_URL} writeTennisMatches / writeTennisPlayerGames
                 ├─(5) PATCH {DB}/games/{team}/active/{id}/meta.json → gameFinalized/phase/autoUploadedAt
                 ├─(6) PATCH {DB}/games/{team}/finalized.json        → _meta/{id} + _states/{id}
                 └─(7) DELETE {DB}/games/{team}/active/{id}.json
```

RTDB는 인증 없이 REST 읽기/쓰기가 가능하다(현행 보안 규칙). 러너는 Firebase JS SDK를 쓰지 않고 REST + `fetch`만 쓴다 — `src/config/firebase.js`가 `import.meta.env` 기반이라 headless 초기화가 불안정하기 때문.

## 5. 컴포넌트

### 5-1. 설정 스위치

- `src/config/settings.js` → `SPORT_DEFAULTS.테니스`에 `autoUpload: false` 추가
  - `SHARED_KEYS`에는 **넣지 않는다** (종목 스코프 유지)
  - `TENNIS_KEYS`(레거시 flat 마이그레이션 전용)에도 넣지 않는다 — 테니스는 레거시 설정이 없음
  - `saveSettings`는 기본값과 같은 값을 저장하지 않으므로, 끈 팀은 RTDB에 키 자체가 안 생긴다
- `src/components/common/SettingsScreen.jsx` → `isTennis` 분기(`:348`) 안에만 체크박스 추가
  - 라벨: "경기 마감 후 자동 업로드·아카이브 (매일 오전 10시)"
  - 힌트: "마감한 경기만 대상 — 진행 중/미마감 경기는 건드리지 않습니다"
  - 마크업은 같은 파일의 크로바/고구마 체크박스 패턴을 따르되 **풋살 블록은 수정하지 않는다**

### 5-2. 등급 스냅샷 (`state.gradeSnapshot`)

명부가 업로드에 쓰이는 곳은 `grade_at_date` 한 칸뿐이다(`tennisRowBuilders.js:126`). 이 값은 시트에 박힌 뒤 `tennisStandings.js:75-80`이 등급 업셋 포인트 계산에 그대로 쓰므로, 비어 들어가면 그날 포인트가 조용히 줄고 복구하려면 시트를 손으로 고쳐야 한다.

명부는 **참석자 선택 시점에 이미 앱이 들고 있다**(`TennisAttendeeSelector.jsx:61`, `TennisAttendeeModal.jsx:37`이 `m.grade`를 렌더). 그 값을 그때 state에 스냅샷해두면 업로드 시점의 명부 조회가 통째로 사라진다.

- 형태: `state.gradeSnapshot = { 회원이름: 등급 }` — **참석자가 아니라 명부 전체**를 담는다
  - 경기 도중 참석자를 추가해도(`TennisAttendeeModal`) 이미 등급이 들어 있다 → `ADD_ATTENDEE` 디스패치 지점을 건드릴 필요가 없다
  - `membersFromState`의 교정용 `roster` 인자도 `Object.keys(gradeSnapshot)`으로 동일하게 재현된다 → 러너는 명부를 **한 번도** 조회하지 않는다
  - 크기: 몽피스 규모에서 수십 엔트리(≈1KB). `saveState` 통짜 저장에 부담 없음
- 시점: `TennisApp`에서 명부 로드 완료 && `gradeSnapshot`이 비어 있을 때 1회 `SET_GRADE_SNAPSHOT` 디스패치
  - 신규 경기는 생성 직후 채워지고, 이 변경 이전에 만들어진 진행 중 경기도 앱을 한 번 열면 백필된다
  - `phase === 'done'`(이미 마감·전송 완료)이면 디스패치하지 않는다 — 지나간 기록을 오늘 등급으로 덮지 않기 위함
- 동기화 등록(누락 시 조용히 사라지는 필드가 된다):
  - `TENNIS_WHOLE_REPLACE_FIELDS`에 `'gradeSnapshot'` 추가
  - `reconstructState`에 `gradeSnapshot: raw.gradeSnapshot` (기존 `rounds`/`guests`/`scoringRules`와 동일한 테니스 전용 필드 패턴 — 풋살/축구 state엔 `undefined`로 남아 무영향)
  - `normalizeTennisMatch`가 `{}`로 기본값 복원
  - `tennisSyncCoverage.test.js`가 미등록 필드를 잡으므로 회귀 방지는 자동
- 소비 지점 (앱·러너 공통 규칙): `gradeByPlayer = state.gradeSnapshot` 우선, 비어 있으면 명부 조회 폴백
  - 앱 `handleSubmitRecords`도 같은 규칙으로 바꾼다 — 스냅샷이 있으면 "명부를 불러오지 못했습니다" confirm이 뜨지 않는다

### 5-3. 대상 선별 (순수 함수)

`src/utils/tennis/autoUploadTargets.js`

```js
export function classifyAutoTarget(state)
// → 'upload_archive' | 'archive_only' | 'skip'
//   sport !== '테니스'                      → skip
//   phase ∉ {summary, done}                 → skip
//   gameFinalized === true                  → archive_only
//   그 외                                    → upload_archive

export function selectAutoTargets(games)   // [{gameId, state}] → [{gameId, state, action}]
```

시트/RTDB에 닿지 않는 순수 함수로 분리해 vitest로 검증한다.

### 5-4. 러너

`scripts/tennisAutoUpload.mjs` — `npx vite-node`로 실행. 앱에서 그대로 import:

| import | 출처 | 용도 |
|---|---|---|
| `reconstructState` | `src/services/firebaseSyncDiff.js` | RTDB raw → state (앱과 동일 복원) |
| `normalizeTennisMatch` | `src/utils/tennis/normalizeTennisMatch.js` | 빈배열/객체화 복원 |
| `buildTennisMatchRows`, `buildTennisPlayerGameRows`, `membersFromState` | `src/utils/tennis/tennisRowBuilders.js` | 시트 행 생성 (단일 소스) |
| `nowKST` | `src/utils/tennis/tennisTime.js` | `input_time` |
| `stripNameDecorations` | `src/services/tennisSync.js` | ★ 표식 제거 (named export, import 안전 확인됨) |
| `classifyAutoTarget` | `src/utils/tennis/autoUploadTargets.js` | 대상 선별 |

러너 자체 구현이 필요한 것 (앱 코드가 브라우저 전용이라 복사 + 주석으로 출처 명시):

- `safeTeam(team)` — `firebaseSync._safeTeam`과 동일한 `[.#$/[\]] → _` 치환
- `buildSummary(gameId, state)` — `firebaseSync._buildSummary`의 테니스 분기와 동일 문자열
  (`{gameId} | {creator} | {phase} | {n}라운드 | 완료 {m}경기`)
- Apps Script POST — `tennisSync._post`와 동일 계약: `authToken`+`team` 첨부, `success:false`도 throw

환경변수: `FIREBASE_DATABASE_URL`, `APPS_SCRIPT_URL`, `TENNIS_BOT_TOKEN`, `DRY_RUN`.

### 5-5. 워크플로

`.github/workflows/tennis-auto-upload.yml`

- `schedule: cron "0 1 * * *"` + `workflow_dispatch`(입력 `dry_run`, 기본 `true`)
  - cron 실행은 `DRY_RUN=false` 고정, 수동 실행은 입력값을 따른다
- Node 20 + `npm ci` + `npx vite-node scripts/tennisAutoUpload.mjs`
- 시크릿: 신규 `TENNIS_BOT_TOKEN`, 기존 `VITE_FIREBASE_DATABASE_URL`·`VITE_APPS_SCRIPT_URL` 재사용

## 6. 데이터 흐름 (경기 1건, `upload_archive`)

1. `gradeByPlayer = state.gradeSnapshot` (§5-2). 비어 있는 레거시 경기만 `getTennisRoster` 폴백 —
   이때는 앱의 `_safeRead`(실패를 `[]`로 삼킴)를 쓰지 않고 **throw 방식**으로 조회해 "조회 실패"와 "진짜 빈 명부"를 구분한다.
   1회 재시도 후에도 실패하면 그 경기 스킵(다음날 자동 재시도), 조회는 됐는데 0명이면 스킵 + `MANUAL_CHECK` 로그.
2. `memberSet = membersFromState(state, Object.keys(gradeByPlayer).map(name => ({ name })))`
   (스냅샷이 명부 전체를 담으므로 앱의 `roster` 인자와 동일한 교정 효과)
3. `inputTime = nowKST()`, `inputBy = '자동업로드'`
4. `writeTennisMatches(matchRows)` → 성공 확인 → `writeTennisPlayerGames(pgRows)` → 성공 확인
   (앱의 `Promise.allSettled` 병렬과 달리 **순차**. 앞이 실패하면 뒤를 보내지 않아 반쪽 업로드 경우의 수를 줄인다)
5. `PATCH .../active/{id}/meta.json` → `{gameFinalized:true, phase:'done', autoUploadedAt:{".sv":"timestamp"}}`
6. `PATCH .../finalized.json` → `{"_meta/{id}": {summary, gameDate, updatedAt:{".sv":"timestamp"}}, "_states/{id}": {state: JSON.stringify(state)}}`
7. `DELETE .../active/{id}.json`

`archive_only`은 6~7만 수행한다.

## 7. 실패 처리

| 실패 지점 | 동작 |
|---|---|
| 설정/게임 조회 실패 | 전체 중단, exit 1 (아무것도 안 건드림) |
| 등급 출처 없음 (스냅샷 없는 레거시 경기 + 명부 조회 실패) | 그 경기 스킵 → 다음날 재시도. 신규 경기는 스냅샷이 있어 해당 없음 |
| 시트 전송 실패 | 그 경기 스킵 — `meta` 갱신도 아카이브도 안 함 → 다음날 재시도 |
| 5단계(meta 갱신) 실패 | 그 경기 아카이브 중단. **시트는 이미 들어갔으므로 다음날 재실행 시 중복 업로드 위험** → 이 경우만 로그에 `MANUAL_CHECK` 태그로 남기고 러너 exit code 1 |
| 6단계(finalized 쓰기) 실패 | `active` 삭제하지 않음 (데이터 보존). `gameFinalized=true`가 이미 찍혀 다음날 `archive_only`로 자연 재시도 |
| 7단계(active 삭제) 실패 | finalized에는 있으므로 데이터 안전. 다음날 `archive_only`로 재시도(멱등) |

**불변식**: 시트 성공 → meta 갱신 성공 → finalized 쓰기 성공, 이 셋이 모두 확인된 뒤에만 `active`를 지운다.

## 8. 격리 보장 (다른 팀·다른 종목 무영향)

1. 러너는 `autoUpload===true`인 팀의 노드만 URL로 구성한다. 다른 팀 노드는 **읽지도 않는다**
2. `classifyAutoTarget`이 `sport==='테니스'`가 아닌 state를 무조건 skip → 풋살/축구 경기가 섞여 들어와도 배제(이중 방어)
3. 앱 코드 변경 범위 — 전부 테니스 전용 경로:
   - `settings.js`(테니스 기본값 1줄), `SettingsScreen.jsx`(`isTennis` 분기 1블록)
   - `useTennisReducer.js`(`SET_GRADE_SNAPSHOT` 케이스), `TennisApp.jsx`(스냅샷 디스패치 + `gradeByPlayer` 우선순위)
   - `firebaseSyncDiff.js`는 **테니스 전용 배열 `TENNIS_WHOLE_REPLACE_FIELDS`에만** 추가하고,
     `reconstructState`에 `rounds`/`guests`/`scoringRules`와 같은 형태로 한 줄 추가(풋살/축구 state엔 `undefined`)
   - 풋살/축구 분기·`appSync.js`·`analyticsV2`는 미변경
4. Apps Script는 **수정하지 않는다** (기존 액션만 호출)

## 9. 테스트

**vitest (신규)** — `src/utils/tennis/__tests__/autoUploadTargets.test.js`

- `phase:'setup'` → skip (방치된 8건 회귀 방지)
- `phase:'playing'` + 전 라운드 확정 → skip
- `phase:'summary'` + `gameFinalized:false` → `upload_archive`
- `phase:'done'` + `gameFinalized:true` → `archive_only`
- `sport:'풋살'` + `phase:'summary'` → skip
- `sport` 없음(레거시 풋살 state) → skip

**vitest (기존 파일에 케이스 추가)**

- `tennisSyncCoverage.test.js` — `gradeSnapshot` 왕복(저장→복원) 통과. 미등록 시 실패하도록 샘플 state에 필드 추가
- `useTennisReducer.test.js` — `SET_GRADE_SNAPSHOT`가 맵을 넣고, 기존 스냅샷을 덮지 않음
- `tennisRowBuilders.test.js` — `gradeSnapshot` 기반 `gradeByPlayer`로 `grade_at_date`가 채워지고, 용병은 `''`

**기존 테스트** — `tennisRowBuilders.test.js` 등 재사용(행 스키마는 이미 커버됨)

**실데이터 검증** — `workflow_dispatch` + `DRY_RUN=1`로 몽피스 실데이터에 1회 실행, "무엇을 처리할 뻔했는지"만 출력해 눈으로 확인. 현 시점 기대 출력은 **처리 대상 0건**(전부 setup).

## 10. 배포·운영 절차

1. 코드 머지 (기능은 아직 아무 팀도 안 켬 → 무동작)
2. `gh secret set TENNIS_BOT_TOKEN`
3. `workflow_dispatch` + DRY_RUN으로 1회 실행 → 대상 0건 확인
4. 몽피스 설정에서 체크박스 ON
5. 다음 실제 마감 경기가 생긴 뒤 DRY_RUN으로 1회 더 확인 → 이상 없으면 cron 자동 실행에 맡김

## 11. 리스크

- **정시성**: GH Actions cron은 지연이 흔하다(10:00~10:40). 사용자 승인된 허용 오차.
- **되돌리기 어려움**: 아카이브는 `active` 삭제를 동반한다. §7 순서 고정 + finalized 선기록으로 유실을 막지만, 성격상 되돌리기 비용이 크다.
- **cron 자동 비활성화**: 공개 저장소는 60일 무커밋 시 스케줄이 꺼진다. 이 저장소는 활동이 잦아 실질 위험은 낮으나, 장기 미활동 시 재활성화가 필요하다.
- **중복 업로드**: §7의 5단계 실패 시나리오에서만 발생 가능. 자동 멱등화는 프로젝트 결정에 따라 하지 않으며, `MANUAL_CHECK` 로그로 사람이 판단한다.

## 12. 미결정

없음. (실행 시각 허용 오차·DRY_RUN 관찰 절차 모두 사용자 승인 완료)
