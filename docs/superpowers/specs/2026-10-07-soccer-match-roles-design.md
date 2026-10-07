# 축구 경기별 역할 지정 (영상촬영 · 주심 · 부심) — 설계

- 날짜: 2026-10-07
- 대상: 하버FC 축구 경로 (`SoccerApp` → `SoccerMatchView`)
- 제외: 빅마스터FC 자체전(`IntraSoccerApp` / `IntraSoccerMatchView`), 풋살, 테니스

## 1. 배경 · 목표

하버FC는 경기일에 상대팀을 바꿔가며 여러 경기(= 「제N경기」, `soccerMatches` 배열의 각 원소)를
치른다. 그 경기들에서 영상촬영과 심판을 누가 맡았는지가 지금 아무 데도 기록되지 않는다.

목표: 경기 단위로 **영상촬영(복수) · 주심(1명) · 부심(2명)** 을 지정하고, 실시간으로 공유하고,
구글시트에 적재해 **사람별 역할 횟수**를 분석 탭에서 볼 수 있게 한다. 모든 역할은 공석 가능.

### 확정된 요구사항 (사용자 결정)

| 항목 | 결정 |
|---|---|
| 기록 범위 | 시트 적재 + 분석 집계까지 |
| 역할 인원 | 영상촬영 제한 없음 / 주심 0~1 / 부심 0~2 |
| 후보 풀 | 참석자 전원. 미출전자를 앞에 두고 출전자는 「출전」 라벨 — 선택은 막지 않음 |
| 진입점 | 경기 노드 상단 버튼(상시), 진행중·종료 경기 모두 수정 가능 |
| 분석 노출 | 분석 탭에 「역할 기록」 표 하나 |
| 용어 | "촬영감독" 아님 → **영상촬영** |
| 적재 형태 | 로그_매치에 `roles_json` 열 1개 (A안) |

### 적재 형태를 열 1개로 정한 이유

- 열 4개(`camera_json`/`referee`/`assistant1`/`assistant2`)는 부심이 3명 되는 날 스키마가 또 바뀌고,
  촬영은 복수라 JSON이 섞여 혼종이 된다.
- 별도 시트(`로그_역할`)는 Apps Script 쓰기/읽기/날짜삭제 3경로 + SheetCache 데이터셋 등록 +
  마감 플로우 5시트 → 6시트 확장을 요구한다. 역할 횟수 집계는 `roles_json` 파싱으로 충분하므로
  이 비용이 정당화되지 않는다.
- 열 1개는 `our_members_json` · `our_defenders_json` 과 동일한 기존 전례이고, 나중에 「기록원」
  같은 역할이 추가돼도 **시트 스키마와 Apps Script가 안 바뀐다**.

## 2. 데이터 모델

경기 객체(`soccerMatches[i]`)에 필드 하나를 추가한다.

```js
roles: {
  camera: [],       // 영상촬영 — 인원 제한 없음
  referee: "",      // 주심 — 0 또는 1명
  assistants: [],   // 부심 — 최대 2명
}
```

- 공석 = `""` / `[]`. `roles` 자체가 없는 경기(기존 경기 · 휴식)는 전부 공석으로 읽는다.
- 값은 **선수 이름 문자열**. `lineup` · `defenders` 와 같은 규약이라 이름 정정 로직과 어긋나지 않는다.
- 겸임 규칙: **주심 ↔ 부심만 상호 배타**. 영상촬영은 주심·부심과 겸임 허용(한 명이 찍으면서
  주심 보는 경우가 실제로 있다).
- 후보 = **참석자 전원**. `getNonPlayers(match, attendees)` 로 미출전자를 가려 앞 그룹에 두고,
  출전자는 「출전」 라벨을 달아 뒤 그룹에 둔다. 선택을 막지 않는다 — `getNonPlayers` 는 경기
  **전체 기준** 미출전자라서, 전반에 심판 보다가 후반 교체 투입된 사람이 후보에서 사라지기 때문.

## 3. 읽기 단일 소스 — `readRoles`

RTDB는 빈 배열을 저장하지 않는다. `{camera:[],referee:"박C",assistants:[]}` 를 쓰면 받는 쪽에는
`{referee:"박C"}` 만 도착한다. 이 모양 차이가 네 경로에서 사고를 만든다.

| # | 문제 | 발생 지점 |
|---|---|---|
| 1 | 받는 기기 렌더 크래시 (`roles.camera.map` of undefined) | 실시간 동기화 |
| 2 | **아카이브 상세가 정규화를 안 탄다** | `firebaseSync.js:221` `loadFinalizedOne` 이 `snap.val().state` 를 그대로 반환 — `reconstructState` 미경유 |
| 3 | 마감 시 시트 빌더가 같은 undefined 에 노출 | `matchRowBuilder` |
| 4 | 「미지정」과 「공석」을 구분할 수 없음 | 저장 형태가 동일 — 공석 허용이므로 실해 없음. 다만 "역할 미지정 경기 알림" 류는 못 붙인다 |

따라서 **읽기 전용 순수 헬퍼 하나를 단일 소스로 두고, 모든 읽는 쪽이 이것만 경유한다.**

```js
// 어떤 모양으로 와도(undefined / 키 누락 / RTDB 객체화 {0:'김A'}) 항상 같은 모양
readRoles(match) → { camera: string[], referee: string, assistants: string[] }
```

**파일**: `src/utils/soccerRoles.js` (신규). 역할 관련 순수 함수를 한 모듈에 모은다.

| 함수 | 책임 |
|---|---|
| `readRoles(match)` | 경기 객체 → 정규형 `{camera, referee, assistants}` |
| `serializeRoles(roles)` | 정규형 → 시트 `roles_json` 문자열 (전원 공석이면 `''`) |
| `parseRoles(rolesJson)` | 시트 `roles_json` → 정규형 (빈값·깨진 JSON 은 전원 공석) |

경유 대상: 경기화면 UI, 아카이브 상세, 시트 빌더, 분석 집계.
`normalizeSoccerMatch` 의 `roles` 정규화는 실시간 경로를 위해 **그대로 추가하되**, 그것이 유일한
방어선이 아니게 된다. 호출부마다 `|| []` 를 흩뿌리는 땜질과 다르다 — 접근자 1개 + 테스트 1개로
네 경로가 동시에 막힌다.

### 문제가 아닌 것 (코드로 확인)

- **쓰기 루프 · 에코 핑퐁 없음.** `useFirebaseSync.js:66` 에서 받은 원격 state 가 로컬 state 와
  diff 기준선 **양쪽 모두**가 되므로, 모양이 달라도 prev · next 가 같아 재전송이 안 일어난다.
- **역할 삭제 전파 정상.** `update()` 가 `soccerMatches/{idx}/roles` 서브트리를 통째 교체하므로
  뺀 사람은 받는 기기에서도 사라진다.

## 4. 리듀서 · 실시간 동기화

**리듀서**: 새 액션 `SET_SOCCER_MATCH_ROLES`.
`SET_SOCCER_MATCH_OPPONENT` 와 동일하게 **논리 `matchIdx` 매칭**(배열 index 불변식에 의존하지
않음)으로 그 경기의 `roles` 만 교체하고, `events` / `status` / 점수는 스프레드로 보존한다.

**동기화 등록 작업 없음.** `soccerMatches` 가 이미 `CHILD_NODE_FIELDS`(`firebaseSyncDiff.js:34`)에
등록된 자식노드 단위 동기화 대상이므로, 내부 새 필드는 `soccerMatches/{idx}/roles` 경로 한 칸으로
자동 전파된다. 골 · 교체 · 포메이션과 같은 배선이다.

`roles` 는 최상위 state 필드가 아니라 경기 객체 내부 필드라서 `syncCoverage` 테스트의 강제 분류
대상이 아니다. 대신 전파를 직접 검증하는 테스트를 `firebaseSyncDiff` 쪽에 둔다(§8-3).

**배선**: `SoccerApp.jsx` 에 `setSoccerMatchRoles(matchIdx, roles)` 핸들러를 추가하고
(`setSoccerMatchOpponent` 와 같은 자리·같은 모양), `SoccerMatchView` 에 `onSetMatchRoles` 로 넘긴다.

동시 편집은 `roles` 통째 last-write-wins. 역할은 한 명이 한 번 정하는 성격이라 이대로 둔다.

## 5. UI

**진입점** — `SoccerMatchView.jsx:243` 상단 버튼 줄(`canChangeOpponent` 블록)에 `🎬 역할 지정` 추가.
조건이 기존 버튼과 같아 **새 경기 노드와 휴식 경기에는 보이지 않는다**.

모달 본문은 신규 컴포넌트 `src/components/game/MatchRolesModal.jsx` 로 분리한다
(`SoccerMatchView` 는 이미 359행이라 모달 UI 를 인라인으로 넣지 않는다).

`Modal`(오버레이)로 띄운다 — 「출전 수정」처럼 전체화면 조기반환이 아니라서 진행 중 경기의
`FormationRecorder` 가 언마운트되지 않는다. 따라서 골 입력 중 `navLocked` 차단이 불필요하고,
「상대팀 변경」과 같은 규칙이 된다.

**모달 구성** — 영상촬영 / 주심 / 부심 세 섹션. 각 섹션에 참석자 칩, 미출전자 먼저, 출전자는
「출전」 라벨 + 흐리게. 탭 토글:

| 섹션 | 동작 |
|---|---|
| 영상촬영 | 인원 제한 없이 토글 |
| 주심 | 1명. 다른 사람 탭 = 교체, 본인 재탭 = 공석 |
| 부심 | 최대 2명. 2명 찬 뒤 세 번째 탭은 「부심은 2명까지」 안내로 차단 |

주심인 사람을 부심으로 탭하면 주심에서 빠지고 부심으로 **이동**한다(상호 배타인 쪽만).

**종료된 경기 요약**에 읽기전용 한 줄:
`🎬 영상촬영: 김A, 이B · 🧑‍⚖️ 주심: 박C · 부심: 최D`. 공석은 `—`.

**마감 후 경고** — `gameFinalized` 면 confirm 을 띄우되 문구는 사실대로 쓴다. 로그_매치는
`game_id|match_id` 로 중복 차단(`_writeRawMatches`)하므로 **「수정 후 재전송」으로는 시트가
갱신되지 않는다.** 교정 경로는 설정 화면의 날짜별 삭제 후 재전송뿐임을 안내한다.
(기존 「상대팀 변경」 문구도 같은 이유로 부정확하지만 이번 범위 밖으로 둔다.)

## 6. 시트 · Apps Script

**앱 쪽**

- `RAW_MATCH_COLUMNS` **끝에** `'roles_json'` 추가. 끝에 붙이는 것이 필수 — 기존 열 위치가 밀리면
  Apps Script 하드코딩 순서(`_rawMatchToArray` / `_getRawMatches`)와 어긋난다.
- `buildRoundRowsFromSoccer` 에 `roles_json: serializeRoles(readRoles(m))`.
- `serializeRoles` 는 **전원 공석이면 빈 문자열**을 반환한다. 시트가
  `{"camera":[],"referee":"","assistants":[]}` 로 도배되지 않고 레거시 행(빈칸)과 같은 모양이 된다.
- 풋살 빌더(`buildRoundRowsFromFutsal`)는 **무변경**. Apps Script 가 `r.roles_json||""` 로 받으므로
  풋살 행은 자연히 빈칸이 된다.

**Apps Script 쪽** (`apps-script/Code.js`)

- `RAW_MATCHES_HEADERS` 끝에 `"roles_json"`, `_rawMatchToArray` 끝에 `r.roles_json||""`.
- 최상단 changelog 에 날짜 + 수정사항 기록(팀 규칙).
- `_loadRawMatchKeys` 는 6~10열만 읽으므로 무영향.

**SheetCache 작업 없음** — `RAW_MATCH_COLUMNS` 가 바뀌면 `readCacheNode` 의 `MISS_SCHEMA` 가
L2 캐시를 자동 무효화한다.

**사용자 수동 작업 1건** — `_ensureRawSheets` 는 시트가 **없을 때만** 헤더를 쓴다. 기존 로그_매치
시트 헤더 행 23번째 칸(W1)에 `roles_json` 을 직접 입력해야 한다. 안 하면 값은 들어가지만 열 이름이
비어 사람이 읽을 수 없다.

## 7. 분석 「역할 기록」 표

- `PlayerAnalytics` 에 **축구 전용 서브탭** 추가: `isSoccer && { key: 'roles', label: '역할' }`.
  탭 순서는 `personal` · `chem` · `awards` **뒤**. 표 컴포넌트는
  `src/components/dashboard/analytics/RoleRecordTab.jsx` (신규).
- 계산은 `src/utils/soccerAnalytics/calcRoleCounts.js` 신규 + barrel(`index.js`) export.
  **`analyticsV2`(풋살)는 건드리지 않는다.**
- 입력 = `matchLogs` 의 `roles_json`. 출력 = `[{ name, camera, referee, assistant, total }]`.
- 표는 테니스 `useSortableRows` / `SortHeader` 재사용(컵 탭에서 이미 재사용한 경로).
  기본 정렬 = 합계 내림차순.
- 모집단 = **역할 1회 이상 기록된 사람만**. 0회 전원을 나열하면 로스터 전체 표가 된다.
- 기록이 없으면 빈 상태 문구: "역할 기록이 아직 없습니다 — 2026-10-07 이후 경기부터 집계됩니다."
  (레거시 행은 `roles_json` 이 전부 빈칸이다.)

## 8. 테스트

1. **`readRoles` 순수 테스트** — `undefined` / 키 누락 / RTDB 객체화(`{0:'김A'}`) / 정상, 네 입력
   모두 같은 모양 반환.
2. **리듀서** — `SET_SOCCER_MATCH_ROLES` 가 논리 `matchIdx` 로만 매칭, 타 경기 · `events` ·
   `status` · 점수 무변경.
3. **동기화** — roles 변경이 `soccerMatches/{idx}/roles` 경로 하나로 쓰이고, RTDB 누락 모양
   (`{referee:''}`)을 `reconstructState` 가 배열로 복원(= 실시간 공유 보장).
4. **시트 빌더** — 전원 공석 → `''`, 레거시 경기(roles 없음) → `''`, 정상값 → JSON.
5. **`calcRoleCounts`** — 집계 정확성, 빈 `roles_json` 무시, 깨진 JSON 에도 크래시 금지.
6. **렌더 스모크(RTL)** — 역할 모달과 역할 탭. 빌드 · vitest 가 렌더 크래시를 못 잡는 공백이 있어
   필수(기존 `analyticsTabs.smoke.test.jsx` · `IntraSoccerMatchView.smoke.test.jsx` 패턴).

## 9. 배포

1. 빌드 + push → GitHub Actions 자동 배포
2. Apps Script 는 사용자가 「배포 관리 → 편집 → 새 버전」으로 반영 (URL 고정)
3. 로그_매치 시트 W1 셀에 `roles_json` 입력

## 10. 범위 밖 (의도적으로 안 하는 것)

- 빅마스터FC 자체전 화면 — 요구 범위 아님
- 풋살 · 테니스 — 무변경
- 로그_매치 재전송 멱등화 — 기존 결함이고 사용자 결정으로 보류된 사안
- 「상대팀 변경」 기존 경고 문구 교정
