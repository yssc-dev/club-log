export const TEAM_COLORS = [
  { name: "연두", bg: "#84cc16", text: "#1a2e05" },
  { name: "빨강", bg: "#ef4444", text: "#fff" },
  { name: "파랑", bg: "#3b82f6", text: "#fff" },
  { name: "주황", bg: "#f97316", text: "#fff" },
  { name: "녹색", bg: "#22c55e", text: "#fff" },
  { name: "하늘", bg: "#38bdf8", text: "#1e3a5f" },
  { name: "검정", bg: "#1e293b", text: "#fff", border: "#475569" },
  { name: "흰색", bg: "#f1f5f9", text: "#1e293b" },
];

export const C = {
  bg: "#0f172a", card: "#1e293b", cardLight: "#334155",
  accent: "#22d3ee", accentDim: "#0891b2",
  green: "#10b981", greenDim: "#059669",
  red: "#ef4444", redDim: "#dc2626",
  orange: "#f97316", yellow: "#eab308", purple: "#a855f7",
  white: "#f8fafc", gray: "#94a3b8", grayDark: "#475569", grayDarker: "#334155",
};

// 구글시트 설정
// - 웹앱 대시보드: csvUrlBySheet(gviz) 사용
// - 웹앱 참석명단: csvUrlByGid(export+gid) 사용, gid 미확인 시 gviz 폴백
// - Apps Script(Code.js): 시트 이름 기반 저장 (앱_경기상태, 회원인증, 포인트로그, 선수별집계기록로그)
// - 시트 이름 변경 시: Code.js 상단 변수 수정 + Apps Script 재배포 필요
export const SHEET_CONFIG = {
  sheetId: import.meta.env.VITE_SHEET_ID || "1cM4UhB-nL6smf4OIn_lqQ0on1AtYG2ff_haIXBvXnK0",
  csvUrlBySheet(sheetId, sheetName) {
    return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  },
  csvUrlByGid(sheetId, gid) {
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${encodeURIComponent(String(gid))}`;
  },
};

export const AUTH_STORAGE_KEY = "masterfc_auth";
// 주 단위로 쓰는 앱이라 24h면 경기 날마다 세션 만료 → 매번 느린 Apps Script 재로그인.
// 서버가 모든 쓰기에서 토큰을 재검증하므로(_parseAuthToken→_verifyAuth) 클라 세션을 길게 둬도 안전.
export const AUTH_EXPIRY_HOURS = 720; // 30일
