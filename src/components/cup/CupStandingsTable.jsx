// src/components/cup/CupStandingsTable.jsx
// 대회 누적 순위표(3단계 스펙 §5). calcCupStandings().standings 를 그대로 받아 그린다 — 계산하지 않는다.
// 2026-10-08: 표 위 "점수 규칙 ⓘ" 탭 토글 — 문구는 cupStandingRules()(계산 상수에서 조립)만 쓴다. 폰에선 hover 가
// 없으니 탭으로 여닫고, 데스크톱은 title 로도 보인다. 기본 닫힘(경기일별 접힘과 같은 관례).
import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { cupStandingRules } from '../../utils/cup/cupRecords';

// 가점은 종류별 열로 따로 보여준다(합쳐서 '가점 n' 금지, 2026-09-29). 남은 가점은 참석뿐(무실점 09-28·다득점 10-01 폐지).
const COLS = ['순위', '팀', '경기', '승', '무', '패', '득실', '승점', '참석', '합계'];

export default function CupStandingsTable({ standings = [], finished = false }) {
  const { C } = useTheme();
  const [rulesOpen, setRulesOpen] = useState(false);
  const rules = cupStandingRules();
  const th = { padding: "6px 4px", fontSize: 11, color: C.gray, fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" };
  const td = (bold = false) => ({ padding: "6px 4px", fontSize: 13, color: C.white, textAlign: "center", fontWeight: bold ? 700 : 400, whiteSpace: "nowrap", verticalAlign: "top" });
  const gdText = (gd) => (gd > 0 ? `+${gd}` : String(gd));
  // 팀장 표기 "국뽕(강국)" — 성을 뺀 두 글자(3자 이상이면 뒤 2자, 그 외 그대로). 정규 세션의 makeTeamName 과 같은 관례.
  const givenName = (n) => (n.length >= 3 ? n.slice(-2) : n);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: rulesOpen ? 6 : 2 }}>
        <button type="button" data-role="cup-rules-toggle" aria-expanded={rulesOpen} title={rules.join('\n')}
          onClick={() => setRulesOpen(o => !o)}
          style={{ background: "transparent", border: "none", padding: "2px 4px", fontSize: 11, color: C.gray, cursor: "pointer", fontFamily: "inherit" }}>
          점수 규칙 ⓘ
        </button>
      </div>
      {rulesOpen && (
        <ul data-role="cup-rules-panel"
          style={{ margin: "0 0 8px", padding: "8px 10px 8px 24px", fontSize: 12, lineHeight: 1.5, color: C.gray, background: C.cardLight, borderRadius: 8, border: `1px solid ${C.borderColor}` }}>
          {rules.map(line => <li key={line}>{line}</li>)}
        </ul>
      )}
      <div style={{ overflowX: "auto" }}>
        <table data-role="cup-standings" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{COLS.map(c => <th key={c} style={th}>{c}</th>)}</tr></thead>
          <tbody>
            {standings.map((s, i) => {
              const first = i === 0;
              return (
                <tr key={s.name} data-role="cup-standing-row" data-team={s.name}
                  style={{ background: first ? "rgba(255,149,0,0.10)" : "transparent", borderTop: `1px solid ${C.borderColor}` }}>
                  <td style={td(first)}>{i + 1}</td>
                  <td style={{ ...td(first), textAlign: "left" }}>
                    {s.name}
                    {s.captain && <span style={{ fontSize: 11, color: C.gray }}>({givenName(s.captain)})</span>}
                    {!s.registered && <span style={{ fontSize: 11, color: C.gray }}> (미등록)</span>}
                    {first && finished && <span style={{ marginLeft: 4, fontSize: 12 }}>🏆 우승</span>}
                  </td>
                  <td style={td()}>{s.games}</td>
                  <td style={td()}>{s.wins}</td>
                  <td style={td()}>{s.draws}</td>
                  <td style={td()}>{s.losses}</td>
                  <td style={td()}>{gdText(s.gd)}</td>
                  <td style={td()}>{s.points}</td>
                  <td style={td()}>{s.bonusAttend}</td>
                  <td style={td(true)}>{s.total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
