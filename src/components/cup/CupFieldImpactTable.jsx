// src/components/cup/CupFieldImpactTable.jsx
// 컵 필드 지표 통합 표 — 수비력(경기당 득점·실점·무실점률)과 관여(득점·수비) 를 한 표로.
// calcCupOnOff 결과(rated/unrated/minOn)를 props 로 직접 받아 그린다.
// 스펙 §5.1 필드 지표 (2026-10-02 통합). 같은 날 저녁: 관여의 기준값(없을 때 득점·실점, 미출전 수) 열 추가 —
// "+1.83 이 어디서 나왔는지" 를 표에서 바로 뺄셈으로 읽을 수 있게 득점 묶음·실점 묶음으로 열을 재배치했다.
import { useState, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { SortHeader } from '../tennis/Sortable';
import { sortRows, nextSort } from '../../utils/tennis/sortRows';

// 표 위 안내 — 한 항목에 한 가지만
const HELP_LINES = [
  '기준: 내가 필드로 뛴 우리 팀 경기를 기준으로 봅니다(GK로 뛴 경기 제외)',
  'GK(제외): 내가 GK로 선 경기 수. 키퍼 성적은 개인기록 GK 열에서 따로 보며, 출전 + 미출전 + GK(제외) = 소속팀 경기 수',
  '뛸 때·없을 때: 내가 명단에 있던 우리 팀 경기와 없던 우리 팀 경기의 경기당 득점·실점',
  '득점관여 = 뛸 때 득점 − 없을 때 득점 (+1.00이면 내가 뛸 때 팀이 경기당 1골 더 넣음)',
  '수비관여 = 없을 때 실점 − 뛸 때 실점 (+1.50이면 내가 뛸 때 팀이 경기당 1.5골 덜 먹음, 둘 다 +가 좋음)',
  '무실점률: 내가 뛸 때 우리 팀이 무실점으로 마친 경기 비율',
  '같은 경기에 함께 뛴 팀원끼리는 값이 비슷하고, 경기일이 쌓일수록 차이가 드러납니다',
];

const COLS_COUNT = 12;

const COLS = {
  name:       { accessor: p => p.name,                         type: 'text' },
  team:       { accessor: p => p.team,                         type: 'text' },
  onGames:    { accessor: p => p.onGames,                      type: 'num'  },
  offGames:   { accessor: p => p.offGames,                     type: 'num'  },
  gkGames:    { accessor: p => p.gkGames ?? 0,                 type: 'num'  },
  onGfPg:     { accessor: p => p.onGfPg,                       type: 'num'  },
  offGfPg:    { accessor: p => p.offGfPg,                      type: 'num'  },
  goalImpact: { accessor: p => p.goalImpact,                   type: 'num'  },
  onGaPg:     { accessor: p => p.onGaPg,                       type: 'num'  },
  offGaPg:    { accessor: p => p.offGaPg,                      type: 'num'  },
  defImpact:  { accessor: p => p.defImpact,                    type: 'num'  },
  cleanRate:  { accessor: p => p.cleanRate,                    type: 'num'  },
};

// null(—) 행은 정렬 방향과 무관하게 항상 맨 뒤 — 관여와 "없을 때" 기준값(offGames=0 이면 null)
const IMPACT_KEYS = new Set(['goalImpact', 'defImpact', 'offGfPg', 'offGaPg']);
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

// 경기당 값: null(없을 때 경기가 없음) 이면 —
const fmtPg = (v) => (v === null || v === undefined) ? '—' : Number(v).toFixed(2);

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
        <td style={{ ...td, color: C.gray }}>{p.offGames}</td>
        <td style={{ ...td, color: C.gray }}>{p.gkGames ?? 0}</td>
        {/* 득점 묶음: 뛸 때 − 없을 때 = 득점관여 */}
        <td style={td}>{fmtPg(p.onGfPg)}</td>
        <td style={{ ...td, color: C.gray }}>{fmtPg(p.offGfPg)}</td>
        <td style={{ ...td, color: goalPositive ? C.accent : C.white }}>{fmtImpact(p.goalImpact)}</td>
        {/* 실점 묶음: 없을 때 − 뛸 때 = 수비관여 */}
        <td style={td}>{fmtPg(p.onGaPg)}</td>
        <td style={{ ...td, color: C.gray }}>{fmtPg(p.offGaPg)}</td>
        <td style={{ ...td, color: defPositive  ? C.accent : C.white }}>{fmtImpact(p.defImpact)}</td>
        <td style={td}>{Math.round(p.cleanRate * 100)}%</td>
      </tr>
    );
  };

  return (
    <div>
      {/* 안내는 항목별 한 줄 — 문단처럼 붙여 쓰면 읽히지 않는다(2026-10-02 사용자 피드백). 구분자 "-" + 들여쓰기 */}
      <div data-role="cup-field-impact-help" style={{ fontSize: 11, color: C.gray, marginBottom: 8, lineHeight: 1.5 }}>
        {HELP_LINES.map((line, i) => (
          <div key={i} style={{ display: 'flex', gap: 5, alignItems: 'flex-start' }}>
            <span style={{ flexShrink: 0 }}>-</span>
            <span>{line}</span>
          </div>
        ))}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table data-role="cup-field-impact" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <SortHeader label="선수"        sortKey="name"       sort={sort} onSort={onSort} align="left"   ds={ds} />
              <SortHeader label="팀"          sortKey="team"       sort={sort} onSort={onSort} align="center" ds={ds} />
              <SortHeader label="출전"        sortKey="onGames"    sort={sort} onSort={onSort} align="center" ds={ds} />
              <SortHeader label="미출전"      sortKey="offGames"   sort={sort} onSort={onSort} align="center" ds={ds} />
              <SortHeader label="GK(제외)"    sortKey="gkGames"    sort={sort} onSort={onSort} align="center" ds={ds} />
              <SortHeader label="뛸 때 득점"   sortKey="onGfPg"     sort={sort} onSort={onSort} align="center" ds={ds} />
              <SortHeader label="없을 때 득점" sortKey="offGfPg"    sort={sort} onSort={onSort} align="center" ds={ds} />
              <SortHeader label="득점관여"    sortKey="goalImpact" sort={sort} onSort={onSort} align="center" ds={ds} />
              <SortHeader label="뛸 때 실점"   sortKey="onGaPg"     sort={sort} onSort={onSort} align="center" ds={ds} />
              <SortHeader label="없을 때 실점" sortKey="offGaPg"    sort={sort} onSort={onSort} align="center" ds={ds} />
              <SortHeader label="수비관여"    sortKey="defImpact"  sort={sort} onSort={onSort} align="center" ds={ds} />
              <SortHeader label="무실점률"     sortKey="cleanRate"  sort={sort} onSort={onSort} align="center" ds={ds} />
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
        기준: 필드 {minOn}경기 이상 출전(미달은 흐리게) · 내가 없던 우리 팀 경기가 없으면 없을 때·관여는 —
      </div>
    </div>
  );
}
