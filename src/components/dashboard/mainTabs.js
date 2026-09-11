// 홈 상단 탭 배열. 테니스만 대시보드·리그·분석·회원관리·경기관리, 그 외는 기존 구성.
// hideTournament: 로그 시트만 쓰는 축구팀(빅마스터FC, 스펙 §15)은 대회 탭을 숨긴다 — 대회 생성은 대회_* 탭을 새로 만든다.
export function buildMainTabs({ activeSport, role, pendingCount, hideTournament = false }) {
  const badge = pendingCount > 0;
  if (activeSport === '테니스') {
    return [
      { key: 'tdash', label: '대시보드' },
      { key: 'league', label: '리그' },
      { key: 'records', label: '분석' },
      ...(role === '관리자' ? [{ key: 'members', label: '회원관리' }] : []),
      { key: 'games', label: '경기관리', badge },
    ];
  }
  return [
    { key: 'records', label: '대시보드' },
    { key: 'roster', label: activeSport === '축구' ? '팀/개인 기록' : '개인기록' },
    { key: 'analytics', label: '분석' },
    { key: 'games', label: '경기관리', badge },
    ...(activeSport === '축구' && !hideTournament ? [{ key: 'tournament', label: '대회' }] : []),
  ];
}
