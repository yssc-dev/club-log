import { useTheme } from '../../hooks/useTheme';
import { calcSoccerScore, soccerResultLabel } from '../../utils/soccerScoring';
import { isIntra, sideView, fieldsOfA, fieldsOfB } from '../../utils/intraSoccer/sideView';

// 경기 결과 표(경기마감 최종집계 + 아카이브 상세 공용) — 자체전(빅마스터FC) 지원판.
// 각 경기: 스코어/결과 + 우리 득점자(어시) 목록. CS는 선수별 기록 표에 있으므로 여기선 득점만.
// styles(s)는 th(객체) + td(highlight) 함수를 제공(SoccerApp의 s / HistoryView의 hs 모두 호환).
// 자체전(sideB 있음) 행은 A/B 양편 시점(sideView)으로 점수·득점자를 따로 집계해 렌더, 승/패 라벨은 표기하지 않는다.
export default function IntraSoccerMatchResults({ matches, styles: s }) {
  const { C } = useTheme();
  const finished = (matches || []).filter(m => m.status === "finished");

  // 우리 득점: type "goal"은 "선수(어시)", 상대 자책골(opponentOwnGoal)은 "상대자책"으로 표기.
  const scorers = (m) => {
    const list = [...(m.events || [])].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const out = [];
    for (const e of list) {
      if (e.type === "goal") out.push(e.assist ? `${e.player}(${e.assist})` : e.player);
      else if (e.type === "opponentOwnGoal") out.push("상대자책");
    }
    return out;
  };

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead><tr>{["#", "상대팀", "결과", "득점 (어시)"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
      <tbody>
        {finished.map(m => {
          const isRest = m.opponent === "휴식";
          if (isIntra(m)) {
            const vA = sideView(m, 'A'), vB = sideView(m, 'B');
            const sc = calcSoccerScore(vA.events);
            return (
              <tr key={m.matchIdx}>
                <td style={s.td()}>{m.matchIdx + 1}</td>
                <td style={{ ...s.td(true), textAlign: "left", paddingLeft: 4 }}>{fieldsOfA(m).name} vs {fieldsOfB(m).name}</td>
                <td style={{ ...s.td(true), whiteSpace: "nowrap", color: C.white }}>{sc.ourScore}:{sc.opponentScore}</td>
                <td style={{ ...s.td(), textAlign: "left", paddingLeft: 4, fontSize: 11, color: C.grayLight, lineHeight: 1.5 }}>
                  <div>{fieldsOfA(m).name}: {scorers(vA).join(", ") || "-"}</div>
                  <div>{fieldsOfB(m).name}: {scorers(vB).join(", ") || "-"}</div>
                </td>
              </tr>
            );
          }
          const sc = calcSoccerScore(m.events);
          const result = soccerResultLabel(sc.ourScore, sc.opponentScore);
          const goals = isRest ? [] : scorers(m);
          return (
            <tr key={m.matchIdx}>
              <td style={s.td()}>{m.matchIdx + 1}</td>
              <td style={{ ...s.td(true), textAlign: "left", paddingLeft: 4 }}>{m.opponent}</td>
              <td style={{ ...s.td(true), whiteSpace: "nowrap", color: isRest ? C.gray : result === "승" ? C.green : result === "패" ? C.red : C.gray }}>
                {isRest ? "😴 휴식" : `${sc.ourScore}:${sc.opponentScore} ${result}`}
              </td>
              <td style={{ ...s.td(), textAlign: "left", paddingLeft: 4, fontSize: 11, color: C.grayLight, lineHeight: 1.5 }}>
                {goals.length > 0 ? goals.join(", ") : "-"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
