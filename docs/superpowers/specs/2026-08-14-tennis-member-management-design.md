# 테니스 회원관리 기능 설계 (테니스_회원명부 CRUD)

**작성일:** 2026-08-14 · **대상:** 몽피스 테니스 (tennis-league 워크트리) · **탭:** 회원관리(관리자 전용)

## 목표
관리자가 `테니스_회원명부` 시트를 앱에서 직접 **추가·수정·소프트삭제**하고, **정회원/게스트를 구분**한다. 게스트는 명부에서 관리하되 정회원 지표(순위·승률 모집단·레이더·에이스DF 등)에서는 제외한다.

## 핵심 설계 결정 (유저 승인)
- **게스트는 앱 전역 roster에서 제외**: `getTennisRoster`가 탈퇴 **+ 게스트**를 걸러 정회원 활동만 반환 → 분석/순위/레이더 계산 코드는 무변경. 관리 화면만 별도 관리자 조회로 전체를 본다.
- **소프트삭제 = 기존 "상태" 컬럼(활동/탈퇴) 재사용**. 삭제=탈퇴, 복원=활동.
- **식별 키 = 시트 행번호**(이름 편집 허용이라 이름은 키가 될 수 없음). 관리자 조회가 행번호를 함께 내려주고, 쓰기는 그 행번호로 수정한다.
- **이름 변경 허용**(수정 시 "과거 경기기록 분리 위험" 경고). **생년월일은 폼에서 제외**(서버 보관 유지, 클라 미전송 원칙 유지).
- **추가·수정·삭제 모두 저장 전 확인창.**

## 전역 제약 (Global Constraints)
- Apps Script(Code.js) 수정 시 **최상단 changelog에 날짜+수정내역 기록** (기존 규칙). 배포는 **유저 수동**("배포 관리→편집→새 버전"으로 URL 고정) — 코드가 자동 배포하지 않는다.
- 모든 쓰기는 `authToken`(team:name:phone4) 재검증을 서버에서 통과해야 한다. 클라 실패는 throw.
- 이름의 ★ 등 장식 문자는 `stripNameDecorations`로 제거된 채 전송된다(기존 파이프라인).
- 회원명부는 진실 소스다. UI에서 **추가/수정/삭제 모두 확인창**을 거친다.
- 컴포넌트 렌더 검증 공백: build/vitest가 렌더 크래시를 못 잡으므로 SSR 스모크 + act 실렌더 테스트로 보완.

## 1. 데이터 모델 — `테니스_회원명부` 시트

기존 헤더(9열): `팀이름, 이름, 닉네임, 생년월일, 등급, 상태, 시즌시작순위, 가입일, 비고`

**변경**: 맨 끝에 **"구분"**(10번째 열) 추가.
```
TENNIS_ROSTER_HEADERS = ["팀이름","이름","닉네임","생년월일","등급","상태","시즌시작순위","가입일","비고","구분"]
```
- `구분` 값: `정회원`(기본) / `게스트`. **빈 값은 정회원으로 취급**(기존 행 마이그레이션 불필요).
- `상태` 값: `활동`(기본) / `탈퇴`. 소프트삭제 = 탈퇴.

**헤더 보정 필요**: `_ensureTennisSheets`는 시트가 없을 때만 헤더를 쓴다(기존 시트 헤더 미변경). 따라서 기존 9열 시트엔 "구분" 헤더가 없다. → 신규 헬퍼 `_ensureTennisRosterColumns()`가 **row 1을 `TENNIS_ROSTER_HEADERS`로 idempotent하게 재기록**(앞 9개는 동일, 10번째만 추가). 로스터 읽기/쓰기 진입 시 호출. 데이터 행은 건드리지 않는다.
- 읽기 안전성: 신규 시트는 기본 26열이라 `getRange(2,1,n,10)`이 10번째 열을 빈 값으로 안전하게 읽는다(기존 행 구분="" → 정회원).

## 2. Apps Script (Code.js) — 액션 3종

### 2a. `getTennisRoster` (수정)
- `_ensureTennisRosterColumns()` 호출.
- 각 행에서 `구분`(10열, 빈값→정회원) 읽음. 필터: `상태==="탈퇴"` **또는 `구분==="게스트"`이면 skip**.
- 반환 shape는 **기존 유지**(`{name, nickname, grade, status, seasonStartRank}`) — 전부 정회원이라 memberType 불필요. **분석/순위 코드 무변경.**

### 2b. `getTennisRosterAdmin` (신규, 관리자 조회)
- 액션 라우팅에 추가. `_ensureTennisRosterColumns()` 호출.
- **전체 회원**(정회원+게스트, 활동+탈퇴) 반환. 각 항목:
  ```
  { row, name, nickname, grade, memberType, status, seasonStartRank, joinDate, note }
  ```
  - `row` = 시트 실제 행번호(2-base). 수정 키.
  - `memberType` = 구분(빈값→"정회원"), `status` = 상태(빈값→"활동"), `joinDate` = 가입일, `note` = 비고.
  - **생년월일 제외**(클라 미전송 원칙).
- 이름 없는 행은 skip. `success:true, members:[...]`.

### 2c. `writeTennisRosterMember` (신규, upsert + 소프트삭제)
- 액션 라우팅에 추가. `authToken` 인증 필수(`_verifyAuth`). `_ensureTennisRosterColumns()` 호출.
- payload: `{ row?, name, nickname, grade, memberType, status, seasonStartRank, joinDate, note }`
  - `row` 있으면 **그 행 수정**(팀이름·생년월일 열은 보존: 팀이름=요청team으로 세팅, 생년월일은 기존 셀 값 유지).
  - `row` 없으면 **append**(가입일 빈값이면 오늘 날짜 기본).
  - **삭제/복원**도 이 액션으로: status를 `탈퇴`/`활동`으로 보내 update.
- 검증: `name` 필수(공백 불가) → 없으면 `{success:false, error}`. `row`가 유효 범위 밖이면 에러.
- 반환: `{ success:true, row }`(신규 append 시 새 행번호).

### 2d. changelog
- Code.js 최상단에 `// 2026-08-14: 테니스 회원관리 — 회원명부 "구분"열 추가, 액션 getTennisRosterAdmin·writeTennisRosterMember 신설, getTennisRoster 게스트 제외` 추가.

## 3. 프론트 서비스 (`src/services/tennisSync.js`)
```js
getRosterAdmin() { return _safeRead({ action: "getTennisRosterAdmin" }, "members", []); },
writeRosterMember(member) { return _post({ action: "writeTennisRosterMember", ...member }); },
```
- `writeRosterMember`는 실패 시 throw(기존 `_post` 계약). payload는 member 필드를 최상위에 펼쳐 전송(team/authToken은 `_post`가 주입).

## 4. UI — `TennisMembers` 컴포넌트 (`src/components/tennis/TennisMembers.jsx`)
`TennisTabs.jsx`의 `members` placeholder를 `<TennisMembers C={C} />`로 대체. 관리자 전용(탭 자체가 이미 `role==='관리자'`에서만 노출).

**상태**: `members`(getRosterAdmin 결과), `loading`, `showDeleted`(탈퇴 표시 토글), `editing`(폼 대상: null=닫힘 | {} =신규 | member=수정), `confirm`(확인창 payload), `toast`.

**목록**
- 활동 회원 카드 리스트: 이름 + **정회원/게스트 뱃지** + 등급 + (닉네임). 우측 편집·삭제 버튼.
- "탈퇴 회원 보기" 토글 → 탈퇴 회원 섹션(흐리게) + 복원 버튼.
- 로딩 중 "데이터 로딩중…", 빈 목록 안내.

**폼(추가/수정 공용)**: 이름(필수)·닉네임·등급(select: 등급 목록)·구분(정회원/게스트 토글)·시즌시작순위(숫자/빈값)·가입일(date)·비고(text).
- 수정 시 이름 필드 아래 경고: "이름을 바꾸면 과거 경기기록(이름 기준)이 분리될 수 있습니다."

**액션 → 확인창(공통 ConfirmDialog)**
- 추가: "정회원 '홍길동' 추가할까요?" → writeRosterMember(폼, row 없음).
- 수정: 변경 요약 → writeRosterMember(폼, row 포함).
- 삭제: "'홍길동'을 탈퇴 처리할까요? (기록은 보존, 명부에서 숨김)" → writeRosterMember({row, status:'탈퇴', ...기존}).
- 복원: writeRosterMember({row, status:'활동', ...}).
- 확인 → 저장 → 성공 토스트 + `getRosterAdmin()` 재조회 / 실패 토스트, 목록 유지.

**검증(클라)**: 이름 공백 불가, 같은 팀 활동 회원 중 동일 이름 신규 추가 시 경고(중복 방지), 시즌시작순위는 숫자 또는 빈값.

## 5. 순수 로직 분리 (`src/utils/tennis/memberForm.js`)
컴포넌트에서 분리해 유닛 테스트 가능하게:
- `validateMember(form, existingMembers, {isNew})` → `{ ok, errors:{field:msg} }` (이름 필수, 시즌시작순위 숫자, 신규 중복 이름).
- `toWritePayload(form, {row})` → 서버 전송용 객체(정규화: 시즌시작순위 ""→"" 또는 Number, 문자열 trim, memberType/status 기본값).
- `partitionMembers(members)` → `{ active:[], deleted:[] }` (status 기준), 각 이름 오름차순.
- `GRADES` 상수(등급 select 옵션) — 기존 등급 값 소스가 있으면 재사용, 없으면 명부 실제 값에서 도출.

## 6. 에러 처리
- 조회 실패: `_safeRead`가 빈 배열 폴백 → "불러오지 못했습니다" 안내(로딩과 구분).
- 쓰기 실패: throw → 에러 토스트, 목록 미변경, 폼 유지(재시도 가능).
- 서버 검증 실패(이름 누락·행 범위 초과): `{success:false,error}` → throw → 토스트에 서버 메시지.

## 7. 테스트
- **유닛(memberForm.js)**: validateMember(이름누락·중복·순위형식), toWritePayload(정규화·row 유무·기본값), partitionMembers(활동/탈퇴 분리·정렬).
- **컴포넌트 스모크(SSR)**: TennisMembers 렌더 크래시 방어(로딩/빈/픽스처). 폼·확인창 하위요소 크래시 방어.
- **로딩게이트 실렌더(act)**: getRosterAdmin 목킹 → 로딩 이후 목록·뱃지·추가폼·확인창 렌더 크래시 방어(`tennisAnalyticsTab.render.test.jsx` 패턴 재사용).
- **회귀**: 기존 스위트 그린. `getTennisRoster` 게스트 필터는 현재 게스트 0이라 분석 무영향(단, 필터 로직 자체는 Apps Script라 수동 검증).
- **Apps Script 수동 검증 체크리스트**(스펙 부록):
  1. "구분" 헤더가 시트 row1에 생성되는지(첫 write 후).
  2. 게스트 추가 → getTennisRoster에 안 나오고 getTennisRosterAdmin엔 나옴.
  3. 정회원 추가 → getTennisRoster/분석 순위표에 0경기로 등장.
  4. 수정(이름 포함) → 해당 행만 변경, 팀이름·생년월일 보존.
  5. 삭제(탈퇴) → getTennisRoster에서 사라짐, admin에선 탈퇴로 표시, 복원 동작.
  6. 인증 없는 요청 → success:false.

## 8. 범위 밖 (YAGNI)
- 생년월일 편집 UI(서버 보관만).
- 회원 병합/일괄 이관/CSV 임포트.
- 게스트→정회원 승격 별도 버튼(구분 필드 수정으로 이미 가능하므로 불필요).
- 경기기록 이름 리네임 마이그레이션(유저 책임, 경고만).
- 실시간 동기화(관리 화면은 저장 후 재조회로 충분, RTDB 미사용).

## 9. 파일 요약
- `apps-script/Code.js` (수정): 헤더 상수, `_ensureTennisRosterColumns`, `getTennisRoster` 필터, `getTennisRosterAdmin`, `writeTennisRosterMember`, 액션 라우팅, changelog.
- `src/services/tennisSync.js` (수정): `getRosterAdmin`, `writeRosterMember`.
- `src/utils/tennis/memberForm.js` (신규): 순수 로직.
- `src/utils/tennis/__tests__/memberForm.test.js` (신규).
- `src/components/tennis/TennisMembers.jsx` (신규).
- `src/components/tennis/__tests__/tennisMembers.smoke.test.jsx` + `.render.test.jsx` (신규).
- `src/components/tennis/TennisTabs.jsx` (수정): placeholder → `<TennisMembers>`.
