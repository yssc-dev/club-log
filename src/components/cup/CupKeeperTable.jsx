// src/components/cup/CupKeeperTable.jsx
// 컵 수문장 테이블 — 계산된 keepers 배열을 받아 그린다.
import { useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { useSortableRows, SortHeader } from '../tennis/Sortable';

const COLS_COUNT = 5;

export default function CupKeeperTable({ keepers = [] }) {
  const { C } = useTheme();
  const th = { padding: '6px 4px', fontSize: 11, color: C.gray, fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' };
  const td = { padding: '6px 4px', fontSize: 13, color: C.white, textAlign: 'center', whiteSpace: 'nowrap' };
  const ds = { th };

  const cols = useMemo(() => ({
    name:         { accessor: k => k.name, type: 'text' },
    games:        { accessor: k => k.games, type: 'num' },
    conceded:     { accessor: k => k.conceded, type: 'num' },
    concededRate: { accessor: k => Number(k.concededRate), type: 'num' },
    cleanSheets:  { accessor: k => k.cleanSheets, type: 'num' },
  }), []);

  const { sorted, sort, onSort } = useSortableRows(keepers, cols);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table data-role="cup-keepers" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <SortHeader label="선수"    sortKey="name"         sort={sort} onSort={onSort} align="left"   ds={ds} />
            <SortHeader label="경기"    sortKey="games"        sort={sort} onSort={onSort} align="center" ds={ds} />
            <SortHeader label="실점"    sortKey="conceded"     sort={sort} onSort={onSort} align="center" ds={ds} />
            <SortHeader label="실점률"  sortKey="concededRate" sort={sort} onSort={onSort} align="center" ds={ds} />
            <SortHeader label="클린시트" sortKey="cleanSheets"  sort={sort} onSort={onSort} align="center" ds={ds} />
          </tr>
        </thead>
        <tbody>
          {keepers.length === 0 ? (
            <tr>
              <td colSpan={COLS_COUNT} style={{ ...td, color: C.gray, textAlign: 'center', padding: '12px 4px' }}>
                기록 없음
              </td>
            </tr>
          ) : (
            sorted.map((k) => (
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
