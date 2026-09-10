import { useTheme } from '../../hooks/useTheme';
import SoccerStandingsTable from '../game/SoccerStandingsTable';
import IntraSoccerMatchResults from './IntraSoccerMatchResults';
import {
  calcSoccerPlayerStats, calcSoccerPlayerPoint, calcSoccerTeamRecord, calcSoccerOpponentRecords,
} from '../../utils/soccerScoring';
import { isIntra, sideView } from '../../utils/intraSoccer/sideView';

// 아카이브 상세의 축구(matchMode==="soccer") 게임 렌더 — 자체전(빅마스터FC) 지원판.
// 팀 순위(상대별 전적) · 경기 결과(스코어) · 선수별 기록. 데이터는 gs.soccerMatches에서 파생.
// 팀 순위(상대별 전적)는 외부전만 집계(자체전은 상대팀이 없어 의미 없음), 전적이 될 외부전(휴식 제외)이 없으면 섹션 자체를 숨긴다.
// 선수별 기록은 자체전 경기를 A/B 양편 시점(sideView)으로 펼쳐 넣어 양팀 선수 모두 집계한다.
// HistoryView의 hs 스타일(th/td(highlight)/card)을 그대로 받아 futsal 상세와 톤을 맞춘다.
export default function IntraSoccerArchiveDetail({ soccerMatches, es, styles: hs }) {
  const { C } = useTheme();
  const matches = soccerMatches || [];
  const finished = matches.filter(m => m.status === "finished");
  const externalOnly = matches.filter(m => !isIntra(m));          // 팀 전적·상대별 전적은 외부전만(자체전은 무의미)
  // 휴식 노드는 외부전 모양이지만 전적이 없다 — 자체전 + 휴식만인 날 0전적 표를 막는다.
  const hasExternalRecord = externalOnly.some(m => m.status === "finished" && m.opponent !== "휴식");
  const rec = calcSoccerTeamRecord(externalOnly);
  const oppRecords = calcSoccerOpponentRecords(externalOnly);
  const perSide = finished.flatMap(m => (isIntra(m) ? [sideView(m, 'A'), sideView(m, 'B')] : [m]));
  const playerRows = Object.entries(calcSoccerPlayerStats(perSide)).map(([name, st]) => ({
    name, ...st, point: calcSoccerPlayerPoint(st, es),
  })).sort((a, b) =>
    b.point - a.point || b.goals - a.goals || b.assists - a.assists ||
    b.cleanSheets - a.cleanSheets || a.owngoals - b.owngoals || a.conceded - b.conceded || a.games - b.games
  );

  if (finished.length === 0) {
    return <div style={{ textAlign: "center", color: C.gray, padding: 20 }}>상세 기록이 없습니다</div>;
  }

  return (
    <>
      {/* 팀 순위 (상대별 전적) — 외부전이 있을 때만 */}
      {hasExternalRecord && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.white, marginBottom: 8 }}>🏆 팀 순위 (상대별 전적)</div>
          <div style={hs.card}>
            <SoccerStandingsTable records={oppRecords} total={rec} styles={hs} />
          </div>
        </div>
      )}

      {/* 경기 결과 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.white, marginBottom: 8 }}>📊 경기 결과</div>
        <div style={hs.card}>
          <IntraSoccerMatchResults matches={matches} styles={hs} />
        </div>
      </div>

      {/* 선수별 기록 */}
      {playerRows.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.white, marginBottom: 8 }}>👤 선수별 기록</div>
          <div style={hs.card}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["선수", "경기", "골", "어시", "자책", "CS", "실점", "포인트"].map(h => <th key={h} style={hs.th}>{h}</th>)}</tr></thead>
              <tbody>
                {playerRows.map(p => (
                  <tr key={p.name}>
                    <td style={{ ...hs.td(true), textAlign: "left", paddingLeft: 4 }}>{p.name}</td>
                    <td style={hs.td()}>{p.games}</td>
                    <td style={hs.td(p.goals > 0)}>{p.goals}</td>
                    <td style={hs.td(p.assists > 0)}>{p.assists}</td>
                    <td style={{ ...hs.td(p.owngoals > 0), color: p.owngoals > 0 ? C.red : C.white }}>{p.owngoals}</td>
                    <td style={hs.td(p.cleanSheets > 0)}>{p.cleanSheets}</td>
                    <td style={hs.td()}>{p.conceded}</td>
                    <td style={{ ...hs.td(true), fontSize: 14, fontWeight: 800, color: C.green }}>{p.point}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
