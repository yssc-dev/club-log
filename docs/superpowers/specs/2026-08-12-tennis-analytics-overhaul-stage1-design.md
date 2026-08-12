# 테니스 분석·대시보드 대개편 — 1단계 (탭 재편 + 분석 뷰 전환 + 컬럼 정렬) 설계

- 날짜: 2026-08-12
- 대상: 몽피스(테니스). 분석·대시보드 대개편 3단계 중 **1단계**.
- 브랜치/워크트리: `tennis-analytics` (base = origin/main `380170e`)

## 1. 배경

테니스 홈 화면은 현재 **분석 · 개인기록 · 경기관리** 3탭이다(공유 `TeamDashboard.jsx`의 종목 분기). 분석 탭엔 이미 복식/단식 토글과 선수 선택 select가 있으나, 선수를 골라도 전체 랭킹 위에 개인 섹션이 **덧붙는** 구조라 "전체 지표"와 "개인 지표"가 섞여 보인다. 개인기록 탭은 로그인 유저 본인의 요약 카드만 보여준다.

이 개편은 홈 탭을 **대시보드 · 분석 · 경기관리**로 재편하고(개인기록 탭 제거 → 분석에 흡수), 분석 탭을 **"미선택=전체 랭킹 / 선수 선택=개인 분석"** 뷰 전환으로 바꾸며, 지표 테이블에 **컬럼 정렬**을 추가한다. 대시보드 탭의 콘텐츠 자체는 2단계 작업이며, 1단계에서는 "준비 중" placeholder로 둔다.

## 2. 범위

- **포함**: 탭 재편(테니스 분기), 분석 뷰 전환, 개인기록 탭 흡수, 컬럼 정렬(분석 테이블 전부).
- **제외(후속 단계)**: 대시보드 콘텐츠(2단계), 날짜 필터(3단계), 대시보드 테이블 정렬(2단계에서 동일 훅 재사용), **회원관리 기능**(회원명부 조회·편집 — 진실 소스 쓰기 API+승인 게이트 필요, 별도 서브프로젝트). 1단계는 회원관리 **탭 placeholder만** 추가.
- **무변경**: 분석 계산 유틸(`tennisAnalytics.js`/`tennisStandings.js`)의 **계산 로직**. 컴포넌트 배치와 정렬 래핑만 바뀐다. 축구/풋살 코드 경로 전부.

## 3. 결정 (2026-08-12 유저)

| 항목 | 결정 |
|---|---|
| 대시보드 탭 | 1단계는 "준비 중" placeholder, 2단계에서 채움 |
| 회원관리 탭 | 1단계는 "준비 중" placeholder(관리자 전용), 기능은 별도 서브프로젝트 |
| 탭 순서 | `[대시보드] · [분석] · [경기관리] · [회원관리(관리자)]`, 개인기록 탭 제거 |
| 기본 진입 탭 | 분석(현행 유지 — 대시보드는 아직 비어 있음) |
| 분석 기본 상태 | **전체 랭킹**(선수 미선택) |
| 개인 뷰 구성 | 요약 카드 + 파트너별(복식) + 상대전적 + 월별흐름 + 연도별 |
| 컬럼 정렬 | 분석 테이블 전부에 헤더 클릭 정렬 추가 |

## 4. 설계

### 4.1 탭 재편 — `src/components/dashboard/TeamDashboard.jsx` (테니스 분기만)

현재 탭 배열(공유, 931-948행 부근)은 단일 배열에 종목 조건이 인라인으로 섞여 있다:

```js
{[
  { key: "records", label: activeSport === "테니스" ? "분석" : "대시보드" },
  { key: "roster",  label: activeSport === "축구" ? "팀/개인 기록" : "개인기록" },
  activeSport !== "테니스" && { key: "analytics", label: "분석" },
  { key: "games",   label: "경기관리", badge: pendingGames.length > 0 },
  activeSport === "축구" && { key: "tournament", label: "대회" },
].filter(Boolean).map(...)}
```

**변경**: 테니스일 때 별도 탭 배열을 쓰도록 분기한다. `isTennis`(951행에 이미 존재) 재사용.

```js
{(isTennis
  ? [
      { key: "tdash",   label: "대시보드" },
      { key: "records", label: "분석" },
      { key: "games",   label: "경기관리", badge: pendingGames.length > 0 },
      activeEntry?.role === "관리자" && { key: "members", label: "회원관리" },
    ]
  : [
      { key: "records", label: "대시보드" },
      { key: "roster",  label: activeSport === "축구" ? "팀/개인 기록" : "개인기록" },
      activeSport !== "테니스" && { key: "analytics", label: "분석" },
      { key: "games",   label: "경기관리", badge: pendingGames.length > 0 },
      activeSport === "축구" && { key: "tournament", label: "대회" },
    ]
).filter(Boolean).map(tab => ( ... 기존 map 본문 그대로 ... ))}
```

- 비테니스 배열은 기존과 **의미 동일**: 테니스가 빠졌으므로 `records` 라벨은 항상 "대시보드", `analytics`의 `activeSport !== "테니스"`는 항상 참(그대로 두어도 무방하나 명시적으로 유지). 축구/풋살 탭 구성·순서·badge 무변경.
- 기본 `activeTab`은 `useState("records")`(29행) 유지 — 테니스에선 "분석"(records)에 착지, 대시보드(tdash)는 탭해서 진입.
- 렌더 분기(951-954행): 테니스는 `TennisTabs`가 `activeTab`을 받아 전 분기를 처리하므로, 새 키 `tdash`를 TennisTabs가 처리하게 한다(4.3). TeamDashboard의 테니스 렌더 호출부는 그대로.

### 4.2 분석 뷰 전환 — `src/components/tennis/TennisAnalyticsTab.jsx`

- `player` 기본값을 `authUserName || ''` → **`''`**(미선택)로 변경. select 빈 옵션 라벨 `"선수 선택"` → **`"전체 랭킹"`**.
- 렌더를 `player` 유무로 **전환**(현재는 항상 전체+개인 혼재):

**미선택(전체) 뷰** — 개인 전용 섹션(파트너별·상대전적·월별·연도별·요약카드) 숨김:
- 복식: `DoublesStandingsSection` · `ChemistrySection`(전체 케미만; `player` 없으면 파트너별 미표시) · `TbBagelSection` · `AceDfSection`
- 단식: `SinglesStandingsSection` · `TbBagelSection` · `AceDfSection`

**선택(개인) 뷰** — 전체 순위/케미/TB·베이글·에이스 랭킹 숨김:
- 상단: **요약 카드**(신규, 4.3에서 이식) — `buildPlayerSummary({ rows, player })` 사용. format 무관, 단·복식 양쪽 표기.
- 복식: 파트너별(`buildPartnerBreakdown`) · 상대전적(`buildHeadToHead`) · 월별흐름(`buildMonthlyForm`) · 연도별(`buildYearlyRecords`, `legacyRows` 있을 때)
- 단식: 상대전적 · 월별흐름 · 연도별

기존 섹션 컴포넌트(`DoublesStandingsSection`, `ChemistrySection`, `HeadToHeadSection`, `MonthlyFormSection`, `TbBagelSection`, `AceDfSection`, `YearlyRecordsSection`, `SinglesStandingsSection`)는 **재사용**. `ChemistrySection`은 현재 전체 케미 + (player 있으면)파트너별을 함께 렌더하므로, 전체 뷰에서는 파트너별이 자연히 빠진다(player=''). 개인 뷰에서는 케미(전체)를 빼고 파트너별만 원하면 별도 파트너별 섹션으로 분리하거나 `ChemistrySection`에 `showChemistry`/`showBreakdown` 플래그를 준다 — **구현 시 파트너별만 렌더하도록 분리**(개인 뷰에 전체 케미는 노출하지 않음).

toggle/select UI(427-449행)는 유지. `useMemo`들은 그대로 두되(계산은 player 없으면 빈 배열 반환), 렌더 트리만 전환.

### 4.3 개인기록 탭 흡수 — `src/components/tennis/TennisTabs.jsx`

- `roster` 분기(55-75행: "내 전적" 요약 카드) **삭제**.
- `StatCell` 컴포넌트 + 요약 카드 마크업을 분석 개인 뷰의 **요약 카드**로 이동(TennisAnalyticsTab 내부 또는 공용 소컴포넌트). 값은 동일하게 `buildPlayerSummary` 사용.
- 새 `tdash`·`members` 분기 추가 → placeholder:
  ```js
  if (activeTab === 'tdash')   return <Placeholder text="대시보드 준비 중" />;
  if (activeTab === 'members') return <Placeholder text="회원관리 준비 중" />;
  // Placeholder = <div style={{ padding: 20, textAlign: 'center', color: C.gray, fontSize: 13 }}>{text}</div>
  ```
  회원관리 탭은 TeamDashboard에서 관리자에게만 노출되므로 비관리자는 `members` activeTab에 도달할 수 없음(방어적으로 placeholder는 무해).
- `records` 분기(→ `TennisAnalyticsTab`)·`games` 분기 유지. `authUserName`은 TennisAnalyticsTab에 계속 전달(개인 뷰 기본은 전체지만, 유저가 select에서 본인 선택 시 사용 — 기본 선택엔 안 씀).

### 4.4 컬럼 정렬 (신규) — `src/utils/tennis/useSortableRows.js` + `SortHeader`

지표 테이블 헤더 클릭으로 정렬. 8+ 테이블에 중복 없이 적용하기 위한 공용 훅/컴포넌트.

**훅**: `useSortableRows(rows, accessors, initial?)`
- `accessors`: `{ [key]: (row) => value }` — 컬럼별 정렬값 추출기.
- `initial`: `{ key, dir } | null` — 기본 정렬(대개 `null` = build 함수 순서 유지).
- 반환: `{ sorted, sort, onSort }`.
  - `sort`: `{ key, dir } | null` (현재 활성 정렬).
  - `onSort(key)`: 같은 key면 dir 토글, 다른 key면 그 컬럼의 **기본 방향**으로 활성화.
  - `sorted`: `sort`가 null이면 `rows` 원본 순서, 아니면 정렬본(안정 정렬을 위해 `[...rows]` 후 비교).
- 비교기: 숫자면 수치 비교, 문자면 `localeCompare(…, 'ko')`. `dir==='desc'`면 부호 반전.
- **기본 방향**: 컬럼 타입에 따라 — 숫자 컬럼 첫 클릭=`desc`, 텍스트 컬럼 첫 클릭=`asc`. 타입은 `accessors`와 함께 컬럼 메타로 전달하거나, accessor가 반환하는 값 타입으로 판정(number → desc, string → asc).

**컴포넌트**: `SortHeader({ label, sortKey, sort, onSort, align, ds })`
- `<th>`를 렌더, 클릭 시 `onSort(sortKey)`. 활성 컬럼이면 라벨 뒤 `▲`(asc)/`▼`(desc) 표시, 비활성이면 옅은 정렬 가능 표식(선택). 기존 `ds.th` 스타일 유지 + `cursor: pointer`.

**적용**: 각 섹션 테이블에서 `useSortableRows`로 rows를 감싸고 `<th>`를 `<SortHeader>`로 교체. 정렬 키 매핑:
- 복식 순위: 이름(text)·등급(text)·전적(승수 `s.wins`)·승률(`s.rate`)
- 단식 순위: 이름·리그(`leagueTier`)·등급·전적(`wins`)·승률(`rate`)·P(`points`)
- 페어 케미: 페어(text, `players.join`)·전적(`wins`)·승률(`rate`)
- TB: 이름·승판(`tbWon`)·승률(`rate`)
- 베이글: 이름·준(`given`)·먹음(`taken`)
- 에이스·DF: 이름·에이스(`aces`)·DF(`doubleFaults`)·경기수(`recordedGames`)
- 파트너별: 파트너(text)·전적(`wins`)·승률(`rate`)
- 상대전적: 상대(text)·전적(`wins`)·승률(`rate`)
- 연도별: 시즌(text)·전적(`wins`)·승률(`rate`) — 단, "통산" 행은 정렬 시에도 맨 아래 고정 여부는 구현 판단(간단히 함께 정렬 허용).

셀 렌더는 기존 그대로(등급 fontSize, 리그 BK/BR 변환 등) 유지 — 훅은 **행 순서만** 바꾼다.

### 4.5 무영향 보장

- 공유 `TeamDashboard.jsx`: 테니스 분기 배열만 신설, 비테니스 배열은 의미 보존. 축구/풋살 탭·렌더 무변경.
- 분석 계산 유틸 로직 무변경(정렬은 컴포넌트 계층에서 래핑, build 함수 미변경).
- 새 파일(`useSortableRows.js`, `SortHeader`)은 테니스 전용 — 타 종목 미참조.
- 상태·동기화 스키마 변경 없음. 시트/Apps Script 무수정.

## 5. 테스트

- **`useSortableRows` 유닛**: 숫자 desc 우선·텍스트 ko asc·같은 key 토글(asc↔desc)·다른 key 전환·`initial=null`이면 원순서·안정성(동값 순서 보존).
- **분석 뷰 전환**(렌더 또는 순수 함수 스모크): `player=''`이면 전체 섹션만(순위·케미·TB·베이글·에이스), 개인 전용 섹션(요약카드·파트너별·상대전적·월별·연도별) 미표시. `player='홍길동'`이면 반대. 복식/단식 각각.
- **요약 카드**: `buildPlayerSummary` 반환값(단·복식 전적·출석·에이스·DF·TB·베이글) 표기 확인.
- **탭 배열 회귀**: 테니스(관리자)=`[대시보드, 분석, 경기관리, 회원관리]`, 테니스(비관리자)=`[대시보드, 분석, 경기관리]`(개인기록 없음, 회원관리 없음); 축구/풋살 탭 배열 기존 유지 — 기존 `analyticsTabs.smoke.test.jsx`가 비테니스 회귀 감시.
- 전체 스위트(820) 통과 유지 + 신규 테스트.

## 6. 하위 호환·리스크

- 개인기록 탭 제거로 딥링크/기본탭이 `roster`를 가리키면 문제 — 테니스 기본은 `records`라 무해. `roster` 잔여 참조(테니스 경로) 없는지 확인.
- `player` 기본값 변경(본인→미선택)으로 첫 진입 화면이 전체 랭킹으로 바뀜(의도된 변경).
- 정렬 상태는 컴포넌트 로컬(탭/포맷 전환 시 초기화) — 세션 지속 불필요.
