import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import Modal from '../common/Modal';

// ownGoalPoint: 세션 규칙 스냅샷의 자책 점수(컵·표준 -1, 마스터FC 정규 -2). 합계와 같은 값으로 표시해야 한다.
export default function PlayerStatsModal({ attendees, calcPlayerPoints, showBonus, onClose, styles: s, ownGoalPoint = -1 }) {
  const { C } = useTheme();
  const [sortKey, setSortKey] = useState("total");
  const cols = ["선수", "골", "어시", "자책", "클린", ...(showBonus ? ["🍀", "🍠"] : []), "키퍼", "실점", "합계"];
  const colKeys = ["name", "goals", "assists", "owngoals", "cleanSheets", ...(showBonus ? ["crova", "goguma"] : []), "keeperGames", "conceded", "total"];

  const rows = attendees.map(p => {
    const pts = calcPlayerPoints(p);
    return { name: p, ...pts };
  });

  const sorted = [...rows].sort((a, b) => {
    if (sortKey === "name") return a.name.localeCompare(b.name, "ko");
    const diff = (b[sortKey] || 0) - (a[sortKey] || 0);
    if (diff !== 0) return diff;
    const goalDiff = (b.goals || 0) - (a.goals || 0);
    if (goalDiff !== 0) return goalDiff;
    return (b.assists || 0) - (a.assists || 0);
  });

  return (
    <Modal onClose={onClose} title="오늘의 선수기록" maxWidth={500}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
          <thead><tr>{cols.map((h, ci) => <th key={h} style={{ ...s.th, cursor: "pointer", color: sortKey === colKeys[ci] ? C.accent : C.gray }} onClick={(e) => { e.stopPropagation(); setSortKey(colKeys[ci]); }}>{h}{sortKey === colKeys[ci] ? " ▼" : ""}</th>)}</tr></thead>
          <tbody>
            {sorted.map(p => (
              <tr key={p.name}>
                <td style={s.td(true)}>{p.name}</td>
                <td style={s.td(p.goals > 0)}>{p.goals}</td>
                <td style={s.td(p.assists > 0)}>{p.assists}</td>
                <td style={{ ...s.td(p.owngoals > 0), color: p.owngoals > 0 ? C.red : C.white }}>{p.owngoals > 0 ? String(p.owngoals * ownGoalPoint) : 0}</td>
                <td style={s.td(p.cleanSheets > 0)}>{p.cleanSheets}</td>
                {showBonus && <td style={{ ...s.td(p.crova > 0), color: p.crova > 0 ? C.green : C.white }}>{p.crova || ""}</td>}
                {showBonus && <td style={{ ...s.td(p.goguma < 0), color: p.goguma < 0 ? C.red : C.white }}>{p.goguma || ""}</td>}
                <td style={s.td(p.keeperGames > 0)}>{p.keeperGames}</td>
                <td style={s.td(p.conceded > 0)}>{p.conceded}</td>
                <td style={{ ...s.td(true), fontSize: 13, fontWeight: 800, color: p.total > 0 ? C.green : p.total < 0 ? C.red : C.white }}>{p.total > 0 ? `+${p.total}` : p.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
