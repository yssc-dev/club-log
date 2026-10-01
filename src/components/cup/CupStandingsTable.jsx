// src/components/cup/CupStandingsTable.jsx
// 대회 누적 순위표(3단계 스펙 §5). calcCupStandings().standings 를 그대로 받아 그린다 — 계산하지 않는다.
import { useTheme } from '../../hooks/useTheme';

// 가점은 종류별 열로 따로 보여준다(합쳐서 '가점 n' 금지, 2026-09-29). 남은 가점은 참석뿐(무실점 09-28·다득점 10-01 폐지).
const COLS = ['순위', '팀', '경기', '승', '무', '패', '득실', '승점', '참석', '합계'];

export default function CupStandingsTable({ standings = [], finished = false }) {
  const { C } = useTheme();
  const th = { padding: "6px 4px", fontSize: 11, color: C.gray, fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" };
  const td = (bold = false) => ({ padding: "6px 4px", fontSize: 13, color: C.white, textAlign: "center", fontWeight: bold ? 700 : 400, whiteSpace: "nowrap", verticalAlign: "top" });
  const gdText = (gd) => (gd > 0 ? `+${gd}` : String(gd));
  return (
    <div style={{ overflowX: "auto" }}>
      <table data-role="cup-standings" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{COLS.map(c => <th key={c} style={th}>{c}</th>)}</tr></thead>
        <tbody>
          {standings.map((s, i) => {
            const first = i === 0;
            return (
              <tr key={s.name} data-role="cup-standing-row" data-team={s.name}
                style={{ background: first ? "rgba(255,149,0,0.10)" : "transparent", borderTop: `1px solid ${C.borderColor}` }}>
                <td style={td(first)}>{i + 1}</td>
                <td style={{ ...td(first), textAlign: "left" }}>
                  {s.name}
                  {!s.registered && <span style={{ fontSize: 11, color: C.gray }}> (미등록)</span>}
                  {first && finished && <span style={{ marginLeft: 4, fontSize: 12 }}>🏆 우승</span>}
                </td>
                <td style={td()}>{s.games}</td>
                <td style={td()}>{s.wins}</td>
                <td style={td()}>{s.draws}</td>
                <td style={td()}>{s.losses}</td>
                <td style={td()}>{gdText(s.gd)}</td>
                <td style={td()}>{s.points}</td>
                <td style={td()}>{s.bonusAttend}</td>
                <td style={td(true)}>{s.total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
