import { useState } from 'react';
import TennisCourtSetup from './TennisCourtSetup';
import TennisCourtRecorder from './TennisCourtRecorder';
import { summarizeCourt, setWinner } from '../../utils/tennis/tennisScoring';

// 끝난 판을 고치는 경로. 진행 카드의 [설정 수정]은 done 카드엔 없으므로
// 여기서 탭해 펼치는 것이 유일한 진입점이다.
//   되돌리기 = 판 종료를 취소해 마지막 세트를 다시 연다(점수 유지)
//   설정 수정 = 점수를 지우고 배치부터 다시
function DoneCourtCard({ court, roundIdx, dispatch, C, styles: s, locked }) {
  const [open, setOpen] = useState(false);
  const courtKey = { roundIdx, courtId: court.courtId };
  const summ = summarizeCourt(court);
  const canUndo = (court.undoStack || []).length > 0;
  // 세트 승리(1-0)와 세트별 게임 스코어(6:4)를 헤더에 병행 표기
  const setScores = (court.sets || [])
    .filter(set => setWinner(set))
    .map(set => `${set.a}:${set.b}${(set.tbA || set.tbB) ? `(${set.tbA}-${set.tbB})` : ''}`)
    .join(' ');

  return (
    <div style={{ ...s.card, marginBottom: 10, padding: open ? 14 : '10px 14px' }}>
      <button onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
          width: '100%', background: 'transparent', border: 'none', padding: 0,
          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        }}>
        <span style={{ color: C.green, fontSize: 13, fontWeight: 500 }}>✓ 코트 {court.courtId} · {court.format}</span>
        <span style={{ fontSize: 12, color: C.gray }}>
          {court.sideA.join('/')} {summ.setsA}-{summ.setsB} {court.sideB.join('/')}
          {setScores ? <span style={{ marginLeft: 6, color: C.grayLight, fontVariantNumeric: 'tabular-nums' }}>{setScores}</span> : null}
          <span style={{ marginLeft: 6, color: C.grayLight }}>{open ? '▲' : '▼'}</span>
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 12, borderTop: `0.5px solid ${C.borderColor}`, paddingTop: 12 }}>
          {locked ? (
            <div style={{ fontSize: 12, color: C.gray, textAlign: 'center', padding: '4px 0' }}>
              확정된 라운드 — 수정하려면 하단에서 확정취소
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <button disabled={!canUndo}
                onClick={() => dispatch({ type: 'UNDO', ...courtKey })}
                style={{ ...s.btnSm(), flex: 1, minHeight: 36, opacity: canUndo ? 1 : 0.4 }}>
                ↩ 되돌리기
              </button>
              <button onClick={() => {
                if (!confirm('이 판의 기록된 점수가 지워지고 배치 화면으로 돌아갑니다. 계속할까요?')) return;
                dispatch({ type: 'EDIT_COURT_SETTINGS', ...courtKey });
              }} style={{ ...s.btnSm(), flex: 1, minHeight: 36 }}>
                설정 수정
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TennisCourtCard({ court, roundIdx, attendees, usedNames, dispatch, C, styles: s, canDelete, locked, scoringRules }) {
  if (court.status === 'done') {
    return <DoneCourtCard court={court} roundIdx={roundIdx} dispatch={dispatch} C={C} styles={s} locked={locked} />;
  }

  return (
    <div style={s.card}>
      <div style={{ ...s.sectionTitle, marginBottom: 10 }}>
        코트 {court.courtId} · {court.status === 'ready' ? '배치 중' : `${court.format} · ${court.bestOf}세트`}
      </div>
      {court.status === 'ready'
        ? <TennisCourtSetup court={court} roundIdx={roundIdx} attendees={attendees}
            usedNames={usedNames} dispatch={dispatch} C={C} styles={s} canDelete={canDelete} />
        : <TennisCourtRecorder court={court} roundIdx={roundIdx} dispatch={dispatch} C={C} styles={s} scoringRules={scoringRules} />}
    </div>
  );
}
