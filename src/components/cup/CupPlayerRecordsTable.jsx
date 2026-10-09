// src/components/cup/CupPlayerRecordsTable.jsx
// 대회 개인기록 표(3단계 스펙 §5). mergePlayerKeeperRecords() 결과를 그린다.
// 열: 선수·팀·골·어시·자책(점)·참석·GK·실점·실점률·클린시트 (10열, 전부 정렬 가능)
// ownGoalPoint: 자책 1골당 점수 (기본 -1, 표준 규칙). 자책(점) 셀 = ownGoals * ownGoalPoint 정수 문자열.
// CupDetail 은 getCupSettings 로 팀 규칙값(-2 등)을 넘기므로 화면은 팀 규칙을 따른다.
// gkRate 정렬: 비-GK(null)는 방향과 무관하게 항상 맨 뒤.
// 2026-10-09: 표 위 "정렬 기준 ⓘ" 탭 토글 — 문구는 cupPlayerRecordRules()(정렬 상수에서 조립)만 쓴다.
// 기본 순서(골→어시→클린시트→참석→이름)는 records 가 이미 그 순서로 오고, 머리글 정렬은 안정 정렬이라 동값 안에서 유지된다.
import { useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { useSortableRows, SortHeader } from '../tennis/Sortable';
import { cupPlayerRecordRules } from '../../utils/cup/cupRecords';
import CupRulesToggle from './CupRulesToggle';

export default function CupPlayerRecordsTable({ records = [], ownGoalPoint = -1 }) {
  const { C } = useTheme();
  const th = { padding: '6px 3px', fontSize: 11, color: C.gray, fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' };
  const td = { padding: '6px 4px', fontSize: 13, color: C.white, textAlign: 'center', whiteSpace: 'nowrap' };
  const ds = { th };

  const cols = useMemo(() => ({
    name:        { accessor: r => r.name, type: 'text' },
    team:        { accessor: r => r.guest ? '용병' : (r.team || ''), type: 'text' },
    goals:       { accessor: r => r.goals, type: 'num' },
    assists:     { accessor: r => r.assists, type: 'num' },
    ownGoals:    { accessor: r => r.ownGoals * ownGoalPoint, type: 'num' },
    days:        { accessor: r => r.days, type: 'num' },
    gkGames:     { accessor: r => r.gkGames ?? 0, type: 'num' },
    gkConceded:  { accessor: r => r.gkConceded ?? 0, type: 'num' },
    // Infinity sentinel: 오름차순에서 비-GK를 뒤로 보냄. 내림차순 보정은 아래 post-process.
    gkRate:      { accessor: r => r.gkRate ?? Infinity, type: 'num' },
    cleanSheets: { accessor: r => r.cleanSheets, type: 'num' },
  }), [ownGoalPoint]);

  const { sorted: rawSorted, sort, onSort } = useSortableRows(records, cols);

  // 비-GK(gkRate == null) 행은 정렬 방향과 무관하게 항상 맨 뒤
  const sorted = useMemo(() => {
    if (sort?.key !== 'gkRate') return rawSorted;
    const nulls = rawSorted.filter(r => r.gkRate == null);
    const nonNulls = rawSorted.filter(r => r.gkRate != null);
    return [...nonNulls, ...nulls];
  }, [rawSorted, sort]);

  return (
    <div>
    <CupRulesToggle id="cup-player-rules" label="정렬 기준" lines={cupPlayerRecordRules()} />
    <div style={{ overflowX: 'auto' }}>
      <table data-role="cup-player-records" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <SortHeader label="선수"    sortKey="name"        sort={sort} onSort={onSort} align="left"   ds={ds} />
            <SortHeader label="팀"      sortKey="team"        sort={sort} onSort={onSort} align="center" ds={ds} />
            <SortHeader label="골"      sortKey="goals"       sort={sort} onSort={onSort} align="center" ds={ds} />
            <SortHeader label="어시"    sortKey="assists"     sort={sort} onSort={onSort} align="center" ds={ds} />
            <SortHeader label="자책(점)" sortKey="ownGoals"    sort={sort} onSort={onSort} align="center" ds={ds} />
            <SortHeader label="참석"    sortKey="days"        sort={sort} onSort={onSort} align="center" ds={ds} />
            <SortHeader label="GK"      sortKey="gkGames"     sort={sort} onSort={onSort} align="center" ds={ds} />
            <SortHeader label="실점"    sortKey="gkConceded"  sort={sort} onSort={onSort} align="center" ds={ds} />
            <SortHeader label="실점률"  sortKey="gkRate"      sort={sort} onSort={onSort} align="center" ds={ds} />
            <SortHeader label="클린시트" sortKey="cleanSheets" sort={sort} onSort={onSort} align="center" ds={ds} />
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => (
            <tr key={r.name} data-role="cup-player-row" data-player={r.name} style={{ borderTop: `1px solid ${C.borderColor}` }}>
              <td style={{ ...td, textAlign: 'left' }}>{r.name}</td>
              <td style={{ ...td, color: C.gray, fontSize: 12 }}>{r.guest ? '용병' : r.team}</td>
              <td style={{ ...td, fontWeight: r.goals > 0 ? 700 : 400 }}>{r.goals}</td>
              <td style={td}>{r.assists}</td>
              <td style={td}>{String(r.ownGoals * ownGoalPoint)}</td>
              <td style={td}>{r.days}</td>
              <td style={td}>{r.gkGames ?? 0}</td>
              <td style={td}>{r.gkConceded ?? 0}</td>
              <td style={td}>{r.gkRate == null ? '—' : r.gkRate.toFixed(2)}</td>
              <td style={td}>{r.cleanSheets}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div style={{ fontSize: 11, color: C.gray, marginTop: 4 }}>
      자책(점) = 자책골 수 × 팀 규칙 자책점 ({ownGoalPoint}점/개) · GK·실점·실점률·클린시트는 GK로 뛴 경기 기준
    </div>
    </div>
  );
}
