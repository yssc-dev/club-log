export default function TennisRoundNav({ rounds, viewingRoundIdx, dispatch, C }) {
  const idxs = rounds.map(r => r.roundIdx);
  const pos = idxs.indexOf(viewingRoundIdx);
  const go = (d) => {
    const n = idxs[pos + d];
    if (n !== undefined) dispatch({ type: 'SET_VIEWING_ROUND', roundIdx: n });
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', color: C.white }}>
      <button onClick={() => go(-1)} disabled={pos <= 0}>◀</button>
      <span style={{ flex: 1, textAlign: 'center', fontSize: 12 }}>라운드 {viewingRoundIdx} / {idxs.length}</span>
      <button onClick={() => go(1)} disabled={pos >= idxs.length - 1}>▶</button>
      <button onClick={() => dispatch({ type: 'ADD_ROUND' })} style={{ fontSize: 11 }}>+ 라운드</button>
    </div>
  );
}
