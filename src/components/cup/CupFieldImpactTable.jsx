// src/components/cup/CupFieldImpactTable.jsx
// 컵 필드 지표 통합 표 — 수비력(경기당 득점·실점·무실점률)과 관여(득점·수비) 를 한 표로.
// calcCupOnOff 결과(rated/unrated/minOn)를 props 로 직접 받아 그린다.
// 스펙 §5.1 필드 지표 (2026-10-02 통합).
import { useState, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { SortHeader } from '../tennis/Sortable';
import { sortRows, nextSort } from '../../utils/tennis/sortRows';

const COLS_COUNT = 8;

const COLS = {
  name:       { accessor: p => p.name,                         type: 'text' },
  team:       { accessor: p => p.team,                         type: 'text' },
  onGames:    { accessor: p => p.onGames,                      type: 'num'  },
  onGfPg:     { accessor: p => p.onGfPg,                       type: 'num'  },
  onGaPg:     { accessor: p => p.onGaPg,                       type: 'num'  },
  cleanRate:  { accessor: p => p.cleanRate,                    type: 'num'  },
  goalImpact: { accessor: p => p.goalImpact,                   type: 'num'  },
  defImpact:  { accessor: p => p.defImpact,                    type: 'num'  },
};

// null(—) 행은 정렬 방향과 무관하게 항상 맨 뒤
const IMPACT_KEYS = new Set(['goalImpact', 'defImpact']);
function pushNullsLast(rows, key) {
  const nulls    = rows.filter(r => r[key] == null);
  const nonNulls = rows.filter(r => r[key] != null);
  return [...nonNulls, ...nulls];
}

const fmtImpact = (v) => {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (n > 0) return `+${n.toFixed(2)}`;
  return n.toFixed(2);
};

export default function CupFieldImpactTable({ minOn = 3, rated = [], unrated = [] }) {
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
    const raw = sortRows(rated, COLS[sort.key].accessor, sort.dir);
    return IMPACT_KEYS.has(sort.key) ? pushNullsLast(raw, sort.key) : raw;
  }, [rated, sort]);

  const sortedUnrated = useMemo(() => {
    if (!sort || !COLS[sort.key]) return unrated;
    const raw = sortRows(unrated, COLS[sort.key].accessor, sort.dir);
    return IMPACT_KEYS.has(sort.key) ? pushNullsLast(raw, sort.key) : raw;
  }, [unrated, sort]);

  const all = [...rated, ...unrated];

  const renderRow = (p, isRated) => {
    const goalPositive = p.goalImpact !== null && p.goalImpact > 0;
    const defPositive  = p.defImpact  !== null && p.defImpact  > 0;
    return (
      <tr
        key={p.name}
        data-role="cup-field-impact-row"
        data-player={p.name}
        data-rated={isRated ? 'true' : 'false'}
        style={{
          borderTop: `1px solid ${C.borderColor}`,
          ...(isRated ? {} : { opacity: 0.5 }),
        }}
      >
        <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{p.name}</td>
        <td style={{ ...td, color: C.gray, fontSize: 12 }}>{p.team}</td>
        <td style={td}>{p.onGames}</td>
        <td style={td}>{Number(p.onGfPg).toFixed(2)}</td>
        <td style={td}>{Number(p.onGaPg).toFixed(2)}</td>
        <td style={td}>{Math.round(p.cleanRate * 100)}%</td>
        <td style={{ ...td, color: goalPositive ? C.accent : C.white }}>{fmtImpact(p.goalImpact)}</td>
        <td style={{ ...td, color: defPositive  ? C.accent : C.white }}>{fmtImpact(p.defImpact)}</td>
      </tr>
    );
  };

  return (
    <div>
      <div data-role="cup-field-impact-help" style={{ fontSize: 11, color: C.gray, marginBottom: 6, lineHeight: 1.5 }}>
        <div>내가 필드로 뛴 우리 팀 경기를 기준으로 봅니다(GK로 뛴 경기 제외).</div>
        <div>경기당 득점·실점·무실점률 = 내가 뛸 때 우리 팀의 경기당 득점·실점과 무실점 경기 비율</div>
        <div>득점관여 +1.00 = 내가 뛸 때 팀이 경기당 1골 더 넣음 · 수비관여 +1.50 = 내가 뛸 때 팀이 경기당 1.5골 덜 먹음 (내가 없던 우리 팀 경기와 비교, 둘 다 +가 좋음)</div>
        <div>같은 경기에 함께 뛴 팀원끼리는 값이 비슷하고, 경기일이 쌓일수록 차이가 드러납니다.</div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table data-role="cup-field-impact" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <SortHeader label="선수"       sortKey="name"       sort={sort} onSort={onSort} align="left"   ds={ds} />
              <SortHeader label="팀"         sortKey="team"       sort={sort} onSort={onSort} align="center" ds={ds} />
              <SortHeader label="출전"       sortKey="onGames"    sort={sort} onSort={onSort} align="center" ds={ds} />
              <SortHeader label="경기당 득점" sortKey="onGfPg"     sort={sort} onSort={onSort} align="center" ds={ds} />
              <SortHeader label="경기당 실점" sortKey="onGaPg"     sort={sort} onSort={onSort} align="center" ds={ds} />
              <SortHeader label="무실점률"    sortKey="cleanRate"  sort={sort} onSort={onSort} align="center" ds={ds} />
              <SortHeader label="득점관여"   sortKey="goalImpact" sort={sort} onSort={onSort} align="center" ds={ds} />
              <SortHeader label="수비관여"   sortKey="defImpact"  sort={sort} onSort={onSort} align="center" ds={ds} />
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
        기준: 필드 {minOn}경기 이상 출전(미달은 흐리게) · 내가 없던 우리 팀 경기가 없으면 관여는 —
      </div>
    </div>
  );
}
