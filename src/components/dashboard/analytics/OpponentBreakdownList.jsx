// src/components/dashboard/analytics/OpponentBreakdownList.jsx
// 개인분석 '상대팀별 성적' (축구 전용). 상대팀마다 공격/수비 순위 막대차트.
//
// 43명 전체를 그리면 읽히지 않으므로 rankWindow로 '내 위 2명 + 나 + 아래 2명'만 본다.
// 좌측이 등수(위가 1등), 막대 길이는 그 창 안의 최대값 기준 상대 길이다.
// 수비는 경기당 실점이라 짧을수록 좋은 쪽 — 1위 막대가 가장 짧게 나온다.
import { rankWindow } from '../../../utils/soccerAnalytics';

function ChartRow({ row, isMe, valueText, subText, ratio, color, C }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 0', fontSize: 10.5 }}>
      <span style={{ width: 26, flexShrink: 0, textAlign: 'right', color: isMe ? C.white : C.grayDark, fontWeight: isMe ? 700 : 400 }}>
        {row.rank}위
      </span>
      <span style={{ width: 44, flexShrink: 0, color: isMe ? C.white : C.gray, fontWeight: isMe ? 700 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {row.name}
      </span>
      <div style={{ flex: 1, minWidth: 0, height: 7 }}>
        <div style={{
          width: `${Math.max(ratio * 100, row.__zero ? 0 : 2)}%`, height: '100%', borderRadius: 3,
          background: color, opacity: isMe ? 1 : 0.35,
        }} />
      </div>
      <span style={{ flexShrink: 0, color: isMe ? color : C.gray, fontWeight: isMe ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>
        {valueText}
      </span>
      <span style={{ width: 62, flexShrink: 0, textAlign: 'right', fontSize: 9, color: C.grayDark, whiteSpace: 'nowrap' }}>
        {subText}{isMe && <span style={{ color: C.orange }}>{' ◀'}</span>}
      </span>
    </div>
  );
}

function Chart({ label, rows, playerName, valueOf, valueText, subText, color, emptyText, C }) {
  if (!rows || rows.length === 0) {
    return (
      <>
        <div style={{ fontSize: 9.5, color: C.gray, margin: '5px 0 2px' }}>{label}</div>
        <div style={{ fontSize: 10.5, color: C.grayDark, paddingLeft: 2 }}>{emptyText}</div>
      </>
    );
  }
  const max = Math.max(...rows.map(valueOf), 0);
  return (
    <>
      <div style={{ fontSize: 9.5, color: C.gray, margin: '5px 0 2px' }}>{label}</div>
      {rows.map(r => (
        <ChartRow
          key={r.name} row={{ ...r, __zero: valueOf(r) === 0 }} isMe={r.name === playerName}
          ratio={max > 0 ? valueOf(r) / max : 0}
          valueText={valueText(r)} subText={subText(r)} color={color} C={C}
        />
      ))}
    </>
  );
}

export default function OpponentBreakdownList({ rows, playerName, attackByOpponent, defenseByOpponent, C }) {
  if (!rows || rows.length === 0) return null;

  return (
    <>
      {rows.map(r => {
        const attack = rankWindow(attackByOpponent?.[r.opponent] || [], playerName);
        const defAll = defenseByOpponent?.[r.opponent] || [];
        // 본인이 그 상대팀 수비 기록에 없으면 남의 순위만 보여줄 이유가 없다
        const defense = defAll.some(d => d.name === playerName) ? rankWindow(defAll, playerName) : [];
        return (
          <div key={r.opponent} style={{ padding: '8px 0', borderTop: `1px dashed ${C.grayDarker}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 11 }}>
              <span style={{ color: C.white, fontWeight: 600 }}>{r.opponent}</span>
              <span style={{ color: C.gray, fontVariantNumeric: 'tabular-nums' }}>
                {r.games > 0 ? `${r.games}경기 ${r.wins}-${r.draws}-${r.losses}` : '경기수 기록 없음'}
              </span>
            </div>
            <Chart
              label="공격" rows={attack} playerName={playerName} C={C} color={C.green}
              valueOf={x => x.attackPoints}
              valueText={x => `${x.attackPoints}P`}
              subText={x => `${x.goals}골 ${x.assists}어시`}
              emptyText="공격 기록 없음"
            />
            <Chart
              label="수비" rows={defense} playerName={playerName} C={C} color={C.accent}
              valueOf={x => x.concededPerGame}
              valueText={x => `${x.concededPerGame.toFixed(2)}실점`}
              subText={x => `${x.games}경기`}
              emptyText="수비 기록 없음"
            />
          </div>
        );
      })}
    </>
  );
}
