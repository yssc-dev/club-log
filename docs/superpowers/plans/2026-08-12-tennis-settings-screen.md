# 테니스 설정 화면 정리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `SettingsScreen.jsx`에 `isTennis` 분기를 추가해 테니스 설정에서 풋살/축구 필드(구글시트·크로바/자책골·관리자툴)를 숨기고, 테니스 스코어링 규칙 토글(팀 기본값)을 넣는다. 라벨을 "타이브레이크 시"로 통일.

**Architecture:** SettingsScreen은 풋살/축구/테니스 공용 컴포넌트. `isSoccer`·풋살(else) 분기는 절대 건드리지 않고 `isTennis` 분기만 추가한다. scoringRules 저장은 기존 saveSettings/getEffectiveSettings 경로 재사용(별도 로직 없음).

**Tech Stack:** React(Vite)+vitest.

**Spec:** `docs/superpowers/specs/2026-08-12-tennis-settings-screen-design.md` — 어긋나면 스펙이 이긴다.

## Global Constraints

- **풋살/축구 무영향(최우선).** SettingsScreen은 공용 컴포넌트 — `isSoccer` 분기, else(풋살) 분기, 구글시트/크로바/자책골/관리자툴의 풋살·축구 렌더 경로를 **수정하지 않는다**. `isTennis` 조건만 추가.
- scoringRules는 `settings.scoringRules.{tiebreakMode, acesDfAffectScore}`. 없을 수 있으니 `?? '7point'`/`?? false` 방어(경기 규칙 기본값과 동일).
- 저장은 기존 `saveSettings`/`update`/`getEffectiveSettings` 재사용 — scoringRules는 이미 TENNIS_KEYS에 있어 override로 저장됨. 새 로직 금지.
- SettingsScreen은 CSS 변수 기반 `ss` 스타일 객체 사용. TennisAttendeeSelector의 `RuleToggle`(테마 C 기반)은 재사용하지 말고 SettingsScreen 스타일에 맞는 자체 세그먼트 토글을 만든다.
- 렌더 검증 공백(메모리 규칙): jsx 선언 순서 육안 + diff 정독 + 브라우저 스모크.
- 커밋 스타일 `fix(tennis): …` / `feat(tennis): …`. 전체 스위트 803개 통과 유지.

---

### Task 1: SettingsScreen isTennis 분기 + 스코어링 토글 + 라벨 통일

**Files:**
- Modify: `src/components/common/SettingsScreen.jsx` (isTennis 분기 3곳 + 테니스 규칙 토글 + 로컬 토글 컴포넌트)
- Modify: `src/components/tennis/TennisAttendeeSelector.jsx` (라벨 "타이브레이크 시")

**Interfaces:**
- Consumes: 기존 `settings.scoringRules`, `update(key, value)`, `PRESETS`, `getEffectiveSettings`.
- Produces: 테니스 설정 = 경기규칙(프리셋 + 타이브레이크 시/에이스·DF 토글)만. 풋살/축구 화면 불변.

- [ ] **Step 1: isTennis 플래그 추가** — `SettingsScreen.jsx:14` `const isSoccer = teamMode === "축구";` 아래에:

```js
  const isTennis = teamMode === "테니스";
```

- [ ] **Step 2: 로컬 세그먼트 토글 컴포넌트** — 파일 하단(다른 로컬 컴포넌트 `NumRow`/`SheetSelect` 근처, 모듈 스코프)에 `ss` 스타일과 무관한 자체 스타일 세그먼트 버튼:

```jsx
function SegToggle({ label, options, value, onPick }) {
  return (
    <div className="app-row">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%" }}>
        <span style={{ fontSize: 15, color: "var(--app-text-primary)", flex: 1 }}>{label}</span>
        <div style={{ display: "flex", gap: 4 }}>
          {options.map(([v, lbl]) => (
            <button key={String(v)} type="button" onClick={() => onPick(v)}
              style={{
                padding: "5px 10px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                fontFamily: "inherit", border: "0.5px solid var(--app-divider)",
                background: v === value ? "var(--app-blue)" : "var(--app-bg-row)",
                color: v === value ? "#fff" : "var(--app-text-secondary)",
              }}>
              {lbl}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 구글시트 설정 섹션 숨김** — `:302` `<div style={ss.section}>` (구글시트 설정)을 `{!isTennis && (` … `)}`로 감싼다. 섹션 전체(`:302-316`)가 조건부.

- [ ] **Step 4: 경기규칙 분기 확장** — `:340` `{isSoccer ? (…축구…) : (…풋살…)}`를 `{isSoccer ? (…축구…) : isTennis ? (…테니스…) : (…풋살…)}`로. 테니스 블록:

```jsx
          ) : isTennis ? (
            <>
              <SegToggle label="타이브레이크 시"
                options={[['7point', '노애드 7점'], ['1point', '단판 1점']]}
                value={settings.scoringRules?.tiebreakMode ?? '7point'}
                onPick={(v) => update('scoringRules', { ...(settings.scoringRules || {}), tiebreakMode: v })} />
              <SegToggle label="에이스·더블폴트"
                options={[[false, '분석 전용'], [true, '점수 반영']]}
                value={settings.scoringRules?.acesDfAffectScore ?? false}
                onPick={(v) => update('scoringRules', { ...(settings.scoringRules || {}), acesDfAffectScore: v })} />
            </>
          ) : (
            <>
              {/* 기존 풋살 블록 그대로 — 크로바/고구마·자책골. 수정 금지 */}
```

(주의: 기존 풋살 `<>...</>` 내용은 손대지 않고, 그 앞에 `isTennis ?` 분기만 삽입. 프리셋 select·description(`:320-339`)은 세 종목 공통이라 그대로 둔다 — 테니스도 "표준테니스" 프리셋 표시.)

- [ ] **Step 5: 크로바 details 방어** — `:372` `{!isSoccer && settings.useCrovaGoguma && (` 를 `{!isSoccer && !isTennis && settings.useCrovaGoguma && (`로(테니스는 useCrovaGoguma가 없어 이미 안 뜨지만 명시적 방어).

- [ ] **Step 6: 관리자 툴 숨김** — `:388` `{isAdmin && (` (관리자 툴 섹션)을 `{isAdmin && !isTennis && (`로.

- [ ] **Step 7: 라벨 통일** — `TennisAttendeeSelector.jsx:82` `<RuleToggle label="타이브레이크(5:5)"` → `label="타이브레이크 시"`.

- [ ] **Step 8: 검증** — `npm test`(803 유지) + `npm run lint`(신규 에러 없어야) + `npm run build`. SettingsScreen 선언 순서 육안, **풋살/축구 렌더 경로 diff에서 무변경 확인**(isSoccer·else 블록이 그대로인지).

```bash
git add src/components/common/SettingsScreen.jsx src/components/tennis/TennisAttendeeSelector.jsx
git commit -m "fix(tennis): 설정 화면 종목 분기 — 풋살 필드 제거, 스코어링 토글 추가, 라벨 통일"
```

---

### Task 2: 통합 검증 (브라우저 스모크)

**Files:** 없음(검증 전용).

- [ ] **Step 1: 전체 스위트/린트/빌드** — `npm test`, `npm run lint`, `npm run build`.
- [ ] **Step 2: 브라우저 스모크** — `npm run dev` + Playwright:
  - **테니스 팀**(몽피스) 설정 화면: ① 구글시트 설정·크로바/고구마·자책골·관리자 툴 **미표시** ② "타이브레이크 시"[노애드7점/단판1점]·"에이스·더블폴트"[분석전용/점수반영] 토글 표시·클릭 시 선택 반영 ③ 프리셋("표준테니스")·설명 표시 ④ 저장 후 경기 생성 시 그 값으로 시작(scoringRules 로드).
  - **풋살 팀**(마스터FC) 설정 화면: 구글시트·크로바/고구마·자책골·관리자 툴 **그대로 표시**(무영향).
  - 관리자 role로 확인.
- [ ] **Step 3: 배포 안내** — 이 브랜치는 Apps Script/시트 무변경(클라이언트 UI만) → 유저 수동 반영 불필요.

---

## Self-Review 결과

- **Spec coverage**: §3.1 isTennis 분기 3곳(Task1 Step3·4·6)+토글(Step2·4)+크로바 방어(Step5), §3.2 저장 재사용(별도 로직 없음 — 준수), §3.3 라벨 통일(Step7), §4 풋살 무영향(Global Constraints+Step8 diff 확인), §5 테스트(Task2 스모크). §6 범위 밖 침범 없음.
- **Placeholder scan**: Task1 Step4의 "기존 풋살 블록 그대로" 주석은 실제 파일의 기존 코드를 가리키는 보존 지시(placeholder 아님). 그 외 TBD 없음.
- **Type consistency**: `settings.scoringRules.{tiebreakMode, acesDfAffectScore}` 키가 커스텀 스코어링 스펙과 동일. `update('scoringRules', obj)`가 기존 update 시그니처와 일치. SegToggle options 형태([value, label])가 onPick과 정합.
