import { buildTennisPlayerGameRows } from '../../utils/tennis/tennisRowBuilders';

// 오늘 경기의 선수별 누적 기록.
// buildTennisPlayerGameRows가 단일 진실 소스 — 새 집계 로직을 추가하지 않는다.
export default function TennisPlayerStatsModal({ team, state, roster, C, styles: s }) {
  const memberSet = new Set(roster.map(m => m.name));
  const gradeByPlayer = Object.fromEntries(roster.map(m => [m.name, m.grade]));

  const pgRows = buildTennisPlayerGameRows({ team, state, inputTime: '', memberSet, gradeByPlayer });

  // 선수별 집계
  const playerMap = {};
  for (const row of pgRows) {
    if (!playerMap[row.player]) {
      playerMap[row.player] = {
        wins: 0, losses: 0,
        setsDiff: 0, gamesDiff: 0,
        aces: 0, df: 0,
        tbPlayed: 0, tbWon: 0,
        bagels: 0,
      };
    }
    const p = playerMap[row.player];
    if (row.result === '승') p.wins++;
    else p.losses++;
    p.setsDiff  += (row.sets_won   || 0) - (row.sets_lost   || 0);
    p.gamesDiff += (row.games_won  || 0) - (row.games_lost  || 0);
    p.aces      += row.aces          || 0;
    p.df        += row.double_faults || 0;
    p.tbPlayed  += row.tb_played     || 0;
    p.tbWon     += row.tb_won        || 0;
    p.bagels    += row.bagels_given  || 0;   // 내가 상대에게 베이글을 준 횟수(성취)
  }

  const players = Object.entries(playerMap).sort(([a], [b]) => a.localeCompare(b, 'ko'));

  if (players.length === 0) {
    return (
      <div style={{ color: C.gray, textAlign: 'center', padding: 20 }}>
        완료된 경기 기록이 없습니다.
      </div>
    );
  }

  const fmt = (n) => (n > 0 ? `+${n}` : String(n));

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 360 }}>
        <thead>
          <tr>
            {['선수', '승-패', '세트Δ', '게임Δ', '에이스', 'DF', 'TB', '베이글'].map(h => (
              <th key={h} style={s.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map(([name, p]) => (
            <tr key={name}>
              <td style={s.td(true)}>{name}</td>
              <td style={s.td()}>{p.wins}-{p.losses}</td>
              <td style={s.td(p.setsDiff > 0)}>{fmt(p.setsDiff)}</td>
              <td style={s.td(p.gamesDiff > 0)}>{fmt(p.gamesDiff)}</td>
              <td style={s.td(p.aces > 0)}>{p.aces || '—'}</td>
              <td style={{ ...s.td(), color: p.df > 0 ? C.red : C.gray }}>{p.df || '—'}</td>
              <td style={s.td()}>{p.tbWon}/{p.tbPlayed}</td>
              <td style={s.td(p.bagels > 0)}>{p.bagels || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
