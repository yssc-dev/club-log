import { summarizeCourt, setWinner } from '../../utils/tennis/tennisScoring';

// 오늘 완료된 코트(라운드별 encounter 순)를 한눈에 보여 주는 모달.
// winner === null인 코트(미완료)는 건너뛴다.
export default function TennisResultsModal({ rounds, C, styles: s }) {
  const results = [];
  for (const round of (rounds || [])) {
    for (const court of (round.courts || [])) {
      const summary = summarizeCourt(court);
      if (!summary.winner) continue;
      results.push({ round, court, summary });
    }
  }

  if (results.length === 0) {
    return (
      <div style={{ color: C.gray, textAlign: 'center', padding: 20 }}>
        완료된 경기가 없습니다.
      </div>
    );
  }

  return (
    <div>
      {results.map(({ round, court, summary }) => {
        const sideA = (court.sideA || []).join(' / ');
        const sideB = (court.sideB || []).join(' / ');
        const setsStr = (court.sets || [])
          .filter(set => setWinner(set))
          .map(set => `${set.a}:${set.b}`)
          .join('  ');
        const winnerLabel = summary.winner === 'A' ? sideA : sideB;

        return (
          <div key={`r${round.roundIdx}-c${court.courtId}`} style={{ ...s.card, marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: C.gray, marginBottom: 4 }}>
              R{round.roundIdx} · 코트 {court.courtId} · {court.format}
            </div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: C.white }}>
              {sideA} <span style={{ fontWeight: 400, color: C.gray }}>vs</span> {sideB}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: C.gray, fontVariantNumeric: 'tabular-nums' }}>
                {setsStr}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.green }}>
                {winnerLabel} 승
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
