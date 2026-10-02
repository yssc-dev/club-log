// src/components/cup/CupHeadToHead.jsx
// 컵 상대전적 테이블 — 계산된 teams/cells 를 받아 그린다.
import { useTheme } from '../../hooks/useTheme';

export default function CupHeadToHead({ teams = [], cells = {} }) {
  const { C } = useTheme();
  const th = { padding: '6px 4px', fontSize: 11, color: C.gray, fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' };
  const td = { padding: '6px 4px', fontSize: 12, color: C.white, textAlign: 'center', whiteSpace: 'nowrap', verticalAlign: 'top' };
  const tdName = { ...td, textAlign: 'left', fontWeight: 600, fontSize: 13 };

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table data-role="cup-h2h" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}></th>
              {teams.map((t) => (
                <th key={t} style={th}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((row) => (
              <tr key={row} style={{ borderTop: `1px solid ${C.borderColor}` }}>
                <td style={tdName}>{row}</td>
                {teams.map((col) => {
                  if (row === col) {
                    return (
                      <td
                        key={col}
                        data-role="cup-h2h-cell"
                        data-row={row}
                        data-col={col}
                        style={{ ...td, color: C.gray }}
                      >
                        ·
                      </td>
                    );
                  }
                  const pair = cells[row]?.[col];
                  if (!pair) {
                    return (
                      <td
                        key={col}
                        data-role="cup-h2h-cell"
                        data-row={row}
                        data-col={col}
                        style={{ ...td, color: C.gray }}
                      >
                        -
                      </td>
                    );
                  }
                  return (
                    <td
                      key={col}
                      data-role="cup-h2h-cell"
                      data-row={row}
                      data-col={col}
                      style={td}
                    >
                      <div>{`${pair.wins}승${pair.draws}무${pair.losses}패`}</div>
                      <div style={{ fontSize: 10, color: C.gray }}>{`${pair.gf}:${pair.ga}`}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: C.gray, marginTop: 4 }}>
        행 팀 기준 승무패 · 득:실
      </div>
    </div>
  );
}
