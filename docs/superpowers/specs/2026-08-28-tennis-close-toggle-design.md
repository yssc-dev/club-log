# 테니스 경기 마감 토글 설계 (2026-08-28, v3 — 적대적 리뷰 + 유저 UX 결정 반영)

## 배경 / 요구사항 (유저 원문 기반)

현재 테니스 앱의 마감 플로우:

```
경기 진행 화면(phase 'playing') ─[탭 "경기 마감"]→ phase='summary' → 마감 화면(TennisSummaryView)
마감 화면 ─[버튼 "마감 해제"(구 "← 경기로 돌아가기")]→ phase='playing' → 경기 진행 화면
```

즉 "마감"이 곧 "마감 화면으로 이동"이라, 경기 진행 화면에 있는 동안은 항상 마감 전 상태다.

유저 요구:
1. 마감 화면의 버튼은 **"← 경기로 돌아가기"** 로 되살리되 **화면 이동만** 한다(마감 상태는 유지).
2. 경기 진행 화면 탭바의 **"경기 마감" 버튼이 상태 토글**이 된다: 마감 전이면 "경기 마감", 마감 상태면 "마감 취소".
3. **경기 마감은 모든 라운드 확정이 필수 조건**(현재와 동일).
4. 제약: **앱이 실사용 중**이다. 진행 중인 경기에 영향을 주면 안 된다. 풋살·축구 무손상(기존 원칙).

## 관련 기존 사실 (리뷰어 5명이 검증 완료)

- `src/TennisApp.jsx`
  - 상태는 `useTennisReducer`; 상태가 바뀔 때마다 `FirebaseSync.saveState`로 RTDB `games/{team}/active/{gameId}`에 **통째로** 저장(첫 렌더는 skip). RTDB를 **구독하지 않는다**(로드 1회, `TennisApp.jsx:60`).
  - 화면 분기: `phase==='setup'` → 참석자 설정 / `phase==='summary'||'done'` → 마감 화면 / 그 외 → 경기 진행 화면.
  - 탭바 `finish` 탭(`TennisApp.jsx:185-195`): 관리자 게이트 없음(회원 누구나). `canFinish = allRoundsConfirmed(...)` 아니면 alert, 맞으면 `SET_PHASE summary`.
  - 하단 `TennisConfirmBar`: 보는 라운드 확정 여부에 따라 [라운드 N 확정] / [+ 다음 라운드 시작][라운드 N 확정취소]. 확정/확정취소 모두 `confirm()` 확인창이 이미 있다.
- `src/hooks/useTennisReducer.js`
  - `COURT_EDIT_ACTIONS`는 확정된 라운드에 대해 무시됨(리듀서 최상단 가드, 75행).
  - `SET_PHASE`(335-338행): `'playing'|'summary'`만 허용, **현재 phase가 `done`이어도 `playing`으로 되돌릴 수 있음**(UI 경로 없음, 리듀서 불변식 구멍).
  - `ADD_ROUND`(127-135행): phase를 `'playing'`으로 강제하며 라운드 추가 = **이미 "라운드 추가 = 마감 자동 해제"** 의미. `UNCONFIRM_ROUND`엔 phase 처리 없음.
  - `allRoundsConfirmed`는 import되어 있지 않음(8행은 `isRoundComplete`만).
- `src/components/tennis/TennisSummaryView.jsx`: `gameFinalized`가 아닐 때만 뒤로가기 버튼 표시. 관리자만 기록확정(시트 전송) → `FINALIZE` → 아카이브.
- `src/components/tennis/TennisTabs.jsx`: 목록 배지 — `gameFinalized` → 전송완료, `phase==='summary'` → 마감됨.
- `src/utils/tennis/autoUploadTargets.js`: 자동 업로드(KST 10:00/10:30)는 `phase ∈ {summary, done}`인 active 경기만 대상, updatedAt 10분 이내 수정 시 skip, 아카이브 완료 건 재업로드 차단.
- `src/hooks/__tests__/tennisReducerConfirm.test.js:50-56`: **라운드 미확정 `base`에서 `SET_PHASE summary`가 성공한다고 단언** → 리듀서 가드 추가 시 갱신 필요.
- 참석자(`attendees/guests`)는 시트 행 생성에서 회원/용병 구분에만 쓰임(`tennisRowBuilders.js:9-17`) — 마감 후 참석자 추가는 "전 라운드 확정" 불변식과 무관.

## 유저 결정 (v2 리뷰 후, 2026-08-28)

> 풋살은 하단에 경기로·구글시트전송·아카이브가 있고, 탭은 "마감취소"가 아니라 최종집계 화면으로 가는 버튼이다. 마감을 취소하는 버튼보다 이 UX가 맞다. 경기 수정이 필요하면 라운드 확정취소를 누르면 된다.

→ **"마감 취소" 버튼 없음.** 탭은 마감 화면 네비게이션(풋살 "최종집계"와 같은 역할). 마감 해제는 **라운드 확정취소**로만(이미 확인창 있음). 확인창 추가 논의는 소멸.

## 설계 v3

### 핵심 결정 (v1·v2와 동일): 마감 상태 = `phase: 'summary'` 그대로. "어느 화면을 보는지"만 로컬 UI 상태로 분리.

RTDB 스키마, 자동 업로드 판정, 목록 배지, 풋살·축구는 **무변경**.

### 플로우

```
경기 진행 화면 (phase playing)  ─[탭 "경기 마감": 전 라운드 확정 필수]→  SET_PHASE summary + showSummary=true → 마감 화면
마감 화면  ─[← 경기로 돌아가기]→  showSummary=false (phase summary 유지 = 마감 상태) → 경기 진행 화면
경기 진행 화면 (phase summary)  ─[탭 "마감 화면"]→  showSummary=true → 마감 화면 (상태 변경 없음)
경기 진행 화면 (phase summary)  ─[라운드 N 확정취소 (기존 확인창 + "마감도 취소됩니다")]→  UNCONFIRM_ROUND → phase playing (자동 해제)
```

### 변경 1 — `src/TennisApp.jsx`

- `const [showSummary, setShowSummary] = useState(false);`
- 로드 콜백(60-62행):
  ```js
  FirebaseSync.loadStateReconstructed(team, gameId).then(raw => {
    if (!raw) return;
    const normalized = normalizeTennisMatch(raw);
    dispatch({ type: 'INIT_STATE', state: normalized });
    if (normalized.phase === 'summary') setShowSummary(true);   // 기존처럼 마감 화면부터
  });
  ```
  (`useEffect([state.phase])` 방식 금지 — 멀티탭 재마감 시 화면 강제 전환)
- 화면 분기: `setup` → 참석자 설정 / `done` → 마감 화면 / `summary && showSummary` → 마감 화면 / 그 외 → 경기 진행 화면.
- `const closed = state.phase === 'summary';`
- 탭 `finish`:
  - `closed`: `{ label: '마감 화면', tone: 'orange', strong: true, onClick: () => setShowSummary(true) }` — 상태 변경 없음(목록 배지 "마감됨"과 같은 주황).
  - 아니면 기존 그대로(`canFinish` 아니면 alert) + `dispatch(SET_PHASE summary)` + `setShowSummary(true)`.
- 마감 화면 `onBack={() => setShowSummary(false)}`.
- `closed`면 `canAddRound`를 `false`로(`TennisRoundNav`·`TennisConfirmBar` 둘 다 `canAddRound && !closed`) — 라운드 추가는 확정취소로 마감을 푼 뒤에. `handleUnconfirmRound` 확인 문구에 `closed`면 "\n경기 마감도 함께 취소됩니다." 추가.

### 변경 2 — `src/hooks/useTennisReducer.js`

- `import { isRoundComplete, allRoundsConfirmed } from '../utils/tennis/roundConfirm';`
- `SET_PHASE`:
  ```js
  if (state.phase === 'done') return state;                                  // 전송 완료 후엔 되돌리지 않는다
  if (action.phase !== 'playing' && action.phase !== 'summary') return state;
  if (action.phase === 'summary' && !allRoundsConfirmed(state.rounds, state.confirmedRounds)) return state;
  return { ...state, phase: action.phase };
  ```
- `UNCONFIRM_ROUND`: 기존 처리 + `phase: state.phase === 'summary' ? 'playing' : state.phase` (마감 자동 해제 — `ADD_ROUND`가 이미 phase를 playing으로 강제하는 것과 같은 원칙).
- 그 외 무변경.

### 변경 3 — `src/components/tennis/TennisSummaryView.jsx`

- 버튼 라벨 `마감 해제` → `← 경기로 돌아가기`. `{!finalized && …}` 조건 그대로.

### 변경 없음 (명시)

`TennisConfirmBar.jsx`(props 그대로), `TennisAttendeeModal.jsx`, `autoUploadTargets.js`, `scripts/tennisAutoUpload.mjs`, `TennisTabs.jsx`, RTDB 저장/복원, 풋살(`App.jsx`)·축구(`SoccerApp.jsx`).

### 테스트

- `tennisReducerConfirm.test.js` SET_PHASE 테스트: CONFIRM_ROUND 후 상태로 갱신.
- 신규 리듀서 케이스: (a) 미확정 라운드 있으면 `SET_PHASE summary` no-op, `rounds=[]`도 no-op (b) `done`에서 `SET_PHASE playing` no-op (c) 마감 상태에서 `UNCONFIRM_ROUND` → phase `playing` + 키 삭제, playing 상태에선 phase 불변 (d) 마감 상태에서 `ADD_ATTENDEE` 허용 (e) `SET_PHASE playing` 후 편집 가능.
- 전체 스위트 + 빌드. 푸시 전 코드 적대적 리뷰(5렌즈).

### 실사용 안전성 논거

- 스키마 무변경. 구버전 탭이 만든 `summary`는 신버전에서 마감 화면으로 열리고, 신버전이 만든 상태를 구버전이 열어도 같은 의미(구버전 "마감 해제"=playing 저장 → 신버전에서도 마감 전).
- `playing` 경기의 코드 경로는 그대로. 리듀서 신규 가드는 정상 UI 흐름에서 이미 성립하는 조건만 강제.
- 자동 업로드 판정 무변경. 확정취소는 `phase:'playing'` 저장 → 대상 제외.

## 적대적 리뷰 로그 (2026-08-28, 5렌즈 병렬, 조작 근거 0건)

- **A 정합성**: A1 showSummary 로드 초기화 코드 미명시(Important) → 반영. A2 `rounds=[]` 케이스 테스트(Minor) → 반영.
- **B 요구사항/범위**: B1 참석자 차단 = 범위 확장(Important) → 잠금 폐기. B2 잠금 배너 = 미요청 UI(Important) → 잠금 폐기, 네비 버튼 1개만 남김(마감 화면 재진입 경로 필요 — 유저 확인 항목). B3 = A1.
- **C 단순화**: C1 무음 무시 UX(Important) → 잠금 폐기로 해소. C2 bottomBar 복제(Minor) → ConfirmBar 모드로. C3 import 누락(Minor) → 명시. C4 useEffect 안티패턴(Minor) → 로드 콜백 방식 고정.
- **D 보안/권한**: D1 `done→playing` 리듀서 구멍(Important) → 가드 추가. D2 비관리자 마감 취소 + 탭바 노출(Important) → 확인창 추가(권한은 기존과 동일하게 회원 전체 — 유저 확인 항목). D3 RTDB rules 저장소 부재(Minor) → 범위 밖, 기록만.
- **E 회귀**: E1 기존 SET_PHASE 테스트 파손(Important) → 테스트 갱신 명시. E2 = A1.
- 반박/기각: 없음(모든 지적이 코드 인용과 일치). 중복: A1=B3=C4=E2, B1≈C1.

## 코드 적대적 리뷰 로그 (2026-08-28, diff 1cb9de7..a5f7182, 5렌즈 병렬, 조작 근거 0건) — 판정 PASS

- **A 정합성**: Minor 1 — `phase==='done'`인데 `gameFinalized`가 false인 손상 데이터에서만 "← 경기로 돌아가기"가 보이되 무동작. 정상 흐름(FINALIZE가 두 필드를 원자적으로 설정)에선 도달 불가 → 기록만.
- **B 요구사항/범위**: 공격 지점 없음(파일 범위·요구사항 1~7 전부 대조).
- **C 단순화**: Minor 1 — `canFinish`가 closed에서도 평가됨(미사용, 비용 무시 수준) → 기록만. `SET_PHASE playing` 리듀서 분기는 구버전 탭 호환·테스트용으로 유지(죽은 코드 아님) 확인.
- **D 보안/권한**: Minor 1 — 봇이 아카이브(active DELETE)한 직후 열려 있던 탭이 확정취소를 누르면 `saveState`가 active 노드를 playing으로 되살림. **반박(기존 경로)**: 구버전(1cb9de7) 마감 화면의 "마감 해제"도 `SET_PHASE playing` → `saveState`로 동일하게 되살렸고, 열린 탭의 어떤 dispatch든 같은 결과(TennisApp이 RTDB를 구독하지 않는 기존 한계, 메모리에 기록됨). 이 diff가 새로 만든 위험 아님. 근본 해결(로드 시 `finalized/_meta` 존재 확인 → 아카이브된 경기 편집 차단)은 별도 백로그.
- **E 회귀**: 공격 지점 없음. 멀티기기 overwrite·구/신버전 혼재·리로드 복원·skipFirst 쓰기·done 경로 전부 추적, 1497/1497 통과 재확인.
