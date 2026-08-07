import TennisCourtSetup from './TennisCourtSetup';
import TennisCourtRecorder from './TennisCourtRecorder';
import { summarizeCourt } from '../../utils/tennis/tennisScoring';

export default function TennisCourtCard({ court, roundIdx, attendees, usedNames, dispatch, C, canDelete }) {
  if (court.status === 'done') {
    const s = summarizeCourt(court);
    return (
      <div style={{ background: C.bg, margin: 8, borderRadius: 10, border: `1px solid ${C.grayDarker}`, padding: 9,
        display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.gray }}>
        <span>✓ 코트 {court.courtId} · {court.format}</span>
        <span>{court.sideA.join('/')} {s.setsA}-{s.setsB} {court.sideB.join('/')}</span>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, margin: 8, borderRadius: 10, border: `1px solid ${C.grayDarker}`, overflow: 'hidden' }}>
      <div style={{ padding: '6px 9px', borderBottom: `1px solid ${C.grayDarker}`, fontSize: 10.5, color: C.gray }}>
        코트 {court.courtId} · {court.status === 'ready' ? '배치 중' : `${court.format} · ${court.bestOf}세트`}
      </div>
      <div style={{ padding: 9 }}>
        {court.status === 'ready'
          ? <TennisCourtSetup court={court} roundIdx={roundIdx} attendees={attendees}
              usedNames={usedNames} dispatch={dispatch} C={C} canDelete={canDelete} />
          : <TennisCourtRecorder court={court} roundIdx={roundIdx} dispatch={dispatch} C={C} />}
      </div>
    </div>
  );
}
