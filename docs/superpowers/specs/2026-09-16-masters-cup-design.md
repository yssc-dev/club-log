# 마스터스컵(풋살 컵대회) 설계

- 작성일: 2026-09-16
- 상태: 1단계(격리 게이트) 구현 완료 — 2026-09-16. 2단계 계획 대기
- 대상 팀: 마스터FC(풋살). 하버FC·빅마스터FC(축구)·몽피스(테니스)에는 어떤 동작 변화도 없어야 한다.

## 1. 개요

마스터FC 회원을 5개 팀으로 나눠 풀리그 1회전(10경기)을 여러 날에 걸쳐 치르는 "마스터스컵"을 앱에서 기록·집계한다. 컵 경기일은 기존 풋살 세션(2구장·라운드·CourtRecorder·마감)을 그대로 쓰되, 세션에 `tournamentId`를 박아 (1) 팀 명단을 시트에서 자동으로 불러오고, (2) 마감 시 정규 포인트 계열 시트에는 쓰지 않으며, (3) 정규 분석·대시보드가 컵 행을 읽지 않게 하고, (4) 컵 전용 탭에서 누적 순위표·득점왕·남은 대진을 보여준다.

### 1.1 사용자 확정 사항

| 항목 | 결정 |
|---|---|
| 팀 구성 | 5개 팀, 전원 마스터FC 회원. 팀장·팀원은 운영진이 시트에 기입 |
| 대회 형식 | 풀리그 1회전(10경기). 여러 날에 나눠 진행. 컵 경기일에는 컵 경기만 한다 |
| 정규 기록과의 관계 | **완전 분리.** 컵 골·어시·클린시트는 마스터FC 포인트 로그·마스터FC 선수별집계기록 로그·★ 랭킹·대시보드·분석탭에 반영하지 않는다 |
| 명단 관리 | 마스터FC 스프레드시트 **같은 파일의 별도 탭**(열=팀, 1행=팀명, 2행=팀장, 3행부터 팀원) |
| 진입점 | **경기관리 탭 "새 경기"에서 일반(자동설정/커스텀) 또는 🏆 컵대회를 선택**한다. 컵대회를 고르면 팀명단 탭으로 팀이 결정되고 이후는 공통 기록 로직·실시간 공유 |
| 대회 기간 | 필드 없음. 대회명 하나로 식별 |
| 아카이브 | 컵 경기일도 경기 기록 보관소에 포함하고 🏆 라벨로 구분 |
| Apps Script | 1차 범위에서는 변경 없음. 서버 측 tournamentId 필터는 선택적 후속 강화 |

### 1.2 기본 가정(설계에 포함)

- 팀장은 표시 전용. 권한 없음. 표시는 `Ⓒ` 배지(기존 팀 카드의 👑는 "포인트 최고 선수" 의미라 겹치지 않게 한다).
- 팀 순위 = 승점 3/1/0 → 득실차 → 다득점 → 팀명. 개인 = 득점·어시스트 순위.
- 컵 세션의 규칙 스냅샷은 표준 풋살 규칙(자책 −1, 크로바/고구마 꺼짐, 보너스 1배). 포인트를 어디에도 쓰지 않으므로 화면 표시에만 영향.
- 결석·용병·경기 중 명단 수정은 기존 풋살 세션 메커니즘(absentees·liveMercs·teamEditMode) 그대로.
- 5팀 고정. 팀 수가 다르면 컵 세션 생성을 거부한다(일반화는 비목표).
- 임시 라운드(`is_extra`)의 경기는 팀 순위·개인 순위·치른 대진 **모두**에서 제외한다.

### 1.3 비목표

녹아웃·결승전, 여러 대회 동시 운영·대회 목록 화면, 팀장 권한, 실시간(마감 전) 누적 순위, 시트 탭 자동 생성, 기존 축구 대회 모드(`components/tournament`)와의 통합, 컵 전용 포인트/MVP, 정규 "새 경기" 버튼의 앱 차원 차단, Apps Script 변경, Firebase 규칙 변경, analyticsV2 내부 수정.

## 2. 왜 기존 축구 "대회 모드"를 쓰지 않는가

`docs/superpowers/specs/2026-04-08-tournament-mode-design.md`의 대회 모드는 "우리 팀 1개 vs 외부 팀들" 구조다. 탭은 `activeSport === '축구'`에서만 뜨고(`mainTabs.js`), 대진 생성은 우리 팀 경기만 만들며, 기록기는 FormationRecorder(축구), 타팀 경기는 스코어 수동 입력이다. 팀별 사전 명단 저장 구조도 없다. 5팀 전원이 회원인 내부 풀리그와는 모양이 달라 껍데기 재사용조차 이득이 없다. 대신 풋살 세션 플로우를 재사용한다.

## 3. 용어와 식별자

- **cupName**: 대회명이자 `tournament_id` 값. 예: `마스터스컵 2026`. 팀 설정(풋살 스코프)에 저장. `|` 문자 금지(아카이브 summary 구분자). 대회 진행 중 변경 금지(과거 기록과의 연결이 끊긴다).
- **컵 세션**: `state.tournamentId !== ''`인 풋살 세션. 판별은 단일 헬퍼 `isCupSession(state)`만 쓴다.
- **로그 태그**: `logTagsOf(state)` = 컵이면 `{ mode:'대회', tournamentId: state.tournamentId }`, 아니면 `{ mode:'기본', tournamentId:'' }`. 로그_* 행을 만드는 **모든** 호출부(마감, 설정 화면의 로그_매치 재기록 도구)가 이 헬퍼를 쓴다.
- **정규 세션**: `tournamentId === ''`(또는 없음). 기존 세션 전부.
- **canonical 대진**: 5팀 2구장 5라운드 고정 순서(§6.3).
- **치른 대진(playedPairs)**: 로그_매치의 컵 행(`is_extra` 제외)에서 뽑은 팀 이름 쌍(순서 무관) 집합.

## 4. 데이터 모델

### 4.1 세션 state (useGameReducer initialState)

| 필드 | 타입 | 기본 | 동기화 분류 | 비고 |
|---|---|---|---|---|
| `tournamentId` | string | `''` | `META_FIELDS` | 컵 세션이면 cupName |

네 지점을 함께 바꾼다(하나라도 빠지면 재접속 시 컵 판별이 사라져 정규 마감으로 흘러간다):
1. `initialState.tournamentId = ''`
2. `META_FIELDS`에 `'tournamentId'`
3. `reconstructState`: `tournamentId: meta.tournamentId ?? ''`
4. `RESTORE_STATE`: `if (s.tournamentId != null) updates.tournamentId = s.tournamentId`

왕복 테스트로 고정한다: meta에 `tournamentId`가 있는 RTDB 스냅샷 → `reconstructState` → `RESTORE_STATE` → `isCupSession(state) === true`.

새 필드는 이 하나뿐이다. 나머지는 기존 필드의 값 조합으로 표현한다: `matchMode='schedule'`, `courtCount=2`, `teamCount=5`, `draftMode='sheet'`(재배치 버튼은 기존 조건 `draftMode==='snake'`에 의해 자동으로 숨겨진다), `settingsSnapshot`=컵 규칙(§4.3).

`gameMode`(Root의 prop, `'cup'`)는 **신규 세션 진입 시점에만** 쓰이고 저장되지 않는다. "이어서 기록"(`handleContinue`)은 `gameMode=null`로 들어오므로 컵 로드 분기를 타지 않으며, 재진입·재접속·기기 변경 후의 컵 판별(배너·마감 분기·라벨)은 오직 `isCupSession(state)`로 한다.

### 4.2 팀 설정 (settings.js, 풋살 스코프)

`FUTSAL_KEYS`에 두 키를 추가한다. 기본값은 빈 문자열(비활성)이며 `SPORT_DEFAULTS.풋살`에 빈 값으로만 둔다(팀 커스텀값을 DEFAULTS에 박지 않는다는 규칙 준수). 마스터FC 값은 RTDB `settings/마스터FC/풋살/overrides`에 저장된다.

| 키 | 의미 | 예 |
|---|---|---|
| `cupName` | 대회명 = tournament_id. 비어 있으면 컵 기능 전체 비노출. `|` 포함 불가 | `마스터스컵 2026` |
| `cupRosterSheet` | 팀명단 시트 탭 이름 | `마스터스컵 팀명단` |

설정 화면(SettingsScreen) 풋살 섹션에 "마스터스컵" 블록을 추가한다: 대회명 텍스트 입력(`|` 입력 시 저장 거부 + 안내), 팀명단 시트 SheetSelect, 상시 경고 문구 "대회 진행 중 대회명·팀 이름을 바꾸면 순위표와 치른 대진이 초기화된 것처럼 보입니다". 축구·테니스 섹션에는 나타나지 않는다.

### 4.3 컵 규칙 스냅샷

```
getCupSettings(team) = {
  ...SPORT_DEFAULTS.풋살,          // 표준 규칙
  ...(_cache[team].shared || {}),   // SHARED_KEYS 전체: sheetId, attendanceSheet, dashboardSheet, pointLogSheet, playerLogSheet
  cupName, cupRosterSheet,          // getEffectiveSettings(team,'풋살')에서 읽은 값(풋살 overrides에 있음)
  _meta: { preset: null, sport: '풋살', team, cup: true },
}
```

팀의 프리셋·오버라이드(마스터FC풋살의 자책 −2, 크로바/고구마 ON, 2배 보너스)는 **적용하지 않는다.** 새 프리셋을 만들지 않는다(프리셋 드롭다운에 컵 규칙이 노출되면 팀 규칙으로 오선택될 수 있다).

### 4.4 로그 시트 태그 (스키마 변경 없음)

로그_매치·로그_이벤트·로그_선수경기의 기존 열을 그대로 쓴다.

| 열 | 정규 세션 | 컵 세션 |
|---|---|---|
| `mode` | `기본` | `대회` (축구 대회 모드와 같은 어휘) |
| `tournament_id` | `''` | cupName |
| `sport` | `풋살` | `풋살` |
| 로그_선수경기 `rank_score` | 세션 순위 점수 | `0` |

마스터FC 포인트 로그·마스터FC 선수별집계기록 로그에는 컵 행을 **쓰지 않는다.**

dedupe 키 사실(Apps Script 기준): 로그_매치 = `game_id|match_id`, 로그_선수경기 = `team|sport|mode|tournament_id|date|player`, 로그_이벤트 골/자책/파울 행은 dedupe 없음. 따라서 같은 날 정규·컵 행이 공존해도 **키 충돌은 없다.** "컵 경기일에는 컵만"은 기술 제약이 아니라 운영 혼선 방지 결정이다.

### 4.5 팀명단 시트 형식 (`cupRosterSheet` 탭)

빅마스터FC 참석명단과 같은 파서(`parseIntraRosterCsv`)를 쓴다.

```
| 팀A    | 팀B    | 팀C    | 팀D    | 팀E    |   ← 1행: 팀 이름(값이 있는 열만 팀)
| 김철수 | 이영희 | ...    |        |        |   ← 2행: 팀장 (표시 전용 규약 = players[0])
| 박민수 | ...    |        |        |        |   ← 3행~: 팀원
```

- 이름은 `stripNameDecorations`로 ★ 계열 장식을 제거하고 trim한다.
- 팀명 중복·`휴식`은 파서가 에러. 같은 이름이 두 열에 있으면 먼저 나온 열 소속 + 경고(warnings).
- 팀명은 로드 시 RESTORE_STATE와 같은 규칙(`/^팀 /` → `팀`)으로 정규화한다. 헤더에 공백을 넣지 않기를 권장한다.
- 팀 이름은 대회 내내 고정한다(순위표·치른 대진이 이름으로 연결된다). 팀원 이동은 허용된다(매 경기일 다시 읽는다).
- 정확히 5개 팀이어야 한다. 아니면 컵 세션 생성 거부.
- gviz CSV 행 유실 함정은 40행 이하 소형 탭이라 해당 없음(빅마스터FC 참석명단과 같은 근거).

`fetchCupRoster()` 반환 타입:
```
{ teams: Array<{ name: string, captain: string, players: string[] }>,  // players는 captain 포함, players[0] === captain
  attendees: string[], warnings: string[] }
```
에러(throw): `cupRosterSheet` 미설정, HTTP 오류, 파서 에러, 팀 수 ≠ 5, 어느 팀이든 선수 0명.

### 4.6 시트 캐시 데이터셋 (sheetCache.js, 풋살만)

Apps Script 호출을 늘리지 않기 위해 L2 노드는 지금처럼 **풋살 전체 행**을 담고, 데이터셋별 "뷰 필터"를 `get()` 반환 시점에 적용한다.

| 데이터셋 | 원본 노드 | rowFilter | 비고 |
|---|---|---|---|
| `matchLog` / `eventLog` / `playerGameLog` (풋살) | 자기 자신 | `!row.tournament_id` | 정규 소비자 전부 자동 보호 |
| `cupMatchLog` / `cupEventLog` / `cupPlayerGameLog` (풋살 신규) | `alias`로 위 세 노드를 공유 | `!!settings.cupName && row.tournament_id === settings.cupName` | 별도 Apps Script 호출·별도 RTDB 노드 없음. cupName이 비면 항상 `[]` |
| 축구 어댑터 | 변경 없음 | 없음 | 하버FC 축구 대회 행(mode=대회)은 지금처럼 그대로 읽힌다 |

어댑터 계약(구현 지시):
- 새 어댑터 옵션 `rowFilter(row, settings) → boolean`, `alias: '<원본 데이터셋 키>'`.
- alias 어댑터는 `fetch`·`columns`를 갖지 않는다. `_adapter()`가 alias를 만나면 원본 어댑터를 대신 돌려주되 `rowFilter`는 alias 것을 쓴다(`resolveAdapter(sport, dataset) → { adapter: 원본, rowFilter, dataset: 원본키 }`).
- `_pathFor`는 항상 **원본 데이터셋 키**로 경로를 만든다(`cachePath(team, sport, adapter.alias || dataset)`). alias 전용 RTDB 노드는 생기지 않는다.
- `get()`은 세 반환 지점 모두에서 `applyRowFilter(rowFilter, value)`를 거친다: (1) L1 히트 `return hit.value` → 필터 적용, (2) 최종 `return value` → 필터 적용(in-flight 합류는 이 Promise를 공유하므로 자동으로 필터된 값을 받는다), (3) `DISABLED` 직행 경로. L1/L2에는 필터 전(전체) 값을 저장한다. `rowFilter`가 없으면 항등 함수.
- `refresh(alias)`는 원본 데이터셋 경로를 재적재하고 `{ ok, rows: applyRowFilter(alias.rowFilter, sourceRows) }`를 돌려준다.
- `datasetsOf(sport)`는 alias 데이터셋을 제외한다 → `refreshAll`·정규 마감의 `refreshAfterFinalize`·`status` 비용과 대상이 늘지 않는다.
- 컵 마감 후 재적재 목록 `CUP_FINALIZE_DATASETS = ['matchLog','eventLog','playerGameLog']`(원본 키). 컵 마감은 `refreshAfterFinalize`(전체)를 **호출하지 않고** `refreshDatasets(CUP_FINALIZE_DATASETS, { sport:'풋살' })`만 호출한다. 포인트로그·선수별집계·누적보너스·latestDeltas는 쓰지 않았으므로 재적재하지 않는다(재적재하면 빈 결과 강등으로 L2가 지워져 다음 정규 마감이 콜드스타트를 맞는다).
- 컵 행이 하나도 없을 때 cup 뷰는 `[]`를 돌려준다. 빈 값은 L1에 넣지 않는 기존 규칙에 따라 원본 노드 캐시로 매번 재계산되지만 Apps Script 추가 호출은 없다.

## 5. 기록 분리(격리) 설계

정규 지표가 컵 행을 읽을 수 있는 경로는 넷이다. 각각의 차단 지점:

| 경로 | 소비자 | 차단 |
|---|---|---|
| A. 로그_매치 → matchLogs 지표 | analyticsV2 전반, 월별 랭킹, 참석률 | `matchLog` rowFilter(§4.6) |
| B. 로그_이벤트 → eventLogs 지표 | 득점·어시·해트트릭·어시 연결망 | `eventLog` rowFilter |
| C. 로그_선수경기 → PG 지표 | GK·수호신·최근 폼·스트릭·일일 MVP | `playerGameLog` rowFilter |
| D. 포인트 로그·선수별집계 → 대시보드·latestDeltas·랭킹 히스토리 | records 탭, ▲▼ 배지, 캔들 차트 | 컵 마감이 두 시트를 **호출하지 않음** |

우회 경로(모두 1단계에서 막는다):
- `recoverFinalizedFromSheets`는 AppSync를 직접 호출한다 → 행 필터에 `!r.tournament_id`를 추가한다. 컵 세션은 아카이브에 정상 저장되므로 복구 대상이 아니다(컵 날짜를 입력하면 "데이터 없음"). 기존대로 sport 필터가 없다는 점은 단일 종목 팀 전제이며 이번 범위 밖(주석으로 남긴다).
- 설정 화면의 **"Firebase stateJSON → 로그_매치 정확 덮어쓰기"**(`runFirebasePhaseMigration`)는 모든 확정 세션을 `mode:'기본', tournamentId:''`로 재기록한다. 컵 세션이 아카이브에 있는 상태에서 실행되면 컵 날짜의 행이 지워지고 태그 없는 행으로 다시 써져 필터를 우회한다. → `buildFn({ ..., ...logTagsOf(gs) })`로 바꾼다(그 도구의 다른 동작은 그대로).
- 풋살 로그 3종의 다른 직접 소비자는 없다(조사 시점 grep 기준). 1단계에 "SheetCache.get 외 경로로 로그 3종을 읽지 않는다"는 정적 가드 테스트를 둔다(`AppSync.getMatchLog|getEventLog|getPlayerGameLog` 호출부 화이트리스트 = sheetCache.js, recoverFinalizedFromSheets.js).

왜 클라이언트 필터인가: 하버FC 축구 대회 모드가 이미 같은 열에 `mode='대회'` 행을 쓰고 있고 축구 분석은 그 행을 거르지 않는다. Apps Script 읽기 함수에 무조건 필터를 넣으면 하버FC 지표가 바뀐다. 클라이언트 필터는 컵 행을 **쓰는** 코드와 같은 빌드로 배포되어 순서 사고가 없고, Apps Script 수동 반영이 필요 없다. 오래된 빌드를 새로고침 없이 쓰는 기기에서는 컵 행이 보일 수 있으나 새로고침으로 해소된다. 서버 파라미터(`tournamentId` 스코프: 미지정=전체, `''`=정규만, 값=해당 대회만)는 4단계 선택 강화로 남긴다.

## 6. 플로우

### 6.1 진입점(경기관리 탭)과 "컵" 탭

**진입점 — 경기관리 탭 "새 경기" 영역(풋살 분기).** 기존 두 버튼(자동설정 경기 / 커스텀 경기) 아래에 세 번째 버튼을 추가한다:
- `🏆 컵대회 경기` — 부제 "컵 팀명단 · 2구장 · 남은 대진 자동". `onStartGame('cup')`.
- `cupName`이 비어 있으면 버튼 자체를 렌더하지 않는다(기존 두 버튼은 변경 없음).
- 진행 중 컵 세션은 기존 "진행중인 경기" 목록에 🏆 라벨(`pendingGameLabel`)로 나타나고 "이어서 기록"도 기존 카드 그대로다.
- 축구·테니스 분기는 손대지 않는다.

**"컵" 탭 — 기록 전용.** `buildMainTabs`는 풋살(테니스·축구 아님)이고 `cupName`이 비어 있지 않을 때만 `{ key:'cup', label:'🏆 컵' }`을 경기관리 뒤에 추가한다. 탭 내용(`CupTab`), 위에서부터:
  1. 대회명, 진행도(치른 경기 n/10).
  2. 명단 미리보기: 탭 진입 시 `fetchCupRoster()` 호출, 팀별 카드(팀장 `Ⓒ`). 실패하면 에러 문구만 표시(탭은 계속 동작).
  3. 팀 순위표(`CupStandingsTable`).
  4. 득점 TOP5·어시스트 TOP5.
  5. 남은 대진(라운드별).
  6. 경기 결과 목록(날짜별, `팀A a:b 팀B`).
  데이터는 `cupMatchLog`·`cupEventLog`·`cupPlayerGameLog`(`SheetCache.get`). 경기 시작 버튼은 이 탭에 두지 않는다(진입점은 경기관리 하나로 고정).

### 6.2 컵 경기일 시작 (경기 생성 시 명단 자동 로드)

1. 경기관리 탭 `🏆 컵대회 경기` → `onStartGame('cup')` → Root `handleStartNew('cup')`(기존 진행중 경기 confirm 포함) → `gameId = g_{ts}`, `gameMode='cup'`.
2. App `_loadAllData`에 `else if (gameMode === 'cup')` 분기(기존 `sheetSync` 분기는 그대로). 병렬 로드: 시즌 선수 데이터(기존과 동일, 포인트 표시용), `fetchCupRoster()`, `SheetCache.refresh('cupMatchLog', { sport:'풋살' })`.
   - `get` 대신 `refresh`를 쓰는 이유: `get`은 실패·미등록·0건을 모두 `[]`로 돌려줘 구별할 수 없고, `refresh`는 `{ ok, rows }`로 실패를 알려주며 세션 생성 시점에 최신 치른 대진을 보장한다(Apps Script 1회, 수 초).
3. 명단 로드 실패(§4.5의 throw 조건) → 에러 화면 + "대시보드로" 버튼. phase는 `setup`에 머물러 자동저장되지 않으므로 RTDB에 흔적이 남지 않는다. 컵 세션은 명단 없이 시작할 수 없다.
4. `refresh` 결과 `ok:false` → 경고 배너("치른 대진을 확인하지 못해 전체 대진을 표시합니다") 후 canonical 5라운드 전체로 진행. `ok:true`면 §6.3으로 남은 라운드 계산(0건이면 그대로 5라운드).
5. 성공 시 `SET_FIELDS` 한 번으로 `phase:'match'` 진입(시트 연동 경로와 같은 모양):
   `tournamentId=cupName, attendees=명단 전원, teamCount=5, courtCount=2, matchMode='schedule', draftMode='sheet', teams/teamNames(정규화)/teamColorIndices, gks={}, schedule=남은 라운드, currentRoundIdx=0, viewingRoundIdx=0, completedMatches=[], allEvents=[], confirmedRounds={}, isExtraRound=false, settingsSnapshot=getCupSettings(team)`.
6. 남은 라운드가 0이면 "모든 대진을 치렀습니다" 에러 화면(세션 미생성).
7. 파서 warnings가 있으면 경기 화면 상단에 배너로 한 번 표시하고 **자동으로 진행**한다(confirm 없음). 관리자는 배너를 보고 경기 중 명단 수정으로 바로잡는다.
8. 재진입("이어서 기록")은 `handleContinue(gameId)` → `gameMode=null`. 컵 로드 분기는 타지 않고 RTDB 복원만 한다. 이후 모든 컵 동작은 `isCupSession(state)`로 결정된다(§4.1).

### 6.3 대진과 남은 라운드

- canonical = `generate5Team2Court().slice(0, 5)`. 앞 5라운드가 정확히 10개 쌍을 한 번씩 덮는다(팀 인덱스 = 시트 열 순서, 매 라운드 1팀 휴식).
- `playedPairs` = `cupMatchLog` 행 중 `!is_extra`인 것의 `{our_team_name, opponent_team_name}`를 정규화·정렬해 `a|b` 키로 모은 집합.
- `calcRemainingRounds(canonical, teamNames, playedPairs)`: 각 라운드에서 치른 쌍을 제거, 남은 경기 0인 라운드는 버림, 1경기만 남으면 1경기 라운드로 유지. 반환 형식은 기존 `schedule`과 동일(`[{ matches:[[h,a],...] }]`). 1경기 라운드는 `matches` 길이 1이며 ScheduleMatchView가 `matches.map`으로 그리므로 B구장 카드는 렌더되지 않는다(스모크로 확인).
- 그날 몇 라운드를 하든 기존 **조기 종료**로 마감한다. 두 구장이 동시에 돌아 라운드가 자연 단위다.
- 임시 라운드(`isExtraRound`)는 허용하되 `is_extra=true`로 기록되어 팀 순위·개인 순위·치른 대진 어디에도 반영되지 않는다(§7).
- 시트 열 순서를 바꿔도 이름 기반이라 치른 대진 판정은 유지된다(라운드 묶음만 달라진다).
- 라운드 번호 표시는 그날 기준(1부터)이다. 대회 누적 라운드 표시는 비목표.

### 6.4 경기 진행

기존과 동일: GK 지정, CourtRecorder 골/어시/자책/파울, 라운드 확정, 결석·용병, 경기 중 명단 수정. 실시간 동기화도 동일(`tournamentId`는 META 노드로 함께 전파). 모든 phase 화면 상단에 `🏆 {tournamentId}` 배너를 표시해 기록자가 컵 세션임을 항상 알 수 있게 한다.

### 6.5 마감 (기록확정)

`handleFinalize`의 컵 분기. 정규 분기는 **한 줄도 바꾸지 않는다**(else 구조). 태그는 `logTagsOf(state)`로만 만든다.

| 단계 | 정규 세션 | 컵 세션 |
|---|---|---|
| 전송 | 포인트로그, 선수별집계, 로그_이벤트, 로그_선수경기, 로그_매치 (5) | 로그_이벤트, 로그_선수경기, 로그_매치 (3), `mode='대회'`, `tournament_id=cupName`, PG `rank_score=0` |
| 핵심 실패 판정(legacyOk) | 포인트로그+선수별집계 | 없음 |
| allOk | 로그_* 3종 성공 | 로그_* 3종 성공 |
| 아카이브 | `saveFinalized` | `saveFinalized` (동일). summary 끝에 ` \| 🏆 {cupName}` 파트 추가 |
| gameFinalized | allOk | allOk |
| 재적재 | `refreshAfterFinalize({sport:'풋살'})` 전체 | `refreshDatasets(CUP_FINALIZE_DATASETS, {sport:'풋살'})`만 |
| 완료 알림 | 5줄 | 3줄 |

컵 세션의 로그_선수경기 행 집합은 정규와 동일하다(팀 배정 참석자 전원, 통계 없는 선수 포함). 필터는 세션 순위(sessionRank)로 판정하고 기록되는 rank_score 값만 0이다.

빌더 변경: `buildRawEventsFromFutsal`·`buildRawPlayerGamesFromFutsal`에 `mode='기본'`, `tournamentId=''` 선택 인자를 추가한다(기본값이 현재 동작과 동일). `buildRoundRowsFromFutsal`은 이미 인자를 받는다. 마감 헬퍼 `selectFinalizeWrites(isCup)`(어떤 시트를 보낼지)는 순수 함수로 분리해 단위 테스트한다.

재마감·부분 실패: 기존과 같다. 로그_* 중 하나라도 실패하면 미확정으로 두고 재전송을 유도한다. 재전송 시 로그_매치·로그_선수경기는 dedupe 키로 중복이 막히고, 로그_이벤트 골 행은 기존 규칙대로 dedupe하지 않는다(정규와 동일한 수동 정리 절차).

## 7. 계산 규칙

### 7.1 팀 순위 `calcCupStandings(rows, teamNames)`

- 입력: `cupMatchLog` 행(로그_매치는 경기당 1행: `our_team_name`=홈, `opponent_team_name`=원정). `is_extra` 제외.
- 팀 집합 = `teamNames`(시트) ∪ 행에 등장한 팀. 경기 0인 팀도 표에 나온다.
- 승 3·무 1·패 0. 정렬: 승점 → 득실차 → 다득점 → 팀명. `getTeamStandings`(App 내부 훅)는 재사용 불가하므로 같은 규칙의 순수 함수로 새로 둔다. 출력 필드: `{ name, games, wins, draws, losses, gf, ga, points }`.

### 7.2 개인 순위

로그_이벤트 행에는 `is_extra` 열이 없고 `analyticsV2/calcPlayerSummary`의 eventLogs 패스는 `is_extra` 조인을 하지 않는다(축구 버전과 다름). analyticsV2는 수정하지 않고(비목표) 컵 쪽에서 전처리한다:

```
extraKeys = cupMatchLog에서 is_extra 행의 `${date}|${match_id}` 집합
cupEventsNoExtra = cupEventLog.filter(e => !extraKeys.has(`${e.date}|${e.match_id}`))
calcPlayerSummary({ matchLogs: cupMatchLog, eventLogs: cupEventsNoExtra, playerGameLogs: cupPlayerGameLog })
```
`goals`·`assists`로 TOP5. 전처리 함수 `dropExtraEvents(matchRows, eventRows)`는 `src/utils/cup/`에 두고 테스트한다.

### 7.3 진행도·남은 대진

`playedPairs.size / 10`, 남은 대진 = §6.3의 `calcRemainingRounds` 결과를 라운드별로 표시.

## 8. UI 변경 목록

| 위치 | 변경 |
|---|---|
| `mainTabs.js` | 풋살 + `cupName` 있을 때 `cup` 탭 |
| `TeamDashboard.jsx` | 경기관리 새 경기 영역(풋살 분기)에 `🏆 컵대회 경기` 버튼(`cupName` 조건), `cup` 탭 렌더(`CupTab`), `cupName`을 `getEffectiveSettings(teamName,'풋살')`에서 |
| `components/cup/CupTab.jsx` (신규) | §6.1 기록 전용 탭 |
| `components/cup/CupStandingsTable.jsx` (신규) | 순위표. `StandingsModal`은 모달이라 재사용하지 않음 |
| `App.jsx` | 컵 로드 분기, 에러 화면, 배너, 마감 분기 |
| `SettingsScreen.jsx` | 풋살 섹션 "마스터스컵" 블록(§4.2), `runFirebasePhaseMigration`의 태그를 `logTagsOf(gs)`로 |
| `HistoryView.jsx` | summary 6번째 파트(🏆)를 목록·상세 헤더에 표시 |
| `pendingGameLabel.js` | `isCupSession(gs)`면 라벨 앞에 `🏆 ` |

## 9. 파일별 변경 범위

| 파일 | 변경 |
|---|---|
| `src/hooks/useGameReducer.js` | `tournamentId:''` 초기값, RESTORE_STATE 복원 |
| `src/services/firebaseSyncDiff.js` | META_FIELDS에 `tournamentId`, reconstructState 기본값 |
| `src/services/firebaseSync.js` | `_buildSummary`에 🏆 파트(`|`는 cupName 검증으로 배제) |
| `src/services/sheetCache.js` | `rowFilter`·`alias` 어댑터 옵션, `resolveAdapter`, `_pathFor` alias 해석, `get()` 세 반환 지점 필터, `refresh(alias)` 위임, `datasetsOf` alias 제외, 풋살 정규 3종 필터, cup 3종 alias |
| `src/utils/recoverFinalizedFromSheets.js` | `!tournament_id` 필터 |
| `src/utils/rawLogBuilders.js` | 풋살 빌더 2개에 `mode`·`tournamentId` 선택 인자 |
| `src/utils/cup/cupSession.js` (신규) | `isCupSession(state)`, `logTagsOf(state)` |
| `src/utils/cup/cupRoster.js` (신규) | `fetchCupRoster()` (§4.5 반환 타입·에러) |
| `src/utils/cup/cupSchedule.js` (신규) | `CANONICAL_ROUNDS`, `pairKey`, `collectPlayedPairs`, `calcRemainingRounds` |
| `src/utils/cup/calcCupStandings.js` (신규) | §7.1 |
| `src/utils/cup/dropExtraEvents.js` (신규) | §7.2 |
| `src/utils/cup/finalizeWrites.js` (신규) | `selectFinalizeWrites(isCup)` |
| `src/config/settings.js` | `FUTSAL_KEYS` 두 키, `SPORT_DEFAULTS.풋살` 빈 기본값, `getCupSettings(team)` |
| `src/utils/refreshAfterFinalize.js` | `CUP_FINALIZE_DATASETS` 상수 export |
| `src/utils/finalizedRows.js` (신규) | `rowsForFinalizedSession(h, gs, team)` — 확정 세션 1건 → 로그_매치 rows(태그는 `logTagsOf`) |
| `src/Root.jsx` | `handleStartNew('cup')` 전달(로직 변경 없음) |
| `src/App.jsx` | §6.2·§6.4·§6.5 |
| `src/components/common/SettingsScreen.jsx` | §4.2 블록, `runFirebasePhaseMigration` 태그(순수 부분 `rowsForFinalizedSession(h, gs, team)`을 `src/utils/finalizedRows.js`로 분리해 테스트) |
| `src/components/dashboard/mainTabs.js`, `TeamDashboard.jsx`, `components/cup/*`, `history/HistoryView.jsx`, `utils/pendingGameLabel.js` | §8 |
| `src/utils/intraSoccer/rosterSheet.js` | **변경 없음**(파서 import만) |
| `src/utils/analyticsV2/*`, `soccerAnalytics/*` | **변경 없음** |
| `apps-script/Code.js`, Firebase 규칙 | **변경 없음** |

## 10. 불변식과 회귀 가드

1. 정규 세션의 마감 코드 경로·전송 시트·판정 로직은 바이트 단위로 동일하다(else 분기). 테스트: `selectFinalizeWrites(false)`가 기존 5개 순서 그대로, `selectFinalizeWrites(true)`는 로그_* 3종만. 컵 마감은 `refreshAfterFinalize`를 호출하지 않는다.
2. `tournament_id`가 빈 행만 정규 풋살 데이터셋에서 나온다. 테스트: L1 히트·in-flight 합류(동시 두 번 호출)·L2 히트·L3 폴백 각 경로에 컵 행을 섞어 `get()` 결과 검증. cup 뷰는 cupName 일치 행만, cupName이 비면 `[]`. 축구 어댑터에는 rowFilter가 없다(테스트로 고정). alias 어댑터는 `fetch`가 없고 `_pathFor`가 원본 경로를 돌려준다. `refreshAll` 후 원본 L2 노드는 전체 행을 담는다. `datasetsOf('풋살')`에 cup 뷰가 없다.
3. 새 state 필드는 `syncCoverage` 테스트를 통과한다(META 분류). 왕복 테스트: reconstructState → RESTORE_STATE 후 `isCupSession` 유지.
4. 풋살 빌더의 기본 인자 동작은 기존 테스트가 그대로 통과한다. `logTagsOf`는 컵/정규 두 값만 만든다.
5. canonical 5라운드는 10개 쌍을 정확히 한 번씩 포함한다(테스트). 남은 라운드 계산은 치른 쌍·임시 라운드·1경기 라운드·이름 정규화·빈 입력을 다룬다(테스트).
6. 순위 정렬 규칙과 0경기 팀 포함(테스트). 로그_매치가 경기당 1행이라는 전제(테스트 데이터로 고정). `dropExtraEvents`가 임시 라운드 이벤트를 제거한다(테스트).
7. `mainTabs`: 테니스·축구에는 `cup` 탭이 절대 없다. 풋살이라도 `cupName`이 비면 없다(테스트).
8. 로그 3종 직접 호출 화이트리스트 정적 가드(테스트).
9. `recoverFinalizedFromSheets`는 `tournament_id`가 있는 행을 무시한다(테스트). `runFirebasePhaseMigration`은 세션 태그를 `logTagsOf`로 만든다(테스트 가능한 순수 부분 `rowsForFinalizedSession(h, gs)`로 분리).
10. `CUP_FINALIZE_DATASETS`는 정확히 `['matchLog','eventLog','playerGameLog']`이다(테스트).
11. App.jsx는 렌더 하네스가 없다(메모리: 컴포넌트 렌더 검증 공백). 컵 분기는 선언 순서·diff 정독 + 브라우저 스모크(컵 세션 생성 → 골 1개 → 라운드 확정 → 조기 종료 → 마감 → 시트 3종 확인 → 정규 분석탭 불변 확인 → 1경기 라운드 렌더)로 검증한다.

## 11. 구현 순서

각 단계는 독립 배포·검증 가능하다. 1단계가 배포되기 전에는 컵 세션이 UI에서 만들어질 수 없으므로 오염 창이 없다.

### 1단계 — 격리 게이트 (UI 없음)

- `tournamentId` 필드(§4.1 네 지점), `cupSession.js`(`isCupSession`, `logTagsOf`).
- sheetCache `rowFilter` 옵션 + `get()` 세 반환 지점·`refresh()` 반환 필터 + 풋살 정규 3종 필터. (`alias`/`resolveAdapter`/`_pathFor`/`datasetsOf` 제외는 등록 대상이 생기는 3단계에서 cup 뷰와 함께.)
- `recoverFinalizedFromSheets` 필터, `runFirebasePhaseMigration` 태그 → `logTagsOf`.
- 빌더 선택 인자, `selectFinalizeWrites`, `handleFinalize` 컵 분기, `_buildSummary` 🏆, `CUP_FINALIZE_DATASETS`.
- 테스트: 불변식 1·2(정규 필터 부분)·3·4·8·9·10.
- 검증: 유닛 전부 green. 수동 확인은 캐시 때문에 신뢰할 수 없으므로(L2 12시간) 유닛 테스트를 근거로 삼는다. 굳이 확인하려면 설정 화면 "구글시트에서 다시 불러오기"로 재적재한 뒤 본다.

### 2단계 — 컵 경기일 진입 (1일차 가능)

- 설정 키·`getCupSettings`·설정 화면 블록(`|` 검증, 경고 문구).
- `fetchCupRoster`, `CANONICAL_ROUNDS`(치른 대진 제외는 3단계, 이 단계에서는 5라운드 전체·`refresh('cupMatchLog')` 호출 없음).
- 경기관리 탭 `🏆 컵대회 경기` 버튼, `mainTabs` cup 탭 + `CupTab` 최소 버전(§6.1의 1·2 = 대회명·진행도·명단 미리보기), Root 전달, App 로드 분기·에러 화면·배너, `pendingGameLabel`.
- 테스트: 불변식 5(canonical)·7, `fetchCupRoster` 형식·검증 에러, `getCupSettings`가 팀 프리셋·오버라이드를 무시하고 shared를 포함.
- 검증: 브라우저 스모크(불변식 11). 정규 시트 연동 세션 회귀 없음.

### 3단계 — 순위표·득점왕·남은 대진 (2일차 전)

- sheetCache `alias`/`resolveAdapter`/`_pathFor`/`datasetsOf` 제외 구현 + cup 뷰 데이터셋 3종, `collectPlayedPairs`·`calcRemainingRounds`, App 로드에서 `refresh('cupMatchLog')` + 남은 라운드 적용(§6.2 2·4), `calcCupStandings`, `dropExtraEvents`, `CupTab` 완성(§6.1의 3~6), 컵 마감 재적재 연결 + 같은 캐시 경로를 공유하는 두 어댑터(alias)의 in-flight 합류 테스트.
- 테스트: 불변식 2(cup 뷰·alias·refreshAll)·5(남은 라운드)·6.
- 검증: 1일차 데이터로 순위표·남은 대진이 맞는지, 2일차 시작 시 치른 대진이 빠지는지 확인. 1경기 라운드 렌더 확인.

### 4단계 — 마무리 (선택)

- HistoryView 🏆 표시, 설정 화면 다듬기, `docs/PRESETS.md`·`TEAM_ONBOARDING.md` 갱신.
- 선택 강화: Apps Script 읽기 함수에 `tournamentId` 스코프 파라미터(기본 동작 유지) + 클라이언트가 정규 읽기에 `''`를 넘김. 별도 스펙/승인.

## 12. 운영 절차

사전(1회):
1. 마스터FC 스프레드시트에 `cupRosterSheet` 이름의 탭을 만들고 §4.5 형식으로 5팀을 기입한다.
2. 설정 화면(풋살) 마스터스컵 블록에 대회명·팀명단 시트를 저장한다(2단계 배포 전에는 Firebase 콘솔의 `settings/마스터FC/풋살/overrides`에 직접 입력).

경기일:
1. 경기관리 탭 → 새 경기 → `🏆 컵대회 경기`. 명단·남은 대진이 자동으로 채워진 경기 화면이 뜬다(🏆 배너 확인).
2. 결석은 경기별 휴식, 게스트는 용병으로 처리한다. 시트는 고치지 않아도 된다.
3. 계획한 라운드까지 확정하고 조기 종료 → 기록확정(관리자).
4. 컵 탭에서 순위·남은 대진을 확인한다.

하지 말 것:
- 컵 경기를 "자동설정 경기/커스텀 경기" 버튼으로 열지 않는다(세 버튼이 나란히 있다). 그 경로는 정규 마감으로 흘러가 포인트 로그·선수별집계에 기록된다. 앱은 이를 막지 않는다(비목표). 마지막 방어선은 기록확정 confirm 문구("포인트로그 + 선수별집계를 저장합니다")와 🏆 배너의 부재다.
- 컵 경기일에 정규 세션을 열지 않는다(기술 충돌은 없으나 운영 혼선 방지).
- 대회 진행 중 대회명·팀 이름을 바꾸지 않는다.
- 설정 화면의 "로그_매치 정확 덮어쓰기"·"finalized 복구" 도구는 1단계 이후 버전에서만 쓴다.

## 13. 리스크와 미확인 사항

| 항목 | 영향 | 대응 |
|---|---|---|
| 1경기 라운드(치른 대진 제외 결과) 렌더 | ScheduleMatchView는 `matches.map`이라 B구장 카드가 안 그려질 것으로 보이나 CourtRecorder 쪽 미검증 | 3단계 브라우저 스모크 항목 |
| 오래된 빌드 기기 | 새로고침 전까지 정규 분석에 컵 행 노출 가능 | 4단계 서버 파라미터로 봉합 가능 |
| 나란한 세 버튼 중 정규 버튼으로 컵을 여는 실수 | 포인트 로그·선수별집계 오염(수동 삭제로 롤백) | 컵 버튼을 색·아이콘으로 구분, 운영 규칙, confirm 문구, 배너 부재. 앱 차단은 비목표(대회 기간 필드가 없어 "컵 날" 판별 불가) |
| 컵 행 0건일 때 cup 뷰 L1 미적재 | 컵 탭 첫 로드가 원본 노드 재필터(메모리 연산)로 반복 | 무시 가능 |
| 대회명 변경 | 과거 행과 연결 단절 | 운영 규칙으로 금지, 설정 화면 상시 경고 문구 |
| `parseIntraRosterCsv` 경고 | 이름 중복 등 | 배너 1회 표시 후 자동 진행, 경기 중 명단 수정으로 정정 |
| 하버FC 축구 대회 행 | 변화 없음 | 축구 어댑터 무필터 테스트로 고정 |
| 세션 생성 시 `refresh('cupMatchLog')` | Apps Script 1회(콜드스타트 최대 ~10초) | 시트 연동 경로도 CSV fetch를 하므로 허용. 실패 시 배너 + 전체 대진 |

## 14. 결정 기록

- 세션 재사용(경로 A/C) vs 대회 엔티티(경로 B): 3렌즈 심사에서 세션 재사용이 우세. 엔티티가 주는 "남은 대진 추적"은 로그_매치 파생으로 대체(저장소·화면 추가 없음).
- 서버 필터 선배포 대신 클라이언트 필터: §5.
- 아카이브 포함: 경기별 상세 조회를 기존 화면으로 얻고 복구 유틸 함정을 피한다(사용자 확정).
- 컵 규칙을 프리셋으로 만들지 않음: §4.3.
- 5팀 고정: 요구 범위. 팀 수 일반화는 필요해질 때 canonical 생성기만 바꾸면 된다.
- 적대적 리뷰 반영(2026-09-16): 설정 화면 로그_매치 재기록 도구의 태그 하드코딩(격리 우회) → `logTagsOf` 단일화; 임시 라운드 이벤트의 개인 순위 혼입 → `dropExtraEvents`; alias 경로·`get` 세 반환 지점·`datasetsOf` 제외의 구현 계약 명시; 세션 생성 시 `get` 대신 `refresh`로 실패 판별; 로그_선수경기 키 충돌이라는 잘못된 근거 정정; 재진입(`handleContinue`) 경로 명시; 팀장 데이터 경로(`captain=players[0]`)·`Ⓒ` 배지; `cupName`의 `|` 금지; 테스트 항목 보강(왕복·in-flight·복구 필터·재기록 도구·상수 내용).
- 2026-09-16 사용자 재확인: 진입점은 경기관리 탭 "새 경기"의 일반/컵대회 선택(컵 탭은 기록 전용); 마스터FC 포인트 로그·선수별집계기록 로그에는 컵 행을 넣지 않음; 팀명단은 같은 스프레드시트의 별도 탭.
