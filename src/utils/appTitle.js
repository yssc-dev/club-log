// 브라우저 탭 제목 — 팀에 들어가면 "팀이름 - 클럽 기록", 밖(로그인·팀선택)에선 기본 제목.
// Root.jsx의 effect가 유일한 호출자(단일 작성자) — 화면 컴포넌트들이 각자 쓰면 경합한다.
const BASE = '클럽 기록';

export function appTitle(teamName) {
  const t = (teamName || '').trim();
  return t ? `${t} - ${BASE}` : BASE;
}
