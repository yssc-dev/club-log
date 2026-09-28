# 마스터스컵 3단계 — 대회 순위표·개인기록 설계

- 작성일: 2026-09-26
- 상태: 구현 완료(feat/cup-s3-records, 2026-09-26). 배포·스모크는 상위 문서 §12 절차.
- 상위 문서: `2026-09-16-masters-cup-design.md`(v2.1). 이 문서는 그 §7(계산 규칙)·§4.6(alias 뷰)·§11 3단계를 **대체**한다. 나머지(엔티티·마법사·마감·격리)는 상위 문서 그대로.
- 대상 팀: 마스터FC(풋살). 하버FC·빅마스터FC(축구)·몽피스(테니스)에는 어떤 동작 변화도 없어야 한다.

## 1. 개요

2026년 10월 한 달(10/1·8·15·22·29, 5개 경기일)에 4팀이 2구장에서 회전 3~4회 풀리그를 도는 마스터스컵의 **누적 순위표·개인기록·경기일별 결과**를 대회 상세 화면에 보여준다. 대회 마지막 날 이 순위표로 시상한다.

포인트 방식은 정규 세션과 다르다.

| 항목 | 정규 세션(마스터FC) | 컵 |
|---|---|---|
| 크로바/고구마 | 있음 | **없음**(구현 완료 — 컵 규칙 스냅샷이 표준값) |
| 팀 순위 | 세션 단위 승점·득실 | **대회 누적**: 승점(3/1/0) + 가점(참석·다득점) → 골득실. **무실점 팀 가점은 없음(2026-09-28 폐지) — 클린시트는 키퍼 개인기록만** |
| 개인 | 포인트 로그·★ 랭킹 | 골·어시·클린시트·자책골·참석횟수(포인트 환산 없음) |

당일 경기 화면(세션 순위 탭·마감)은 손대지 않는다. "그날의 기록"은 세션·아카이브가, "대회 누적"은 대회 상세가 맡고, 대회 상세 안에 경기일별 내역 섹션을 두어 둘을 한 화면에서 따로 본다.

### 1.1 사용자 확정 사항 (2026-09-26)

| 항목 | 결정 |
|---|---|
| 구현 방향 | **A. 시트 로그 파생 계산.** 저장 필드·마감·Apps Script 변경 없음. 대회 상세가 로그_매치·로그_이벤트의 컵 행을 읽어 그 자리에서 계산 |
| 참석 가점 단위 | **경기일당 1회**, 팀별. **구간제(2026-09-28 추가): 등록 팀원 참석 7~9명 +1, 10명 이상 +3(전원 참석 기준이 10명). 누적 아님** |
| 참석 인원 정의 | **대회 등록 팀원만.** 당일 추가 용병은 세지 않는다. 등록 팀원이 그날 다른 팀 명단으로 뛰어도(용병 이동) **원소속 팀**에 센다. 옮겨간 팀에는 세지 않는다 |
| 당일 화면 | 변경 없음(가점 표시 안 함) |
| 전 대회 개인 통산(상위 §7.3) | **이번 범위 밖**(보류) |

### 1.2 비목표

전 대회 개인 통산, 시상 자동 선정(득점왕 등 배지), 당일 세션 화면의 가점 표시, 로그_선수경기 alias 뷰, Apps Script 변경, analyticsV2 수정, 대회 목록 카드에 순위 노출, 순위표 정렬 토글, 마감 시 RTDB 집계 스냅샷.

## 2. 용어

- **경기일**: 로그_매치 `date` 값 하나. 같은 날짜에 세션(`game_id`)이 둘 이상이어도 한 경기일로 본다.
- **경기(행)**: 로그_매치 1행 = 경기 1건. `our_team_name`=홈, `opponent_team_name`=원정, `our_score`/`opponent_score`, `our_gk`/`opponent_gk`, `our_members_json`/`opponent_members_json`(그 경기 그 팀 명단, 휴식 포함).
- **경기 키**: `${date}|${game_id}|${normalizeMatchId(match_id,'풋살')}`. 로그_이벤트 행도 같은 세 열을 가지므로 경기와 이벤트를 잇는 키다(이벤트 쪽 `match_id`는 이미 표준형이고, 로그_매치 쪽은 세션 원값이라 양쪽 다 정규화해 비교한다).
- **임시 라운드**: `is_extra`가 참인 행. 값은 boolean `true` 또는 문자열 `'TRUE'`(시트 경유)일 수 있어 `isExtraRow(row)`가 둘 다 참으로 본다.
- **등록 팀원**: 대회 엔티티 `teams[i].players`(열람 시점). 이름 비교는 양쪽 모두 `cleanPlayerName`(장식 제거+trim) 후. 팀명 비교는 양쪽 모두 `normalizeTeamName`(`cupEntity.js`, `/^팀 /`→`팀` + trim) 후.
- **그날 참석자 전체** `dayAttendees(date)`: 그 경기일의 모든 (임시 라운드 제외) 행의 홈·원정 명단(`players`, 휴식 포함) 합집합.
- **팀의 그날 명단** `teamDayList(date, team)`: 그 팀이 홈 또는 원정으로 나온 행들의 그 팀 쪽 명단 합집합.

## 3. 계산 규칙 (`src/utils/cup/cupRecords.js`, 순수 함수)

### 3.1 입력 선별 `selectCupRows({ matchRows, eventRows, cupId })`

1. `matchRows`에서 `tournament_id === cupId`인 행만 남긴다.
2. 그중 `isExtraRow`인 행의 경기 키를 `extraKeys`에 모으고, 그 행들은 버린다.
3. `eventRows`에서 `tournament_id === cupId`이고 경기 키가 `extraKeys`에 **없는** 행만 남긴다. (로그_매치에 짝이 없는 이벤트 행은 버리지 않는다 — 부분 실패 재전송 중인 날의 골이 사라지면 안 된다.)
4. 반환 `{ matchRows, eventRows }`. 골/자책 이벤트는 어떤 키로도 중복 제거하지 않는다(프로젝트 규칙).

### 3.2 팀 순위표 `calcCupStandings({ matchRows, cup })`

`matchRows`는 3.1을 거친 것. `cup`은 엔티티(팀명·players).

**경기 단위** — 행마다 홈·원정 각각:
- `games+1`, 득점·실점 누적, 승/무/패 판정 → 승점 승 3·무 1·패 0.
- 다득점 가점: 이긴 팀의 득점 − 실점 ≥ 3 → 이긴 팀 `bonusMargin+1`.
- ~~무실점 가점~~ 2026-09-28 폐지(사용자 확정). 팀 순위·경기일별 내역에 무실점 항목이 없다(`bonusClean`·`clean` 필드 제거). 키퍼 클린시트는 §3.3 개인기록에만 남는다.

**경기일 단위** — 경기일마다 등록 팀 각각:
- `present(date, T)` = `T.players` ∩ `dayAttendees(date)` 의 크기. 그날 어느 팀 명단에 있든 등록 팀원이면 원소속 팀에 센다.
- 구간제 `attendBonusOf(present)`: `present ≥ 10` → +3, `7 ≤ present ≤ 9` → +1, 그 외 0 (`ATTEND_BONUS_TIERS`, 위 구간부터 검사, 누적 아님). 그날 값을 `bonusAttend`에 더한다(경기일당 최대 3). 그날 경기를 뛰지 않은 등록 팀도 `present`로만 판정한다(등록 팀원 7명이 왔는데 팀이 경기하지 않는 경우는 실무상 없다 — 조건을 더 얹지 않는다).
- 등록 팀이 아닌 팀명(행에만 있는 이름)은 참석 가점을 받지 않는다(등록 팀원이 정의되지 않는다).

**합계·정렬**
- `bonus = bonusAttend + bonusMargin`, `total = points + bonus`.
- 정렬: `total` 내림 → 골득실(`gd = gf − ga`) 내림 → `gf` 내림 → 팀명 `localeCompare('ko')` 오름.
- 팀 집합 = 등록 팀 ∪ 행에 등장한 팀명. 0경기 팀도 행으로 나온다(전부 0).

**출력**
```
{
  standings: [{ name, registered: boolean, games, wins, draws, losses, gf, ga, gd,
                points, bonusAttend, bonusMargin, bonus, total }],   // 정렬됨
  days: [{                                                                  // date 오름차순
    date,
    matches: [{ key, matchId, home, away, homeScore, awayScore,
                homeBonus: { margin: 0|1 }, awayBonus: { margin } }],  // game_id → match_idx 오름(같은 날짜 두 세션은 세션별로 묶임)
    teams: { [teamName]: { registered, present, guests: string[], bonusAttend: 0|1|3, points, bonusMargin } }
           // 키 = 등록 팀 ∪ 그날 행에 등장한 팀. 미등록 팀은 present 0·guests [] 로 둔다
  }]
}
```
`days[].teams[T].guests` = `teamDayList(date, T)` − `T.players`(그 팀 명단으로 뛴 비등록 인원; 다른 팀 등록 팀원이 옮겨온 경우 포함). 표시용이며 어떤 점수에도 쓰지 않는다.

**예시(사용자 제시)**: A팀 등록 팀원 서라현이 그날 B팀 명단으로 뛰었다. A의 `present`에는 서라현이 들어가고, B의 `present`에는 들어가지 않으며 B의 `guests`에 나타난다. A가 서라현 포함 7명 이상이면 A +1, B가 등록 팀원 6명이면 B는 0.

### 3.3 개인기록 `calcCupPlayerRecords({ matchRows, eventRows, cup })`

입력은 3.1을 거친 것.
- 골: `event_type === 'goal'`의 `player` +1. 어시: 같은 행의 `related_player`가 비어 있지 않으면 +1.
- 자책골: `event_type === 'owngoal'`의 `player` +1.
- 클린시트: 로그_매치 행에서 `our_gk`가 비어 있지 않고 `opponent_score === 0`이면 `our_gk` +1, `opponent_gk`가 비어 있지 않고 `our_score === 0`이면 `opponent_gk` +1. **경기(라운드) 단위**, 당일 세션 화면(`App.jsx` `playerMatchStats`)과 같은 정의.
- 참석횟수: 선수가 어느 팀 명단에든(휴식 포함) 등장한 **날짜의 수**.
- 대상 = 등록 팀원 전원 ∪ 로그(명단·이벤트)에 등장한 이름. `team` = 등록 팀명, 등록되지 않은 이름은 `team: ''`, `guest: true`.
- 정렬: 골 내림 → 어시 내림 → 클린시트 내림 → 이름 오름.
- 출력 `[{ name, team, guest, goals, assists, cleanSheets, ownGoals, days }]`.

### 3.4 잠금 파생 `collectPlayedPairs(matchRows, cupId)`

`tournament_id === cupId`이고 임시 라운드가 아닌 행의 `{홈, 원정}` 정렬 쌍 `"A|B"` 집합. `isLocked(cup, playedPairs)`(기존 시그니처)에 넘긴다 — `lockedAt` 기록이 실패한 대회도 로그가 있으면 잠긴다(상위 §4.5 예정분).

## 4. 데이터 흐름

### 4.1 시트 캐시 alias 뷰 (`src/services/sheetCache.js`)

상위 §4.6 계약을 그대로 구현하되 범위를 2종으로 줄인다.

```
const ALIASES = {
  '풋살': {
    cupMatchLog: { alias: 'matchLog', rowFilter: isCupRow },   // isCupRow = row => !!row?.tournament_id
    cupEventLog: { alias: 'eventLog', rowFilter: isCupRow },
  },
};
```
- `_resolve(sport, dataset) → { adapter, sourceDataset } | null`. alias면 `adapter = { ...원본, rowFilter: alias.rowFilter }`, `sourceDataset = alias.alias`. 아니면 원본 그대로.
- `get`·`refresh`는 `_resolve`를 쓰고 경로는 항상 `_pathFor(adapter, team, sport, sourceDataset)`. alias 전용 RTDB 노드는 생기지 않는다.
- in-flight 공유 Promise는 필터 전 값으로 resolve하고 각 호출자가 자기 `adapter.rowFilter`로 거른다(구현 완료 구조 유지). 정규 `matchLog`와 `cupMatchLog`를 동시에 부르면 같은 L3 조회 하나를 공유하고 각자 반대 필터를 받는다.
- `datasetsOf`는 `ADAPTERS` 키만 돌려준다(alias 제외) → `refreshAll`·`status`·마감 재적재·기존 커버리지 테스트("풋살 7종") 불변.
- `_aliasesForTest()` 추가. `cupPlayerGameLog`는 만들지 않는다.

### 4.2 대회 상세 읽기

`CupDetail`이 `cup.meta.id`가 바뀔 때마다 `SheetCache.get('cupMatchLog', { sport: '풋살' })`·`SheetCache.get('cupEventLog', { sport: '풋살' })`를 `Promise.all`로 읽는다. `sport`는 반드시 명시(`AuthUtil.mode`는 화면 종목 토글을 따라오지 않는다). 이펙트 cleanup 의 alive 플래그로 늦은 응답을 폐기(`CupListTab.reload`의 세대 카운터와 같은 목적). 상태 `{ status: 'loading'|'ok'|'error', matchRows, eventRows }`.

컵 마감은 이미 원본 3종(`CUP_FINALIZE_DATASETS`)을 재적재하므로 마감 직후 대회 탭을 열면 최신 행이 보인다. 대회 상세는 별도 재적재를 하지 않는다.

계산은 `useMemo`: `selectCupRows` → `calcCupStandings`·`calcCupPlayerRecords`·`collectPlayedPairs`. 잠금은 `isLocked(cup, playedPairs)`.

## 5. 화면 (`CupDetail` 확장)

섹션 순서: 헤더 → 진행 중 세션 카드 → 시작 버튼 → **순위표 → 개인기록 → 경기일별 결과** → 팀 관리 → 종료/삭제.

- 헤더 부제 "N팀 · 풀리그 1회전" → "N팀 · 경기일별 풀리그".
- **순위표(누적)** `CupStandingsTable`: 열 = 순위·팀·경기·승·무·패·득실·승점·가점·합계. 가점 셀 아래 작은 글씨 "참석 n · 다득점 n". 1위 행 강조. `cup.meta.status === 'finished'`면 1위에 "🏆 우승". 등록되지 않은 팀명(`registered:false`)은 팀명 옆 "(미등록)". 행이 0개(경기 없음)면 표 대신 "아직 마감된 경기가 없습니다".
- **개인기록** `CupPlayerRecordsTable`: 열 = 선수·팀·골·어시·클린시트·자책·참석. 전원 표시, `guest`면 팀 칸에 "용병". 경기가 없으면 섹션 자체를 숨긴다.
- **경기일별 결과** `CupDayResults`: 날짜 내림차순 접이식 카드(최신만 기본 펼침). 펼치면 (1) 경기 목록 "A팀 3 : 0 B팀" + 배지 `+1 다득점`(해당 팀 쪽에), (2) 팀별 한 줄 "A팀 등록 7명 참석 ✓ +1"(10명 이상이면 "✓ +3"), "B팀 등록 6명 + 용병 1명(서라현) ✗".
- 로딩 "기록 불러오는 중…", 실패 "기록을 불러오지 못했습니다" + "다시 시도" 버튼. 팀 관리·시작·종료는 기록 로딩 상태와 무관하게 동작한다(잠금만 `lockedAt` OR 로그 파생).
- `CupTeamEditor` 잠금 안내 문구에 "팀원을 빼면 지난 경기일 참석 가점이 바뀔 수 있습니다"를 덧붙인다.
- 스타일은 `CupDetail`의 `section`/`card`/`title` 토큰과 `useTheme().C`를 재사용. 표는 `overflow-x:auto` 컨테이너 안.

## 6. 파일별 변경 범위

| 파일 | 변경 |
|---|---|
| `src/utils/cup/cupRecords.js` (신규) | `isExtraRow`, `matchKeyOf`, `selectCupRows`, `calcCupStandings`, `calcCupPlayerRecords`, `collectPlayedPairs`. React·Firebase 의존 없음 |
| `src/services/sheetCache.js` | `ALIASES`, `_resolve`, `get`/`refresh` 경로를 `sourceDataset`으로, `_aliasesForTest` |
| `src/components/cup/CupStandingsTable.jsx` / `CupPlayerRecordsTable.jsx` / `CupDayResults.jsx` (신규) | 표시 전용, props로 계산 결과만 받는다 |
| `src/components/cup/CupDetail.jsx` | 두 뷰 읽기·계산·세 섹션·잠금 OR·부제 문구 |
| `src/components/cup/CupTeamEditor.jsx` | 잠금 안내 한 줄 |
| `docs/superpowers/specs/2026-09-16-masters-cup-design.md` | §7·§4.6·§11 3단계를 이 문서로 위임(한 줄씩), §1.2 순위 규칙 문장 갱신 |

수정 금지: `src/App.jsx`, `apps-script/`, `src/utils/analyticsV2/`, `src/services/cupSync.js`, `src/utils/cup/cupEntity.js`(`isLocked` 시그니처 그대로 사용), 축구·테니스 경로 전부.

## 7. 테스트

**`src/utils/__tests__/cupRecords.test.js`** (fixture는 로그_매치·로그_이벤트 열 이름 그대로)
- 무실점 팀 가점 없음: 0:0 양 팀 합계 1 / 2:0 이긴 팀 3 / `bonusClean`·`clean` 필드 부재.
- 다득점: 3:0 → +1 / 4:1 → +1 / 2:0·3:1 → 없음.
- 참석 경계: 등록 6명 참석 → 0, 7명 → +1, 9명 → +1, 10명 → +3(누적 아님), 두 경기일 10명+7명 → 4, 두 세션(`game_id` 둘)이 같은 날짜여도 경기일당 1회.
- 용병 이동(서라현 예시): A 등록 팀원이 B 명단으로 뛰면 A `present`에 포함·B `present`에 미포함·B `guests`에 포함. A 7명(서라현 포함) → A +1, B 등록 6명 → 0.
- 휴식 라운드(`{players, absent}` 형식) 선수도 참석으로 센다.
- 두 경기일 합산, 같은 조합 재대결 합산.
- 정렬: 합계 동률 → 골득실 → 다득점 → 팀명. 0경기 등록 팀이 마지막에 전부 0으로 나온다. 미등록 팀명은 `registered:false`이고 참석 가점 0.
- 임시 라운드 제외: 그 경기의 골 이벤트도 개인기록에서 빠진다. 로그_매치에 짝이 없는 이벤트는 남는다.
- 개인: 원정 명단·원정 GK로만 뛴 선수의 참석·클린시트 / 어시 없는 골 / 자책골 / 참석횟수는 라운드 수가 아닌 날짜 수 / 등록 안 된 이름은 `guest:true` / 이름 장식(`★`)·공백 정규화 일치.
- `collectPlayedPairs`: 임시 라운드 제외, 다른 대회 행 제외, 홈·원정 순서 무관 동일 키.

**`src/services/__tests__/sheetCache.alias.test.js`**
- `datasetsOf('풋살')`에 alias 없음(기존 7종 그대로).
- `cupMatchLog`와 `matchLog`가 같은 캐시 경로를 쓴다(alias 전용 노드 없음).
- 정규 뷰 ∪ 컵 뷰 = 전체 행, 교집합 없음(L3 폴백·L1 히트 둘 다).
- 같은 경로 in-flight 공유: 두 뷰를 동시에 부르면 L3 조회 1회, 각자 자기 필터 결과.
- `refresh('cupMatchLog')`는 원본 경로를 재적재하고 컵 행만 돌려준다.

**`src/components/cup/__tests__/CupDetail.render.test.jsx`** (createRoot+act 하네스, cupSync·sheetCache 목)
- 행이 있으면 순위표·개인기록·경기일별 카드가 렌더되고 1위 팀명이 첫 행.
- 행이 없으면 "아직 마감된 경기가 없습니다", 개인기록 섹션 없음.
- 캐시 실패 → 실패 문구 + 다시 시도 버튼, 팀 관리 버튼은 여전히 동작.
- 로그 행만 있고 `lockedAt`이 없어도 🔒 잠김 표시.

**정적 가드(`cupWiring.guard.test.js` 확장)**: `CupDetail.jsx`의 `SheetCache.get(` 호출은 모두 `sport: '풋살'`을 명시한다.

## 8. 불변식

1. 정규 풋살 뷰(`matchLog`/`eventLog`)의 반환은 이 변경 전후로 동일하다(alias는 원본 필터를 바꾸지 않는다).
2. `datasetsOf`·`refreshAll`·`status`·마감 재적재 대상은 늘지 않는다.
3. 팀 순위 합계 = 승점 + 참석가점 + 다득점가점(무실점 팀 가점 없음). 어떤 경기도 임시 라운드면 어느 집계에도 들어가지 않는다.
4. 참석 가점은 (경기일, 등록 팀)당 1회(구간제 최대 3)이고 등록 팀원만 센다.
5. 골/자책 이벤트는 중복 제거하지 않는다.
6. `App.jsx`·Apps Script·analyticsV2·축구·테니스 코드는 바이트 동일.

## 9. 리스크

| 항목 | 영향 | 대응 |
|---|---|---|
| 대회 중 팀원 제거 | 지난 경기일 `present`가 줄어 참석 가점이 바뀔 수 있음 | 팀 편집기 잠금 안내 문구. 운영상 대회 중 팀원 제거를 피한다 |
| 재마감 중복 행 | 순위·개인기록 이중 집계 | 서버 dedupe 키(로그_매치 `game_id\|match_id`)가 막는다. 실패 시 기존 운영 절차(수동 삭제·재전송) |
| 이름 표기 불일치(장식·공백) | 등록 팀원이 참석에 안 잡힘 | 양쪽 `cleanPlayerName` 정규화. 경기일별 카드의 `guests`에 이름이 보이므로 운영자가 알아챌 수 있다 |
| `is_extra` 문자열 `'TRUE'` | 임시 라운드가 집계에 섞임 | `isExtraRow` 이중 판정 + 테스트 |
| 캐시 L1 TTL 안의 낡은 값 | 마감 직후 다른 기기에서 옛 순위 | 컵 마감 재적재는 원본 노드(L2)를 갱신하고, 다른 기기의 L1은 TTL 후 갱신. "다시 시도"는 `get`만 다시 부른다(강제 재적재 아님, 기존 동작과 동일) |
| Apps Script/L2 읽기 실패가 빈 배열로 resolve(기존 캐시 계약: `AppSync.getMatchLog` 등이 실패를 `null` → 어댑터가 `[]`) | 대회 상세의 "기록을 불러오지 못했습니다"·다시 시도 상태가 실제로는 도달 불가하고, 콜드스타트 시 "아직 마감된 경기가 없습니다"로 보이며 로그 파생 잠금도 빠짐 | 이 단계 범위 밖(전 대시보드 탭 공유 계약). 후속: 풋살 로그 어댑터가 전송 실패(`null`)와 0행(`{rows:[]}`)을 구분해 reject 하도록 바꾸되 정규 호출부 전수 감사 후. `[]`는 L1 에 캐시되지 않아 재진입 시 재시도되고, 컵 마감 재적재가 L2 를 채우므로 첫 경기일 운영 영향은 낮음 |
