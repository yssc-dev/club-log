# 빅마스터FC 자체 축구전 — 설계

날짜 2026-09-10. 상태: **§1–12 = 1차 구현 완료(로컬 main 2216f24, 테스트 1726 통과, 배포 전). §13 = 증분 2, 미구현(계획 대기).** §13 이 구현되기 전에는 빅마스터FC 참석명단 시트가 §13.1 포맷이면 1차 구현의 `fetchAttendanceData`(B열 단일 목록)가 빈 참석자를 돌려주므로, 배포는 §13 까지 마친 뒤 한 번에 한다.

## 0. 한 줄 요약

마스터FC(풋살) 회원이 11 대 11 **자체 축구전**(A팀 vs B팀, 둘 다 우리 회원)을 기록할 수 있게 **별도 축구 팀 "빅마스터FC"**를 만들고, 하버FC 축구 모드의 오케스트레이션 층만 복사한 `IntraSoccerApp`에 "한 경기 양팀" 모델을 붙인다. 저장은 경기 1개 = 레코드 1개(홈=A, 어웨이=B). 화면·마감·아카이브는 **편 기준 시점 뷰 `sideView`**로 하버FC 잎 컴포넌트·빌더·분석을 무수정 재사용한다. 하버FC·마스터FC의 코드 경로와 데이터는 변경 0.

## 1. 배경과 결정 이력

- 마스터FC는 매주 회원을 팀으로 나눠 자체전을 하는 풋살 팀이다. 같은 회원으로 축구 자체전을 시작한다(첫 경기 2026-09-11은 앱 없이 기록, 추후 적재).
- 유저 모델: 한 팀이 여러 종목을 하고, 축구 안에 자체전/외부전이 있다. 장기적으로 club-platform(별도 레포)에서 1급으로 모델링하고 이 앱의 데이터를 마이그레이션한다. 이 설계는 그때까지의 **격리된 브리지**다.
- 저장 모델 2안을 적대적 리뷰(공격 8·반박 8·심판 2 + 디스패처 검증)로 비교했다.
  - P1 "시점 2개" — 경기 1개를 하버FC 모양 기록 2개로 저장하고 골을 미러링. **기각**: 두 행 모두 `opponent_members_json=[]`라 교차팀 관계(라이벌·시너지·황금트리오)가 시트에 영구 소실되고(채우면 선수가 두 행에 등장해 2중 집계), 경기 1개=2행이라 아카이브·재마감·마이그레이션이 늘 짝 맞추기부터다.
  - P2 "한 경기 양팀" — **채택**. 풋살 로그_매치 행과 같은 모양이라 이미 양팀 대칭으로 짜인 soccerAnalytics가 B팀을 자동 집계한다.
  - P1의 "우리팀 vs 우리팀이면 동작은 동일" 통찰은 **뷰 층**에서 채택(§5). 저장은 한 번, 표시·빌더 입력은 편 기준으로 변환.
- 리뷰로 바로잡은 사실: (a) 로그_이벤트에 편 구분 열이 이미 있다(`our_team`/`opponent`, 풋살이 세션 팀명을 씀) → 스키마 변경 불필요. (b) 회전 라벨('A팀'/'B팀')의 상대 버킷 노이즈는 양 모델 공통 → `mode='자체전'` 분기로 해결. (c) 리듀서 액션은 전부 명시적 `matchIdx`라 "현재 경기" 동기화 문제는 설계로 회피.
- 스펙 리뷰(5렌즈)에서 반영한 것: 상대골 버튼 처리(§6.4), 포인트 로그 이중 계산(§7 — 자체전은 포인트 로그 미기록), `match_id` +1 오프셋(§7), B편 교체 삭제 되돌리기(§6.5), B편 라인업 정정(§6.6), sideA 이름 저장(§4.1), 완료 패널·결과표의 점수(§6.7), 교체 후보 집합(§6.3), 빈 배열 복구 시점(§5), `calcOpponentBreakdown` 이벤트 폴백(§8), 수비 분석 B편 집계 구조(§8).
- 최종 리뷰 C1 — Apps Script 로그_선수경기 dedupe 키(`team|sport|mode|tournament_id|date|player`)로 인해 경기×편 행은 불가 → 날짜 집계로 변경(§7).

## 2. 확정된 요구사항

| 항목 | 결정 |
|---|---|
| 팀 | 신규 팀 **빅마스터FC**, 종목 축구. 회원은 마스터FC와 동일 인물(회원인증 행 복사) |
| 경기 규모 | **11 대 11 고정**(FormationSetup 11명 게이트 그대로) |
| 경기 유형 | **자체전**(주) + **외부전**(가끔, 상대 기록 불필요 = 하버FC와 동일) |
| 기록자 | **한 명·한 기기**가 A/B 양팀을 탭 전환으로 기록 |
| 기록 범위 | 양팀 모두: 선발·포메이션·골/어시·자책·교체·위치교대·GK 변경·카드·**양팀 수비진** |
| 포인트 규칙 | 하버FC 축구와 동일(골·어시·클린시트·자책, 승리 보너스 없음). 빅마스터FC 전용 시트 |
| 최우선 제약 | **하버FC·마스터FC 경기에 영향 0**(코드 경로·데이터). 공유 파일은 "기존 팀이 진입하지 않는 분기"만 추가 |
| 시간 | 충분. 품질 우선 |

## 3. 팀·진입·시트

### 3.1 팀 등록과 설정
- 비공개 시트 `회원인증`에 `빅마스터FC / 축구 / 이름 / 뒷4자리 / 역할` 행을 회원마다 추가(유저, 1회).
- `src/config/settings.js` **추가만**:
  - `PRESETS.축구['자체전축구'] = { description: '자체전(A/B 모두 우리 회원) + 외부전', values: { intraSquad: true } }`
  - `PRESET_MAP['빅마스터FC'] = { 축구: '자체전축구' }`
  - `getEffectiveSettings`가 `...presetValues`를 펼치므로(settings.js:223-236) `SOCCER_KEYS` 변경 없이 `intraSquad`가 유효 설정에 나타난다. 다른 팀 프리셋에는 이 키가 없다.
- RTDB `settings/빅마스터FC/축구`는 `loadSettingsFromFirebase`가 회원인증 종목을 보고 자동 생성(settings.js:195).

### 3.2 진입 분기
`src/Root.jsx` 변경: import 2줄(`isIntraSquadTeam`, `IntraSoccerApp`) + GameApp 선택 분기.
```js
import IntraSoccerApp from './IntraSoccerApp';
import { isIntraSquadTeam } from './utils/intraSoccer/isIntraSquadTeam';
// ...
const isIntra = isIntraSquadTeam(teamContext?.team, teamContext?.mode);
const GameApp = isIntra ? IntraSoccerApp
  : teamContext?.mode === "축구" ? SoccerApp
  : teamContext?.mode === "테니스" ? TennisApp
  : App;
```
게이트 규칙의 단일 소스는 `src/utils/intraSoccer/isIntraSquadTeam.js`: 저장된 설정(`getEffectiveSettings`)의 `intraSquad`가 true면 true, 없으면 팀 기본 프리셋(`getPresetValue('축구', resolvePreset(team,'축구'), 'intraSquad')`)으로 폴백한다. 저장 설정만 보면 **RTDB 로드 실패·첫 접속(설정 노드 미생성)에서 빅마스터FC가 하버FC 모드로 열린다** — `PRESET_MAP`은 `loadSettingsFromFirebase` 안에서만 적용되고 그 catch 경로는 preset을 쓰지 않는다(settings.js:225-227). 하버FC는 두 경로 모두 undefined → 기존 식과 동일. 대시보드·설정 화면·pending 필터(`Root.jsx:83`, `matchMode==='soccer'`→'축구')는 무변경. 롤백 = 이 분기 제거.

### 3.3 시트 (Apps Script 변경 없음)

| 시트 | 생성 | 용도 |
|---|---|---|
| `빅마스터FC 포인트 로그` | 첫 마감 시 자동 생성(Code.js:997) | **외부전만** 기록(§7). 대시보드 팀 전적·상대팀별 전적 |
| `빅마스터FC 선수별집계기록 로그` | 첫 마감 시 자동 생성(Code.js:1037) | 양팀 선수 집계. 대시보드 POINT/GAME·개인 분석 모집단 |
| `빅마스터FC 대시보드` | 유저: `하버FC 대시보드` 수식 복사, 참조 탭을 위 집계 탭으로 | `fetchSheetData` 축구 파서(`parseSoccerCSV`·`parseSoccerOpponents`) — 명단 + 외부 상대팀 마스터 |
| `빅마스터FC 참석명단` | 유저: **팀별 열**(1행 팀 이름, 아래 참석자) — §13 | 빅마스터FC 전용 `fetchIntraRoster`(§13.2) → 참석자 + 팀 명단. `mergeAttendeesIntoRoster`가 대시보드에 없는 이름도 합치므로 기록 0건인 첫날에도 전원 선택 가능. (§13 이전 설계의 `fetchAttendanceData` B열 읽기는 폐기) |
| 로그_이벤트·로그_선수경기·로그_매치 | 기존 전 팀 공유 | `team='빅마스터FC'`, `sport='축구'`, `mode='자체전'|'기본'` |

- shared 설정 5키(`sheetId`·`dashboardSheet`·`attendanceSheet`·`pointLogSheet`·`playerLogSheet`)는 설정 화면에서 위 이름으로 입력.
- RTDB `games/빅마스터FC/...`, `cache/빅마스터FC/축구/*`·`/공용/*` — 최상위 규칙 안이라 규칙 변경 없음.

## 4. 경기 모델 — RTDB state

`soccerMatches[i]`는 하버FC 모양을 유지하고 **A팀 = 기존 '우리' 자리**. 추가 필드:

```js
{
  // 기존(=A팀): matchIdx, opponent, lineup, gk, defenders, subs, formation, assignments, positionMap,
  //            events, startedAt, ourScore, opponentScore, status
  sideA: { name: 'A팀' },                      // A 표시 이름(기본 'A팀', 편집 가능)
  sideB: {                                     // 자체전일 때만. 없으면 외부전
    name: 'B팀',
    lineup, gk, defenders, formation, assignments, positionMap, subs,
  },
}
```

- **경기 유형 = `sideB` 존재 여부**(`isIntra(m) = !!m.sideB`). 별도 `matchType` 필드 없음.
- `opponent`: 외부전은 외부팀 이름(하버FC). 자체전은 **`CREATE_SOCCER_MATCH`에 `opponent: sideB.name`으로 생성**하고, B 이름을 편집하면 `PATCH_SOCCER_SIDE`(B)와 함께 기존 `SET_SOCCER_MATCH_OPPONENT`도 dispatch해 동기화한다. 단 모든 읽기는 §5의 `sideView`를 거치므로 `opponent`는 원자료의 가독성·기존 복사 코드(IntraSoccerMatchView의 헤더 등) 호환용이다.
- **이벤트**: 기존 타입 + `side: 'A'|'B'`(없으면 'A'로 간주).
  - 득점 `{type:'goal', side, player, assist, concedeGk}` — `concedeGk` = 득점 시점 **상대 편**의 현재 GK(§6.4). 저장은 이 1건만.
  - 자책 `{type:'owngoal', side, player}` — 상대 편 +1. 하버FC처럼 GK 실점에 귀속하지 않음.
  - `sub`·`gkChange`·`yellowCard`·`redCard` — 해당 편에만.
  - **자체전 저장 이벤트에 `opponentGoal`/`opponentOwnGoal`은 존재하지 않는다**(§6.4에서 가로챈다). 외부전은 하버FC와 동일하게 존재하며 모두 `side:'A'`.
- 저장 필드 `ourScore/opponentScore`는 `ADD/DELETE_SOCCER_EVENT`가 `calcSoccerScore(events)`로 갱신하는데 이 함수는 `side`를 모른다 → 자체전에서는 **A 시점 점수가 아니다**. 빌더는 events에서 도출하고(matchRowBuilder.js:108 주석) 화면·결과표·아카이브는 §5 뷰로 계산하므로 **IntraSoccerApp 계열은 `m.ourScore/opponentScore`를 읽지 않는다**(grep 테스트로 고정). 외부전은 side 전부 'A'라 기존 의미 그대로.

### 4.1 리듀서 — 새 case 1개
`src/hooks/useGameReducer.js`에 **추가만**:
```js
// 자체전 편 상태 생성/갱신. side 'A'는 표시 이름만(sideA.name), 'B'는 전 필드. 논리 matchIdx 매칭.
// remapEvents: [from, to] — 라인업 정정 시 그 편 이벤트의 선수명만 치환(remapPlayerInSoccerEvents 재사용).
case 'PATCH_SOCCER_SIDE': {
  const { matchIdx, side, patch, remapEvents } = action;
  const keys = side === 'A' ? ["name"] : ["name", "lineup", "gk", "defenders", "formation", "assignments", "positionMap", "subs"];
  const allowed = {};
  for (const k of keys) if (patch && patch[k] !== undefined) allowed[k] = patch[k];
  const matches = state.soccerMatches.map(m => {
    if (m.matchIdx !== matchIdx) return m;
    const key = side === 'A' ? 'sideA' : 'sideB';
    let events = m.events || [];
    if (Array.isArray(remapEvents) && remapEvents.length === 2) {
      const [from, to] = remapEvents;
      events = events.map(e => ((e.side || 'A') === side ? remapPlayerInSoccerEvents([e], from, to)[0] : e));
    }
    return { ...m, [key]: { ...(m[key] || {}), ...allowed }, events };
  });
  return { ...state, soccerMatches: matches };
}
```
- 경기 생성: 기존 `CREATE_SOCCER_MATCH`(A 필드, `opponent = B 이름`) → `PATCH_SOCCER_SIDE`(A, `{name}`) → `PATCH_SOCCER_SIDE`(B, 전 필드). 기존 case 무변경. 세 dispatch는 같은 틱에 연속 실행되고 autoSync는 디바운스라 RTDB에는 완성 상태가 쓰인다.
- A편 갱신은 기존 `UPDATE_SOCCER_MATCH_FORMATION`/`CORRECT_SOCCER_LINEUP`/`SWAP_SOCCER_LINEUP_POSITIONS`. B편 갱신은 오케스트레이터가 **순수 헬퍼**(`formations.js`의 `swapFormationSlots`·`defendersFromPositionMap`·`revertSubInFormation`, `soccerScoring.js`의 `remapPlayerInSoccerEvents`)로 새 값을 계산해 `PATCH_SOCCER_SIDE`(B).
- 이벤트 추가/삭제는 기존 `ADD_SOCCER_EVENT`/`DELETE_SOCCER_EVENT`. `DELETE_SOCCER_EVENT`의 `revertSubInFormation(m, deleted)`는 `m.assignments[posIdx] === deleted.playerIn`일 때만 동작(formations.js:111)하고 B 선수는 A 배치에 없으므로 **B 교체 삭제 시 A에는 no-op**(테스트로 고정). B편 되돌리기는 §6.5.
- `REOPEN_SOCCER_MATCH`·`FINISH_SOCCER_MATCH`·`SET_SOCCER_MATCH_OPPONENT`는 `...m` 스프레드라 `sideA/sideB` 보존(useGameReducer.js:940-1043).
- `firebaseSyncDiff`: `soccerMatches`는 경기 노드 단위 diff — `sideA/sideB`는 그 경기 노드에 함께 저장. 공유 파일 변경 없음.

## 5. 시점 뷰 어댑터 `sideView` — 핵심 메커니즘

`src/utils/intraSoccer/sideView.js`, 순수함수. **IntraSoccerApp 계열의 모든 읽기(레코더·편집기·완료 패널·결과표·빌더·아카이브)는 이 함수를 통해서만 경기 객체를 본다.** RTDB 빈 배열 소실 복구(`|| []`)도 여기서 하므로 공유 `normalizeSoccerMatch`는 건드리지 않고 "단일 지점" 원칙을 지킨다. `PATCH_SOCCER_SIDE`는 소비자가 아니라 스프레드 병합만 하므로 undefined 배열이 남아 있어도 무해하다.

```js
const ARR = (v) => (Array.isArray(v) ? v : []);
function fieldsOfA(m) {
  return { name: m.sideA?.name || 'A팀', lineup: ARR(m.lineup), gk: m.gk || '', defenders: ARR(m.defenders),
           formation: m.formation || null, assignments: m.assignments || null, positionMap: m.positionMap || null, subs: ARR(m.subs) };
}
function fieldsOfB(m) {
  const b = m.sideB || {};
  return { name: b.name || 'B팀', lineup: ARR(b.lineup), gk: b.gk || '', defenders: ARR(b.defenders),
           formation: b.formation || null, assignments: b.assignments || null, positionMap: b.positionMap || null, subs: ARR(b.subs) };
}
export function isIntra(m) { return !!(m && m.sideB); }

// 저장된 양팀 경기 m을 side 편의 하버FC 모양 경기로 변환. 외부전은 입력을 그대로 반환(참조 동일).
export function sideView(m, side /* 'A'|'B' */) {
  if (!isIntra(m)) return m;
  const me = side === 'A' ? fieldsOfA(m) : fieldsOfB(m);
  const other = side === 'A' ? fieldsOfB(m) : fieldsOfA(m);
  const events = ARR(m.events).flatMap(e => {
    const s = e.side || 'A';
    if (s === side) return [e];                                                   // 내 편: goal/owngoal/sub/gkChange/card 그대로
    if (e.type === 'goal')    return [{ type: 'opponentGoal', currentGk: e.concedeGk || '', id: e.id, timestamp: e.timestamp, mirrorOf: e.id }];
    if (e.type === 'owngoal') return [{ type: 'opponentOwnGoal', id: e.id, timestamp: e.timestamp, mirrorOf: e.id }];
    return [];                                                                    // 상대 편 교체·GK변경·카드는 내 시점에 없음
  });
  const { sideA, sideB, ourScore, opponentScore, ...rest } = m;   // 저장 점수는 뷰로 통과시키지 않는다(§4 — B 뷰에서 뒤집혀 있다)
  return { ...rest, ...me, opponent: other.name, events };
}
```
- 미러 항목의 `id`는 원본과 같다. 레코더는 `id`를 key·삭제 인자로만 쓰고(FormationRecorder.jsx:189,263), 한 뷰 안에서 원본과 미러가 동시에 있을 수 없으므로 충돌 없음. `onDeleteEvent(id)`는 그대로 `DELETE_SOCCER_EVENT(id)` — 원본이 지워진다.
- 외부전(`sideB` 없음)은 입력을 그대로 반환하므로 **외부전 경로 = 하버FC 경로**. 테스트: 같은 입력에 대한 빌더 출력 deep-equal.

## 6. 화면 — IntraSoccerApp

### 6.1 파일
- 복사(오케스트레이션): `src/SoccerApp.jsx → src/IntraSoccerApp.jsx`, `src/components/game/SoccerMatchView.jsx → src/components/intra/IntraSoccerMatchView.jsx`, `src/components/game/SoccerMatchResults.jsx → src/components/intra/IntraSoccerMatchResults.jsx`(양팀 득점자 표시), `src/components/history/SoccerArchiveDetail.jsx → src/components/intra/IntraSoccerArchiveDetail.jsx`. 하버FC 원본 무수정.
- 재사용(import, 무수정): `FormationSetup`·`FormationPitch`·`FormationRecorder`·`LineupEditView`·`RoundNav`·`ConfirmBar`·`MatchHeader`·`MatchTabBar`, `sheetService`·`SheetCache`·`AppSync`·`FirebaseSync`·`useFirebaseSync`·`useGameReducer`, `soccerScoring`·`formations`·`matchRowBuilder`·`rawLogBuilders`.
- 신규: `src/utils/intraSoccer/sideView.js`, `src/utils/intraSoccer/buildIntraRows.js`, `src/utils/intraSoccer/subPool.js`(§6.3), `src/utils/soccerAnalytics/parseSideExtras.js`, `src/utils/soccerAnalytics/expandIntraMatchRows.js`(§8).

### 6.2 흐름 — **§13.5 로 대체됨(1차 구현 기록용으로만 남김; 구현자는 §13.5 를 따른다)**
1. **참석자 선택** — 하버FC와 동일(참석명단 시트 + 수동 추가).
2. **경기 생성** — `경기 유형` 선택.
   - 외부전: 하버FC와 동일(상대팀 선택 → 11명 → FormationSetup → 기록). `state.opponents` 요구(`canStart`)는 외부전에만 적용.
   - 자체전: 팀 이름 입력(기본 A팀/B팀) → **A팀 11명 + FormationSetup** → **B팀 11명(A에 뽑힌 선수 제외, 정확히 11명) + FormationSetup** → `CREATE_SOCCER_MATCH`(A, `opponent=B이름`) → `PATCH_SOCCER_SIDE`(A,{name}) → `PATCH_SOCCER_SIDE`(B, 전 필드). 참석자가 22명 미만이면 자체전 버튼 비활성(안내 문구).
3. **기록 화면** — 상단 `A팀 | B팀` 탭(로컬 `useState`, RTDB 미동기). 탭 X는 `<FormationRecorder {...sideView(m, X)} attendees={subPool(m, X, attendees)} .../>`. 점수판은 A·B 둘 다 항상 표시(`calcSoccerScore(sideView(m,'A').events)`).
4. **경기 종료** — 버튼 1개 → `FINISH_SOCCER_MATCH`. 후반 팀 재편성은 **새 경기**.
5. **마감** — §7.

### 6.3 교체 후보
`subPool(m, X, attendees)` = 참석자 − (상대 편 **출전 이력 전체** `getSoccerPlayedPlayers(sideView(m, other))` = 선발 ∪ 교체 투입 ∪ GK 교대 ∪ 현재 배치 — 교체 아웃된 선수도 제외해 한 선수가 양 편에 기록되는 것을 막는다; Task 3b 룰링) − (상대 편 `redCard` 선수, `m.events`에서 `side===other && type==='redCard'`). 내 편 피치 제외와 내 편 퇴장자 제외는 레코더 내부 `getSubCandidates(attendees, assignments, events)`(soccerScoring.js:120)가 내 시점 events로 처리한다.

### 6.4 이벤트 입력 — 오케스트레이터 `onAddEvent`(탭 X)
```js
const onAddEvent = (ev) => {
  const m = latest().soccerMatches[matchIdx];               // ref로 최신 state — 클로저 stale 방지
  if (isIntra(m) && (ev.type === 'opponentGoal' || ev.type === 'opponentOwnGoal')) {
    // 자체전: 상대 편 골은 상대 편 탭에서 득점자를 선택해 입력한다. 저장하지 않고 탭만 전환.
    setTab(other(X)); toast(`${otherName} 골은 ${otherName} 탭에서 득점자를 선택해 입력하세요`); return;
  }
  const side = isIntra(m) ? X : 'A';
  const concedeGk = ev.type === 'goal' && isIntra(m) ? (X === 'A' ? fieldsOfB(m).gk : fieldsOfA(m).gk) : undefined;
  dispatch({ type: 'ADD_SOCCER_EVENT', matchIdx, event: { ...ev, side, ...(concedeGk !== undefined ? { concedeGk } : {}) } });
};
```
- 하버FC `FormationRecorder`의 "⚽ 상대골" 버튼은 남아 있되 자체전에서는 **상대 탭으로 가는 단축키**로 동작한다(잎 컴포넌트 무수정). 외부전에서는 하버FC와 동일하게 `opponentGoal` 저장.
- `concedeGk`는 입력 시점 스냅샷(하버FC `opponentGoal.currentGk`와 같은 의미). 상대 편 GK 교체는 `gkChange` 이벤트 + 그 편 `gk` 필드 갱신으로 반영되므로 최신 state의 `gk`를 읽는다.
- **goalFlow 잠금**: `onFlowActiveChange`로 골 입력 플로우 중 A/B 탭 전환을 잠근다(레코더 remount로 진행 중 골이 유실되는 기존 함정 차단).

### 6.5 이벤트 삭제 — 오케스트레이터 `onDeleteEvent`(탭 X)
```js
const onDeleteEvent = (id) => {
  const m = latest().soccerMatches[matchIdx];
  const deleted = ARR(m.events).find(e => e.id === id);
  dispatch({ type: 'DELETE_SOCCER_EVENT', matchIdx, eventId: id });   // A편 교체면 리듀서가 A를 되돌림(기존)
  if (isIntra(m) && deleted?.type === 'sub' && deleted.side === 'B') {
    const reverted = revertSubInFormation(fieldsOfB(m), deleted);     // 같은 순수 헬퍼
    if (reverted) dispatch({ type: 'PATCH_SOCCER_SIDE', matchIdx, side: 'B', patch: reverted });
  }
};
```
레코더 로컬 state 되돌림은 레코더가 스스로 한다(기존). 미러 항목(상대 골) 삭제는 `id`가 원본과 같아 원본이 지워진다.

### 6.6 편별 포메이션·라인업 편집
- 탭 X 레코더의 `onStateChange(patch)`(교체·GK 변경·위치 변경 결과): X==='A' → 기존 `UPDATE_SOCCER_MATCH_FORMATION`; X==='B' → `PATCH_SOCCER_SIDE`(B, patch).
- `LineupEditView`(편별로 열기):
  - 위치교대 `onSwap(aIdx,bIdx)`: A → 기존 `SWAP_SOCCER_LINEUP_POSITIONS`; B → `swapFormationSlots(fieldsOfB(m), aIdx, bIdx)` 결과 + `defendersFromPositionMap` → `PATCH_SOCCER_SIDE`(B).
  - 라인업 정정 `onCorrect(out, inn)`: A → 기존 `CORRECT_SOCCER_LINEUP`; B → lineup/assignments/positionMap/gk/subs를 `out→inn` 치환한 patch + `remapEvents: [out, inn]`으로 `PATCH_SOCCER_SIDE`(B). **B편에서 `CORRECT_SOCCER_LINEUP`을 dispatch하지 않는다**(A 필드를 건드린다, useGameReducer.js:949-970).

### 6.7 완료 경기 패널·결과표·아카이브
- IntraSoccerMatchView의 완료 경기 패널(원본 SoccerMatchView.jsx:283-305)은 `node` 대신 `sideView(node,'A')`로 점수·득점자를 계산하고, 자체전이면 `sideView(node,'B')` 득점자도 함께 표시.
- `IntraSoccerMatchResults`: 자체전 행은 `A이름 a : b B이름` + 양팀 득점자; 외부전 행은 하버FC와 동일.
- `IntraSoccerArchiveDetail`: `matches.flatMap(m => isIntra(m) ? [sideView(m,'A'), sideView(m,'B')] : [m])`를 `calcSoccerPlayerStats`에 넘겨 양팀 선수 기록을 표시. 팀 전적·상대팀별 전적(`calcSoccerTeamRecord`·`calcSoccerOpponentRecords`)은 외부전 경기만 넘긴다.

## 7. 마감 — 시트 행

`src/utils/intraSoccer/buildIntraRows.js`, 순수함수. 입력 `{ team, dateStr, inputTime, finished }`(finished = `status==='finished'` 경기 배열). 하버FC `SoccerApp.handleFinalize`(SoccerApp.jsx:236-270)와 같은 인자 규약을 따른다:
- `sessionGameId = finished[0].startedAt ? `s_${finished[0].startedAt}` : `s_${dateStr}_${finished[0].matchIdx+1}``, 모든 로그_매치 행의 `game_id`에 덮어씀(SoccerApp.jsx:262-271과 동일).
- **`match_id` 정합**: `buildEventLogRows`는 내부에서 `matchIdx+1`을 쓰고(soccerScoring.js:235) `buildRoundRowsFromSoccer`는 `matchIdx`를 그대로 쓰므로(matchRowBuilder.js:104), 하버FC처럼 로그_매치용 입력만 `{...v, matchIdx: v.matchIdx + 1}`로 올려 넘긴다(SoccerApp.jsx:254).

자체전 경기 `m`에 대해 `vA = sideView(m,'A')`, `vB = sideView(m,'B')`:

| 시트 | 경기 1개당 | 방법 |
|---|---|---|
| **로그_매치** | **1행** | `rowA = buildRoundRowsFromSoccer({team, mode:'자체전', tournamentId:'', date: dateStr, stateJSON:{soccerMatches:[{...vA, matchIdx: vA.matchIdx+1}]}, inputTime})[0]`, `rowB` 동일(vB). 결과 `= { ...rowA, game_id: sessionGameId, our_team_name: vA.name, opponent_team_name: vB.name, opponent_members_json: JSON.stringify({ players: JSON.parse(rowB.our_members_json), formation: vB.formation || '', defenders: vB.defenders }), opponent_gk: vB.gk }`. `our_score/opponent_score`는 rowA가 events로 도출(A:B 방향). `match_id`·`match_idx`는 양 뷰가 같은 `matchIdx`라 동일 |
| **로그_이벤트** | 출전 22 + 골/자책/교체 + 상대 시점 실점 행 | `evA = buildEventLogRows([vA], dateStr)`, `evB = buildEventLogRows([vB], dateStr)` → `buildRawEventsFromSoccer({team, mode:'자체전', gameId: sessionGameId, events: evA}).map(r => ({...r, our_team: vA.name}))` + B 동일. A의 골 = `goal`행(`our_team=A, opponent=B`) + B 시점 `concede`행(`our_team=B, concede_gk=B GK`) — 풋살이 `our_team`/`opponent`에 세션 팀명을 쓰는 용법과 동일 |
| **로그_선수경기** | **선수당 1행(날짜 기준 집계)**, `session_team='자체전'` | `intraViews = 자체전 경기.flatMap(m => [vA, vB])` → `buildRawPlayerGamesFromSoccer({team, inputTime, players: buildPlayerLogRows(intraViews, dateStr, inputTime)}).map(r => ({...r, mode:'자체전', session_team:'자체전'}))`. 외부전 집계(`mode='기본'`, `session_team=team`)와 concat. **경기×편 1행은 불가** — Apps Script `_rawPlayerGameKey`(Code.js:1751)가 `team\|sport\|mode\|tournament_id\|date\|player`만 보므로 같은 날 2번째 경기 행이 조용히 버려진다(Code.js:1717-1721). `session_team`이 상수인 이유: 한 선수가 1경기 A·2경기 B를 뛸 수 있다. **편 소속은 로그_매치 `our_members_json`/`opponent_members_json`으로 복원**하며 분석 코드는 `session_team`을 읽지 않는다. 클린시트·실점·키퍼경기는 시점 뷰 덕에 `calcSoccerPlayerStats`가 편별로 올바르게 계산되고 이름 키로 경기 간 합산된다 |
| **선수별집계** | **선수당 1행** — 외부전 + 자체전 양편 뷰 전체를 한 번에 집계 | `buildPlayerLogRows([...external, ...intraViews], dateStr, inputTime)` → `AppSync.writeSoccerPlayerLog`. 한 선수는 한 경기에서 한 편에만 있으므로 games/goals 등이 경기 간 정확히 합산된다 |
| **포인트 로그** | **0행** | 자체전은 기록하지 않는다. 유일한 소비자 `TeamDashboard.jsx:89-130`이 `matchId`별 득점/실점 행으로 **팀 전적·상대팀별 전적**을 계산하는데, 양팀 행을 넣으면 A 2골·B 1골이 3:3으로 합산되고(이중 계산), A 시점만 넣으면 "vs B팀 전적"이 생긴다. 두 지표는 자체전에서 무의미하므로 외부전 행만 남겨 **팀 전적 = 외부전 전적**이 되게 한다. 골/어시 데이터는 로그_이벤트·선수별집계에 모두 있다 |

- 외부전 경기는 `sideView`가 입력을 그대로 돌려주고 빌더 인자·후처리가 하버FC와 같다(포인트 로그 포함) → 출력 deep-equal 테스트. 외부전 `mode='기본'`.
- `tournament_id=''`, `is_extra=false`(분석 포함).
- `opponent_members_json` 객체형 확장: `parseMembersWithAbsent`(parseMembers.js)는 `.players`/`.absent`만 읽고 나머지 키 무시 → 기존 소비자 무영향. 새 접근자 `parseSideExtras(json) → { formation: string, defenders: string[] }`.
- 마감 오케스트레이션은 `SoccerApp.handleFinalize` 복사: 5시트 `allSettled` → 핵심 2시트(포인트 로그·선수별집계) 실패 시 중단(자체전 포인트 로그 0행은 Apps Script가 `success:true, count:0` 반환 — Code.js:989) → 로그_* 실패 시 `gameFinalized:false` → `saveFinalized` → `syncDiff` → `set('gameFinalized')` → `refreshAfterFinalize({ sport:'축구' })`.
- 재마감 중복 정책은 기존과 동일(수동 삭제). 자체전도 경기당 로그_매치 1행.

## 8. 분석·대시보드 — additive 분기

대시보드·개인분석은 하버FC와 같은 `TeamDashboard`/`PersonalAnalysisTab`(isSoccer 경로)을 쓴다. 자체전 행(`mode==='자체전'`)이 있을 때만 타는 분기를 추가한다. 하버FC 행은 `mode='기본'`(현행 마감, SoccerApp.jsx:261) 또는 `''`(레거시, Code.js `_rawMatchToArray` `r.mode||""`) — 둘 다 조건 불충족.

| 함수 | 변경 | 
|---|---|
| `calcPlayerSummary`·`calcMonthlyRanking`·`calcSynergyMatrix`·`calcGoldenTrio`·`calcRivalry`·`calcTrends` | **없음** — `opponent_members_json`이 채워지면 B팀을 자동 credit(이미 대칭) |
| `calcDefenseAnalysis` | 입력 전처리 `expandIntraMatchRows(matchLogs)`: 자체전 행 1개를 **하버FC 모양 2행**으로 펼친다 — A행 `{...m, opponent_team_name:'자체전'}`, B행 `{...m, our_team_name: m.opponent_team_name, opponent_team_name:'자체전', our_members_json: JSON.stringify(extras.players), our_defenders_json: JSON.stringify(extras.defenders), our_gk: m.opponent_gk, opponent_gk: m.our_gk, our_score: m.opponent_score, opponent_score: m.our_score, formation: extras.formation}`. 기존 루프는 무변경 — 각 행이 "우리 팀의 한 경기"라는 전제 그대로. 상대 버킷 `'자체전'`은 상수라 회전 라벨 노이즈가 없고, 파일 주석(12행)대로 단일 버킷은 옛 전체-부재 수식과 같다. 비자체전 행은 그대로 통과 |
| `calcOpponentBreakdown` | matchLogs 루프에서 `if (m.mode==='자체전') { extraKeys.add(key); continue; }` — 이벤트 루프의 `e.opponent` 폴백(calcOpponentBreakdown.js:39)까지 차단. 결과가 비면 PersonalAnalysisTab의 `oppRows.length>0` 가드로 섹션 자동 숨김 |
| `calcOpponentLeaders`·`calcOpponentDefense` | `m.mode==='자체전'` 행 skip(상대 축 지표는 자체전에서 무의미) |
| `TeamDashboard` 팀 전적·상대팀별 전적 | **변경 없음** — 자체전이 포인트 로그에 없어 외부전 전적만 표시(§7) |

- `HistoryView.jsx`: import 1줄 + `isSoccer` 분기에 `hasIntra = soccerMatches.some(isIntra)`일 때 `IntraSoccerArchiveDetail` 선택 1줄. 하버FC 게임은 `sideB` 없음.

## 9. 하버FC·마스터FC 무영향 — 접촉 면과 보증

| 기존 파일 | 변경 | 기존 팀이 타는가 |
|---|---|---|
| `src/Root.jsx` | import 2줄 + GameApp 분기(`intraSquad` 게이트) | 플래그 없음 → 기존 식 |
| `src/config/settings.js` | 프리셋 1개 + PRESET_MAP 항목 1개 | 빅마스터FC에만 해석 |
| `src/hooks/useGameReducer.js` | 새 case `PATCH_SOCCER_SIDE` | 새 타입 — 기존 코드가 dispatch 안 함 |
| `src/utils/soccerAnalytics/` 4함수 + 신규 2파일 | `mode==='자체전'` 분기·전처리 | `mode`가 `'기본'`/`''` → 미진입 |
| `src/components/history/HistoryView.jsx` | import 1줄 + `hasIntra` 분기 1줄 | `sideB` 없음 → 기존 컴포넌트 |
| Apps Script · 시트 스키마 · RTDB 규칙 | **0** | — |
| `SoccerApp.jsx`·`SoccerMatchView`·`SoccerMatchResults`·`SoccerArchiveDetail`·잎 컴포넌트·`soccerScoring`·`matchRowBuilder`·`rawLogBuilders`·`formations`·`firebaseSyncDiff`·`App.jsx`·`analyticsV2`·`TeamDashboard` | **0** | — |

보증:
1. 머지 전 `git diff --stat origin/main`에 위 표 밖의 **기존 파일**이 나오면 리뷰 실패(신규 파일은 자유).
2. 기존 테스트(1666개) 전부 **무수정** 통과.
3. 적대적 리뷰 5렌즈(회귀 렌즈 필수) + 수정 후 재검증.
4. 데이터: 빅마스터FC는 팀 네임스페이스(시트 탭·`team` 열·RTDB·캐시)로 분리. 마스터FC 풋살·하버FC 시트에 쓰는 경로 없음.
5. 롤백: Root 분기 제거 → 빅마스터FC가 하버FC 모드로 열림(자체전 기능만 사라지고 데이터는 남음).

## 10. 테스트 계획

신규(전부 순수함수 또는 리듀서):
- `sideView`: A/B 뷰의 필드·`opponent`·events 변환(골→`opponentGoal`+`concedeGk`, 자책→`opponentOwnGoal`, 상대 교체·카드 제거, 내 이벤트 보존, 미러 `id` 동일, `side` 누락=A), 빈 배열 복구, 외부전 입력 **참조 동일** 반환, `sideA/sideB`·`ourScore/opponentScore` 키 제거.
- `subPool`: 상대 피치·상대 퇴장자 제외, 내 편은 제외하지 않음.
- `buildIntraRows`: 자체전 1경기 → 로그_매치 1행(양팀 명단·GK·점수 방향·객체형 B 명단 with formation/defenders·`mode`·`game_id`·`match_id`가 이벤트 행과 일치), 로그_이벤트(출전 22·골/실점 쌍·교체·`our_team` 편 이름), 로그_선수경기(출전 선수당 1행·`session_team='자체전'`·클린시트/실점 편별), 포인트 로그 0행. **같은 날 자체전 2경기(편 교체 포함) → 로그_선수경기·선수별집계 모두 선수당 1행, 경기수 합산, Apps Script dedupe 키 유일.** **혼합일(외부전+자체전) → `mode='기본'` 집계와 `mode='자체전'` 집계 두 갈래, 선수별집계는 한 번에 합산.** **외부전 경기 → 하버FC 빌더 출력과 deep-equal(포인트 로그 포함).** `mergeEventRowsByTimestamp` 길이 불일치 → throw.
- `PATCH_SOCCER_SIDE`: A는 name만, B는 화이트리스트, 논리 matchIdx 매칭, 타 경기 무변경, `remapEvents`가 그 편 이벤트만 치환. `DELETE_SOCCER_EVENT`로 B 교체 삭제 시 A `assignments` 무변경(no-op).
- 오케스트레이터 핸들러(순수 부분 추출): `onAddEvent`의 side/`concedeGk` 부착·자체전 `opponentGoal` 가로채기, `onDeleteEvent`의 B 되돌리기 patch, B `onCorrect`의 patch+remap.
- 분석: `expandIntraMatchRows`(펼침·비자체전 통과), 자체전 행이 있을 때 B팀 rounds/wins/케미 집계, 수비 B편 집계, 상대 축 함수 skip(이벤트 폴백 포함). 하버FC 픽스처(기존 테스트 데이터)에 대한 출력 **변화 없음** 스냅샷.
- 정적: IntraSoccerApp 계열 파일에 `ourScore`/`opponentScore` 직접 읽기 없음(grep 테스트 — 수신자 화이트리스트 `sc`/`scoreA`/`score`만 허용, 그 밖의 모든 수신자는 실패).
- `isIntraSquadTeam`: 저장 설정 없이도 빅마스터FC 축구 true(프리셋 폴백), 하버FC false, 비축구 false, 팀 없음 false.
검증(수동, 배포 후): 빅마스터FC 자체전 테스트 경기 1회 마감 → 로그_매치 1행·선수경기 출전 선수당 1행(`session_team='자체전'`)·이벤트 편 이름·포인트 로그 미기록 확인 → 테스트 행 삭제(유저). 하버FC 대시보드·개인분석 화면 변화 없음 확인.

## 11. 운영 준비(유저 작업)

1. 회원인증에 빅마스터FC 행 추가(회원 복사).
2. 스프레드시트에 `빅마스터FC 참석명단`(팀별 열, §13.1) 생성. `빅마스터FC 대시보드`는 기록이 쌓인 뒤 하버FC 대시보드 수식을 복사해 만들면 됨(없어도 경기 기록·마감은 동작, 대시보드 회원 목록만 빈 화면).
3. 설정 화면에서 빅마스터FC shared 5키 입력.
4. 포인트 로그·선수별집계 탭은 첫 마감 때 자동 생성.

## 12. 범위 밖 / 후속

- 2026-09-11 첫 경기는 시트/수기로 기록, 앱 배포 후 빅마스터FC 시트 모양으로 적재(별도 작업).
- club-platform 마이그레이션: 자체전 행은 이미 "경기 1개 = 양팀"이라 변환이 직접적. 외부전 행은 하버FC와 동일.
- 팀 규모 가변(7~9인), 2기기 동시 기록, 자체전 전용 수비 지표, 자체전 전용 팀(편) 전적은 비범위.
- `calcGkChemistry`는 프로덕션에서 호출되지 않음(리뷰 확인) — 건드리지 않는다.

## 13. 증분 2 — 시트 기반 팀 명단·유동 인원·종료 확정 (2026-09-10, 1차 구현 머지 후 요구 변경)

### 13.1 요구 변경
- **팀 소속은 시트에서 미리 지정**한다(앱에서 22명을 A/B로 고르는 단계 제거). 시트 `빅마스터FC 참석명단`: **1행 = 팀 이름(열마다 하나), 그 아래 = 그 팀 참석자**. 팀 이름은 1행 값 그대로(그날그날 자유). 한 열이 11명을 넘으면 넘는 인원이 그 팀 벤치.
- **외부팀은 앱에서 추가**(기존 외부전 흐름의 상대팀 선택/직접 추가 그대로). 시트에 상대팀 열 없음.
- **지각 참석자는 앱 "수동 추가"** → 팀 없는 **유동 인원**. 유동 인원은 자체전에서 어느 편 벤치로든 교체 투입 가능하고 다음 경기 배치에서 양쪽 선발 후보에 뜬다. 한 경기 안에서 양 편에 동시에 기록되는 것은 §6.3(상대 편 출전 이력 제외)으로 이미 차단.
- **종료 = 확정(수정 불가)**: 빅마스터FC에서는 종료된 경기의 확정취소·출전 수정·상대팀 변경을 제공하지 않는다(외부전 포함).
- 기록은 한 사람이 A/B 탭 전환(§6.2 3단계 그대로). 2기기 배치·기록은 비범위.
- 로그_선수경기는 "그날 개인 결과"(편 무관, `session_team='자체전'`)로 확정. 편 소속은 로그_매치 명단·로그_이벤트 `our_team`이 담당(유저 합의).

### 13.2 시트 파서·읽기 (신규, 공유 파일 무접촉)
`src/utils/intraSoccer/rosterSheet.js`
- `parseIntraRosterCsv(text) → { teams: [{ name, players: string[] }], attendees: string[], warnings: string[] }`
  - **비어있지 않은 행** = 모든 셀의 trim 값이 전부 빈 문자열인 행은 건너뛴다; 하나라도 값이 있으면 그 행이 헤더. 헤더 행에서 비어있지 않은 셀 하나 = 팀 1개(trim; 열 인덱스 기억). 헤더가 빈 열(A열이 비고 B·C열에만 팀 이름인 경우 포함)은 무시.
  - 그 아래 각 행의 해당 열 셀 = 선수 이름(trim, 끝의 `★`·공백 제거; 빈 셀 건너뜀). 빈 행이 중간에 있어도 멈추지 않는다.
  - 같은 열 중복 → 1회만(warning). 같은 이름이 두 열에 → **먼저 나온 열** 소속(warning).
  - `attendees` = 열 순서대로 합집합. `teams.length === 0` → `Error('팀 열 없음')`. 1개면 자체전 불가(외부전 전용 날) — 호출부가 판단.
  - CSV 한 줄 파싱은 모듈 내부 최소 구현(따옴표·쉼표 처리) — `sheetService`의 비공개 헬퍼를 export 하지 않는다(공유 파일 무접촉).
- `fetchIntraRoster() → Promise<{ teams, attendees, warnings }>`: `AuthUtil.getStored().team` → `getSettings(team)` → `SHEET_CONFIG.csvUrlBySheet(sheetId, attendanceSheet)` → fetch → 파서. `attendanceSheet` 미설정/HTTP 오류는 throw(호출부가 `console.warn` + 수동 진행).
- 시트는 40행 이하라 gviz CSV 절단 함정(메모리)과 무관 — 하버FC 참석명단과 같은 메커니즘.

### 13.3 상태 — `soccerFormation.intra`
- 팀 명단은 기존 whole-replace 동기 필드 `soccerFormation` 안에 둔다(공유 `firebaseSyncDiff` 무수정, 새 필드 등록 불필요, 단일 기록자라 경합 없음): `soccerFormation.intra = { teams: [{ name, players }], syncedAt }`.
- `IntraSoccerMatchView.saveFormationState(updates)`는 **현행 `onFormationChange?.({ viewState, selectedOpponent, selectedPlayers, ...updates })`(IntraSoccerMatchView.jsx:57-59)를 `onFormationChange?.({ ...savedFormation, viewState, selectedOpponent, selectedPlayers, ...updates })`로 바꿔** `intra` 키를 보존한다(외부전 복원 계약 `viewState/selectedOpponent/selectedPlayers` 모양은 불변). 이 병합은 순수 헬퍼 `mergeFormationState(saved, current, updates)`(`pools.js` 에 둔다)로 추출해 테스트한다 — 빠지면 `soccerFormation`이 whole-replace 라 호출마다 RTDB 의 `intra` 가 삭제된다.
- 팀이 3개 이상일 때 고른 두 팀은 `soccerFormation.intra.selectedPair = [idxA, idxB]`에 저장(새로고침 복원). 미설정이거나 인덱스가 범위를 벗어나면(재연동으로 팀 수가 바뀐 경우) `[0, 1]`로 간주.
- **RTDB 배열 복구 강화**: `sideView.ARR`은 빈 배열 소실(`undefined`)뿐 아니라 객체화된 배열(`{0:'a',1:'b'}`)도 `Object.values`로 복구한다 — 공유 `normalizeSoccerMatch`의 `asArr`(firebaseSyncDiff.js:324)와 같은 규칙을 `sideB` 배열 필드에 적용하기 위함(공유 파일은 여전히 무수정).
- `attendees`(기존 필드) = 시트 참석자 ∪ 수동 추가. **유동 인원** = `attendees − ∪teams.players`. 참석자 선택 화면에서 해제한 이름은 모든 풀에서 빠진다(풀은 항상 `∩ attendees`).

### 13.4 풀 계산 (신규 순수함수 `src/utils/intraSoccer/pools.js`)
- `floatingOf(attendees, teams) → string[]`
- `setupPoolA({ teams, a, attendees }) → (roster(a) ∪ floating) ∩ attendees`
- `setupPoolB({ teams, b, attendees, aAssigned }) → ((roster(b) ∪ floating) ∩ attendees) − aAssigned`
- `sidePool(m, side, attendees, teams) → subPool(m, side, (roster(sideName) ∪ floating) ∩ attendees)` — `sideName = fieldsOfA/B(m).name`으로 팀을 찾고, 없으면 `attendees` 전체로 폴백. 교체 후보 = 자기 팀 벤치 + 유동 인원 − 상대 편 출전 이력·퇴장자.
- `sidePool`은 외부전(`!isIntra(m)`)이면 기존과 동일하게 `attendees` 전체(유동 인원 포함)를 돌려준다 — 유동 인원의 '양 편 벤치' 규칙은 자체전에만 의미가 있다.
- `canIntra({ teams, attendees, pair })` — `teams`는 전체 팀 배열, `pair = selectedPair ?? [0, 1]`. `teams.length ≥ 2` 이고 `pair`의 두 팀 각각 `(roster ∪ floating) ∩ attendees ≥ 11` 이고 `attendees.length ≥ 22`. 팀이 3개 이상이고 아직 고르지 않았으면 기본 `[0, 1]`로 평가한다.

### 13.5 흐름 변경 (§6.2 대체)
1. **참석자 선택** — 시작 시 `fetchIntraRoster()`로 참석자·팀 명단 적재(`gameMode==='sheetSync'`일 때, 하버FC의 `fetchAttendanceData` 자리). "참석명단 연동" 버튼 = 재조회: `soccerFormation.intra.teams := 시트`, `attendees := Array.from(new Set([...시트 참석자, ...Array.from(locked)]))`(`locked` = IntraSoccerApp 의 기존 `locked` Set — `perSide(state.soccerMatches)`의 `getSoccerPlayedPlayers` 합집합, D3 잠금) — 수동 추가한 무기록 선수는 재연동 시 빠지므로 다시 추가. 실패 시 경고만, 수동 진행.
2. **경기 생성** — 유형 카드: 팀 이름 입력 없음. 팀이 2개면 자동 A/B(열 순서), **3개 이상이면 두 팀 선택**(두 개의 select, 기본 1·2열). 자체전 버튼은 `canIntra`일 때만 활성(부족 시 어느 팀이 몇 명인지 안내). 외부전은 기존 그대로.
   - 자체전: **A 배치**(`FormationSetup selectedPlayers=setupPoolA`, 11명이면 자동배치 1회로 완성) → **B 배치**(`setupPoolB`) → `CREATE`(A, `opponent`=B 이름) → `PATCH_SOCCER_SIDE`(A,{name}) → `PATCH_SOCCER_SIDE`(B). `FormationSetup.onConfirm.subs`(풀 − 배치)가 곧 그 편 벤치(유동 인원 포함); A 벤치에서 B 선발 제외 규칙(1차 구현) 유지.
3. **기록 화면** — 탭 X 레코더 `attendees={sidePool(m, X, attendees, teams)}`. 그 외 §6.2 3단계 동일.
4. **경기 종료 = 확정** — `IntraSoccerMatchView`에서 `node.status === 'finished'`인 노드(자체전·외부전 모두)는 읽기 전용: 완료 패널 `ConfirmBar`의 확정취소 버튼, 상단 '출전 수정(A/B)'·'상대팀 변경' 버튼을 **렌더하지 않는다**(`canEditNode = !!node && node.status !== 'finished' && …`). 현행 1차 구현은 이 버튼들을 렌더하므로 증분 2에서 제거한다. (리듀서 `REOPEN_SOCCER_MATCH`는 그대로 있으나 빅마스터FC 화면에서 도달 불가.)
5. **마감** — §7 그대로.

### 13.6 접촉 면·테스트
- 변경 파일: 신규 `rosterSheet.js`·`pools.js`(+ 테스트), 수정 `sideView.js`(ARR 객체화 복구 + 테스트), `IntraSoccerApp.jsx`(시트 적재·재연동·canStart·유형 카드 데이터 전달), `IntraSoccerMatchView.jsx`(유형 카드 = 팀 표시/3팀 이상 선택·배치 풀·`saveFormationState` intra 보존·종료 읽기 전용), 스펙. **공유 파일 0** — §9 표 불변. `rosterSheet.js`의 의존(`AuthUtil`, `getSettings`, `SHEET_CONFIG.csvUrlBySheet`, `stripNameDecorations`(src/services/appSync.js))은 전부 기존 export.
- 테스트: 파서(헤더/빈 행 건너뜀/첫 행 A열만 빈 경우/빈 셀/열 내 중복/두 열 중복/따옴표·쉼표 이름/`★` 제거/팀 0·1·3개), 풀(유동 인원, A/B 풀, `∩ attendees`, sidePool 이름 폴백·외부전 전체 반환, canIntra 경계 11/22·기본 pair·selectedPair 범위 초과), `mergeFormationState`가 `intra`·`selectedPair` 보존, `ARR` 객체화 복구, 정적 테스트 유지. UI는 빌드 + 정독.

