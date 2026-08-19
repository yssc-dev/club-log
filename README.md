# 마스터FC 풋살 경기기록 웹앱

풋살 경기 당일 참석자 관리, 팀 편성, 실시간 경기 기록, 포인트 집계를 위한 모바일 웹앱.

## 현황 (2026-03-12)

### v2.2 — Google Sheet 연동 + 자동 저장

**완료된 기능:**

- 참석자 선택 (포인트 순 정렬, 시트 연동 버튼)
- 스네이크 드래프트 팀 편성 (4/5/6팀 지원)
- 라운드 로빈 대진표 자동 생성 (1~2코트)
- 6팀 그룹 스플릿 (상위/하위 재편성)
- 경기별 GK 지정 + 임시 용병 시스템 (MatchSetup)
- 선수 탭 → 골/어시/자책골 선택 UI (CourtRecorder)
- 경기 중 이벤트 로그 수정/삭제
- Google Sheet 실시간 연동 (선수 랭킹 대시보드 탭)
- 참석명단 시트 연동 (버튼 클릭 시 참석자 + N개 팀 자동 반영)
- Google Apps Script 웹앱을 통한 경기 상태 자동 저장/복원
- 브라우저 종료 후에도 "이어서 하기" 가능
- 포인트 집계 화면 (골, 어시, 자책골, 클린시트, 크로바, 고구마, 2배 보정)

**아직 안 된 것:**

- 경기 종료 후 포인트 로그/선수별 집계 시트 쓰기 (writePointLog, writePlayerLog)
- master-fc-app.jsx (모듈 버전) 최신 동기화

### 포인트 시스템

| 항목 | 점수 |
|------|------|
| 골 | +1 |
| 어시스트 | +1 |
| 자책골 | -2 |
| 클린시트 (무실점 GK) | +1 |
| 크로바 (팀 MVP) | +2 |
| 고구마 (팀 꼴찌) | -1 |
| 2배 보정 (경기당 이벤트 2 이하) | 모든 포인트 ×2 |

## 파일 구조

```
footsal_webapp/
├── index.html              ← 메인 앱 (React 단일 파일, GitHub Pages 배포용)
├── apps-script-추가코드.js   ← Google Apps Script (기존 코드 아래 붙여넣기)
└── README.md               ← 이 파일
```

## 배포

### GitHub Pages
1. 이 레포를 Public으로 설정
2. Settings → Pages → Branch: main → Save
3. `https://yssc-dev.github.io/club-log/` 로 접속

### Google Apps Script
1. Google Sheets → 확장 프로그램 → Apps Script
2. 기존 코드 맨 아래에 `apps-script-추가코드.js` 내용 붙여넣기
3. 배포 → 새 배포 → 웹 앱 (실행: 나 / 접근: 모든 사용자)
4. 배포 URL을 `index.html`의 `APPS_SCRIPT_URL`에 설정

### Google Sheet 연동
- 시트: `마스터FC풋살` (공유: 링크가 있는 모든 사용자 - 뷰어)
- 대시보드 탭 → 선수 랭킹/포인트 자동 로딩
- 참석명단 탭 → "시트 연동" 버튼으로 참석자 반영
- 앱_경기상태 탭 → 경기 진행 상태 자동 저장 (A2:C2)

## 기술 스택

- React 18 + Babel (CDN, 빌드 없음)
- Google Sheets CSV API (gviz/tq)
- Google Apps Script (웹앱, 경기 상태 저장/복원)
- GitHub Pages (정적 호스팅)
