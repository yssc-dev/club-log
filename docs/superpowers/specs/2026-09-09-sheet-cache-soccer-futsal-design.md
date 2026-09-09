# 시트 캐시 확장 — 풋살·축구

- 작성일: 2026-09-09
- 선행: `docs/superpowers/specs/2026-09-08-sheet-cache-design.md` (테니스, 배포 완료)
- 상태: 설계 확정 대기

## 1. 목표

풋살·축구의 Apps Script 읽기 7종을 기존 3층 캐시에 태운다.

| 화면 | 현재 Apps Script 호출 | 목표 |
|---|---|---|
| `TeamDashboard` (내부 3개 컴포넌트 포함) | 5~6회 (축구 6 / 풋살 5) | **0회** |
| `PlayerAnalytics` | 3회 | **0회** |
| 앱 진입 (`App.jsx`, 풋살) | 1회 | **0회** |

`TeamDashboard` 마운트 1회에 `getPlayerLog` 가 **두 번** 나간다(본체 + 내부 `DualTeamTab`).
in-flight 중복 제거가 이것을 공짜로 흡수한다.

## 2. 캐시하지 않는 것과 그 이유

| 대상 | 이유 |
|---|---|
| `fetchSheetData` / `fetchAttendanceData` (대시보드·참석명단) | **Apps Script를 안 거친다.** 구글시트 CSV 직접 조회로 실측 0.6~0.8초, 콜드스타트 없음. 이득이 작고, **참석명단은 경기 당일 계속 바뀌어** 캐싱하면 낡은 명단으로 대진을 짤 위험이 있다(테니스 중복 입력 가드와 같은 계열) |
| `recoverFinalizedFromSheets` | 관리자 복구 도구 — 신선도가 정확성 요건 |
| `getSheetList` | 설정 화면 전용, 저빈도 |
| `getRankingHistory(allNames, sheet)` | 인자가 동적 선수 목록이라 고정 데이터셋이 아니다 |

## 3. 저장 모드 2종

현재 캐시는 "컬럼이 정해진 평평한 객체 배열" 하나만 다룬다. 풋살·축구 7종 중 2종이
**중첩 맵**이라 그 모델이 안 맞는다. 모드를 어댑터가 선언하게 한다.

```
mode: 'rows'  → { version, sheetName?, headers, rows, count }   (기존)
mode: 'raw'   → { version, sheetName?, data }                    (신규)
```

`raw` 는 응답 값을 그대로 보관한다. 대상 2종이 선수당 숫자 몇 개짜리 맵(≈78명, 수 KB)이라
배열형 압축 이득이 없고, 캐시가 데이터를 재해석하지 않는 편이 의미론적으로도 정확하다.

`readCacheNode` 가 모드로 분기하고, 히트 판정(`version` 존재)·TTL·`sheetName` 가드는 공통이다.
`rows` 모드의 `headers` 동등 비교는 그대로 유지한다.

## 4. 어댑터 등록

`sport` 가 이미 경로 축(`cache/{team}/{sport}/{dataset}/all`)이므로 `ADAPTERS` 에
`'풋살'`·`'축구'` 키를 추가한다. 두 종목이 같은 함수를 쓰지만 **sport 인자와 시트명이 다르다.**

### 4.1 로그 3종 — 기존 컬럼 상수 재사용

클라이언트 미러가 이미 있고 서버 헤더와 **완전히 일치함을 실측 확인했다**(2026-09-09):

| 클라이언트 상수 | 위치 | 서버 | 칸 |
|---|---|---|---|
| `RAW_MATCH_COLUMNS` | `src/utils/matchRowBuilder.js` | `RAW_MATCHES_HEADERS` | 22 |
| `RAW_EVENT_COLUMNS` | `src/utils/rawLogBuilders.js` | `RAW_EVENTS_HEADERS` | 15 |
| `RAW_PLAYER_GAME_COLUMNS` | `src/utils/rawLogBuilders.js` | `RAW_PLAYER_GAMES_HEADERS` | 20 |

**새 상수를 만들지 않는다 → 새 드리프트 원천이 없다.**

세 함수는 `{ rows: [...] }` 래퍼를 반환하므로 어댑터의 `fetch` 에서 `.rows` 로 벗겨
배열을 캐시에 넣는다. 호출부는 `.rows` 대신 배열을 직접 받도록 바꾼다(§6).

### 4.2 시트명 의존 4종

`getPointLog(pointLogSheet)` 처럼 **시트명이 팀 설정에서 온다.** 캐시 키는 팀+종목이라
설정에서 시트명을 바꾸면 같은 키에 다른 시트 데이터가 남는다.

→ 노드에 `sheetName` 을 함께 저장하고 **불일치 시 미스**로 처리한다. `headers` 드리프트
가드와 같은 방식이라 새 개념이 아니다.

`pointLog` / `playerLog` 의 컬럼 상수는 **시트 헤더가 아니라 Apps Script 응답 객체의 키**다
(서버가 시트 열을 camelCase 키로 매핑한다). 테니스 `TENNIS_ROSTER_CACHE_COLUMNS` 와 같은 성격.

```js
export const POINT_LOG_CACHE_COLUMNS = [
  'date', 'matchId', 'myTeam', 'opponent', 'scorer', 'assist', 'ownGoal', 'foul', 'concedingGk',
];
export const PLAYER_LOG_CACHE_COLUMNS = [
  'date', 'name', 'goals', 'assists', 'ownGoals', 'conceded', 'cleanSheets',
  'crova', 'goguma', 'keeperGames', 'rankScore',
];
```

**구현 시 `apps-script/Code.js` 의 `_getPointLog` / `_getPlayerLog` push 블록과 1:1 대조해
검증할 것** — 위 목록은 2026-09-09 시점 추출값이다. 불일치해도 자동 미스로 강등되므로
데이터 손상은 없고 캐시가 무효화될 뿐이다(자가치유).

### 4.3 전체 표

| dataset | mode | columns | sheetName | fetch |
|---|---|---|---|---|
| `matchLog` | rows | `RAW_MATCH_COLUMNS` | — | `getMatchLog({sport}).rows` |
| `eventLog` | rows | `RAW_EVENT_COLUMNS` | — | `getEventLog({sport}).rows` |
| `playerGameLog` | rows | `RAW_PLAYER_GAME_COLUMNS` | — | `getPlayerGameLog({sport}).rows` |
| `pointLog` | rows | `POINT_LOG_CACHE_COLUMNS` | `pointLogSheet` | `getPointLog(sheet)` |
| `playerLog` | rows | `PLAYER_LOG_CACHE_COLUMNS` | `playerLogSheet` | `getPlayerLog(sheet)` |
| `latestDeltas` | raw | — | `playerLogSheet` | `getLatestDeltas(sheet)` |
| `cumulativeBonus` | raw | — | `playerLogSheet` | `getCumulativeBonus(sheet)` |

`cumulativeBonus` 는 풋살 전용이다(축구 진입 경로가 호출하지 않음). 축구 어댑터에서 빼도
되지만, 등록해 두면 호출되지 않을 뿐이므로 **양쪽 동일하게 등록**해 어댑터 표를 단순하게 둔다.

## 5. 채택하지 않은 대안 — 맵 2종의 클라이언트 파생

`getLatestDeltas` 와 `getCumulativeBonus` 는 **`getPlayerLog` 와 같은 시트를 서버가 집계한
결과**다(최신 날짜 필터 / 선수별 crova·goguma 합산). 캐시된 `playerLog` 에서 계산하면
Apps Script 호출 2개가 캐시가 아니라 **아예 사라진다.**

채택하지 않는다. 서버 집계를 클라이언트로 옮기는 **동작 변경**이고, 하필 그 영역이 과거
사고 지점이다 — 하버FC 선수기록보관소에 크로바/고구마 열이 없어 실점을 고구마로 오독해
유령 ▲배지가 뜬 건이 정확히 `_playerLogColMap` 계열이다. 이득(호출 2개)에 비해 회귀
위험이 크다. 캐시가 안정된 뒤 별도 과제로 다룬다.

## 6. 호출부 변경

| 파일 | 변경 |
|---|---|
| `TeamDashboard.jsx` | `getLatestDeltas` / `getPlayerLog` / `getPointLog` → `SheetCache.get` |
| `analytics/DualTeamTab.jsx` | `getPlayerLog` → `SheetCache.get` (본체와의 중복이 in-flight 로 흡수됨) |
| `analytics/RecentFormTop3.jsx` | `getPlayerGameLog` → `SheetCache.get` |
| `analytics/DefenseTopCards.jsx` | `getMatchLog` → `SheetCache.get` |
| `dashboard/PlayerAnalytics.jsx` | 로그 3종 → `SheetCache.get`. **`.rows` 접근을 배열 직접 사용으로 변경** |
| `App.jsx` | `getCumulativeBonus` → `SheetCache.get` |
| `utils/recoverFinalizedFromSheets.js` | **변경 없음** (§2) |
| `services/appSync.js` | **변경 없음** — L3 그대로 재사용 |

`fetchSheetData` / `fetchAttendanceData` 호출부는 모두 그대로 둔다.

## 7. 무효화

풋살·축구 마감은 **5개 시트에 병렬 전송**한다(`App.jsx` / `SoccerApp.jsx`). 그 5개가
캐시 7종 전부를 낡게 만든다(맵 2종도 선수별집계 시트에서 파생되므로 포함).

| 트리거 | 대상 | 위치 |
|---|---|---|
| 마감 전송 성공 | 7종 전부 | `App.jsx`(풋살) / `SoccerApp.jsx`(축구) |
| 대회 기록 전송 | `eventLog`, `playerGameLog` | `TournamentMatchManager.jsx` — 로그_이벤트·로그_선수경기에 쓴다 |
| 설정의 로그_매치 재전송 | `matchLog` | `SettingsScreen.jsx` |
| 수동 동기화 | 종목의 전 데이터셋 | `SettingsScreen` (기존 버튼이 `datasetsOf(sport)` 를 쓰므로 자동 동작) |
| TTL 12시간 | 해당 데이터셋 | 백스톱 |

마감 후 재적재는 **`Promise.all` 병렬**로 한다(순차면 7 × 2초). 기존 규칙 유지:
전송이 하나라도 실패하면 재적재하지 않고 미확정을 유지하며, **재적재 실패는 마감 성공을
되돌리지 않는다**(`refresh` 가 내부에서 강등 처리하고 throw 하지 않는다).

## 8. 수동 동기화 UI

설정의 기존 버튼이 `SheetCache.datasetsOf(sport)` 로 동작하므로 풋살·축구에서 **자동으로
켜진다.** `syncStatusText.js` 의 `DATASET_LABELS` 에 한글 이름 7개만 추가한다.

## 9. 용량 (실측 기반 추정)

팀별 노드 합계(배열형):

| 팀 | 구성 | 합계 |
|---|---|---|
| 마스터FC(풋살) | matchLog 554행 209KB + eventLog 1,279행 221KB + playerGameLog 948행 153KB + pointLog 1,279행 + playerLog 948행 + 맵 2종 | **≈860 KB** |
| 하버FC(축구) | matchLog 137행 46KB + eventLog 1,202행 191KB + playerGameLog 530행 79KB + pointLog 421행 + playerLog 625행 + 맵 2종 | **≈440 KB** |

선행 스펙 §9의 샤딩 전환 기준(배열형 단일 노드 1.5 MB)은 **개별 노드** 기준이며 여기서
가장 큰 노드는 221 KB다. 다만 한 화면이 여러 노드를 동시에 받으므로 **마스터FC는 진입 시
약 860 KB를 내려받는다** — 테니스(635 KB)보다 크다. 모바일 체감을 배포 후 확인 대상에 넣는다.

## 10. 테스트

순수 로직:
1. `raw` 모드 인코딩/디코딩 왕복 — 중첩 맵이 그대로 복원되는가
2. `raw` 노드도 `version` 으로 히트 판정되는가(빈 맵 `{}` 포함)
3. `sheetName` 불일치 → 미스
4. `sheetName` 이 없는 데이터셋(로그 3종)은 가드를 적용하지 않는가
5. `mode` 가 다른 노드를 읽으면 미스(모드 전환 시 안전)
6. 어댑터 커버리지 확장 — `mode:'rows'` 는 `columns` 필수, `mode:'raw'` 는 `columns` 없어야 함, 모든 어댑터에 `fetch` 존재
7. `{rows}` 래퍼 언랩 — 서버가 `null` 을 줘도 `[]` 가 되는가

통합·렌더:
8. `TeamDashboard` / `PlayerAnalytics` 렌더 테스트 모킹을 `SheetCache` 로 교체, 렌더 결과 동일
9. `TeamDashboard` 1회 마운트에서 `playerLog` fetch 가 **1회만** 일어나는가(중복 흡수)
10. 마감 성공 후 7종 재적재 호출, 전송 실패 시 미호출

## 11. 적용 순서

각 단계 독립 배포·독립 롤백.

1. **캐시 코어 확장** — `raw` 모드 + `sheetName` 가드 + 테스트. 아무도 안 쓴다, 동작 변화 0.
2. **어댑터 등록** — 풋살·축구 7종 + 컬럼 상수 2개. 등록만, 호출부 미전환이라 여전히 동작 변화 0.
3. **읽기 경로 전환** — 6개 파일. 체감 개선이 여기서 나온다.
4. **무효화** — 마감 / 대회 / 재전송 도구.
5. **`DATASET_LABELS` 추가** — 수동 동기화 표시.

## 12. 롤백

기존 `DISABLED` 스위치가 그대로 적용된다(`true` 면 전 종목 L3 직행).

## 13. 범위 밖

- 대시보드·참석명단 CSV 캐싱 (§2)
- 맵 2종의 클라이언트 파생 (§5)
- **시트 공유 설정 / 인증 모델** — 2026-09-09 확인: 스프레드시트가 링크 공개라
  `회원인증`(이름·휴대폰뒷자리·역할)과 `테니스_회원명부`(생년월일)가 무인증으로 읽힌다.
  시트 ID는 클라이언트 번들에 포함된다. 이 앱의 로그인과 Apps Script 인증 토큰이
  `팀:이름:뒷4자리` 이므로 관리자 토큰 위조가 가능하다. **캐시와 독립된 별도 과제**이며
  유저에게 보고했다(2026-09-08). 이 스펙은 그것을 전제하거나 악화시키지 않는다.
- 연도 샤딩 (선행 스펙 §9)
