# 하버FC 출석률 — 날짜 기반 경로 신뢰성 확보

2026-08-12 · 승인됨

## 문제

하버FC(축구) 앱 대시보드의 "출석률 TOP 10"이 경기수를 "N일"로 표기한다(예: 주건호
100%(99일) — 99는 대시보드 시트의 전체경기 누적, 하루 2~3경기 포함). 날짜 기반 계산
코드(1a37be1, 2026-04-09)는 배포돼 있으나, 선수별집계 로그 조회가 빈 결과일 때
경기수 폴백이 "일" 단위로 표기돼 오진을 유발한다.

## 원인

1. **settings.js 캐시 키 불일치**: `getSettings`는 `_cache[_key(team)]`을 읽는데
   `loadSettingsFromFirebase`/`getEffectiveSettings`/`_hydrateCacheFromStorage`는
   `_cache[team]`에 쓴다. RTDB 로드가 끝나도 같은 세션의 `getSettings`는 낡은 값
   (최초 조회 시점의 localStorage 값, 최악엔 `{}`)을 계속 반환한다.
2. **대시보드 로드 레이스**: TeamDashboard effect가 마운트 즉시
   `getSettings(팀).playerLogSheet`로 조회한다. RTDB 설정 도착 전이면 기본 시트명
   `"선수별집계기록로그"`(하버FC에 없음)으로 조회하고 재시도 트리거가 없다 →
   `attendanceData`가 영영 null → 경기수 폴백.
3. **폴백 표기 오류**: 축구에서 attendanceData가 없으면 대시보드 시트의
   전체경기(경기수)를 그대로 "N일"로 표기한다.

## 수정 (A안: 앱 신뢰성 픽스 3종 — Apps Script 무수정)

### 1. settings.js — getSettings 캐시 통일

`getSettings(team)`을 `_hydrateCacheFromStorage(team)` + `_cache[team]` 기반으로
재작성해 나머지 함수와 같은 캐시를 보게 한다. 빈 결과(`{}`)를 캐시에 고정하는
부정 캐시를 제거한다. 리턴 형태는 기존과 동일:
`{ ...DEFAULTS, ...(stored.shared || {}), ...stored }`.

### 2. TeamDashboard — 설정 로드 완료 후 데이터 조회

대시보드 effect를 async로 바꿔 `loadSettingsFromFirebase(teamName, teamEntries)`를
먼저 await(실패 시 catch — 기존 localStorage 값으로 진행)한 뒤
`fetchSheetData` · `getLatestDeltas` · 축구 조회(`getPlayerLog`/`getPointLog`)를
실행한다. 팀 전환 시 낡은 응답이 상태를 덮지 않도록 cancelled 가드를 추가한다.
effect deps(`[teamName, hasSoccerEntry, isTennis]`)는 유지한다.

### 3. 출석률 위젯 폴백 표기 수정

- 날짜 집계를 순수 함수 `buildAttendanceData(plog)` → `{ totalDates, playerDates }`로
  추출한다.
- 위젯 분기도 순수 함수로 추출한다(예:
  `buildAttendanceView(activeSport, attendanceData, members, maxGames)` →
  `{ mode: 'dates' | 'games' | 'empty', totalDates, list }`).
- 축구 + attendanceData 없음 → `empty` 모드: "출석 데이터 없음" 문구.
  경기수를 "일"로 표기하는 폴백은 제거한다.
- 풋살 경로(`games` 모드, 기존 경기 기반 목록)는 무변경.

## 테스트 (TDD)

- settings: RTDB 로드(모킹) → 같은 세션 `getSettings`에 즉시 반영. 기존
  `src/config/__tests__/tennisSettings.test.js` 모킹 패턴 재사용.
- `buildAttendanceData`: 같은 날짜 여러 행(하루 다경기) → 유니크 날짜로 집계.
- `buildAttendanceView`: 축구+null→empty / 축구+데이터→dates / 풋살→games.
- 전체 vitest + 빌드. RTL 부재 → jsx 변경분 diff 정독으로 렌더 검증 보강.

## 배포·검증

push만으로 GitHub Actions 자동 배포(Apps Script 무수정). 배포 후 하버FC
대시보드에서 "N일"이 실제 출석일수 수준으로 나오는지 확인. "출석 데이터 없음"이
뜨면 콘솔의 `[sheet] GET action=getPlayerLog sheet="..."` 로그로 후속 진단.

## 스코프 외 / 한계

- 선수별집계 로그는 "출전 경기가 있는 사람만 입력"이므로 참석했지만 0경기인
  사람은 출석일에 잡히지 않는다(데이터 구조 한계).
- Apps Script 서버 폴백(B안), 로그_매치 기반 재계산(C안)은 채택하지 않음.
- 구글 시트 쪽(선수기록보관소·대시보드) 수치·수식은 건드리지 않는다.
