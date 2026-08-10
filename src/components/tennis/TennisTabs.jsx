// 테니스 대시보드 본문. Task 12에서 경기관리 탭을 채웠고,
// Task 13에서 records(랭킹)·roster(개인기록) 탭을 추가한다.
// Task 5에서 records 분기를 TennisAnalyticsTab으로 위임.
import { useEffect, useState } from 'react';
import TennisSync from '../../services/tennisSync';
import { buildPlayerSummary } from '../../utils/tennis/tennisStandings';
import { makeStyles } from '../../styles/theme';
import TennisAnalyticsTab from './TennisAnalyticsTab';

function StatCell({ label, value, C }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: C.gray }}>{label}</div>
      <div style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums', color: C.white }}>{value}</div>
    </div>
  );
}

export default function TennisTabs({ activeTab, pendingGames, onStartGame, onContinueGame, authUserName, C }) {
  const ds = makeStyles(C);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    TennisSync.getPlayerGames().then(setRows);
  }, []);

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
                  {(g.state?.rounds || []).length}라운드 · 참석 {(g.state?.attendees || []).length}명
                </div>
              </button>
            ))}
        </div>
      </div>
    );
  }

  if (activeTab === 'records') {
    return <TennisAnalyticsTab C={C} authUserName={authUserName} />;
  }

  if (activeTab === 'roster') {
    const me = buildPlayerSummary({ rows, player: authUserName });
    return (
      <div style={ds.section}>
        <div style={ds.sectionTitle}>{authUserName || '내'} 전적</div>
        <div style={ds.card}>
          <div style={{ display: 'flex', marginBottom: 12 }}>
            <StatCell C={C} label="단식" value={`${me.singles.wins}-${me.singles.losses}`} />
            <StatCell C={C} label="복식" value={`${me.doubles.wins}-${me.doubles.losses}`} />
            <StatCell C={C} label="출석" value={`${me.attendanceDates}일`} />
          </div>
          <div style={{ display: 'flex' }}>
            <StatCell C={C} label="에이스" value={me.aces} />
            <StatCell C={C} label="더블폴트" value={me.doubleFaults} />
            <StatCell C={C} label="타이브레이크" value={`${me.tbWon}/${me.tbPlayed}`} />
            <StatCell C={C} label="베이글" value={`${me.bagelsGiven}/${me.bagelsTaken}`} />
          </div>
        </div>
      </div>
    );
  }

  return <div style={{ padding: 20, textAlign: 'center', color: C.gray, fontSize: 12 }}>준비 중</div>;
}
