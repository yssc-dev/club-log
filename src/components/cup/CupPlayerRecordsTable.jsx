// src/components/cup/CupPlayerRecordsTable.jsx
// 대회 개인기록 표(3단계 스펙 §5). calcCupPlayerRecords() 결과를 그대로 그린다 — 전원 표시, 골순.
import { useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { useSortableRows, SortHeader } from '../tennis/Sortable';

export default function CupPlayerRecordsTable({ records = [] }) {
  const { C } = useTheme();
  const th = { padding: '6px 4px', fontSize: 11, color: C.gray, fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' };
  const td = { padding: '6px 4px', fontSize: 13, color: C.white, textAlign: 'center', whiteSpace: 'nowrap' };
  const ds = { th };

  const cols = useMemo(() => ({
    name:        { accessor: r => r.name, type: 'text' },
    team:        { accessor: r => r.guest ? '용병' : r.team, type: 'text' },
    goals:       { accessor: r => r.goals, type: 'num' },
    assists:     { accessor: r => r.assists, type: 'num' },
    cleanSheets: { accessor: r => r.cleanSheets, type: 'num' },
    ownGoals:    { accessor: r => r.ownGoals, type: 'num' },
    days:        { accessor: r => r.days, type: 'num' },
  }), []);

  const { sorted, sort, onSort } = useSortableRows(records, cols);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table data-role="cup-player-records" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <SortHeader label="선수"    sortKey="name"        sort={sort} onSort={onSort} align="left"   ds={ds} />
            <SortHeader label="팀"      sortKey="team"        sort={sort} onSort={onSort} align="center" ds={ds} />
            <SortHeader label="골"      sortKey="goals"       sort={sort} onSort={onSort} align="center" ds={ds} />
            <SortHeader label="어시"    sortKey="assists"     sort={sort} onSort={onSort} align="center" ds={ds} />
            <SortHeader label="클린시트" sortKey="cleanSheets" sort={sort} onSort={onSort} align="center" ds={ds} />
            <SortHeader label="자책"    sortKey="ownGoals"    sort={sort} onSort={onSort} align="center" ds={ds} />
            <SortHeader label="참석"    sortKey="days"        sort={sort} onSort={onSort} align="center" ds={ds} />
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => (
            <tr key={r.name} data-role="cup-player-row" data-player={r.name} style={{ borderTop: `1px solid ${C.borderColor}` }}>
              <td style={{ ...td, textAlign: 'left' }}>{r.name}</td>
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
