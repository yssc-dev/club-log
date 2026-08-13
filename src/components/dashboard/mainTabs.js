// 홈 상단 탭 배열. 테니스만 대시보드·분석·회원관리(beta)·경기관리, 그 외는 기존 구성.
export function buildMainTabs({ activeSport, role, pendingCount }) {
  const badge = pendingCount > 0;
  if (activeSport === '테니스') {
    return [
      { key: 'tdash', label: '대시보드' },
      { key: 'records', label: '분석' },
      ...(role === '관리자' ? [{ key: 'members', label: '회원관리', beta: true }] : []),
      { key: 'games', label: '경기관리', badge },
    ];
  }
  return [
    { key: 'records', label: '대시보드' },
    { key: 'roster', label: activeSport === '축구' ? '팀/개인 기록' : '개인기록' },
    { key: 'analytics', label: '분석' },
    { key: 'games', label: '경기관리', badge },
    ...(activeSport === '축구' ? [{ key: 'tournament', label: '대회' }] : []),
  ];
}
