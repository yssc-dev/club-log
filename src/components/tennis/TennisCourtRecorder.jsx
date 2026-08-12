import { isTiebreakActive, isSetComplete } from '../../utils/tennis/tennisScoring';

// 좌우 축을 그대로 유지한다: 이름·스코어·▲·에이스/DF가 한 세로줄.
// 5:5가 되면 ▲가 게임이 아니라 타이브레이크 포인트를 올린다.

// 에이스=테니스공, 더블폴트=레드카드. 글자만으론 "A"와 "DF"가 비슷하게 읽혀
// 경기 중 급하게 누를 때 헷갈린다 — 색과 모양으로 먼저 구분되게 한다.
function AceBadge() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <circle cx="10" cy="10" r="9" fill="#D8E840" />
      <path d="M4 3.8a8 8 0 0 1 0 12.4" fill="none" stroke="#fff" strokeWidth="1.3" />
      <path d="M16 3.8a8 8 0 0 0 0 12.4" fill="none" stroke="#fff" strokeWidth="1.3" />
      <text x="10" y="13.4" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#2E3A00">A</text>
    </svg>
  );
}

function DoubleFaultBadge({ C }) {
  return (
    <span aria-hidden="true" style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 13, height: 18, borderRadius: 2.5, flexShrink: 0,
      background: C.red, color: '#fff', fontSize: 9.5, fontWeight: 700, lineHeight: 1,
    }}>D</span>
  );
}

function Column({ side, court, cur, tb, courtKey, dispatch, C, s, scoringRules }) {
  const players = side === 'A' ? court.sideA : court.sideB;
  const games = side === 'A' ? cur.a : cur.b;
  const points = side === 'A' ? cur.tbA : cur.tbB;
  // A=왼쪽/파랑, B=오른쪽/주황. 승패를 연상시키는 초록·빨강 대신 중립 두 색을 쓴다.
  const tone = side === 'A' ? C.accent : C.orange;
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        background: C.cardLight, borderRadius: 12, padding: '10px 8px 12px',
        borderTop: `3px solid ${tone}`,
      }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: C.white, minHeight: 32, padding: '2px 0', lineHeight: 1.3 }}>
          {players.join(' / ')}
        </div>
        <div style={{ fontSize: 52, fontWeight: 300, fontVariantNumeric: 'tabular-nums', color: C.white, lineHeight: 1, margin: '4px 0 12px' }}>
          {tb ? points : games}
        </div>
        {/* ▲만 있으면 게임을 올리는지 타이브레이크 포인트를 올리는지 버튼만 봐선 알 수 없다 */}
        <button onClick={() => dispatch({ type: tb ? 'INCREMENT_TIEBREAK_POINT' : 'INCREMENT_GAME', ...courtKey, side })}
          style={{
            ...s.btnFull(tone), minHeight: 46, borderRadius: 999,
            fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em',
          }}>
          {tb ? (scoringRules?.tiebreakMode === '1point' ? '승부 포인트' : '포인트 +1') : '게임 +1'}
        </button>
      </div>
      {/* 에이스/DF는 편이 아니라 선수마다 — 복식에서 잘못 귀속되면 2차에서 복원 불가 */}
      <div style={{ marginTop: 10 }}>
        {players.map(p => {
          const st = court.stats[p] || { aces: 0, df: 0 };
          return (
            <div key={p} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
              <span style={{ flex: 1, textAlign: 'left', color: C.gray, fontSize: 11, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p}</span>
              <button onClick={() => dispatch({ type: 'INCREMENT_STAT', ...courtKey, player: p, stat: 'aces' })}
                aria-label={`${p} 서브에이스 추가`}
                style={{ ...s.btnSm(), display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px' }}>
                <AceBadge />{st.aces || 0}
              </button>
              <button onClick={() => dispatch({ type: 'INCREMENT_STAT', ...courtKey, player: p, stat: 'df' })}
                aria-label={`${p} 더블폴트 추가`}
                style={{ ...s.btnSm(), display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px' }}>
                <DoubleFaultBadge C={C} />{st.df || 0}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TennisCourtRecorder({ court, roundIdx, dispatch, C, styles: s, scoringRules }) {
  const courtKey = { roundIdx, courtId: court.courtId };
  const cur = court.sets[court.currentSet] || { a: 0, b: 0, tbA: 0, tbB: 0 };
  const tb = isTiebreakActive(cur) && scoringRules?.tiebreakMode !== '1point';
  const canEndSet = isSetComplete(cur);
  const tbLabel = scoringRules?.tiebreakMode === '1point' ? '타이브레이크 (1점 데스)' : '타이브레이크 (7점)';

  return (
    <div>
      <div style={{ textAlign: 'center', fontSize: 12, color: C.gray, marginBottom: 8 }}>
        {tb ? tbLabel : `세트 ${court.currentSet + 1} / ${court.bestOf}`}
        {court.sets.filter(set => set.done).map((set, i) => (
          <span key={i} style={{ marginLeft: 8 }}>{set.a}:{set.b}{set.tbA || set.tbB ? ` (${set.tbA}-${set.tbB})` : ''}</span>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 20px 1fr', gap: 4 }}>
        <Column side="A" court={court} cur={cur} tb={tb} courtKey={courtKey} dispatch={dispatch} C={C} s={s} scoringRules={scoringRules} />
        <div />
        <Column side="B" court={court} cur={cur} tb={tb} courtKey={courtKey} dispatch={dispatch} C={C} s={s} scoringRules={scoringRules} />
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
