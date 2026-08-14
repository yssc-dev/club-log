# 테니스 회원관리 기능 설계 (테니스_회원명부 CRUD)

**작성일:** 2026-08-14 · **대상:** 몽피스 테니스 (tennis-league 워크트리) · **탭:** 회원관리(관리자 전용)
**개정:** 2026-08-14 적대적 리뷰(5렌즈) 반영 — Critical 2·Important 6·Minor 3.

## 목표
관리자가 `테니스_회원명부` 시트를 앱에서 직접 **추가·수정·소프트삭제**하고, **정회원/게스트를 구분**한다. 게스트는 명부에서 관리하되 정회원 지표(순위·승률 모집단·레이더·에이스DF 등)에서는 제외한다.

## 핵심 설계 결정 (유저 승인)
- **게스트는 앱 전역 roster에서 제외**: `getTennisRoster`가 탈퇴 **+ 게스트**를 걸러 정회원 활동만 반환 → 분석/순위/레이더 계산 코드는 무변경. 관리 화면만 별도 관리자 조회로 전체를 본다.
- **소프트삭제 = 기존 "상태" 컬럼(활동/탈퇴) 재사용**. 삭제=탈퇴, 복원=활동.
- **식별 키 = 시트 행번호**(이름 편집 허용이라 이름은 키가 될 수 없음). 관리자 조회가 행번호를 함께 내려주고, 쓰기는 그 행번호로 수정한다.
- **이름 변경 허용**(수정 시 "과거 경기기록 분리 위험" 경고). **생년월일은 폼에서 제외**(서버 보관 유지, 클라 미전송 원칙 유지).
- **추가·수정·삭제 모두 저장 전 확인창.**

## 전역 제약 (Global Constraints)
- Apps Script(Code.js) 수정 시 **최상단 changelog에 날짜+수정내역 기록**. 배포는 **유저 수동**("배포 관리→편집→새 버전"으로 URL 고정) — 코드가 자동 배포하지 않는다.
- **모든 쓰기 + 관리자 조회는 서버측 `ADMIN_ACTIONS` 게이트(role==='관리자')를 통과해야 한다.** `authToken`(team:name:phone4) 인증은 라우터가 수행하되, `_verifyAuth`는 신원만 확인하므로 role 게이트가 별도로 필요하다(Code.js:334 주석: 클라 버튼 숨김만으로는 우회 가능).
- 회원명부는 **팀 공유 시트**(팀이름 컬럼으로 구분). 모든 쓰기는 **요청 팀 소유 행에만** 허용.
- 이름의 ★ 등 장식 문자는 `stripNameDecorations`로 제거된 채 전송된다(기존 파이프라인).
- 자유입력 필드는 **Sheets 수식 인젝션**을 서버측에서 차단한다.
- 컴포넌트 렌더 검증 공백: build/vitest가 렌더 크래시를 못 잡으므로 SSR 스모크 + act 실렌더 테스트로 보완.

## 1. 데이터 모델 — `테니스_회원명부` 시트

기존 헤더(9열): `팀이름, 이름, 닉네임, 생년월일, 등급, 상태, 시즌시작순위, 가입일, 비고`

**변경**: 맨 끝에 **"구분"**(10번째 열) 추가.
```
TENNIS_ROSTER_HEADERS = ["팀이름","이름","닉네임","생년월일","등급","상태","시즌시작순위","가입일","비고","구분"]
```
- `구분`(=`v[9]`): `정회원`(기본) / `게스트`. **빈 값은 정회원**(기존 행 마이그레이션 불필요).
- `상태`(=`v[5]`): `활동`(기본) / `탈퇴`. 소프트삭제 = 탈퇴.

**헤더 보정 (읽기 경로 오염 방지 — 리뷰 E-1/E-3/A3/C-3)**: `_ensureTennisSheets`는 시트가 없을 때만 헤더를 쓰므로 기존 9열 시트엔 "구분" 헤더가 없다. 신규 헬퍼 `_ensureTennisRosterColumns()`:
- **10번째 셀만** 다룬다. **row1 전체 재기록 금지**(관리자가 1~9열 헤더를 수정/수식화했을 수 있음 → 덮어쓰면 회귀).
- **가드**: `if (sheet.getLastColumn() >= 10 && sheet.getRange(1,10,1,1).getValue() === "구분") return;` — 이미 마이그레이션됐으면 무동작. 아니면 `sheet.getRange(1,10,1,1).setValue("구분")`만.
- **호출 위치**: `writeTennisRosterMember`·`getTennisRosterAdmin`에서만. **`getTennisRoster`(읽기 hot-path)에서는 호출하지 않는다** — getRoster는 헤더 없이 `v[9]` 인덱스로 읽으면 되므로(빈값→정회원) 보정 불필요. getRoster는 TennisApp·분석·리그·대시보드 **4곳에서 마운트마다** 호출되므로 읽기에 쓰기를 얹으면 로드마다 시트 쓰기가 4회 발생한다(회귀 E-1).
- 읽기 안전성: 신규 시트는 기본 26열이라 `getRange(2,1,n,10)`이 10번째 열을 빈 값으로 안전하게 읽는다.

## 2. Apps Script (Code.js) — 액션 3종

### 2a. `getTennisRoster` (수정)
- **`_ensureTennisRosterColumns()` 호출 안 함**(읽기 hot-path).
- `getRange(2,1,lastRow-1, TENNIS_ROSTER_HEADERS.length)`로 10열 읽기. 각 행 `구분`=`v[9]`(빈값→정회원).
- 필터: `상태==="탈퇴"` **또는 `구분==="게스트"`이면 skip**. (기존 팀 필터 `v[0]!==team` skip 유지.)
- 반환 shape **기존 유지**(`{name, nickname, grade, status, seasonStartRank}`) — 전부 정회원이라 memberType 불필요. **분석/순위/레이더 코드 무변경.**

### 2b. `getTennisRosterAdmin` (신규, 관리자 조회)
- 액션 라우팅에 추가 + **`ADMIN_ACTIONS`에 `getTennisRosterAdmin: 1` 추가**(role 게이트).
- **team 빈값이면 `{success:false, error:"team 필수"}`**(빈 team이 전 팀 명부를 노출하는 것 차단 — 리뷰 D-I1). 팀 필터로 요청 팀 회원만.
- `_ensureTennisRosterColumns()` 호출.
- **전체 회원**(정회원+게스트, 활동+탈퇴) 반환. 각 항목:
  ```
  { row, name, nickname, grade, memberType, status, seasonStartRank, joinDate, note }
  ```
  - `row` = 시트 실제 행번호(2-base, 수정 키). `memberType`=구분(빈값→"정회원"), `status`=상태(빈값→"활동"), `joinDate`=가입일, `note`=비고.
  - **생년월일 제외**(클라 미전송 원칙 — 반환 객체에 birthDate 키가 없어야 함, 테스트로 강제: 리뷰 D-M1).
- 이름 없는 행은 skip(단, row 번호는 실제 시트 행 유지 — 인덱스로 세지 말 것). `success:true, members:[...]`.

### 2c. `writeTennisRosterMember` (신규, upsert + 소프트삭제)
- 액션 라우팅에 추가 + **`ADMIN_ACTIONS`에 `writeTennisRosterMember: 1` 추가**(role 게이트 — 리뷰 Critical1). `_ensureTennisRosterColumns()` 호출.
- **team 필수**: `requestTeam` 빈값이면 `{success:false,error:"team 필수"}`.
- payload: `{ row?, name, nickname, grade, memberType, status, seasonStartRank, joinDate, note }`
- **수식 인젝션 방지**: `name`·`nickname`·`note`가 `=`,`+`,`-`,`@`로 시작하면 앞에 `'` 프리픽스. 서버 헬퍼 `_sanitizeCell(s)` (리뷰 D-I2).
- **name 공백 불가** → `{success:false,error}`.
- **update (`row` 있음)** — 리뷰 Critical2·A2:
  1. `getRange(row,1,1,10).getValues()[0]`로 **기존 행 먼저 읽는다**(범위 밖·행없음 → 에러).
  2. **행 소유 검증**: 기존 행 `팀이름(v[0])`이 `requestTeam`과 다르면 `{success:false,error:"행 팀 불일치"}`(교차팀 덮어쓰기 차단).
  3. 새 10열 배열: **생년월일(index3)=기존 셀 값 그대로 유지**, 팀이름(index0)=requestTeam, 나머지 = payload(정규화·sanitize). `setValues([arr])`.
- **add (`row` 없음)**: `appendRow` 또는 `getRange(lastRow+1,...)`. 팀이름=requestTeam, 가입일 빈값이면 오늘, 생년월일="", 나머지 payload.
- 삭제/복원 = status를 `탈퇴`/`활동`으로 보내는 update.
- 반환: `{ success:true, row }`(신규 시 새 행번호).

### 2d. changelog
`// 2026-08-14: 테니스 회원관리 — 회원명부 "구분"열 추가, 액션 getTennisRosterAdmin·writeTennisRosterMember 신설(ADMIN_ACTIONS+행소유검증+수식이스케이프), getTennisRoster 게스트 제외`

## 3. 프론트 서비스 (`src/services/tennisSync.js`)
```js
getRosterAdmin() { return _safeRead({ action: "getTennisRosterAdmin" }, "members", []); },
writeRosterMember(member) { return _post({ action: "writeTennisRosterMember", ...member }); },
```
- `writeRosterMember` 실패 시 throw(기존 `_post` 계약). team/authToken은 `_post`가 주입.

## 4. UI — `TennisMembers` 컴포넌트 (`src/components/tennis/TennisMembers.jsx`)
`TennisTabs.jsx`의 `members` placeholder를 `role==='관리자'` 가드와 함께 대체.

**TennisTabs 방어층 (리뷰 B-3)**: `TennisTabs`에 `role` prop 추가, members 분기를 가드:
```jsx
if (activeTab === 'members') return role === '관리자' ? <TennisMembers C={C} /> : null;
```
(호출부 Root/TeamDashboard에서 role 전달. 서버 게이트가 1차 방어, 이건 2차.)

**상태**: `members`(getRosterAdmin), `loading`, `error`, `showDeleted`(탈퇴 토글), `editing`(null|{}=신규|member=수정), `saving`, `status`(성공/실패 인라인 메시지).

**목록**
- 활동 회원 카드: 이름 + **정회원/게스트 뱃지** + 등급 + 닉네임. 우측 편집·삭제 버튼.
- "탈퇴 회원 보기" 토글 → 탈퇴 섹션(흐리게) + 복원 버튼.
- 로딩중 "데이터 로딩중…", 조회 실패 시 "불러오지 못했습니다", 빈 목록 안내.

**폼(추가/수정 공용)**: 이름(필수)·닉네임·등급(select: `GRADES` import)·구분(정회원/게스트 토글)·시즌시작순위(숫자/빈값)·가입일(date)·비고(text).
- 수정 시 이름 필드 경고: "이름을 바꾸면 과거 경기기록(이름 기준)이 분리될 수 있습니다."
- 구분을 게스트로 바꿀 때 안내(리뷰 E-4/E-5): "게스트로 바꾸면 순위·모집단 등 정회원 지표와 참석 명단에서 제외됩니다."

**액션 → `window.confirm` (신규 컴포넌트 만들지 않음 — 리뷰 C-2; 앱은 SettingsScreen 등에서 window.confirm 사용)**
- 추가: `window.confirm("정회원 '홍길동' 추가할까요?")` → writeRosterMember(폼, row 없음).
- 수정: `window.confirm("변경사항을 저장할까요?")` → writeRosterMember(폼, row).
- 삭제: `window.confirm("'홍길동'을 탈퇴 처리할까요? (기록 보존, 명부에서 숨김)")` → writeRosterMember({row,status:'탈퇴',...}).
- 복원: `window.confirm(...)` → status:'활동'.
- 확인 → 저장 → `status`에 성공/실패 메시지 + `getRosterAdmin()` 재조회 / 실패 시 목록 유지·폼 유지.

**검증(클라)**: `validateMember` 사용(이름 공백 불가, 같은 팀 활동 동일 이름 신규 추가 경고, 시즌시작순위 숫자/빈값).

## 5. 순수 로직 (`src/utils/tennis/memberForm.js`)
컴포넌트에서 분리해 유닛 테스트 가능하게:
- `import { GRADES } from './tennisSchema'` **(재선언 금지 — 리뷰 C-1)**. select 옵션으로 재사용.
- `validateMember(form, existingMembers, {isNew})` → `{ ok, errors:{field:msg} }`.
- `toWritePayload(form, {row})` → 전송용 객체. **`seasonStartRank: form.seasonStartRank === '' ? '' : Number(form.seasonStartRank)`** (명시 — `Number('')===0` 트랩 방지, 리뷰 A4). 문자열 trim, memberType/status 기본값.
- `partitionMembers(members)` → `{ active, deleted }`(status 기준, 이름 오름차순).

## 6. 에러 처리
- 조회 실패: `_safeRead` 빈 배열 폴백 → `error` 플래그로 "불러오지 못했습니다"(로딩과 구분).
- 쓰기 실패: throw → 인라인 에러 메시지, 목록·폼 유지(재시도).
- 서버 검증 실패(권한·team 누락·행 팀 불일치·이름 누락·수식 차단): `{success:false,error}` → throw → 메시지에 서버 사유.

## 7. 테스트
- **유닛(memberForm.js)**: validateMember(이름누락·중복·순위형식), toWritePayload(**seasonStartRank ""→"" 유지·값→Number**, row 유무, 기본값, trim), partitionMembers.
- **컴포넌트 스모크(SSR)** + **로딩게이트 실렌더(act)**: TennisMembers 로딩→목록·뱃지·폼·탈퇴토글 크래시 방어(`tennisAnalyticsTab.render.test.jsx` 패턴). getRosterAdmin 목킹.
- **드롭다운 회귀(리뷰 E-2)**: TennisAnalyticsTab 개인분석 선수 select를 `rosterNames ∪ 기록보유이름` union으로 변경 → 게스트로 재분류돼 roster에서 빠진 선수도 본인 기록 조회 가능. 유닛(union 헬퍼) + 렌더 확인.
- **회귀**: 기존 스위트 그린.
- **Apps Script 수동 검증 체크리스트(부록)**:
  1. 비관리자 authToken으로 writeTennisRosterMember/getTennisRosterAdmin POST → `success:false`(권한).
  2. team 빈값 getTennisRosterAdmin → `success:false`.
  3. 타팀 소유 row로 update → `행 팀 불일치` 거부.
  4. "구분" 헤더가 첫 write/admin조회 후 row1 col10에만 생성(1~9열 헤더 불변).
  5. 게스트 추가 → getTennisRoster/순위표에 안 나오고 getTennisRosterAdmin엔 나옴. 정회원 추가 → getTennisRoster/순위표 0경기 등장.
  6. 수정(등급만) → **생년월일 셀 보존**(삭제 안 됨). 이름 수정 → 해당 행만, 팀이름=요청team.
  7. 비고에 `=SUM(...)` 입력 → 시트 셀에 `'=SUM(...)` 텍스트로 저장(수식 실행 안 됨).
  8. 삭제(탈퇴) → getTennisRoster에서 사라짐, admin은 탈퇴 표시, 복원 동작.

## 8. 범위 밖 (YAGNI)
- 생년월일 편집 UI(서버 보관만). 회원 병합/일괄 이관/CSV 임포트. 게스트→정회원 승격 별도 버튼(구분 수정으로 가능). 경기기록 이름 리네임 마이그레이션(유저 책임, 경고만). 실시간 동기화(저장 후 재조회로 충분).

## 9. 파일 요약
- `apps-script/Code.js` (수정): 헤더 상수 +"구분", `_ensureTennisRosterColumns`, `_sanitizeCell`, `getTennisRoster` 게스트 필터, `getTennisRosterAdmin`, `writeTennisRosterMember`, **ADMIN_ACTIONS에 신규 2액션 추가**, 액션 라우팅, changelog.
- `src/services/tennisSync.js` (수정): `getRosterAdmin`, `writeRosterMember`.
- `src/utils/tennis/memberForm.js` (신규) + `__tests__/memberForm.test.js` (신규).
- `src/components/tennis/TennisMembers.jsx` (신규) + `__tests__/tennisMembers.smoke.test.jsx` + `.render.test.jsx` (신규).
- `src/components/tennis/TennisTabs.jsx` (수정): `role` prop + members 분기 가드 → `<TennisMembers>`. 호출부에서 role 전달.
- `src/components/tennis/TennisAnalyticsTab.jsx` (수정): 개인분석 선수 select를 roster∪기록 union으로(E-2 회귀 방지).
