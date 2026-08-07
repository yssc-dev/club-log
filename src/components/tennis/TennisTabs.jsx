// 테니스 대시보드 본문. Task 12에서 경기관리 탭을 채웠고,
// Task 13에서 records(랭킹)·roster(개인기록) 탭을 추가한다.
import { useEffect, useState, useMemo } from 'react';
import TennisSync from '../../services/tennisSync';
import { buildSinglesStandings, buildPlayerSummary } from '../../utils/tennis/tennisStandings';

function StatCell({ label, value, C }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: C.gray }}>{label}</div>
      <div style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums', color: C.white }}>{value}</div>
    </div>
  );
}

export default function TennisTabs({ activeTab, pendingGames, onStartGame, onContinueGame, authUserName, C }) {
  const [rows, setRows] = useState([]);
  const [roster, setRoster] = useState([]);

  useEffect(() => {
    TennisSync.getPlayerGames().then(setRows);
    TennisSync.getRoster().then(setRoster);
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const standings = useMemo(
    () => buildSinglesStandings({ rows, roster, asOfDate: today }),
    [rows, roster, today]);

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

  if (activeTab === 'records') {
    return (
      <div style={{ padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: C.white }}>길로틴리그 (단식 승률)</div>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: C.gray, fontSize: 10.5 }}>
              <th style={{ textAlign: 'left' }}>#</th><th style={{ textAlign: 'left' }}>이름</th>
              <th>리그</th><th>등급</th><th>전적</th><th>승률</th><th>P</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => (
              <tr key={s.name} style={{ borderTop: `1px solid ${C.grayDarker}`, color: C.white }}>
                <td>{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{s.name}</td>
                <td style={{ textAlign: 'center', fontSize: 10 }}>{s.leagueTier === '흑기사' ? 'BK' : 'BR'}</td>
                <td style={{ textAlign: 'center', fontSize: 10, color: C.gray }}>{s.grade}</td>
                <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{s.wins}-{s.losses}</td>
                <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                  {s.games > 0 ? `${Math.round(s.rate * 100)}%` : '-'}
                </td>
                <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{s.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (activeTab === 'roster') {
    const me = buildPlayerSummary({ rows, player: authUserName });
    return (
      <div style={{ padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: C.white }}>{authUserName || '내'} 전적</div>
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
    );
  }

  return <div style={{ padding: 20, textAlign: 'center', color: C.gray, fontSize: 12 }}>준비 중</div>;
}
