import { useMemo } from 'react';
import TennisResultsModal from './TennisResultsModal';

// 마감 확인 화면(phase 'summary'/'done'). 풋살 summary phase 이식 —
// 여기서만 시트 전송이 일어나고(관리자 전용), 성공 후 아카이브 저장(관리자 전용)으로 마무리한다.
export default function TennisSummaryView({ state, isAdmin, busy, onBack, onSubmit, onArchive, C, styles: s }) {
  const finalized = state.gameFinalized === true;

  // 게임 전체 에이스/DF 합산 — court.stats {player: {aces, df}}.
  // busy 토글 등 rounds 무관 리렌더에 재계산되지 않도록 메모화한다.
  const statRows = useMemo(() => {
    const totals = {};
    for (const r of (state.rounds || [])) for (const c of (r.courts || [])) {
      for (const [player, st] of Object.entries(c.stats || {})) {
        const cur = totals[player] || { aces: 0, df: 0 };
        totals[player] = { aces: cur.aces + (st.aces || 0), df: cur.df + (st.df || 0) };
      }
    }
    return Object.entries(totals)
      .filter(([, v]) => v.aces > 0 || v.df > 0)
      .sort((a, b) => b[1].aces - a[1].aces);
  }, [state.rounds]);

  return (
    <div style={{ paddingBottom: 120 }}>
      {!finalized && (
        <button onClick={onBack} style={{ ...s.btnSm(), margin: '0 16px 10px' }}>마감 해제</button>
      )}

      <div style={s.section}>
        <TennisResultsModal rounds={state.rounds} C={C} styles={s} />

        {statRows.length > 0 && (
          <div style={{ ...s.card, marginTop: 10 }}>
            <div style={s.sectionTitle}>에이스 · 더블폴트</div>
            {statRows.map(([player, v]) => (
              <div key={player} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', color: C.gray }}>
                <span style={{ color: C.white }}>{player}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>🎾 {v.aces} · DF {v.df}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ ...s.bottomBar, flexDirection: 'column', gap: 6 }}>
        <button disabled={!isAdmin || busy || finalized} onClick={onSubmit}
          style={{ ...s.btnFull(finalized ? C.green : isAdmin ? C.accent : C.cardLight), opacity: isAdmin || finalized ? 1 : 0.5 }}>
          {finalized ? '전송 완료' : busy ? '전송 중...' : isAdmin ? '기록확정 (구글시트 전송)' : '기록확정 (관리자만)'}
        </button>
        <button disabled={!finalized || busy || !isAdmin} onClick={onArchive}
          style={{ ...s.btnFull(finalized && isAdmin ? C.accent : C.cardLight), opacity: finalized && isAdmin ? 1 : 0.5 }}>
          {isAdmin ? '아카이브 저장' : '아카이브 저장 (관리자만)'}
        </button>
      </div>
    </div>
  );
}
