import { isTiebreakActive, isSetComplete } from '../../utils/tennis/tennisScoring';

// 좌우 축을 그대로 유지한다: 이름·스코어·▲·에이스/DF가 한 세로줄.
// 5:5가 되면 ▲가 게임이 아니라 타이브레이크 포인트를 올린다.

function Column({ side, court, cur, tb, courtKey, dispatch, C, s }) {
  const players = side === 'A' ? court.sideA : court.sideB;
  const games = side === 'A' ? cur.a : cur.b;
  const points = side === 'A' ? cur.tbA : cur.tbB;
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: C.white, minHeight: 32, padding: '4px 0', lineHeight: 1.3 }}>
        {players.join(' / ')}
      </div>
      <div style={{ fontSize: 52, fontWeight: 300, fontVariantNumeric: 'tabular-nums', color: C.white, lineHeight: 1, margin: '8px 0' }}>
        {tb ? points : games}
      </div>
      <button onClick={() => dispatch({ type: tb ? 'INCREMENT_TIEBREAK_POINT' : 'INCREMENT_GAME', ...courtKey, side })}
        style={{ ...s.btnFull(C.accent), marginBottom: 10, fontSize: 18 }}>
        ▲
      </button>
      {/* 에이스/DF는 편이 아니라 선수마다 — 복식에서 잘못 귀속되면 2차에서 복원 불가 */}
      <div>
        {players.map(p => {
          const st = court.stats[p] || { aces: 0, df: 0 };
          return (
            <div key={p} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
              <span style={{ flex: 1, textAlign: 'left', color: C.gray, fontSize: 11, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p}</span>
              <button onClick={() => dispatch({ type: 'INCREMENT_STAT', ...courtKey, player: p, stat: 'aces' })}
                style={s.btnSm()}>A {st.aces || 0}</button>
              <button onClick={() => dispatch({ type: 'INCREMENT_STAT', ...courtKey, player: p, stat: 'df' })}
                style={s.btnSm()}>DF {st.df || 0}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TennisCourtRecorder({ court, roundIdx, dispatch, C, styles: s }) {
  const courtKey = { roundIdx, courtId: court.courtId };
  const cur = court.sets[court.currentSet] || { a: 0, b: 0, tbA: 0, tbB: 0 };
  const tb = isTiebreakActive(cur);
  const canEndSet = isSetComplete(cur);

  return (
    <div>
      <div style={{ textAlign: 'center', fontSize: 12, color: C.gray, marginBottom: 8 }}>
        {tb ? '타이브레이크 (7점)' : `세트 ${court.currentSet + 1} / ${court.bestOf}`}
        {court.sets.filter(set => set.done).map((set, i) => (
          <span key={i} style={{ marginLeft: 8 }}>{set.a}:{set.b}{set.tbA || set.tbB ? ` (${set.tbA}-${set.tbB})` : ''}</span>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 20px 1fr', gap: 4 }}>
        <Column side="A" court={court} cur={cur} tb={tb} courtKey={courtKey} dispatch={dispatch} C={C} s={s} />
        <div />
        <Column side="B" court={court} cur={cur} tb={tb} courtKey={courtKey} dispatch={dispatch} C={C} s={s} />
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button onClick={() => dispatch({ type: 'UNDO', ...courtKey })}
          style={{ ...s.btn(C.cardLight), flex: 1 }}>↩ 되돌리기</button>
        <button disabled={!canEndSet} onClick={() => dispatch({ type: 'END_SET', ...courtKey })}
          style={{ ...s.btn(canEndSet ? C.accent : C.cardLight), flex: 1, opacity: canEndSet ? 1 : 0.4 }}>
          세트 종료
        </button>
        <button onClick={() => {
          const hasScore = court.sets.some(set => set.a > 0 || set.b > 0);
          if (hasScore && !confirm('기록된 점수가 지워집니다. 계속할까요?')) return;
          dispatch({ type: 'EDIT_COURT_SETTINGS', ...courtKey });
        }} style={s.btnSm()}>설정 수정</button>
        {court.bestOf === 1 && (
          <button onClick={() => dispatch({ type: 'EXTEND_TO_THREE_SETS', ...courtKey })}
            style={s.btnSm()}>+3세트</button>
        )}
      </div>
    </div>
  );
}
