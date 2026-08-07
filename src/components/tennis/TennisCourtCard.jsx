import TennisCourtSetup from './TennisCourtSetup';
import TennisCourtRecorder from './TennisCourtRecorder';
import { summarizeCourt } from '../../utils/tennis/tennisScoring';

export default function TennisCourtCard({ court, roundIdx, attendees, usedNames, dispatch, C, styles: s, canDelete }) {
  if (court.status === 'done') {
    const summ = summarizeCourt(court);
    return (
      <div style={{ ...s.eventLog, justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ color: C.green, fontSize: 13 }}>✓ 코트 {court.courtId} · {court.format}</span>
        <span style={{ fontSize: 12, color: C.gray }}>
          {court.sideA.join('/')} {summ.setsA}-{summ.setsB} {court.sideB.join('/')}
        </span>
      </div>
    );
  }

  return (
    <div style={s.card}>
      <div style={{ ...s.sectionTitle, marginBottom: 10 }}>
        코트 {court.courtId} · {court.status === 'ready' ? '배치 중' : `${court.format} · ${court.bestOf}세트`}
      </div>
      {court.status === 'ready'
        ? <TennisCourtSetup court={court} roundIdx={roundIdx} attendees={attendees}
            usedNames={usedNames} dispatch={dispatch} C={C} styles={s} canDelete={canDelete} />
        : <TennisCourtRecorder court={court} roundIdx={roundIdx} dispatch={dispatch} C={C} styles={s} />}
    </div>
  );
}
