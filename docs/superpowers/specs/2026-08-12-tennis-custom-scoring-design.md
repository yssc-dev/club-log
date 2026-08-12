# 테니스 커스텀 스코어링 옵션 설계

- 날짜: 2026-08-12
- 대상: 몽피스(테니스)
- 선행: `2026-08-06-tennis-mode-design.md`(도메인 규칙), `2026-08-12-tennis-round-confirm-design.md`

## 1. 배경과 목표

경기 생성 시 상단에서 팀별로 스코어링 규칙을 고를 수 있게 한다. 클럽이 시간 제약 등으로 규칙을 바꿔 칠 때 앱이 그대로 기록하도록. **2개 옵션만** 지원한다.

1. **타이브레이크 방식**: 5:5 도달 후 노애드 7점 TB(현재) ↔ **단판 1포인트 데스**(첫 포인트 딴 쪽이 세트 승).
2. **에이스/더블폴트 스코어 반영**: 분석 지표 전용(현재) ↔ **게임 점수에도 반영**(에이스=서버 편 +1, DF=상대 편 +1).

## 2. 확정된 결정 (2026-08-12 유저)

| 항목 | 결정 |
|---|---|
| TB 진입 기준 | **5:5 고정** — 6:6(정식 세트)은 지원하지 않음. `tiebreakAt` 옵션 없음 |
| TB 1점 모드 동작 | 5:5 도달 → 한 포인트 승부 → 이긴 쪽 6:5 세트 승(단판 데스) |
| 에이스/DF 스코어 반영 | 에이스=서버 편 게임 +1, DF=상대 편 게임 +1. `stats`는 어느 경우든 그대로 누적 |
| TB 진행 중 에이스/DF | **stats만 누적, 게임/TB 점수 미반영** — TB 포인트는 기존 TB 버튼으로만(UX 단순) |
| 설정 위치 | 경기 생성(참석자 설정) 화면 상단. 값은 경기 상태에 스냅샷 고정, 중간 변경 없음 |
| 적용 범위 | **신규 경기만.** 기존/진행 중 경기·마이그레이션 499판·레거시는 무영향 |

## 3. 설정 스키마

`src/config/settings.js`의 `SPORT_DEFAULTS.테니스`에 추가:

```js
scoringRules: {
  tiebreakMode: '7point',   // '7point'(5:5 노애드 7점 TB) | '1point'(5:5 단판 데스)
  acesDfAffectScore: false, // false(분석 전용) | true(게임 점수 반영)
},
```

몽피스 기본값 = 현재 동작(`'7point'`, `false`)이라 아무 설정 안 해도 지금과 동일하다. 팀 override(`getEffectiveSettings`)로 팀별 기본값 변경 가능. `PRESETS.테니스`에 프리셋 추가는 선택(이번엔 SPORT_DEFAULTS만으로 충분).

## 4. 경기 상태 + 동기화

- 경기 생성 시 `state.scoringRules`에 선택값 스냅샷 저장(경기 불변).
- **동기화 등록**(라운드 확정 회귀 교훈 반영 — 테니스 전용 필드라 풋살 무관):
  1. `firebaseSyncDiff.js` `TENNIS_WHOLE_REPLACE_FIELDS`에 `scoringRules` 추가(테니스 전용 통짜 필드).
  2. `reconstructState`에 `scoringRules: raw.scoringRules` 복원(기본값 땜질 금지 — normalize가 담당).
  3. `normalizeTennisMatch.js`에 `scoringRules` 기본값 보정 — 없으면 `{ tiebreakMode: '7point', acesDfAffectScore: false }`(하위 호환: 기존 경기는 현재 동작 유지).
  4. `useTennisReducer.js` `tennisInitialState`에 `scoringRules` 기본값 선언.
  5. `tennisSyncCoverage.test.js` 분류 가드 통과 + 왕복 테스트에 scoringRules 포함(회귀 교훈).

## 5. 스코어링 엔진 파라미터화 (`tennisScoring.js`)

현재 하드코딩을 `rules`(또는 개별 인자)로 파라미터화. 5:5 진입은 고정이므로 `isTiebreakActive`(5:5 판정)는 불변.

- **`incrementTiebreakPoint(set, side, rules)`**:
  - `tiebreakMode === '7point'`(기본): 현재대로 7점 도달 시 6번째 게임 확정(6:5).
  - `tiebreakMode === '1point'`: **첫 포인트**(tbA/tbB가 1이 되는 순간) 즉시 6번째 게임 확정(6:5). 승자 측 `tbA`(또는 `tbB`)=1로 기록 → `summarizeCourt`가 `tbA/tbB>0`으로 tb_played=1 감지(마이그레이션 sentinel과 동일 패턴, 로그 일관).
  - UNDO: `tb` 항목 되돌릴 때 7점→5게임 복원 로직이 1point 모드에도 맞게(1점 도달로 6게임 됐으면 되돌릴 때 5로) — 기존 UNDO의 `>= 7 ? 5` 조건을 모드에 맞게 일반화.
- 함수 시그니처가 바뀌므로 호출부(리듀서 `INCREMENT_TIEBREAK_POINT`)가 `state.scoringRules`를 넘긴다.

## 6. 에이스/DF 스코어 반영 (`useTennisReducer.js` `INCREMENT_STAT`)

`state.scoringRules.acesDfAffectScore === true`일 때:
- 에이스: `stats.aces+1` **+ 서버 편(그 선수의 side) 게임 +1**.
- 더블폴트: `stats.df+1` **+ 상대 편 게임 +1**.
- 게임 점수 증가는 기존 `incrementGame` 경로를 재사용(TB 진입/세트 종료 자동 판정, 이미 6게임이거나 TB 활성이면 무시).
- **TB 진행 중(isTiebreakActive)**: stats만 +1, 게임/TB 점수 미반영(§2 결정).
- UNDO: 스코어 반영 모드에서 에이스/DF를 되돌리면 stats와 게임 점수 **둘 다** 되돌려야 한다 — undoStack 항목에 "점수도 올렸음" 표식 필요(예: `kind: 'statScore'` 또는 기존 stat 항목에 `scored: true` 플래그). `false` 모드는 기존 `stat` 항목 그대로.
- `acesDfAffectScore === false`(기본): 현재 동작 그대로(stats만).

선수→side 매핑: 코트의 `sideA`/`sideB`에서 그 선수가 어느 편인지 찾아 게임 점수를 올린다.

## 7. UI (경기 생성 화면 상단)

`TennisAttendeeSelector`(참석자 설정) 상단에 규칙 선택 영역:
- 타이브레이크: [노애드 7점] / [단판 1점] 토글
- 에이스·DF: [분석 전용] / [점수 반영] 토글
- 기본값은 팀 설정(`getEffectiveSettings`)에서 로드. 선택 시 `dispatch({ type: 'SET_SCORING_RULES', rules })`로 state 갱신. `ADD_ROUND`(경기 시작) 전까지만 변경 가능하게(경기 시작 후엔 고정 — 상단에 읽기 전용 표시 또는 숨김).

## 8. 로그·분석 영향

- 스코어 결과는 이미 `sets`/`games`에 반영되므로 로그(`buildTennisMatchRows`/`buildTennisPlayerGameRows`)는 **변경 없음**. `scoringRules`는 로그에 남기지 않는다(결과로 충분).
- `tb_played`/`tb_won`은 어느 TB 모드든 5:5를 거쳐 tbA/tbB>0이면 1로 집계 → 분석 탭 TB 지표 일관.
- 에이스/DF는 `stats`에서 나오므로 스코어 반영 여부와 무관하게 분석 탭 에이스·DF 집계 동일.

## 9. 하위 호환

- 진행 중 기존 경기(scoringRules 없음): normalize가 `{ '7point', false }` 보정 → 현재 동작 유지.
- 마이그레이션 499판·레거시: 로그 데이터라 이 설정과 무관.
- 풋살/축구: 테니스 전용 필드·파일만 수정, 무영향.

## 10. 테스트

- `tennisScoring.js`: 1point 모드 incrementTiebreakPoint(첫 포인트→6:5), 7point 모드 회귀(기존), UNDO 양 모드.
- 리듀서: `SET_SCORING_RULES`, `INCREMENT_STAT` 스코어 반영(에이스→서버편, DF→상대편, TB 중 stats만), UNDO 스코어 되돌림, 스냅샷 불변.
- normalize/동기화: scoringRules 기본값 보정, 왕복 보존, 분류 가드.
- UI 스모크: 토글 동작, 경기 시작 후 고정, 두 모드 실제 스코어 흐름.

## 11. 범위 밖

- 6:6 정식 세트, 매치 타이브레이크(10점), 애드 방식 등 다른 TB 변형.
- 코트별 규칙 차등(경기 단위 공통).
- 규칙 프리셋 UI(SPORT_DEFAULTS 기본값으로 충분).
