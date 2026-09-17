# 마스터스컵(풋살 컵대회) 설계

- 작성일: 2026-09-16 / v2 개정 2026-09-17
- 상태: 1단계 완료(main 0e015ef). 2단계(대회·팀 관리 + 컵 경기일 진입) 구현 완료 — 2026-09-17. 배포 전제: RTDB tournaments 규칙. 3단계 계획 대기
- 대상 팀: 마스터FC(풋살). 하버FC·빅마스터FC(축구)·몽피스(테니스)에는 어떤 동작 변화도 없어야 한다.

## 1. 개요

마스터FC 회원을 여러 팀으로 나눠 풀리그 1회전을 여러 날에 걸쳐 치르는 컵대회("마스터스컵")를 앱에서 만들고, 팀을 관리하고, 기록·집계한다. 컵 경기일은 기존 풋살 세션(2구장·라운드·CourtRecorder·마감)을 그대로 쓰되 세션에 `tournamentId`를 박아 (1) 팀 명단을 대회 엔티티에서 자동으로 불러오고, (2) 마감 시 정규 포인트 계열 시트에는 쓰지 않으며, (3) 정규 분석·대시보드가 컵 행을 읽지 않게 하고, (4) "대회" 탭에서 대회별 순위표·득점왕·남은 대진과 전 대회 개인 누적을 보여준다.

구글 시트는 **로그 3종(로그_이벤트·로그_매치·로그_선수경기)의 저장소로만** 쓴다. 대회·팀 정보는 앱이 Firebase RTDB에 저장하고 앱 안에서 편집한다.

### 1.1 사용자 확정 사항

| 항목 | 결정 |
|---|---|
| 대회 | 여러 개를 만들 수 있다(예: 해마다). 앱에서 추가. 기간 필드 없음 |
| 팀 | 대회마다 팀 수 가변. 앱에서 팀 추가/삭제, 팀명 수정, 팀원 수정. 팀원은 **회원 명단에서 선택 + 자유 입력(게스트)** |
| 잠금 | 그 대회의 경기가 한 번이라도 마감되면 **팀명·팀 수·대회 삭제가 잠긴다.** 팀원 수정은 언제든 가능. 대회명은 생성 후 항상 불변 |
| 대회 형식 | 풀리그 1회전. 여러 날에 나눠 진행. 컵 경기일에는 컵 경기만 한다(운영 규칙) |
| 정규 기록과의 관계 | **완전 분리.** 컵 골·어시·클린시트는 마스터FC 포인트 로그·마스터FC 선수별집계기록 로그·★ 랭킹·대시보드·분석탭에 반영하지 않는다(1단계 구현 완료) |
| 기록 저장 | 로그 3종에 `mode='대회'`, `tournament_id=대회ID`로 저장(1단계 구현 완료). 시트 의존은 여기까지 |
| 기록 화면 | 대회별 기록(순위표·득점왕·결과·남은 대진) + **전 대회 개인 누적**(팀 누적은 팀 구성이 대회마다 달라 무의미) |
| 진입점 | 경기관리 탭 "새 경기"에서 일반/컵대회 선택 + 대회 상세 화면의 시작 버튼. 컵대회를 고르면 대회의 팀으로 세션이 짜인다 |
| 아카이브 | 컵 경기일도 경기 기록 보관소에 포함, 🏆 라벨(1단계 구현 완료) |
| 하버FC 대회 탭 | 탭 정체성("대회" 탭)만 재사용. 순위표 컴포넌트·저장·기록 모델은 재사용하지 않는다(§2) |
| Apps Script | 변경 없음. 서버 측 tournamentId 필터는 선택적 후속 강화 |

### 1.2 기본 가정(설계에 포함)

- 팀장은 표시 전용(`Ⓒ` 배지). 권한 없음.
- 팀 순위 = 승점 3/1/0 → 득실차 → 다득점 → 팀명. 개인 = 득점·어시스트 순위.
- 컵 세션의 규칙 스냅샷은 표준 풋살 규칙(자책 −1, 크로바/고구마 꺼짐, 보너스 1배). 포인트를 어디에도 쓰지 않으므로 화면 표시에만 영향.
- 결석·용병·경기 중 명단 수정은 기존 풋살 세션 메커니즘(absentees·liveMercs·teamEditMode) 그대로. 세션 안에서 바꾼 명단은 그 세션의 기록에만 남고 대회 엔티티에는 되돌려 쓰지 않는다.
- 팀 수 범위 3~8. 3팀은 1구장, 4팀 이상은 2구장.
- 임시 라운드(`is_extra`)의 경기는 팀 순위·개인 순위·치른 대진·개인 누적 **모두**에서 제외한다.
- 대회·팀 편집은 관리자만. 마지막 저장이 이긴다(동시 편집 보호 없음 — 드문 관리자 작업).

### 1.3 비목표

녹아웃·결승전, 더블 라운드로빈, 팀장 권한, 실시간(마감 전) 순위, 시트 탭 자동 생성, 축구 대회 모드의 저장·기록 모델(대회_목록·대회_* 시트·TournamentMatchManager) 사용, 팀 단위 통산, 대회명 변경(생성 후 불변), 컵 전용 포인트/MVP, 정규 "새 경기" 버튼의 앱 차원 차단, Apps Script 변경, analyticsV2 내부 수정, 대회 편집의 실시간 협업.

## 2. 하버FC "대회" 탭과의 관계

하버FC 대회 모드(`docs/superpowers/specs/2026-04-08-tournament-mode-design.md`)는 "우리 팀 1개 vs 외부 팀들" 구조다. 우리 경기만 축구 포메이션 기록기로 기록하고 타팀 경기는 스코어만 넣으며, 대진도 우리 팀 경기만 만들고, 명단은 경기 후 집계 시트에서 역산한다. 회원 전원이 여러 팀으로 붙는 내부 풀리그와는 모양이 다르다.

재사용하는 것: (a) 탭 정체성 — 풋살 팀에서도 같은 `tournament` 탭 키·"대회" 라벨을 쓰고 종목에 따라 컴포넌트만 바꾼다. 컵 화면은 `tournamentActive`/`onTournamentView`/`onTournamentName`/`onGoHome` 흐름을 **쓰지 않는다**(탭 바·헤더는 그대로 보이고 목록↔상세 전환은 `CupListTab` 내부 state) — 축구 대회 화면과 의도된 UX 차이. (b) RTDB 최상위 경로 `tournaments/{팀}` — 이미 축구 대회 모드가 쓰는 경로라 규칙에 있을 가능성이 높다(§4.2 전제).

재사용하지 않는 것: 대회_목록·대회_* 시트, `CreateTournament`(시작·종료일·참가팀 문자열 입력), `TournamentMatchManager`, `TournamentSchedule`(우리 경기 필터), 이벤트로그 스키마(상대팀 단일), `TournamentStandings.jsx`(경기 기록이 있는 팀만 표시하고 팀명 4번째 정렬이 없어 §7.1 요구와 맞지 않는다 — 컵은 `calcCupStandings` 결과를 직접 표로 그린다).

## 3. 용어와 식별자

- **cupId**: 대회 식별자 = `tournament_id` 값이자 로그·배너·목록에 보이는 이름. 생성 시 입력한 대회명을 `cupIdOf(name)` = `rtdbPath.safeKey(name.trim())`(RTDB 금지문자 `. # $ / [ ]` → `_`)로 정규화한 문자열. 예: `마스터스컵 2026`. **불변**(대회명 변경 없음). `|` 포함 시 throw(아카이브 summary 구분자). 같은 팀 안에서 유일해야 한다(연도 포함 권장). `meta.name === cupId`.
- **컵 세션**: `state.tournamentId !== ''`인 풋살 세션. 판별은 `isCupSession(state)`만(1단계).
- **로그 태그**: `logTagsOf(state)` = 컵이면 `{ mode:'대회', tournamentId }`, 아니면 `{ mode:'기본', tournamentId:'' }`(1단계).
- **팀(엔티티)**: `{ id, name, captain, players[], order }`. `id`는 대회 안에서 불변(`t1`, `t2`, … — 팀 추가 시 기존 id의 최대 번호+1, 중간에 비는 번호는 재사용하지 않는다(현재 최대+1이므로 최대 번호 팀을 지운 뒤 추가하면 그 번호는 다시 쓰일 수 있다 — id는 로그에 기록되지 않아 무해)), `name`이 로그 행의 팀 이름이 된다. `captain`은 `players`에 포함된 이름 하나이거나 `''`(표시 전용).
- **canonical 대진**: 팀 수 N에 대한 풀리그 1회전 라운드 배열(§6.3).
- **치른 대진(playedPairs)**: 그 대회의 로그_매치 행(`is_extra` 제외)에서 뽑은 팀 이름 쌍(순서 무관) 집합.
- **잠금(locked)**: `meta.lockedAt`(첫 컵 마감 성공 시 App이 기록) 이 있거나, 그 대회의 컵 로그_매치 행이 1건 이상 존재(3단계 파생)하면 잠김. `isLocked(cup, playedPairs) = !!cup.meta.lockedAt || playedPairs.size > 0`. 2단계는 `lockedAt`만으로 판정한다.

## 4. 데이터 모델

### 4.1 세션 state (구현 완료, 변경 없음)

| 필드 | 타입 | 기본 | 동기화 분류 | 비고 |
|---|---|---|---|---|
| `tournamentId` | string | `''` | `META_FIELDS` | 컵 세션이면 cupId |

다섯 지점이 함께 바뀌어 있다: `initialState`, `META_FIELDS`, `reconstructState`(`?? ''`), `RESTORE_STATE`(`!= null`), `App.jsx`의 `gameState` useMemo 화이트리스트. 왕복 테스트와 정적 가드(`logReaders.guard.test.js`)가 고정한다. 세션의 컵 판별은 재진입·재접속 후에도 오직 `isCupSession(state)`.

컵 세션의 나머지는 기존 필드의 값 조합이다: `matchMode='schedule'`, `courtCount`(팀 수에 따라 1 또는 2), `teamCount=N`, `draftMode='sheet'`(재배치 버튼은 기존 조건 `draftMode==='snake'`에 의해 자동으로 숨겨진다), `settingsSnapshot`=컵 규칙(§4.3).

### 4.2 대회 엔티티 (RTDB)

경로: `tournaments/{safeTeam}/{cupId}` (`safeTeam`은 `rtdbPath.safeTeam`). 축구 대회 모드가 같은 최상위 경로 아래 `{id}/cache`·`{id}/activeGame`을 쓰지만 자식 이름이 다르고, 풋살 목록은 `meta.sport === '풋살'`인 자식만 대회로 인식하므로 서로 섞이지 않는다.

```
tournaments/{safeTeam}/{cupId}/
  meta: {
    id: cupId, name: cupId, sport: '풋살', format: 'league1',
    status: 'active' | 'finished',        // 관리자가 "대회 종료"로 바꾼다. 집계에는 영향 없음
    createdAt: number, createdBy: string, updatedAt: number,
    lockedAt: number | undefined          // 첫 컵 마감 성공 시 App.jsx 컵 분기가 기록(§6.5). 있으면 잠김
  }
  teams: {
    t1: { id: 't1', name: '팀A', captain: '김철수', players: ['김철수','박민수', ...], order: 0 },
    t2: { ... }
  }
```

읽기 정규화(`normalizeCup(cupId, raw)`, 단일 지점): `teams` 객체를 `order` 순 배열로(각 팀의 `id`는 객체 키로 보강), `players`는 `?? []`(RTDB는 빈 배열을 저장하지 않는다 — 메모리 함정), `captain`은 `?? ''`, `status`는 `?? 'active'`, `lockedAt`은 `?? null`. 목록은 `tournaments/{safeTeam}` 전체를 읽어 `meta?.sport === '풋살'`인 자식만 `createdAt` 내림차순으로 돌려준다(축구 대회 노드는 `meta`가 없어 제외된다).

서비스 `src/services/cupSync.js`(firebase SDK 직접 사용, `safeTeam`은 `rtdbPath`에서):
- `listCups(team) → Cup[]`, `loadCup(team, cupId) → Cup|null`
- `createCup(team, { name, createdBy }) → Cup` — `cupId = safeKey(name.trim())`; 빈 이름·`|` 포함·이미 존재하면 throw.
- `saveTeams(team, cupId, teams[])` — 팀 배열을 `{ [team.id]: team }` 객체로 바꿔 `teams` 노드 통째 교체(`updatedAt` 갱신). `id`가 없는 팀이 있으면 throw. 검증은 호출 전 `validateTeams`(§4.5).
- `setStatus(team, cupId, status)`, `markLocked(team, cupId)`(`meta.lockedAt = Date.now()`, 이미 있으면 유지), `deleteCup(team, cupId)`(`lockedAt`이 없는 대회만; 노드 전체 `remove`).
- 모든 쓰기 실패는 throw → 화면이 `alert`로 보여준다. 시트 캐시처럼 조용히 삼키지 않는다(권한 거부를 즉시 알아야 한다).

**배포 전제: RTDB 보안 규칙에 `tournaments` 최상위 경로 읽기/쓰기가 열려 있어야 한다.** 규칙은 최상위 경로 화이트리스트라 새 노드는 기본 거부된다. 저장소에 규칙 파일이 없으므로 Firebase 콘솔에서 확인하고, 없으면 `"tournaments": { ".read": true, ".write": true }`를 추가한다(2026-09-08 `cache` 추가와 같은 절차). 2단계 배포의 첫 검증 항목이다.

### 4.3 컵 규칙 스냅샷

```
getCupSettings(team) = {
  ...getEffectiveSettings(team, '풋살'),  // 캐시 하이드레이션 포함: shared(sheetId·시트명들) + 팀 규칙
  ...SPORT_DEFAULTS.풋살,                 // 규칙 키만 표준값으로 되돌린다(자책 −1, 크로바/고구마 꺼짐, 보너스 1배)
  _meta: { preset: null, sport: '풋살', team, cup: true },
}
```
`getEffectiveSettings`를 거치므로 `_hydrateCacheFromStorage`가 반드시 먼저 돈다(직접 `_cache`를 읽지 않는다). 팀의 프리셋·오버라이드(마스터FC풋살의 자책 −2, 크로바/고구마 ON, 2배 보너스)는 **덮어써서 적용하지 않는다.** 새 프리셋을 만들지 않는다. 설정 키를 추가하지 않는다(v1의 `cupName`/`cupRosterSheet`는 폐기).

### 4.4 로그 시트 태그 (구현 완료, 스키마 변경 없음)

| 열 | 정규 세션 | 컵 세션 |
|---|---|---|
| `mode` | `기본` | `대회` |
| `tournament_id` | `''` | cupId |
| `sport` | `풋살` | `풋살` |
| 로그_선수경기 `rank_score` | 세션 순위 점수 | `0` (행 집합은 정규와 동일) |

마스터FC 포인트 로그·마스터FC 선수별집계기록 로그에는 컵 행을 쓰지 않는다. dedupe 키(로그_매치 `game_id|match_id`, 로그_선수경기 `team|sport|mode|tournament_id|date|player`)에 `mode`/`tournament_id`가 있어 같은 날 정규·컵 행이 공존해도 충돌은 없다.

### 4.5 팀 관리 규칙 (앱 내)

- 팀원 후보 = 대시보드 시트 회원 목록(`TeamDashboard`의 `members` 이름, 현재 참석자 선택과 같은 소스) + 자유 입력. 이름은 `stripNameDecorations`+trim으로 정규화한다.
- 팀 추가 시 `id` 부여: 기존 id 중 최대 번호+1(`t1`,`t2`,…). 중간에 비는 번호는 재사용하지 않는다 — 현재 최대+1(`nextTeamId(teams)` 순수 함수). `saveTeams`는 `id`가 없는 팀이 있으면 throw.
- 검증 `validateTeams(teams) → { ok, errors[] }`: 팀 수 3~8, 팀명 비어있지 않음·유일·`|` 없음·앞 `팀 ` 공백 정규화(`/^팀 /`→`팀`, RESTORE_STATE와 동일), 한 선수는 한 팀에만(`players` 기준), 각 팀 최소 1명, `captain`은 `''`이거나 그 팀 `players`에 포함. 저장은 `ok`일 때만.
- 잠금(§3): `isLocked(cup, playedPairs)`. 잠기면 팀명 입력·팀 추가/삭제·대회 삭제는 비활성이고 화면에 "🔒 첫 경기 마감 후 팀명·팀 수는 바꿀 수 없습니다"를 표시. 팀원·팀장은 계속 편집 가능(다음 경기일부터 반영). 2단계는 `lockedAt`만으로, 3단계부터는 로그 파생을 OR로 더한다.
- 편집 화면은 열릴 때 `loadCup`으로 최신값을 읽고, 저장은 팀 배열 통째 `saveTeams`. 저장 후 다시 읽어 화면을 맞춘다.
- 로드 시 `validateTeams`가 실패하는 대회(콘솔에서 손으로 고친 경우 등)는 경기 시작을 거부하고 "팀 관리에서 확인" 안내를 띄운다(정상 저장 경로에서는 발생하지 않는다).

### 4.6 시트 캐시 데이터셋 (sheetCache.js, 풋살만)

L2 노드는 **풋살 전체 행**을 담고, 데이터셋별 "뷰 필터"를 `get()` 반환 시점에 적용한다.

| 데이터셋 | 원본 노드 | rowFilter | 비고 |
|---|---|---|---|
| `matchLog` / `eventLog` / `playerGameLog` (풋살) | 자기 자신 | `!row.tournament_id` | 구현 완료 |
| `cupMatchLog` / `cupEventLog` / `cupPlayerGameLog` (풋살, 3단계) | `alias`로 위 세 노드 공유 | `!!row.tournament_id` | **모든 대회**의 행. 대회별 분리는 화면에서 `tournament_id === cupId`로. 정규 뷰와 정확히 분할(합집합=전체) |
| 축구 어댑터 | 변경 없음 | 없음 | 하버FC 축구 대회 행은 그대로 |

어댑터 계약(3단계 구현 지시):
- alias 뷰는 `ADAPTERS`가 아니라 별도 레지스트리 `ALIASES = { '풋살': { cupMatchLog: { alias:'matchLog', rowFilter }, … } }`에 둔다. `ADAPTERS`를 순회하는 기존 커버리지 테스트(모든 어댑터가 `fetch`·`columns`를 갖는다, `datasetsOf('풋살')` 7종)는 그대로 통과해야 한다. 테스트용 `_aliasesForTest()`를 추가한다.
- `resolveAdapter(sport, dataset) → { adapter: 원본 어댑터, rowFilter: (alias면 alias 것, 아니면 원본 것), sourceDataset }`. `get()`·`refresh()`가 rowFilter를 적용하는 지점(현재 `_applyRowFilter(adapter, …)`)은 이 `rowFilter`를 쓴다.
- `_pathFor`는 항상 원본 데이터셋 키로 경로를 만든다. alias 전용 RTDB 노드는 생기지 않는다.
- `get()`의 공유 in-flight Promise는 **필터 전 값**으로 resolve하고 필터는 호출자별로 반환 직전에 적용한다(구현 완료): (1) L1 히트, (2) in-flight 합류, (3) `await p`, (4) `DISABLED`. 같은 경로를 공유하는 두 어댑터가 서로의 필터를 받지 않는다.
- `refresh(alias)`는 원본 경로를 재적재하고 `{ ok, rows: 필터된 값 }`.
- `datasetsOf(sport)`는 alias를 제외한다 → `refreshAll`·정규 마감 재적재·`status` 대상이 늘지 않는다.
- 컵 마감 재적재 `CUP_FINALIZE_DATASETS = ['matchLog','eventLog','playerGameLog']`(구현 완료).

## 5. 기록 분리(격리) 설계 (구현 완료)

| 경로 | 소비자 | 차단 |
|---|---|---|
| A. 로그_매치 → matchLogs 지표 | analyticsV2 전반, 월별 랭킹, 참석률 | `matchLog` rowFilter |
| B. 로그_이벤트 → eventLogs 지표 | 득점·어시·해트트릭·어시 연결망 | `eventLog` rowFilter |
| C. 로그_선수경기 → PG 지표 | GK·수호신·최근 폼·스트릭·일일 MVP | `playerGameLog` rowFilter |
| D. 포인트 로그·선수별집계 → 대시보드·latestDeltas·랭킹 히스토리 | records 탭, ▲▼ 배지, 캔들 차트 | 컵 마감이 두 시트를 호출하지 않음 |

우회 경로도 막혀 있다: `recoverFinalizedFromSheets`(`!r.tournament_id`), 설정 화면의 로그_매치 재기록 도구(`rowsForFinalizedSession` → `logTagsOf`), 정적 가드(로그 3종 직접 읽기 화이트리스트). 클라이언트 필터를 택한 이유: 하버FC 축구 대회 모드가 같은 열에 `mode='대회'` 행을 쓰고 축구 분석이 그 행을 읽으므로 서버 무조건 필터는 하버FC 회귀다.

## 6. 플로우

### 6.1 "대회" 탭과 진입점

**탭.** `buildMainTabs`: 풋살(테니스·축구 아님)이면 `{ key:'tournament', label:'대회' }`를 경기관리 뒤에 추가한다(축구는 기존 조건 그대로). `TeamDashboard`는 `activeTab === 'tournament'`에서 `isSoccer ? <TournamentListTab …기존 props…/> : <CupListTab …/>`로 분기한다. **두 파일(`mainTabs.js`, `TeamDashboard.jsx`)은 한 커밋으로 바꾼다** — 탭만 먼저 생기면 풋살에서 축구 목록이 마운트돼 Apps Script 대회 목록을 호출한다. `CupListTab`은 `tournamentActive`·`onTournamentView`·`onTournamentName`·`onGoHome`을 받지 않는다(탭 바·헤더 유지). 테니스 탭 구성은 불변. 기존 `mainTabs.test.js`의 "풋살 = 대회 없음" 케이스는 `tournament` 포함으로 갱신한다.

**`CupListTab`(대회 목록).**
1. 진행중 대회 카드(대회명, 팀 수, 진행도 `치른 경기 n/전체`, 우승팀(완료 시), 상태) → 탭하면 `CupDetail`.
2. `+ 새 대회`(관리자): 대회명 입력 → `createCup` → 바로 `CupDetail`의 팀 관리로.
3. 완료 대회 목록(접기).
4. **대회 통산(개인 누적)**: 전 대회 개인 득점·어시·출전 라운드·참가 대회 수 상위 표(§7.3).

**`CupDetail`(대회 상세).** 상단 대회명·상태·잠금 표시. 섹션:
1. `오늘 컵 경기 시작`(관리자, `status==='active'`이고 팀 검증 통과일 때) → `onStartGame('cup', { cupId })`. 남은 대진이 0이면 비활성 + "모든 대진 완료".
2. 진행 중 컵 세션이 이 대회 것이면(`pendingGames` 중 `state.tournamentId === cupId`) "이어서 기록" 카드(`onContinueGame`).
3. 팀 순위표(`CupStandingsTable`: `calcCupStandings` 결과를 직접 렌더 — 0경기 팀 포함, 팀명 4번째 정렬).
4. 득점 TOP5·어시스트 TOP5(이 대회).
5. 남은 대진(라운드별) / 경기 결과(날짜별 `팀A a:b 팀B`).
6. **팀 관리**(관리자): 팀 카드(팀명 입력, 팀장 선택, 팀원 칩 목록 + "회원 추가"(멤버 검색 목록)·"이름 추가"(자유 입력)·삭제), `+ 팀 추가`, 팀 삭제, 저장. 잠김이면 §4.5대로 비활성.
7. 하단: `대회 종료`/`다시 열기`(status 토글), `대회 삭제`(잠기지 않은 경우만, confirm. 잠긴 대회는 버튼 비활성 + 이유 표시).

**경기관리 탭 "새 경기"(풋살 분기).** 기존 두 버튼 아래 `🏆 컵대회 경기`(부제 "대회 팀으로 자동 편성 · 남은 대진"). 진행중(`active`) 대회가 0개면 버튼 없음, 1개면 바로 `onStartGame('cup', { cupId })`, 여러 개면 간단한 선택 모달(`CupPickerModal`). 남은 대진이 0인 대회를 골라도 진입은 되며 §6.2 6항의 에러 화면으로 끝난다(2단계는 남은 대진을 모르므로 의도된 동작; 3단계에서 모달이 완주 대회를 회색 처리). 진행 중 컵 세션은 기존 "진행중인 경기" 목록에 🏆 라벨(`pendingGameLabel`)로 나온다.

### 6.2 컵 경기일 시작 (경기 생성 시 팀 자동 로드)

1. `onStartGame('cup', { cupId })` → Root `handleStartNew(mode, params = null)`(기존 진행중 경기 confirm 포함) → `gameId = g_{ts}`, `gameMode='cup'`, `gameParams={ cupId }`. `GameApp`에 `gameParams` prop을 넘긴다(SoccerApp·IntraSoccerApp·TennisApp도 같은 prop을 받지만 쓰지 않는다). `handleContinue`와 `onBackToMenu` 두 곳 모두 `setGameParams(null)`. **Root의 시그니처·state·`<GameApp>` 전달·App의 prop 수신은 한 커밋으로 바꾼다.**
2. App `_loadAllData`에 `else if (gameMode === 'cup')` 분기(기존 `sheetSync` 분기 그대로). 병렬: 시즌 선수 데이터(기존과 동일, 포인트 표시용), `CupSync.loadCup(team, gameParams.cupId)`, `SheetCache.refresh('cupMatchLog', { sport:'풋살' })`(3단계부터; 2단계는 호출 없음).
3. 대회 로드 실패(없음·권한 거부·`validateTeams` 실패·`status!=='active'`) → 에러 화면(원인 문구 + "팀 관리에서 확인" 안내) + "대시보드로". phase는 `setup`에 머물러 자동저장되지 않으므로 RTDB에 흔적이 없다.
4. `refresh` 결과 `ok:false` → 경고 배너("치른 대진을 확인하지 못해 전체 대진을 표시합니다") 후 canonical 전체. `ok:true`면 `collectPlayedPairs(rows, cupId)`(그 대회·`!is_extra` 행만) → §6.3의 남은 라운드.
5. `SET_FIELDS` 한 번으로 `phase:'match'`: `tournamentId=cupId, attendees=전 팀원 합집합, teamCount=N, courtCount=(N<=3?1:2), matchMode='schedule', draftMode='sheet', teams=팀별 players, teamNames=팀명(order 순), teamColorIndices=[0..N-1], gks={}, schedule=남은 라운드, currentRoundIdx=0, viewingRoundIdx=0, completedMatches=[], allEvents=[], confirmedRounds={}, isExtraRound=false, settingsSnapshot=getCupSettings(team)`.
6. 남은 라운드 0 → "모든 대진을 치렀습니다" 에러 화면(세션 미생성).
7. 재진입은 `handleContinue` → `gameMode=null, gameParams=null`. 컵 로드 분기를 타지 않고 RTDB 복원만. 이후 컵 동작은 `isCupSession(state)`.

### 6.3 대진과 남은 라운드

- `generateCupRounds(N, courtCount)`: N=5·2구장은 `generate5Team2Court().slice(0,5)`(5라운드 × 2경기), N=7·2구장은 `generate7Team2Court()`(11라운드, 연속 휴식 최소) — 기존 손수 짠 표가 더 좋다. 그 외는 generic: `generateRoundRobin([0..N-1])`(circle method)의 각 라운드를 `courtCount`개씩 잘라 `{ matches:[[h,a],…] }`로. N=3 → 1구장 3라운드 × 1경기, N=4 → 3라운드 × 2경기, N=6 → 2경기+1경기 라운드 10개, N=8 → 14라운드 × 2경기(검증 완료: 모든 N에서 각 쌍 1회, 라운드 내 팀 중복 없음). 1경기 라운드가 생기는 N의 최적화는 4단계 후보.
- `collectPlayedPairs(rows, cupId)`: `rows.filter(r => r.tournament_id === cupId && !r.is_extra)`의 `{our_team_name, opponent_team_name}`을 정규화(`/^팀 /`→`팀`, trim)·정렬해 `a|b` 키 집합으로. 컵 뷰는 모든 대회 행을 주므로 **cupId 필터는 이 함수 안에서** 한다(동명 팀이 여러 대회에 있어도 섞이지 않는다).
- `calcRemainingRounds(canonical, teamNames, playedPairs)`: 라운드마다 치른 쌍 제거, 0경기 라운드 삭제, 1경기 라운드 유지(`matches` 길이 1 → ScheduleMatchView가 그대로 그린다). 형식은 기존 `schedule`과 동일.
- 그날 몇 라운드를 하든 기존 **조기 종료**로 마감한다. 임시 라운드는 `is_extra=true`라 어디에도 반영되지 않는다.
- 팀 순서(`order`)를 바꿔도 이름 기반이라 치른 대진 판정은 유지된다. 라운드 번호는 그날 기준(1부터).

### 6.4 경기 진행 (변경 없음)

GK 지정, CourtRecorder 골/어시/자책/파울, 라운드 확정, 결석·용병, 경기 중 명단 수정, RTDB 실시간 동기화 모두 기존과 동일. 모든 phase 화면 상단에 `🏆 {tournamentId}` 배너(2단계).

### 6.5 마감 (구현 완료)

`handleFinalize`의 컵 분기. 정규 분기는 한 줄도 바꾸지 않는다(else 구조). 태그는 `logTagsOf(state)`.

| 단계 | 정규 세션 | 컵 세션 |
|---|---|---|
| 전송 | 포인트로그, 선수별집계, 로그_이벤트, 로그_선수경기, 로그_매치 (5) | 로그_이벤트, 로그_선수경기, 로그_매치 (3), `mode='대회'`, `tournament_id=cupId`, PG `rank_score=0` |
| 핵심 실패 판정(legacyOk) | 포인트로그+선수별집계 | 없음 |
| allOk | 로그_* 3종 성공 | 로그_* 3종 성공 |
| 아카이브 | `saveFinalized` | 동일. summary 끝에 ` \| 🏆 {cupId}` |
| 재적재 | `refreshAfterFinalize` 전체 | `refreshDatasets(CUP_FINALIZE_DATASETS)`만 |

컵 세션의 로그_선수경기 행 집합은 정규와 동일하다(팀 배정 참석자 전원). 필터는 세션 순위(sessionRank)로 판정하고 기록되는 rank_score 값만 0이다. 재마감·부분 실패는 정규와 같은 규칙(로그_* 하나라도 실패 → 미확정·재전송 유도).

2단계 추가(컵 분기 안에서만): `allOk`일 때 `CupSync.markLocked(team, state.tournamentId)`를 호출한다(실패는 `console.warn`으로만 — 마감 성공을 되돌리지 않는다; 3단계의 로그 파생 잠금이 보완한다). 정규 분기는 여전히 손대지 않는다.

## 7. 계산 규칙

### 7.1 대회별 팀 순위 `calcCupStandings(rows, teamNames)`

- 입력: 그 대회의 `cupMatchLog` 행(경기당 1행: `our_team_name`=홈, `opponent_team_name`=원정), `is_extra` 제외. 팀 집합 = 엔티티 팀명 ∪ 행에 등장한 팀(0경기 팀도 표시).
- 승 3·무 1·패 0, 정렬 승점 → 득실차 → 다득점 → 팀명. 출력 `{ name, games, wins, draws, losses, gf, ga, points }`. 화면(`CupStandingsTable`)은 이 결과를 직접 표로 그린다. `TournamentStandings`는 쓰지 않는다(§2).

### 7.2 대회별 개인 순위

`dropExtraEvents(matchRows, eventRows)`로 임시 라운드 이벤트를 걷어낸 뒤 `analyticsV2/calcPlayerSummary({ matchLogs, eventLogs, playerGameLogs })`(그 대회 행만)로 `goals`·`assists` TOP5. analyticsV2는 수정하지 않는다.

### 7.3 대회 통산(개인 누적) `calcCupCareer(allCupRows)`

입력은 모든 컵 뷰 행(`tournament_id` 있음). 선수별로 `cups`(출전한 `tournament_id` 종류 수 — 로그_선수경기 행 기준), `rounds`(출전 라운드, `calcPlayerSummary`의 rounds), `goals`, `assists`, `wins`(우승 대회 수). 우승 대회 W(완주 대회의 순위표 1위 팀 이름)에 대해 우승 선수 = 그 대회 로그_선수경기 행 중 `session_team === W`인 `player` 집합(로그_선수경기의 `session_team`은 마감 시 그 선수의 팀명이다 — `buildRawPlayerGamesFromFutsal`). `our_members_json`만 보면 원정 경기 선수가 빠지므로 쓰지 않는다. 정렬 골 → 어시 → 이름. `is_extra` 제외 규칙 동일. 테스트 fixture에 우승팀이 원정으로만 뛴 선수 케이스를 포함한다.

### 7.4 진행도·우승·상태

- 진행도 = `playedPairs.size / (N·(N−1)/2)`.
- 완주(`complete`) = 진행도 100%. 우승팀 = 완주 대회의 순위표 1위(동률이면 정렬 규칙대로).
- `status`는 관리자 토글일 뿐 집계에 영향이 없다. 목록에서 `finished`는 접힌다.

## 8. UI 변경 목록

| 위치 | 변경 |
|---|---|
| `mainTabs.js` | 풋살에도 `tournament`("대회") 탭 |
| `TeamDashboard.jsx` | `tournament` 탭에서 종목 분기(축구=기존, 풋살=`CupListTab`; `mainTabs.js`와 한 커밋), 경기관리 새 경기 영역에 `🏆 컵대회 경기`(활성 대회 0/1/n 처리), `CupListTab`에 `teamName`·`members`·`pendingGames`·`onStartGame`·`onContinueGame`·`isAdmin`·`authUserName`만 전달(`onTournamentView` 계열 미전달) |
| `components/cup/CupListTab.jsx` (신규) | §6.1 목록·생성·완료·통산 |
| `components/cup/CupDetail.jsx` (신규) | §6.1 상세(시작·이어서·순위·TOP·대진·결과·상태·삭제·잠금 표시) |
| `components/cup/CupStandingsTable.jsx` (신규) | §7.1 순위표 직접 렌더 |
| `components/cup/CupTeamEditor.jsx` (신규) | §4.5 팀 관리(잠금 반영) |
| `components/cup/CupPickerModal.jsx` (신규) | 경기관리 버튼에서 활성 대회 여러 개일 때 선택 |
| `App.jsx` | 컵 로드 분기(`gameParams.cupId`), 에러 화면, 🏆 배너 |
| `Root.jsx` | `handleStartNew(mode, params = null)`, `gameParams` state, `<GameApp gameParams>` 전달, `handleContinue`·`onBackToMenu`에서 `setGameParams(null)` |
| `HistoryView.jsx` | summary 6번째 파트(🏆) 표시(4단계) |
| `pendingGameLabel.js` | `isCupSession(gs)`면 `🏆 ` 접두 |
| `App.jsx` 컵 마감 분기 | `allOk` 시 `CupSync.markLocked` 호출(2단계) |

## 9. 파일별 변경 범위 (2단계 이후)

| 파일 | 변경 |
|---|---|
| `src/services/cupSync.js` (신규) | §4.2 CRUD(`listCups`·`loadCup`·`createCup`·`saveTeams`·`setStatus`·`markLocked`·`deleteCup`), firebase SDK 직접 사용, 실패는 throw |
| `src/utils/cup/cupEntity.js` (신규) | `normalizeCup(cupId, raw)`(순수), `validateTeams`, `nextTeamId(teams)`, `isLocked(cup, playedPairs)`, `cupIdOf(name)`(= `rtdbPath.safeKey(name.trim())`, `|`면 throw) |
| `src/utils/cup/cupSchedule.js` (신규) | `generateCupRounds`, `pairKey`, `collectPlayedPairs`, `calcRemainingRounds` |
| `src/utils/cup/calcCupStandings.js`, `dropExtraEvents.js`, `calcCupCareer.js` (신규) | §7 |
| `src/config/settings.js` | `getCupSettings(team)`만 추가(설정 키 없음) |
| `src/services/sheetCache.js` | 3단계: 별도 `ALIASES` 레지스트리 + `resolveAdapter`/`_pathFor` + cup 뷰 3종(`!!row.tournament_id`) + `_aliasesForTest`. `ADAPTERS`·`datasetsOf` 불변 |
| `src/Root.jsx`, `src/App.jsx`, `src/components/dashboard/mainTabs.js`, `TeamDashboard.jsx`, `components/cup/*`, `utils/pendingGameLabel.js`, `history/HistoryView.jsx` | §8 |
| `src/components/dashboard/__tests__/mainTabs.test.js` | 풋살 케이스에 `tournament` 추가 |
| `src/utils/brackets.js` | 변경 없음(`generateRoundRobin`·`generate5Team2Court`·`generate7Team2Court` 재사용) |
| `src/components/tournament/*`, `src/utils/intraSoccer/*`, `src/utils/analyticsV2/*`, `soccerAnalytics/*` | 변경 없음 |
| `apps-script/Code.js` | 변경 없음 |
| Firebase 규칙 | `tournaments` 최상위 경로 허용 확인/추가(콘솔, 2단계 전제) |

## 10. 불변식과 회귀 가드

1~4, 8~10은 1단계로 고정됐다(정규 마감 무수정, 정규 뷰 필터, `tournamentId` 동기화 5지점, 빌더 기본값, 직접 읽기 화이트리스트, 복구·재기록 태그, 재적재 상수).
5. `generateCupRounds(N, c)`는 N∈[3,8]에서 각 쌍 정확히 1회, 라운드 내 팀 중복 없음, 라운드당 경기 수 ≤ c, N=5→5라운드·N=7→11라운드(테스트). `collectPlayedPairs`는 다른 대회의 같은 팀명 쌍을 세지 않는다(테스트). `calcRemainingRounds`는 치른 쌍·임시 라운드·1경기 라운드·이름 정규화·빈 입력을 다룬다(테스트).
6. `calcCupStandings` 정렬(팀명 4번째)·0경기 팀 포함(테스트). `dropExtraEvents`(테스트). `calcCupCareer`의 cups/wins 계산(테스트: 두 대회 fixture, 우승팀 원정 전용 선수 포함).
7. `mainTabs`: 테니스에 `tournament` 탭 없음, 축구·풋살에 있음(테스트). 풋살 `tournament` 탭은 `CupListTab`로 분기(정적 가드 또는 렌더 테스트).
11. `normalizeCup`: `players` 누락 → `[]`, `teams` 객체 → `order` 순 배열(`id`=키), `lockedAt ?? null`, `sport`가 풋살이 아닌 자식은 목록에서 제외(테스트). `validateTeams` 각 규칙(캡틴 소속 포함)(테스트). `nextTeamId`가 현재 최대+1을 주고 중간 빈 번호를 재사용하지 않는다(테스트). `isLocked`: `lockedAt`만으로도, 로그만으로도 잠김(테스트). `cupIdOf`가 `safeKey`에 위임하고 `|`를 거부(테스트).
12. cup 뷰 3종은 `!!row.tournament_id` 행만, 정규 뷰와 합집합이 전체(테스트). alias는 `ALIASES`에만 있고 `ADAPTERS`·`datasetsOf('풋살')`은 불변(기존 커버리지 테스트 그대로 통과), `_pathFor` 원본 경로, `refreshAll` 후 원본 L2 전체 행, 같은 경로를 공유하는 두 어댑터의 in-flight 합류가 각자 필터(테스트).
13. App.jsx·Root.jsx·TeamDashboard·cup 컴포넌트는 렌더 하네스가 없다 — 정적 가드(Root의 `gameParams` state·`<GameApp gameParams>`, App의 `gameMode==='cup'` 분기에서 `gameParams.cupId` 사용, TeamDashboard의 `isSoccer ? TournamentListTab : CupListTab` 분기) + 브라우저 스모크: 대회 생성 → 팀 3개 구성 → 저장 → 컵 경기 시작 → 골 1개 → 라운드 확정 → 조기 종료 → 마감 → 탭 새로고침 후 🏆 복원 → 대회 상세에서 잠금 표시·(3단계) 순위·남은 대진 확인 → 정규 분석탭 불변 확인 → **하버FC 계정으로 대회 탭이 기존 축구 목록 그대로인지 확인**. RTDB 규칙 거부 시 alert가 뜨는지 확인.

## 11. 구현 순서

### 1단계 — 격리 게이트 (완료, main 0e015ef)

### 2단계 — 대회·팀 관리 + 컵 경기일 진입 (1일차 가능)

- **전제:** Firebase 콘솔에서 `tournaments` 규칙 확인/추가 — `tournaments/{팀}` 수준의 `.read`(목록은 팀 노드 전체를 읽는다)와 `{cupId}/meta`·`{cupId}/teams` `.write`가 모두 허용돼야 한다. 기존 규칙이 `…/cache`·`…/activeGame` 하위만 열려 있다면 `tournaments` 최상위로 넓힌다.
- `cupEntity.js`(normalize/validate/isLocked/cupIdOf), `cupSync.js`, `getCupSettings`, `generateCupRounds`(치른 대진 제외는 3단계, 이 단계에서는 canonical 전체·`refresh` 호출 없음).
- `mainTabs` 풋살 `tournament` 탭, `TeamDashboard` 분기, `CupListTab`(목록·생성·완료 접기, 통산은 3단계), `CupDetail`(시작·이어서·팀 관리·상태·삭제; 순위·TOP·대진·결과는 3단계), `CupTeamEditor`, `CupPickerModal`, 경기관리 `🏆 컵대회 경기` 버튼, Root `gameParams`, App 로드 분기·에러 화면·배너, `pendingGameLabel`.
- 잠금은 `meta.lockedAt`(컵 마감 시 `markLocked`)로 판정 — 2단계에서도 첫 마감 후 팀명·팀 수·삭제가 실제로 잠긴다. 3단계에서 로그 파생을 OR로 더한다.
- 원자 커밋 두 묶음: (a) `mainTabs.js` + `TeamDashboard.jsx` 분기, (b) `Root.jsx`(시그니처·state·`<GameApp>`) + `App.jsx`(prop 수신). `mainTabs.test.js` 풋살 케이스 갱신.
- 테스트: 불변식 5(canonical)·7·11·13(정적 가드). 브라우저 스모크(RTDB 규칙 거부 alert, 하버FC 대회 탭 불변 포함).

### 3단계 — 대회별 기록·남은 대진·통산 (2일차 전)

- sheetCache `ALIASES`/`resolveAdapter`/`_pathFor` + cup 뷰 3종, `collectPlayedPairs(rows, cupId)`·`calcRemainingRounds`, App 로드에서 `refresh('cupMatchLog')` + 남은 라운드, `calcCupStandings`+`CupStandingsTable`·`dropExtraEvents`·`calcCupCareer`, `CupDetail` 순위·TOP·대진·결과·우승·진행도, `CupListTab` 통산·우승팀, `CupPickerModal` 완주 대회 회색 처리, `isLocked`에 로그 파생 OR, 같은 경로 두 어댑터 in-flight 테스트.
- 테스트: 불변식 5(남은 라운드)·6·12.

### 4단계 — 마무리 (선택)

- HistoryView 🏆 표시, 문서(`TEAM_ONBOARDING.md`) 갱신, 6팀 이상 대진의 1경기 라운드 최적화, 선택 강화(Apps Script `tournamentId` 스코프 파라미터 — 별도 승인).

## 12. 운영 절차

사전(1회): Firebase 콘솔 RTDB 규칙에 `tournaments` 최상위 읽기/쓰기 허용 확인(`tournaments/{팀}` 수준 `.read` 포함). 2단계 배포 후 "대회" 탭에서 `+ 새 대회` → 대회명(연도 포함 권장, 이후 변경 불가) → 팀 추가·팀명·팀원(회원 선택/이름 입력)·팀장 → 저장.

경기일: 경기관리 탭 `🏆 컵대회 경기`(또는 대회 상세의 시작 버튼) → 팀·남은 대진이 채워진 경기 화면(🏆 배너 확인) → 결석은 휴식, 게스트는 용병 → 계획한 라운드까지 확정 → 조기 종료 → 기록확정(관리자) → 대회 상세에서 순위·남은 대진 확인.

하지 말 것: 컵 경기를 "자동설정/커스텀" 버튼으로 열지 않는다(정규 마감으로 흘러가 포인트 로그가 오염된다; 앱은 막지 않는다). 컵 경기일에 정규 세션을 열지 않는다(운영 혼선). 잠긴 대회(첫 마감 이후)의 팀명·팀 수 변경과 삭제는 앱이 막는다 — 마감 직후 `markLocked`가 실패한 드문 경우(콘솔 경고)에는 3단계 배포 전까지 수동으로 준수한다. 로그가 있는 대회를 삭제하면 로그 행은 남고 화면에서만 사라진다(삭제는 잠기지 않은 대회에만 허용되는 이유).

## 13. 리스크와 미확인 사항

| 항목 | 영향 | 대응 |
|---|---|---|
| `tournaments` RTDB 규칙 부재 | 대회 생성·저장이 권한 거부 | 배포 전제로 콘솔 확인. 쓰기 실패는 alert로 즉시 노출(조용한 실패 금지) |
| 동시 편집 | 두 관리자가 같은 대회 팀을 동시에 저장하면 마지막 저장이 이김 | 드문 작업, 편집 화면 열 때 재로드. 협업 편집은 비목표 |
| `markLocked` 실패(권한·네트워크) 후 팀명 변경 | 순위표·치른 대진이 갈라짐 | 마감 알림에 경고 표시, 3단계 로그 파생 잠금이 보완. 갈라진 경우 시트에서 구 팀명 행을 직접 고치는 수동 복구 |
| 로그가 있는 대회를 삭제 | 로그 행이 화면에서 고아가 됨 | `lockedAt`이 있으면 삭제 불가 |
| 6팀 이상 대진의 1경기 라운드 | 그날 라운드 수가 늘어남 | 4단계 최적화 후보 |
| 회원 목록 소스가 대시보드 시트 | "시트 의존 최소화"와 부분 상충 | 회원 명단 자체는 이미 앱 전역이 시트에서 읽는다. 자유 입력이 있어 시트가 비어도 대회 운영 가능 |
| 나란한 세 버튼 중 정규 버튼으로 컵을 여는 실수 | 포인트 로그 오염(수동 삭제) | 컵 버튼 색·아이콘 구분, confirm 문구, 배너 부재 |
| 오래된 빌드 기기 | 새로고침 전 정규 분석에 컵 행 노출 | 4단계 서버 파라미터로 봉합 가능 |

## 14. 결정 기록

- 세션 재사용(경로 A/C) vs 대회 엔티티(경로 B): 초안은 세션 재사용 + 시트 명단. **v2(2026-09-17)에서 사용자 요구로 대회·팀 관리를 앱(RTDB)으로 옮겨 경로 B의 엔티티를 채택**하되, 기록 저장·격리(1단계)는 그대로 유지. 시트는 로그 저장소로만.
- 서버 필터 선배포 대신 클라이언트 필터: §5.
- 아카이브 포함, 컵 규칙 프리셋 없음: 유지.
- 하버FC 대회 탭: 탭 정체성·순위표 컴포넌트만 재사용, 저장·기록 모델 불사용(§2).
- 팀 수 가변(3~8), 잠금(첫 마감 후 팀명·팀 수·삭제; 대회명은 항상 불변), 팀원=회원 선택+자유 입력, 통산=개인만: 2026-09-17 사용자 확정.
- v2 적대적 리뷰 반영(2026-09-17): 2단계 잠금을 `meta.lockedAt`(컵 마감 시 기록)으로 실제화(로그 파생은 3단계 OR); 우승 선수는 로그_선수경기 `session_team`으로(원정 경기 누락 방지); `TournamentStandings` 재사용 철회(0경기 팀·팀명 정렬 불가) → `CupStandingsTable`; alias는 별도 `ALIASES` 레지스트리(기존 커버리지 테스트 보존); `collectPlayedPairs(rows, cupId)` 필터 내장; `getCupSettings`는 `getEffectiveSettings` 경유(하이드레이션); 팀 id 부여 규칙·캡틴 소속 규칙; 원자 커밋 묶음(탭/대시보드, Root/App); `mainTabs.test.js` 갱신; 하버FC 대회 탭 스모크; N=5·7은 손수 짠 표 우선.
- 적대적 리뷰 반영(2026-09-16, 1단계): 재기록 도구 태그 단일화(`logTagsOf`), `dropExtraEvents`, in-flight 필터 전 값 공유, `gameState` 화이트리스트(다섯 번째 지점), PG 행 집합 유지(sessionRank).
