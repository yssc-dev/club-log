// src/components/cup/CupDefenseTable.jsx
// 컵 필드 수비 테이블 — 계산된 minGames/rated/unrated 를 받아 그린다.
import { useTheme } from '../../hooks/useTheme';

const COLS = ['선수', '경기', '실점', '경기당 실점', '무실점률'];

export default function CupDefenseTable({ minGames = 1, rated = [], unrated = [] }) {
  const { C } = useTheme();
  const th = { padding: '6px 4px', fontSize: 11, color: C.gray, fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' };
  const td = { padding: '6px 4px', fontSize: 13, color: C.white, textAlign: 'center', whiteSpace: 'nowrap' };

  const renderRow = (p, isRated) => (
    <tr
      key={p.name}
      data-role="cup-defense-row"
      data-player={p.name}
      data-rated={isRated ? 'true' : 'false'}
      style={{
        borderTop: `1px solid ${C.borderColor}`,
        ...(isRated ? {} : { opacity: 0.5 }),
      }}
    >
      <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{p.name}</td>
      <td style={td}>{p.games}</td>
      <td style={td}>{p.conceded}</td>
      <td style={td}>{Number(p.concededPerGame).toFixed(2)}</td>
      <td style={td}>{Math.round(p.cleanRate * 100)}%</td>
    </tr>
  );

  const all = [...rated, ...unrated];

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table data-role="cup-defense" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{COLS.map((c) => <th key={c} style={th}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {all.length === 0 ? (
              <tr>
                <td colSpan={COLS.length} style={{ ...td, color: C.gray, textAlign: 'center', padding: '12px 4px' }}>
                  기록 없음
                </td>
              </tr>
            ) : (
              <>
                {rated.map((p) => renderRow(p, true))}
                {unrated.map((p) => renderRow(p, false))}
              </>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: C.gray, marginTop: 4 }}>
        기준: 필드 {minGames}경기 이상 (GK로 뛴 경기 제외)
      </div>
    </div>
  );
}
