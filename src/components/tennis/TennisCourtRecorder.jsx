import { isTiebreakActive, isSetComplete } from '../../utils/tennis/tennisScoring';

// 좌우 축을 그대로 유지한다: 이름·스코어·▲·에이스/DF가 한 세로줄.
// 5:5가 되면 ▲가 게임이 아니라 타이브레이크 포인트를 올린다.

function Column({ side, court, cur, tb, courtKey, dispatch, C }) {
  const players = side === 'A' ? court.sideA : court.sideB;
  const games = side === 'A' ? cur.a : cur.b;
  const points = side === 'A' ? cur.tbA : cur.tbB;
  return (
    <div style={{ padding: 4, textAlign: 'center' }}>
      <div style={{ fontWeight: 600, fontSize: 11.5, minHeight: 28 }}>{players.join(' / ')}</div>
      <div style={{ fontSize: 38, fontWeight: 300, fontVariantNumeric: 'tabular-nums' }}>
        {tb ? points : games}
      </div>
      <button onClick={() => dispatch({ type: tb ? 'INCREMENT_TIEBREAK_POINT' : 'INCREMENT_GAME', ...courtKey, side })}
        style={{ width: '100%', background: C.white, color: C.bg, borderRadius: 9, padding: '15px 0', border: 0, fontSize: 15, fontWeight: 700 }}>
        ▲
      </button>
      {/* 에이스/DF는 편이 아니라 선수마다 — 복식에서 잘못 귀속되면 2차에서 복원 불가 */}
      <div style={{ marginTop: 7 }}>
        {players.map(p => {
          const st = court.stats[p] || { aces: 0, df: 0 };
          return (
            <div key={p} style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 3, fontSize: 9.5 }}>
              <span style={{ flex: 1, textAlign: 'left', color: C.gray }}>{p}</span>
              <button onClick={() => dispatch({ type: 'INCREMENT_STAT', ...courtKey, player: p, stat: 'aces' })}
                style={{ padding: '3px 6px', fontSize: 9.5 }}>A {st.aces || 0}</button>
              <button onClick={() => dispatch({ type: 'INCREMENT_STAT', ...courtKey, player: p, stat: 'df' })}
                style={{ padding: '3px 6px', fontSize: 9.5 }}>DF {st.df || 0}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TennisCourtRecorder({ court, roundIdx, dispatch, C }) {
  const courtKey = { roundIdx, courtId: court.courtId };
  const cur = court.sets[court.currentSet] || { a: 0, b: 0, tbA: 0, tbB: 0 };
  const tb = isTiebreakActive(cur);
  const canEndSet = isSetComplete(cur);

  return (
    <div>
      <div style={{ textAlign: 'center', fontSize: 10.5, color: C.gray, marginBottom: 6 }}>
        {tb ? '타이브레이크 (7점)' : `세트 ${court.currentSet + 1} / ${court.bestOf}`}
        {court.sets.filter(s => s.done).map((s, i) => (
          <span key={i} style={{ marginLeft: 6 }}>{s.a}:{s.b}{s.tbA || s.tbB ? ` (${s.tbA}-${s.tbB})` : ''}</span>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 26px 1fr' }}>
        <Column side="A" court={court} cur={cur} tb={tb} courtKey={courtKey} dispatch={dispatch} C={C} />
        <div />
        <Column side="B" court={court} cur={cur} tb={tb} courtKey={courtKey} dispatch={dispatch} C={C} />
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
        <button onClick={() => dispatch({ type: 'UNDO', ...courtKey })} style={{ flex: 1, padding: 8, fontSize: 11 }}>↩ 되돌리기</button>
        <button disabled={!canEndSet} onClick={() => dispatch({ type: 'END_SET', ...courtKey })}
          style={{ flex: 1, padding: 8, fontSize: 11, opacity: canEndSet ? 1 : 0.4 }}>세트 종료</button>
        <button onClick={() => {
          const hasScore = court.sets.some(s => s.a > 0 || s.b > 0);
          if (hasScore && !confirm('기록된 점수가 지워집니다. 계속할까요?')) return;
          dispatch({ type: 'EDIT_COURT_SETTINGS', ...courtKey });
        }} style={{ flex: '0 0 auto', padding: '8px 10px', fontSize: 10.5, color: C.gray }}>설정 수정</button>
        {court.bestOf === 1 && (
          <button onClick={() => dispatch({ type: 'EXTEND_TO_THREE_SETS', ...courtKey })}
            style={{ flex: '0 0 auto', padding: '8px 10px', fontSize: 10.5 }}>+3세트</button>
        )}
      </div>
    </div>
  );
}
