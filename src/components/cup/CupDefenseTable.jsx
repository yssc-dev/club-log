// src/components/cup/CupDefenseTable.jsx
// 컵 필드 수비 테이블 — 계산된 minGames/rated/unrated 를 받아 그린다.
import { useState, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { SortHeader } from '../tennis/Sortable';
import { sortRows, nextSort } from '../../utils/tennis/sortRows';

const COLS_COUNT = 5;

const COLS = {
  name:            { accessor: p => p.name, type: 'text' },
  games:           { accessor: p => p.games, type: 'num' },
  conceded:        { accessor: p => p.conceded, type: 'num' },
  concededPerGame: { accessor: p => Number(p.concededPerGame), type: 'num' },
  cleanRate:       { accessor: p => Number(p.cleanRate), type: 'num' },
};

export default function CupDefenseTable({ minGames = 1, rated = [], unrated = [] }) {
  const { C } = useTheme();
  const th = { padding: '6px 4px', fontSize: 11, color: C.gray, fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' };
  const td = { padding: '6px 4px', fontSize: 13, color: C.white, textAlign: 'center', whiteSpace: 'nowrap' };
  const ds = { th };

  const [sort, setSort] = useState(null);

  const onSort = (key) => {
    const col = COLS[key];
    const defaultDir = col?.type === 'text' ? 'asc' : 'desc';
    setSort((s) => nextSort(s, key, defaultDir));
  };

  const sortedRated = useMemo(() => {
    if (!sort || !COLS[sort.key]) return rated;
    return sortRows(rated, COLS[sort.key].accessor, sort.dir);
  }, [rated, sort]);

  const sortedUnrated = useMemo(() => {
    if (!sort || !COLS[sort.key]) return unrated;
    return sortRows(unrated, COLS[sort.key].accessor, sort.dir);
  }, [unrated, sort]);

  const all = [...rated, ...unrated];

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

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table data-role="cup-defense" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <SortHeader label="선수"       sortKey="name"            sort={sort} onSort={onSort} align="left"   ds={ds} />
              <SortHeader label="경기"       sortKey="games"           sort={sort} onSort={onSort} align="center" ds={ds} />
              <SortHeader label="실점"       sortKey="conceded"        sort={sort} onSort={onSort} align="center" ds={ds} />
              <SortHeader label="경기당 실점" sortKey="concededPerGame" sort={sort} onSort={onSort} align="center" ds={ds} />
              <SortHeader label="무실점률"    sortKey="cleanRate"       sort={sort} onSort={onSort} align="center" ds={ds} />
            </tr>
          </thead>
          <tbody>
            {all.length === 0 ? (
              <tr>
                <td colSpan={COLS_COUNT} style={{ ...td, color: C.gray, textAlign: 'center', padding: '12px 4px' }}>
                  기록 없음
                </td>
              </tr>
            ) : (
              <>
                {sortedRated.map((p) => renderRow(p, true))}
                {sortedUnrated.map((p) => renderRow(p, false))}
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
