// src/components/cup/CupKeeperTable.jsx
// 컵 수문장 테이블 — 계산된 keepers 배열을 받아 그린다.
import { useTheme } from '../../hooks/useTheme';

const COLS = ['선수', '경기', '실점', '실점률', '클린시트'];

export default function CupKeeperTable({ keepers = [] }) {
  const { C } = useTheme();
  const th = { padding: '6px 4px', fontSize: 11, color: C.gray, fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' };
  const td = { padding: '6px 4px', fontSize: 13, color: C.white, textAlign: 'center', whiteSpace: 'nowrap' };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table data-role="cup-keepers" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>{COLS.map((c) => <th key={c} style={th}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {keepers.length === 0 ? (
            <tr>
              <td colSpan={COLS.length} style={{ ...td, color: C.gray, textAlign: 'center', padding: '12px 4px' }}>
                기록 없음
              </td>
            </tr>
          ) : (
            keepers.map((k) => (
              <tr
                key={k.name}
                data-role="cup-keeper-row"
                data-player={k.name}
                style={{ borderTop: `1px solid ${C.borderColor}` }}
              >
                <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{k.name}</td>
                <td style={td}>{k.games}</td>
                <td style={td}>{k.conceded}</td>
                <td style={td}>{Number(k.concededRate).toFixed(2)}</td>
                <td style={td}>{k.cleanSheets}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
