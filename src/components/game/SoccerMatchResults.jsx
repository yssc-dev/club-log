import { useTheme } from '../../hooks/useTheme';
import { calcSoccerScore, soccerResultLabel } from '../../utils/soccerScoring';
import { readRoles } from '../../utils/soccerRoles';

// 경기 결과 표(경기마감 최종집계 + 아카이브 상세 공용).
// 각 경기: 스코어/결과 + 우리 득점자(어시) 목록. CS는 선수별 기록 표에 있으므로 여기선 득점만.
// styles(s)는 th(객체) + td(highlight) 함수를 제공(SoccerApp의 s / HistoryView의 hs 모두 호환).
//
// 역할 열(2026-10-14): 기록확정(시트 전송) 전에 '영상촬영·주심이 맞게 들어갔나' 를 여기서
// 검토한다. 축이 비면 그 자리만 — 로 적어 미지정이 눈에 띄게 하고, 둘 다 비면 '-' 한 글자다.
// 휴식 경기는 역할 지정 UI 자체가 없지만(canChangeOpponent=false) 값이 있으면 그대로 보여준다 —
// 숨기면 검토 목적을 배반한다. 읽기는 readRoles 경유(RTDB 드롭·객체화·아카이브 경로 방어).
export default function SoccerMatchResults({ matches, styles: s }) {
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

  // 역할 셀. 둘 다 공석이면 '-', 한쪽만 공석이면 그 축만 em dash — 미지정이 눈에 띄게.
  const roleText = (m) => {
    const r = readRoles(m);
    if (r.camera.length === 0 && r.referee === "") return "-";
    const cam = r.camera.length ? r.camera.join(", ") : "\u2014";
    return `\u{1F3A5} ${cam} \u00B7 \u{1F9D1}\u200D\u2696\uFE0F ${r.referee || "\u2014"}`;
  };

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead><tr>{["#", "상대팀", "결과", "득점 (어시)", "역할"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
      <tbody>
        {finished.map(m => {
          const isRest = m.opponent === "휴식";
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
              <td style={{ ...s.td(), textAlign: "left", paddingLeft: 4, fontSize: 11, color: C.grayLight, lineHeight: 1.5 }}>
                {roleText(m)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
