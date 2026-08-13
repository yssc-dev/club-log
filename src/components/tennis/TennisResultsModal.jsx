import { summarizeCourt, setWinner } from '../../utils/tennis/tennisScoring';

// 오늘 완료된 경기를 라운드 단위로 묶어 보여 주는 모달.
// 한 라운드가 카드 하나이고, 그 안에 코트가 줄로 들어간다 — 같은 라운드에서 동시에
// 돌아간 판들이 한 덩어리로 읽혀야 "이번 라운드에 누가 뛰었나"가 한눈에 들어온다.
// winner === null인 코트(미완료)는 건너뛴다.
export default function TennisResultsModal({ rounds, C, styles: s }) {
  const grouped = [];
  for (const round of (rounds || [])) {
    const courts = [];
    for (const court of (round.courts || [])) {
      const summary = summarizeCourt(court);
      if (!summary.winner) continue;
      courts.push({ court, summary });
    }
    if (courts.length > 0) grouped.push({ round, courts });
  }

  if (grouped.length === 0) {
    return (
      <div style={{ color: C.gray, textAlign: 'center', padding: 20 }}>
        완료된 경기가 없습니다.
      </div>
    );
  }

  return (
    <div>
      {grouped.map(({ round, courts }) => (
        <div key={round.roundIdx} style={{ ...s.card, marginBottom: 10, padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '9px 14px', background: C.cardLight,
            fontSize: 12, fontWeight: 600, color: C.white,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>라운드 {round.roundIdx}</span>
            <span style={{ fontWeight: 400, color: C.gray }}>{courts.length}경기</span>
          </div>

          {courts.map(({ court, summary }, i) => {
            const sideA = (court.sideA || []).join(' / ');
            const sideB = (court.sideB || []).join(' / ');
            const aWon = summary.winner === 'A';
            const setsStr = (court.sets || [])
              .filter(set => setWinner(set))
              .map(set => `${set.a}:${set.b}${(set.tbA || set.tbB) ? ` (${set.tbA}-${set.tbB})` : ''}`)
              .join('  ');

            return (
              <div key={court.courtId} style={{
                padding: '10px 14px',
                borderTop: i === 0 ? 'none' : `0.5px solid ${C.borderColor}`,
              }}>
                <div style={{ fontSize: 11, color: C.gray, marginBottom: 5 }}>
                  코트 {court.courtId} · {court.format}
                </div>
                {/* 스코어보드: 세트 스코어를 두 선수 사이에 두어 왼쪽 수=왼쪽 선수로 읽힌다. 승자만 진하게. */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 14, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: aWon ? 600 : 400, color: aWon ? C.white : C.gray }}>{sideA}</span>
                  <span style={{ fontSize: 13, color: C.gray, fontVariantNumeric: 'tabular-nums' }}>{setsStr}</span>
                  <span style={{ fontWeight: aWon ? 400 : 600, color: aWon ? C.gray : C.white }}>{sideB}</span>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
