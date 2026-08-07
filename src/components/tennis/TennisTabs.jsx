// 테니스 대시보드 본문. 이 태스크에선 경기관리 탭만 채우고,
// records(랭킹)·roster(개인기록)는 Task 13에서 같은 시그니처 그대로 확장한다.
// ★ props 이름을 Task 13과 맞춰둔다 — authUserName은 지금은 안 쓰지만 미리 받는다.
export default function TennisTabs({ activeTab, pendingGames, onStartGame, onContinueGame, authUserName: _authUserName, C }) {
  if (activeTab === 'games') {
    return (
      <div style={{ padding: 12 }}>
        <button onClick={() => onStartGame('테니스')}
          style={{ width: '100%', padding: 14, borderRadius: 10, border: 0, background: C.white, color: C.bg, fontWeight: 600 }}>
          + 경기 추가
        </button>
        <div style={{ marginTop: 14 }}>
          {pendingGames.length === 0
            ? <div style={{ color: C.gray, fontSize: 12, textAlign: 'center', padding: 20 }}>진행중인 경기가 없습니다</div>
            : pendingGames.map(g => (
              <button key={g.gameId} onClick={() => onContinueGame(g.gameId)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: 12, marginBottom: 8,
                  border: `1px solid ${C.grayDarker}`, borderRadius: 10, background: C.bg, color: C.white }}>
                <div style={{ fontSize: 13 }}>{g.state?.gameDate || '-'}</div>
                <div style={{ fontSize: 11, color: C.gray }}>
                  {(g.state?.rounds || []).length}라운드 · 참석 {(g.state?.attendees || []).length}명
                </div>
              </button>
            ))}
        </div>
      </div>
    );
  }
  return <div style={{ padding: 20, textAlign: 'center', color: C.gray, fontSize: 12 }}>준비 중</div>;
}
