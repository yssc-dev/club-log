export default function TennisRoundNav({ rounds, viewingRoundIdx, dispatch, styles: s }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 16px 8px' }}>
      <div style={{ ...s.tabRow, flex: 1, marginBottom: 0 }}>
        {rounds.map(r => (
          <button key={r.roundIdx}
            onClick={() => dispatch({ type: 'SET_VIEWING_ROUND', roundIdx: r.roundIdx })}
            style={s.tab(r.roundIdx === viewingRoundIdx)}>
            R{r.roundIdx}
          </button>
        ))}
      </div>
      <button onClick={() => dispatch({ type: 'ADD_ROUND' })} style={s.btnSm()}>
        + 라운드
      </button>
    </div>
  );
}
