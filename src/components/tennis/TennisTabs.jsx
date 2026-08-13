// 테니스 대시보드 본문. Task 12에서 경기관리 탭을 채웠고,
// Task 13에서 records(랭킹)·roster(개인기록) 탭을 추가한다.
// Task 5에서 records 분기를 TennisAnalyticsTab으로 위임.
// Task 4(탭 재편): roster 분기 제거(분석 개인뷰로 흡수), tdash=대시보드 실컴포넌트(2단계), members=placeholder.
import { makeStyles } from '../../styles/theme';
import TennisAnalyticsTab from './TennisAnalyticsTab';
import TennisDashboard from './TennisDashboard';
import TennisLeague from './TennisLeague';

export default function TennisTabs({ activeTab, pendingGames, onStartGame, onContinueGame, onViewHistory, authUserName, C }) {
  const ds = makeStyles(C);

  if (activeTab === 'tdash') {
    return <TennisDashboard C={C} />;
  }

  if (activeTab === 'league') {
    return <TennisLeague C={C} />;
  }

  if (activeTab === 'members') {
    return <div style={{ padding: 20, textAlign: 'center', color: C.gray, fontSize: 13 }}>회원관리 · beta</div>;
  }

  if (activeTab === 'games') {
    return (
      <div style={ds.section}>
        <button onClick={() => onStartGame('테니스')}
          style={ds.btnFull(C.accent)}>
          + 경기 추가
        </button>
        <div style={{ marginTop: 14 }}>
          {pendingGames.length === 0
            ? <div style={{ color: C.gray, fontSize: 13, textAlign: 'center', padding: 20 }}>진행중인 경기가 없습니다</div>
            : pendingGames.map(g => (
              <button key={g.gameId} onClick={() => onContinueGame(g.gameId)}
                style={{ ...ds.card, display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', border: `1px solid ${C.borderColor}` }}>
                <div style={{ fontSize: 14, color: C.white, fontWeight: 600 }}>{g.state?.gameDate || '-'}</div>
                <div style={{ fontSize: 12, color: C.gray, marginTop: 3 }}>
                  {g.state?.gameCreator || g.state?.lastEditor || '알 수 없음'} · {(g.state?.rounds || []).length}라운드 · 참석 {(g.state?.attendees || []).length}명
                </div>
              </button>
            ))}
        </div>
        {onViewHistory && (
          <button onClick={onViewHistory}
            style={{ ...ds.card, display: 'block', width: '100%', marginTop: 14, textAlign: 'center', cursor: 'pointer', border: `1px solid ${C.borderColor}`, color: C.white, fontSize: 14, fontWeight: 500 }}>
            📁 과거 경기 기록
          </button>
        )}
      </div>
    );
  }

  if (activeTab === 'records') {
    return <TennisAnalyticsTab C={C} authUserName={authUserName} />;
  }

  return <div style={{ padding: 20, textAlign: 'center', color: C.gray, fontSize: 12 }}>준비 중</div>;
}
