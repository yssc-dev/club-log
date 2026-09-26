// src/components/cup/CupPlayerRecordsTable.jsx
// 대회 개인기록 표(3단계 스펙 §5). calcCupPlayerRecords() 결과를 그대로 그린다 — 전원 표시, 골순.
import { useTheme } from '../../hooks/useTheme';

const COLS = ['선수', '팀', '골', '어시', '클린시트', '자책', '참석'];

export default function CupPlayerRecordsTable({ records = [] }) {
  const { C } = useTheme();
  const th = { padding: "6px 4px", fontSize: 11, color: C.gray, fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" };
  const td = { padding: "6px 4px", fontSize: 13, color: C.white, textAlign: "center", whiteSpace: "nowrap" };
  return (
    <div style={{ overflowX: "auto" }}>
      <table data-role="cup-player-records" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{COLS.map(c => <th key={c} style={th}>{c}</th>)}</tr></thead>
        <tbody>
          {records.map(r => (
            <tr key={r.name} data-role="cup-player-row" data-player={r.name} style={{ borderTop: `1px solid ${C.borderColor}` }}>
              <td style={{ ...td, textAlign: "left" }}>{r.name}</td>
              <td style={{ ...td, color: C.gray, fontSize: 12 }}>{r.guest ? '용병' : r.team}</td>
              <td style={{ ...td, fontWeight: r.goals > 0 ? 700 : 400 }}>{r.goals}</td>
              <td style={td}>{r.assists}</td>
              <td style={td}>{r.cleanSheets}</td>
              <td style={td}>{r.ownGoals}</td>
              <td style={td}>{r.days}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
