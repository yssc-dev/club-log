# 테니스 설정 화면 정리 설계

- 날짜: 2026-08-12
- 대상: 몽피스(테니스)
- 선행: `2026-08-12-tennis-custom-scoring-design.md`(scoringRules)

## 1. 배경과 문제

`src/components/common/SettingsScreen.jsx`는 풋살/축구/테니스 **공용 컴포넌트**인데, 종목 분기가 `isSoccer`(축구)만 있고 **테니스는 별도 분기가 없어 풋살 UI를 그대로 재사용**한다(`isSoccer ? 축구 : 풋살`의 else로 테니스가 빠짐). 그 결과 테니스 설정 화면에:
- 구글시트 설정(시트 선택들) — 테니스는 전용 시트 3종이라 무의미
- 크로바/고구마·자책골 포인트 — 풋살 마스터FC 커스텀인데 노출(`:346-370`)
- 관리자 툴(Firebase→로그_매치 덮어쓰기 등) — 풋살/축구 전용(buildRoundRowsFromFutsal/Soccer)인데 노출
가 잘못 표시된다. 또 커스텀 스코어링(scoringRules)의 팀 기본값을 설정하는 UI가 없다(경기 생성 시 토글만 있음).

## 2. 확정된 결정 (2026-08-12 유저)

| 항목 | 결정 |
|---|---|
| 테니스 설정 구성 | 경기규칙(프리셋 + 커스텀 토글)만. 구글시트 설정·관리자 툴 숨김 |
| 타이브레이크 라벨 | **"타이브레이크 시"** — 설정 화면과 경기 생성 화면 통일 |
| scoringRules 저장 | 팀 override로 저장(기존 saveSettings 재사용) → 경기 생성 시 로드(이미 구현). 경기별 조정도 유지 |

## 3. 설계

### 3.1 SettingsScreen 종목 분기 (`isTennis` 추가)

`const isTennis = teamMode === '테니스';` 추가. **`isSoccer` 분기와 풋살(else) 경로는 절대 수정하지 않는다**(풋살/축구 무영향).

- **구글시트 설정 섹션**(`:302-316`): `{!isTennis && (…)}`로 감싸 테니스에서 숨김.
- **경기규칙 설정**(`:340-370`): 분기를 `isSoccer ? (축구) : isTennis ? (테니스) : (풋살)`로 확장.
  - 테니스 블록: 프리셋 select + description(기존 `:320-339` 공통 유지) 아래에 커스텀 토글 2개:
    - **"타이브레이크 시"** — [노애드 7점] / [단판 1점] (세그먼트 버튼)
    - **"에이스·더블폴트"** — [분석 전용] / [점수 반영]
  - 값은 `settings.scoringRules.{tiebreakMode, acesDfAffectScore}`. 변경 시 `update('scoringRules', { ...settings.scoringRules, [key]: v })`.
  - `settings.scoringRules`가 없을 수 있으니 `settings.scoringRules?.tiebreakMode ?? '7point'` 방어(기존 경기 규칙 기본값과 동일).
  - 크로바/고구마·자책골(`:346-370` else)은 테니스 블록에 넣지 않음(자동 제외).
  - 크로바 details(`:372-385`)는 `!isSoccer && settings.useCrovaGoguma` 조건이라 테니스(useCrovaGoguma 없음)엔 안 뜸 — 그대로 두되, 명시적으로 `!isTennis`도 추가해 방어.
- **관리자 툴 섹션**(`:388-`): `{isAdmin && !isTennis && (…)}`로 테니스에서 숨김.

### 3.2 scoringRules 저장/로드

- `saveSettings`는 `effectiveValues` 순회로 override 계산(`settings.js:126-135`) — `scoringRules`가 `TENNIS_KEYS`에 있고(이전 작업 추가됨), 객체라 참조 비교로 override에 저장된다. `getEffectiveSettings(team, '테니스').scoringRules`가 반환되어 경기 생성 시 로드(TennisApp 이미 구현).
- 별도 저장 로직 불필요 — 기존 경로 재사용.

### 3.3 라벨 통일

- 경기 생성 화면 `TennisAttendeeSelector`의 규칙 토글 라벨 `"타이브레이크(5:5)"` → **`"타이브레이크 시"`**. (5:5 진입 조건은 프리셋 설명/힌트로 이미 표시되므로 라벨에서 뺌.)

## 4. 하위 호환·범위

- 풋살/축구: `isSoccer`·else(풋살) 분기 무수정 → 완전 무영향. 공용 컴포넌트지만 테니스 분기만 추가.
- scoringRules 없는 기존 테니스 설정: `?? '7point'`/`?? false` 방어로 기본값 표시.
- 새 상태 필드·동기화 변경 없음.

## 5. 테스트

- SettingsScreen 렌더 스모크(브라우저): 테니스 설정에 구글시트/크로바/관리자툴 미표시, 타이브레이크 시·에이스 토글 표시·동작, 저장 후 경기 생성 시 반영. 풋살/축구 설정 화면 무변경 확인.
- (기존 settings.test.js가 scoringRules override 저장/로드를 커버하는지 확인, 없으면 케이스 추가.)
- RTL 하네스 부재 → 선언 순서 육안 + diff 정독 + 브라우저 스모크.

## 6. 범위 밖

- 분석·대시보드·탭 재편(별도 대개편).
- 회원명부 설정(시트에서 관리).
