// src/components/dashboard/analytics/OpponentBreakdownList.jsx
// 개인분석 '상대팀별 성적' 목록 (축구 전용). 상대팀마다 좌=공격 / 우=수비 두 칸.
//
// 순위는 그 상대팀과 붙어본 전원 중 몇 위인지. 공격은 공격포인트(골+어시) '총합' 기준이라
// 1~2경기만 뛴 선수가 상위를 차지하지 않는다(경기당 기준이면 임계가 필요해진다).
// 수비는 경기당 실점 기준(낮을수록 1위)이고, our_defenders_json이 있는 경기만 잡혀
// 소수 상대는 '수비 기록 없음'이 뜬다.
const RANK = (rank, pool) => `${rank}위/${pool}명`;

function Side({ label, main, sub, rank, color, C }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 9, color: C.gray, marginBottom: 2 }}>{label}</div>
      {main == null ? (
        <div style={{ fontSize: 11, color: C.grayDark }}>{sub}</div>
      ) : (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{main}</div>
          <div style={{ fontSize: 9.5, color: C.gray, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {sub}{rank && <span style={{ color: C.grayDark }}>{' · '}{rank}</span>}
          </div>
        </>
      )}
    </div>
  );
}

export default function OpponentBreakdownList({ rows, defenseRows, C }) {
  if (!rows || rows.length === 0) return null;
  const defByOpp = new Map((defenseRows || []).map(d => [d.opponent, d]));

  return (
    <>
      {rows.map(r => {
        const d = defByOpp.get(r.opponent);
        return (
          <div key={r.opponent} style={{ padding: '8px 0', borderTop: `1px dashed ${C.grayDarker}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 11, marginBottom: 5 }}>
              <span style={{ color: C.white, fontWeight: 600 }}>{r.opponent}</span>
              <span style={{ color: C.gray, fontVariantNumeric: 'tabular-nums' }}>
                {r.games > 0 ? `${r.games}경기 ${r.wins}-${r.draws}-${r.losses}` : '경기수 기록 없음'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Side
                label="공격" C={C} color={C.green}
                main={`${r.attackPoints}P`}
                sub={`${r.goals}골 ${r.assists}어시`}
                rank={r.attackRank ? RANK(r.attackRank, r.attackPool) : null}
              />
              <Side
                label="수비" C={C} color={C.accent}
                main={d ? `${d.concededPerGame.toFixed(2)}실점` : null}
                sub={d ? `${d.games}경기` : '수비 기록 없음'}
                rank={d ? RANK(d.rank, d.pool) : null}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}
