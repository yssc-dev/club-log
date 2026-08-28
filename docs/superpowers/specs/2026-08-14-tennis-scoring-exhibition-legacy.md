# 테니스 스코어링·번외·2026 집계 3종 설계

**작성일:** 2026-08-14 · **대상:** 몽피스 테니스 (tennis-league 워크트리)

확정된 3개 독립 변경. 모두 로직 변경, 읽기 전용 분석은 유지(시트 쓰기는 유저 붙여넣기).

## A. 스코어링: 노에드7 → 7:5

**파일:** `src/utils/tennis/tennisScoring.js`, `__tests__/tennisScoring.test.js`

- 현재: 5:5 타이브레이크 승자가 6게임 획득 → **노에드7·단판1점 둘 다 6:5**.
- 변경: **노에드7(7point) 승자 = 7게임 → 7:5**. **단판1점(1point) = 6게임 → 6:5 유지**. 6게임 이전 종료(6:0~6:4)는 불변.
- `incrementTiebreakPoint`: 승리 시 `winGames = (rules.tiebreakMode === '1point') ? GAMES_TO_WIN_SET : GAMES_TO_WIN_SET + 1`. (7 ≥ 6이라 `isSetComplete`/`setWinner`/`summarizeCourt` 모두 정상.)
- 테스트: 7point → {a:7,b:5}; 1point → {a:6,b:5}; 임계 미만 점수는 미완료.

## B. 번외경기 (게스트 분리)

> **⚠️ 정정 (2026-08-28):** 이 절의 "게스트 1명이라도 끼면 번외" 규칙은 몽피스 회원 규정 및 원 스펙(2026-08-06 §4.4)과 어긋난 것으로 확인돼 되돌렸다. 규정: **단식리그(길로틴) = 회원끼리만 / 복식리그(투몽) = 회원 3명 이상 참여 시 성립**. 규칙은 `src/utils/tennis/leagueRule.js` 한 곳(`leagueForComposition`·`isLeagueByGuests`)에 두고, 기록 시점(`determineCompetition`)과 분석 시점(`isLeagueRow`·`buildLeagueCounts`·순위표·개인 전적·선수 성적표)이 공유한다. 분석은 시트 `league` 라벨이 아니라 **참가자 구성(게스트 수)** 으로 판정한다 — 8-14~28 사이 앱이 '미반영'으로 저장한 복식 10판(회원 3+게스트 1)은 Apps Script `relabelTennisLeague`로 라벨을 투몽으로 정정. 실측(2026-08-28): 회원 3+게스트 1 복식 129판이 잘못 번외 처리되고 있었음(전체 복식의 25%).


**규칙:** 참가자 **전원 회원**이면 리그(투몽/길로틴), **게스트 1명이라도** 끼면 **번외**. 전체 = 투몽 + 길로틴 + 번외.

**현황:** `determineCompetition`(tennisRowBuilders.js) — 단식은 이미 전원회원만 길로틴(게스트 단식=미반영 ✓). **복식은 `memberCount >= 3`이면 투몽 → 게스트 1명 낀 복식이 투몽 집계됨(갭).**

**변경:**
1. **기록 시점** (`tennisRowBuilders.js` `determineCompetition`): 복식 `memberCount >= 3` → `memberCount === 4`(전원). 향후 저장값 일치.
2. **분석 시점 재분류** (기존 26년 데이터 반영):
   - `tennisAnalytics.js`에 `guestMatchKeys(rows)` → 게스트 행이 하나라도 있는 `game_id|match_id` Set.
   - `buildDoublesStandings`: 기존 필터에 더해 **guestMatchKeys에 속한 match의 모든 행 제외**(회원 행도). → 게스트 복식이 투몽에서 빠짐.
   - `buildSinglesStandings`: guestMatchKeys 제외 추가(방어 — 이미 league='미반영'로 대부분 걸러지나 일관).
3. **카운트** (`tennisAnalytics.js` 신규 `buildLeagueCounts({ rows })`): distinct match별 분류 — 게스트 있으면 번외, 없으면 format으로 투몽(복식)/길로틴(단식). 반환 `{ tumong, guillotine, exhibition, total }`(total=distinct match 수).
4. **리그 탭 표시**: 연도 상단에 카운트 줄 "투몽 N · 길로틴 M · 번외 K · 전체 T"(그 연도 rows 기준).

**테스트:** determineCompetition 복식 4회원=투몽/3회원1게스트=미반영; buildDoublesStandings 게스트 복식 제외; buildLeagueCounts 합=전체.

## C. 2026 1~7월 단식 집계 병합

**데이터:** `테니스_레거시전적` 시트에 `season=2026, format=단식` 16행 추가(유저 붙여넣기, W/L만). 상세 로우 없음 → **포인트 불가**.

**변경:**
1. `buildSinglesStandings`에 `legacySingles = []` 파라미터: 각 원소 `{player, wins, losses}`를 로스터 선수의 wins/losses/games/rate에 **가산**. **points는 불변**(로우만).
2. `buildPlayerSummary`에 `legacySingles = []`: 해당 선수의 legacy W/L을 `singles` 버킷에 가산(aces/DF/TB/베이글·출석은 로우만).
3. `tennisDateFilter.js` 신규 `legacySinglesForYear(legacyRows, year)` → legacyRows에서 `format==='단식' && season===year` 필터 → `[{player, wins, losses}]`.
4. **리그 탭**: row-year 길로틴 standings에 `legacySingles: legacySinglesForYear(legacyRows, effYear)` 전달. 해당 연도 legacy 존재 시 길로틴 섹션 아래 주석 "※ {year}년 1~7월 집계 포함 · 포인트는 8월~ 경기만".
5. **분석 개인 종합**: 월 미선택(전체 연도)일 때만 `buildPlayerSummary`에 `legacySinglesForYear(legacyRows, effYear)` 전달(특정 월 선택 시 미포함 — legacy는 1~7월 집계라 월 귀속 불가).
6. `buildYearlyRecords`: **변경 없음** — 이미 legacy+rows를 season별 합산(2026 연도별 카드에 1~7월+8월~ 자동 합산).

**주의:** legacy는 W/L만 → 승률/전적/연도별 카드에만 반영, 포인트·페어·상대·월별·TB·베이글·에이스는 로우만. 라벨 "1~7월"(월 구분 없음).

**테스트:** buildSinglesStandings legacy 가산(W/L·rate 반영, points 불변); buildPlayerSummary legacy 단식 가산(다른 지표 불변); legacySinglesForYear 필터.

## 파일 영향
| 파일 | 변경 |
|------|------|
| `tennisScoring.js` | 노에드7 7:5 (A) |
| `tennisRowBuilders.js` | 복식 전원회원=투몽 (B) |
| `tennisAnalytics.js` | guestMatchKeys·buildDoublesStandings 제외·buildLeagueCounts (B) |
| `tennisStandings.js` | buildSinglesStandings/buildPlayerSummary legacySingles (C)·guestMatchKeys 제외(B) |
| `tennisDateFilter.js` | legacySinglesForYear (C) |
| `TennisLeague.jsx` | 카운트 줄(B)·legacy 전달+주석(C) |
| `TennisAnalyticsTab.jsx` | 개인 종합 legacy 전달(C) |
| 각 `__tests__` | A/B/C 유닛 |

## 배포 밖
- 시트 쓰기(유저 붙여넣기) · 문서/페이지(별도 갱신) · 스코어링 기존 저장 6:5는 소급 안 함(향후만).
