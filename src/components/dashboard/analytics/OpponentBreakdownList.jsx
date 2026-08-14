// src/components/dashboard/analytics/OpponentBreakdownList.jsx
// 개인분석 '상대팀별 성적' (축구 전용). 상대팀마다 좌=공격 / 우=수비 순위 막대차트.
//
// 43명 전체를 그리면 읽히지 않으므로 rankWindow로 '내 위 2명 + 나 + 아래 2명'만 본다.
// 좌측이 등수(위가 1등), 막대 길이는 그 창 안의 최대값 기준 상대 길이다.
// 수비는 경기당 실점이라 짧을수록 좋은 쪽 — 1위 막대가 가장 짧게 나온다.
//
// 두 차트를 좌우로 놓아 세로를 절반으로 줄인 만큼 한 행의 폭이 좁다. 그래서 행에는
// 등수·이름·값만 두고, 골/어시·출전경기수는 '내 행'것만 열 아래에 한 번 요약한다.
//
// 행 모양은 RankBarList와 같지만 일부러 옮기지 않았다 — 이 화면은 '내 행'을 색·굵기·◀로
// 강조하고 나머지를 흐리게 깔아야 하는데(isMe), RankBarList는 그 개념이 없다.
import { rankWindow } from '../../../utils/soccerAnalytics';

function ChartRow({ row, isMe, valueText, ratio, color, C }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 0', fontSize: 10 }}>
      <span style={{ width: 24, flexShrink: 0, textAlign: 'right', color: isMe ? C.white : C.grayDark, fontWeight: isMe ? 700 : 400 }}>
        {row.rank}위
      </span>
      <span style={{ width: 38, flexShrink: 0, color: isMe ? C.white : C.gray, fontWeight: isMe ? 700 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {row.name}
      </span>
      <div style={{ flex: 1, minWidth: 8, height: 6 }}>
        <div style={{ width: `${ratio * 100}%`, height: '100%', borderRadius: 3, background: color, opacity: isMe ? 1 : 0.3 }} />
      </div>
      <span style={{ flexShrink: 0, color: isMe ? color : C.gray, fontWeight: isMe ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>
        {valueText}
      </span>
      <span style={{ width: 7, flexShrink: 0, fontSize: 8, color: C.orange }}>{isMe ? '◀' : ''}</span>
    </div>
  );
}

function Chart({ label, rows, playerName, valueOf, valueText, mySummary, color, emptyText, C }) {
  const head = <div style={{ fontSize: 9.5, color: C.gray, marginBottom: 1 }}>{label}</div>;
  if (!rows || rows.length === 0) {
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        {head}
        <div style={{ fontSize: 10, color: C.grayDark, paddingTop: 2 }}>{emptyText}</div>
      </div>
    );
  }
  const max = Math.max(...rows.map(valueOf), 0);
  const me = rows.find(r => r.name === playerName);
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {head}
      {rows.map(r => (
        <ChartRow
          key={r.name} row={r} isMe={r.name === playerName} color={color} C={C}
          ratio={max > 0 ? valueOf(r) / max : 0} valueText={valueText(r)}
        />
      ))}
      {me && (
        <div style={{ fontSize: 9, color: C.grayDark, textAlign: 'center', marginTop: 1 }}>
          {mySummary(me)}
        </div>
      )}
    </div>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 11, marginBottom: 3 }}>
              <span style={{ color: C.white, fontWeight: 600 }}>{r.opponent}</span>
              <span style={{ color: C.gray, fontVariantNumeric: 'tabular-nums' }}>
                {r.games > 0 ? `${r.games}경기 ${r.wins}-${r.draws}-${r.losses}` : '경기수 기록 없음'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Chart
                label="공격" rows={attack} playerName={playerName} C={C} color={C.green}
                valueOf={x => x.attackPoints}
                valueText={x => `${x.attackPoints}P`}
                mySummary={x => `${x.goals}골 ${x.assists}어시`}
                emptyText="공격 기록 없음"
              />
              <Chart
                label="수비" rows={defense} playerName={playerName} C={C} color={C.accent}
                valueOf={x => x.concededPerGame}
                // 단위를 값에 붙여둔다 — 숫자만 두면 총 실점으로 오독된다(1.00실점 사례)
                valueText={x => `${x.concededPerGame.toFixed(2)}실점`}
                mySummary={x => `${x.games}경기`}
                emptyText="수비 기록 없음"
              />
            </div>
          </div>
        );
      })}
    </>
  );
}
