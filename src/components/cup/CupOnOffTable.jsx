// src/components/cup/CupOnOffTable.jsx
// 컵 득점·수비 관여(On/Off) 테이블 — calcCupOnOff 결과를 props 로 직접 받아 그린다.
// 스펙 §5.3 (2026-10-02 추가).
import { useState, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { SortHeader } from '../tennis/Sortable';
import { sortRows, nextSort } from '../../utils/tennis/sortRows';

const COLS_COUNT = 6;

const COLS = {
  name:        { accessor: p => p.name,       type: 'text' },
  team:        { accessor: p => p.team,        type: 'text' },
  onGames:     { accessor: p => p.onGames,     type: 'num'  },
  offGames:    { accessor: p => p.offGames,    type: 'num'  },
  goalImpact:  { accessor: p => p.goalImpact ?? -Infinity,  type: 'num'  },
  defImpact:   { accessor: p => p.defImpact  ?? -Infinity,  type: 'num'  },
};

const fmtImpact = (v) => {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (n > 0) return `+${n.toFixed(2)}`;
  return n.toFixed(2); // includes "0.00" and negatives
};

export default function CupOnOffTable({ minOn = 1, minOff = 2, rated = [], unrated = [] }) {
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

  const renderRow = (p, isRated) => {
    const goalPositive = p.goalImpact !== null && p.goalImpact > 0;
    const defPositive  = p.defImpact  !== null && p.defImpact  > 0;
    return (
      <tr
        key={p.name}
        data-role="cup-onoff-row"
        data-player={p.name}
        data-rated={isRated ? 'true' : 'false'}
        style={{
          borderTop: `1px solid ${C.borderColor}`,
          ...(isRated ? {} : { opacity: 0.5 }),
        }}
      >
        <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{p.name}</td>
        <td style={td}>{p.team}</td>
        <td style={td}>{p.onGames}</td>
        <td style={td}>{p.offGames}</td>
        <td style={{ ...td, color: goalPositive ? C.accent : C.white }}>{fmtImpact(p.goalImpact)}</td>
        <td style={{ ...td, color: defPositive  ? C.accent : C.white }}>{fmtImpact(p.defImpact)}</td>
      </tr>
    );
  };

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table data-role="cup-onoff" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <SortHeader label="선수"     sortKey="name"       sort={sort} onSort={onSort} align="left"   ds={ds} />
              <SortHeader label="팀"       sortKey="team"       sort={sort} onSort={onSort} align="center" ds={ds} />
              <SortHeader label="출전"     sortKey="onGames"    sort={sort} onSort={onSort} align="center" ds={ds} />
              <SortHeader label="미출전"   sortKey="offGames"   sort={sort} onSort={onSort} align="center" ds={ds} />
              <SortHeader label="득점관여" sortKey="goalImpact" sort={sort} onSort={onSort} align="center" ds={ds} />
              <SortHeader label="수비관여" sortKey="defImpact"  sort={sort} onSort={onSort} align="center" ds={ds} />
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
        득점관여 = 출전 시 팀 경기당 득점 − 미출전 시 · 수비관여 = 미출전 시 팀 경기당 실점 − 출전 시 · 둘 다 +가 좋음
      </div>
      <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>
        출전 = 필드로 명단에 있던 우리 팀 경기 · 미출전 = 명단에 없던 우리 팀 경기 · GK로 뛴 경기 제외 · 기준: 출전 {minOn}경기·미출전 {minOff}경기 이상
      </div>
    </div>
  );
}
