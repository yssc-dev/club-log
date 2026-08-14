// 대결 케미(라이벌): 반대팀으로 만났을 때의 상대전적 — 천적/맛집.
// 매주 팀 로테이션 도메인에서만 성립 (동 클럽 선수들이 서로 상대가 됨).
import { useMemo, useState } from 'react';
import { calcRivalry, calcPersonalRivalry } from '../../../utils/analyticsV2/calcRivalry';
import RankBarList from './RankBarList';

export default function RivalryView({ matchLogs, players, C }) {
  const rivalry = useMemo(() => calcRivalry({ matchLogs: matchLogs || [] }), [matchLogs]);
  const [selected, setSelected] = useState(null);
  const player = selected || rivalry.players[0] || null;

  const personal = useMemo(
    () => calcPersonalRivalry({ rivalry, player, minRounds: 5 }),
    [rivalry, player]
  );

  if (!player) {
    return <div style={{ textAlign: 'center', padding: 30, color: C.gray }}>대결 기록이 없습니다.</div>;
  }

  const eligible = personal.opponents.filter(o => !o.isLowSample);
  const lowSample = personal.opponents.filter(o => o.isLowSample);
  const nemesis = [...eligible].sort((a, b) => a.winRate - b.winRate || b.games - a.games).slice(0, 3);
  const favorite = [...eligible].sort((a, b) => b.winRate - a.winRate || b.games - a.games).slice(0, 3);

  const Row = ({ o }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '4px 0', borderBottom: `1px dashed ${C.grayDarker}`, opacity: o.isLowSample ? 0.45 : 1 }}>
      <span style={{ color: C.white }}>
        vs {o.opponent}
        {o.isLowSample && <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 6px', borderRadius: 50, border: `1px dashed ${C.gray}`, color: C.gray }}>표본부족</span>}
      </span>
      <span style={{ color: C.white, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {o.games}전 {o.wins}승 {o.draws}무 {o.losses}패
        <span style={{ color: o.winRate >= 0.5 ? '#22c55e' : '#ef4444', marginLeft: 6 }}>{Math.round(o.winRate * 100)}%</span>
      </span>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 10, lineHeight: 1.5 }}>
        <b>대결 케미</b> — 반대팀으로 만난 라운드의 상대전적. 천적(잘 못 이기는 상대)과 맛집(잘 이기는 상대). 최소 5라운드 대결부터 랭킹.
      </div>
      <select value={player} onChange={e => setSelected(e.target.value)}
        style={{ width: '100%', padding: '8px 12px', borderRadius: 50, fontSize: 13, background: 'transparent', color: C.white, border: `1.2px dashed ${C.grayDark}`, fontFamily: 'inherit', appearance: 'none', cursor: 'pointer', marginBottom: 12 }}>
        {rivalry.players.map(p => <option key={p} value={p}>{p}</option>)}
      </select>

      {eligible.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div style={{ background: C.cardLight, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>😈 천적</div>
            {/* 못 이기는 상대 목록이라 순위 번호는 '잘한 순'으로 오독된다 */}
            <RankBarList
              rows={nemesis.map(o => ({ name: o.opponent, value: o.winRate, sub: `${o.games}전` }))}
              formatValue={v => `${Math.round(v * 100)}%`}
              color="#ef4444" C={C} showRank={false} emptyText="-"
            />
          </div>
          <div style={{ background: C.cardLight, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', marginBottom: 6 }}>😋 맛집</div>
            <RankBarList
              rows={favorite.map(o => ({ name: o.opponent, value: o.winRate, sub: `${o.games}전` }))}
              formatValue={v => `${Math.round(v * 100)}%`}
              color="#22c55e" C={C} emptyText="-"
            />
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 4 }}>전체 상대 전적</div>
      {eligible.map(o => <Row key={o.opponent} o={o} />)}
      {lowSample.map(o => <Row key={o.opponent} o={o} />)}
    </div>
  );
}
