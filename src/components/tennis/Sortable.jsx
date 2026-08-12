import { useMemo, useState } from 'react';
import { defaultDirFor, nextSort, sortRows } from '../../utils/tennis/sortRows';

// columns: { [key]: { accessor: (row)=>value, type?: 'num'|'text' } }
export function useSortableRows(rows, columns, initial = null) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => {
    if (!sort || !columns[sort.key]) return rows || [];
    return sortRows(rows, columns[sort.key].accessor, sort.dir);
  }, [rows, sort, columns]);
  const onSort = (key) => {
    const col = columns[key];
    const dir = col?.type === 'text' ? 'asc'
      : col?.type === 'num' ? 'desc'
      : defaultDirFor(col ? col.accessor((rows || [])[0] || {}) : 0);
    setSort((s) => nextSort(s, key, dir));
  };
  return { sorted, sort, onSort };
}

export function SortHeader({ label, sortKey, sort, onSort, align = 'center', ds }) {
  const active = sort && sort.key === sortKey;
  const arrow = active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{ ...ds.th, textAlign: align, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      {label}{arrow}
    </th>
  );
}
