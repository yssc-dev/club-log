# 테니스 경기 진행·입력 UX 수정 설계

- 날짜: 2026-08-12
- 대상: 몽피스(테니스). 유저 실사용 중 발견한 버그·UX 4건.

## 1. 배경

유저가 실제 경기 입력 중 발견한 실사용 버그/UX 이슈 4건을 묶어 수정한다(분석 대개편보다 우선).

## 2. 이슈와 결정 (2026-08-12 유저)

| # | 이슈 | 결정 |
|---|---|---|
| 1 | 용병 이름 입력칸이 흰 화면에서 안 보임(배경/테두리 구분 안 됨) | 입력칸에 보이는 테두리/배경을 줘서 입력 필드임이 드러나게 |
| 2 | 용병 칩이 참석 처리인데 회색(비참석처럼 보임) | 용병 칩도 **참석 = 파란색**(로스터 참석 칩과 동일) |
| 3 | 6대2 일괄 입력 불가 — 6게임 먼저 찍으면 상대 점수 안 들어감 | `incrementGame`이 유효 세트 스코어(6:0~6:4) 범위에서 **순서 무관 입력** 허용. 5:5→TB, 6:5는 TB 결과만 유지 |
| 4 | 라운드 확정 후 '+ 라운드'가 작아 다음 진행이 안 보임 | 확정 상태 하단 바에 **"다음 라운드 시작"(큰 파란)** 주버튼 + **"확정취소"(작은 보조)** |
| 5 | 1점 데스 모드가 5:5→별도 TB 화면(0:0 승부포인트)으로 전환 | 1점 모드엔 **TB 단계/화면 제거**. 5:5 그대로 두고 게임 버튼 1번 더 → 6:5 세트 승. (7점 모드는 기존 TB 유지) |

## 3. 설계

### 3.1 용병 입력칸 (이슈 1) — `TennisAttendeeSelector.jsx`

용병 이름 `<input>`에 명확한 테두리를 준다. 현재 `s.input`은 `border: 1px solid transparent`라 흰 배경에서 안 보임. 이 input만 인라인으로 `border: 1px solid ${C.borderColor}`(또는 `grayDarker`)를 덮어씌우거나, placeholder를 더 명확히. 풋살/축구 공용 `s.input`은 건드리지 않고 이 사용처만 오버라이드.

### 3.2 용병 칩 색 (이슈 2) — `TennisAttendeeSelector.jsx`

용병 칩 `style={{ ...s.chip(false), cursor: 'default' }}` → `s.chip(true)`(참석=파란). 용병은 추가 즉시 참석이므로 로스터 참석 칩과 동일한 파란색. `cursor: 'default'`는 유지(용병은 탭으로 토글 안 함).

### 3.3 6대2 일괄 입력 + 1점 데스 통합 (이슈 3+5) — `tennisScoring.js` `incrementGame(set, side, rules)`

현재 `if (!set || set.done || isSetComplete(set)) return set;` — 한쪽이 6이면 전면 차단, 5:5는 항상 TB. 이를 **rules(tiebreakMode)를 받아 유효 세트 스코어 유지**로 교체:

```js
export function incrementGame(set, side, rules = {}) {
  if (!set || set.done) return set;
  const oneMode = rules.tiebreakMode === '1point';
  if (!oneMode && isTiebreakActive(set)) return set;   // 7점 모드: 5:5는 TB 포인트로
  const key = side === 'A' ? 'a' : 'b';
  const other = side === 'A' ? 'b' : 'a';
  const nextVal = (set[key] || 0) + 1;
  const otherVal = set[other] || 0;
  if (nextVal > GAMES_TO_WIN_SET) return set;                                    // 7 이상 금지
  if (nextVal === GAMES_TO_WIN_SET && otherVal === GAMES_TO_WIN_SET) return set; // 6:6 금지
  if (oneMode) return { ...set, [key]: nextVal };  // 1점 모드: 6게임 도달이 승(6:5 허용), TB 없음
  // 7점 모드: 6:5는 TB 결과만 — 게임 입력으로 6:5 금지
  if (nextVal === GAMES_TO_WIN_SET && otherVal >= 5) return set;
  if (nextVal === 5 && otherVal === GAMES_TO_WIN_SET) return set;
  return { ...set, [key]: nextVal };
}
```

- **이슈 3(일괄 입력)**: 6:0에서 상대 게임을 6:4(7점)/6:5(1점)까지 순서 무관 입력 가능. 6:6·7:x 방지.
- **이슈 5(1점 데스 TB 제거)**: 1점 모드는 5:5에서 게임 버튼 그대로 → nextVal=6 → 6:5 세트 승. TB 화면/포인트 없음. 7점 모드는 5:5→TB 유지.
- `isSetComplete`(6게임)는 "세트 종료" 버튼 활성 판정용으로 유지. 매치 종료는 END_SET의 `matchWinner`(6게임 선취) — 6:5(1점)도 승자 확정, 변화 없음.
- 시그니처가 `rules` 추가로 바뀌므로 호출부(리듀서 `INCREMENT_GAME`, `INCREMENT_STAT`의 스코어 반영 시 `incrementGame`)가 `state.scoringRules`를 넘긴다. `rules` 없으면 7점 기본(하위호환).
- UNDO(game 케이스)·마이그레이션(incrementGame 미사용) 무영향.

### 3.5 1점 모드 TB 화면 제거 (이슈 5) — `TennisCourtRecorder.jsx` + 리듀서

- **recorder**: `const tb = isTiebreakActive(cur) && rules?.tiebreakMode !== '1point';` 로, 1점 모드면 5:5여도 TB 화면(포인트 버튼·"타이브레이크(N점)" 텍스트) 대신 **게임 화면 유지**. recorder에 `scoringRules` prop 전달(TennisApp→card→recorder, 이미 스코어링 작업에서 배선됨 — 확인).
- **리듀서**: `INCREMENT_GAME`이 `incrementGame(cur, action.side, state.scoringRules)` 호출. `INCREMENT_TIEBREAK_POINT`는 7점 모드에서만 UI가 호출(1점은 게임 버튼). `INCREMENT_STAT`의 스코어 반영 `incrementGame`에도 `state.scoringRules` 전달.
- **1점 모드 6:5의 tb_played**: 게임으로 만들므로 `sets`에 tbA/tbB 없음 → `summarizeCourt`가 `tb_played=0`으로 집계(1점 모드는 TB 개념 자체가 없으므로 일관). 분석 TB 지표는 7점 모드/마이그레이션 기반으로만 쌓임.
- 기존 1점 구현(`incrementTiebreakPoint` threshold 1)은 이 변경으로 1점 모드에서 미사용 경로가 된다. `incrementTiebreakPoint`는 7점 전용으로 남기고 시그니처/테스트 정리(1점 관련 케이스는 incrementGame 쪽으로 이전).

### 3.4 라운드 확정 후 하단 바 (이슈 4) — `TennisConfirmBar.jsx` + `TennisApp.jsx`

확정 상태(`isConfirmed`) + 이 라운드가 마지막이고 확정됨(`canAddRound`)일 때 하단 바:
- **주버튼** "다음 라운드 시작"(`s.btnFull(C.accent)`, 큰) → `onAddRound`(=ADD_ROUND 디스패치)
- **보조** "라운드 N 확정취소"(작게, 텍스트버튼 또는 `s.btnSm`)

중간 라운드 확정을 보고 있으면(`canAddRound` 아님) 기존대로 "확정취소"만. TennisConfirmBar에 `canAddRound`, `onAddRound` prop 추가, TennisApp에서 `isLastRoundConfirmed` 파생값과 `ADD_ROUND` 핸들러 전달. `TennisRoundNav`의 '+ 라운드'는 그대로 두거나(중복 무방) — 하단 강조가 주 경로.

## 4. 하위 호환·범위

- 풋살/축구 무영향: 테니스 파일만(`s.input`/`s.chip` 공용 스타일은 수정 않고 사용처 오버라이드).
- 새 상태 필드·동기화 변경 없음.
- 분석·대시보드 대개편은 별도(백로그).

## 5. 테스트

- `tennisScoring.js` incrementGame(rules):
  - 7점 모드(기본): 6:0→6:1(허용), 6:4→6:5(금지), 6:2→7(금지), 5:0→6:0(허용), 5:5 게임+1(TB로 무시=변화없음), 역방향 6:5 금지.
  - 1점 모드: 5:5→6:5(허용, 세트승), 6:0→6:5(허용), 6:6 금지, 7 금지.
  - rules 미전달 시 7점 기본(하위호환).
- 리듀서: INCREMENT_GAME이 scoringRules 전달, INCREMENT_STAT 스코어 반영도 rules 전달(회귀 없음).
- incrementTiebreakPoint 7점 전용 정리(기존 7점 테스트 유지, 1점 케이스는 incrementGame으로 이전).
- UI(용병 칩/입력, 라운드 버튼, 1점 모드 게임 화면): 브라우저 스모크(RTL 하네스 부재).
- 전체 스위트(807) 통과 유지.
