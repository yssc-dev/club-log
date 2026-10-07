import { useMemo } from 'react';
import { calcRoleCounts } from '../../../utils/soccerAnalytics';
import { useSortableRows, SortHeader } from '../../tennis/Sortable';

// 「역할 기록」 — 사람별 영상촬영 · 주심 · 부심 횟수. 축구 전용 탭.
// 정렬은 테니스 Sortable(컵 탭에서도 재사용한 경로)을 그대로 쓴다.
// 역할 기능 이전 경기는 로그_매치 roles_json 이 빈칸이라 집계에 안 잡힌다 — 그래서
// 기록이 0건일 때는 표 대신 안내 문구를 띄운다(빈 표가 "집계 버그"로 보이는 것 방지).
const COLUMNS = {
  name: { accessor: r => r.name, type: 'text' },
  camera: { accessor: r => r.camera, type: 'num' },
  referee: { accessor: r => r.referee, type: 'num' },
  assistant: { accessor: r => r.assistant, type: 'num' },
  total: { accessor: r => r.total, type: 'num' },
};

export default function RoleRecordTab({ matchLogs, C }) {
  const { rows, hasAny } = useMemo(() => calcRoleCounts(matchLogs || []), [matchLogs]);
  const { sorted, sort, onSort } = useSortableRows(rows, COLUMNS, { key: 'total', dir: 'desc' });

  const ds = {
    th: {
      padding: '8px 6px', fontSize: 11, fontWeight: 700, color: C.gray,
      borderBottom: `1px solid ${C.grayDarker}`, background: 'transparent',
    },
  };
  const td = (align = 'center') => ({
    padding: '8px 6px', fontSize: 12, color: C.white, textAlign: align,
    borderBottom: `1px solid ${C.grayDarker}`,
  });

  if (!hasAny) {
    return (
      <div style={{ textAlign: 'center', color: C.gray, padding: 30, fontSize: 12, lineHeight: 1.8 }}>
        역할 기록이 아직 없습니다.<br />
        2026-10-07 이후 경기에서 역할을 지정하면 여기에 집계됩니다.
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 8, lineHeight: 1.7 }}>
        경기별로 지정한 영상촬영 · 주심 · 부심 횟수입니다. 열 제목을 누르면 정렬됩니다.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <SortHeader label="이름" sortKey="name" sort={sort} onSort={onSort} align="left" ds={ds} />
              <SortHeader label="영상촬영" sortKey="camera" sort={sort} onSort={onSort} ds={ds} />
              <SortHeader label="주심" sortKey="referee" sort={sort} onSort={onSort} ds={ds} />
              <SortHeader label="부심" sortKey="assistant" sort={sort} onSort={onSort} ds={ds} />
              <SortHeader label="합계" sortKey="total" sort={sort} onSort={onSort} ds={ds} />
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.name}>
                <td style={td('left')}>{r.name}</td>
                <td style={td()}>{r.camera || '-'}</td>
                <td style={td()}>{r.referee || '-'}</td>
                <td style={td()}>{r.assistant || '-'}</td>
                <td style={{ ...td(), fontWeight: 800 }}>{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
