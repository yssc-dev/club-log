import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../../../hooks/useTheme';
import SheetCache from '../../../services/sheetCache';
import { getEffectiveSettings, saveSettings, loadSettingsFromFirebase } from '../../../config/settings';

const RED = "#ef4444";
const GREEN = "#22c55e";

export default function DualTeamTab({ teamName, isAdmin, activeSport }) {
  const { C } = useTheme();
  const [loading, setLoading] = useState(true);
  const [playerLog, setPlayerLog] = useState(null);
  const [dualSettings, setDualSettings] = useState(null);
  const [editingTeamIdx, setEditingTeamIdx] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [detailPlayer, setDetailPlayer] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      SheetCache.get('playerLog', { sport: activeSport }).catch(() => []),
      loadSettingsFromFirebase(teamName).then(() => getEffectiveSettings(teamName, "풋살")),
    ]).then(([plog, es]) => {
      setPlayerLog(plog || []);
      setDualSettings(es);
    }).finally(() => setLoading(false));
  }, [teamName, activeSport]);

  const computed = useMemo(() => {
    if (!playerLog || !dualSettings) return null;
    const teams = dualSettings.dualTeams || [];
    const startDate = dualSettings.dualTeamStartDate || "2026-04-01";
    const endDate = dualSettings.dualTeamEndDate || "2026-07-01";
    if (teams.length === 0) return { teams: [], teamScores: [], playerDateDetails: {}, startDate, endDate };

    const playerScores = {};
    const playerDateDetails = {};
    playerLog.forEach(p => {
      if (p.date < startDate || p.date >= endDate) return;
      if (!playerScores[p.name]) playerScores[p.name] = { rankScore: 0, crova: 0, goguma: 0, personalPt: 0 };
      playerScores[p.name].rankScore += p.rankScore || 0;
      playerScores[p.name].crova += p.crova || 0;
      playerScores[p.name].goguma += p.goguma || 0;
      const pPt = (p.goals || 0) + (p.assists || 0) + (p.ownGoals || 0) + (p.cleanSheets || 0);
      playerScores[p.name].personalPt += pPt;
      if (!playerDateDetails[p.name]) playerDateDetails[p.name] = [];
      playerDateDetails[p.name].push({
        date: p.date, rankScore: p.rankScore || 0, personalPt: pPt,
        goals: p.goals || 0, assists: p.assists || 0, ownGoals: p.ownGoals || 0, cleanSheets: p.cleanSheets || 0,
        crova: p.crova || 0, goguma: p.goguma || 0,
      });
    });

    const teamScores = teams.map((t, origIdx) => {
      let total = 0, totalPersonalPt = 0;
      const detail = [];
      t.members.forEach(m => {
        const ps = playerScores[m] || { rankScore: 0, crova: 0, goguma: 0, personalPt: 0 };
        const individual = ps.rankScore + ps.crova + ps.goguma;
        total += individual;
        totalPersonalPt += ps.personalPt;
        detail.push({ name: m, rankScore: ps.rankScore, personalPt: ps.personalPt, crova: ps.crova, goguma: ps.goguma, total: individual });
      });
      return { name: t.name, members: t.members, total, totalPersonalPt, detail, origIdx };
    }).sort((a, b) => (b.total - a.total) || (b.totalPersonalPt - a.totalPersonalPt));

    return { teams, teamScores, playerDateDetails, startDate, endDate };
  }, [playerLog, dualSettings]);

  if (loading) return <div style={{ textAlign: "center", padding: 20, color: C.gray }}>불러오는 중...</div>;
  if (!computed) return <div style={{ textAlign: "center", padding: 20, color: C.gray }}>데이터 없음</div>;
  if (computed.teams.length === 0) return <div style={{ textAlign: "center", padding: 20, color: C.gray }}>설정에서 팀전 팀을 구성해주세요</div>;

  const handleTeamNameSave = async (origIdx, newName) => {
    const es = getEffectiveSettings(teamName, "풋살");
    const { _meta, ...rest } = es;
    const updated = [...(rest.dualTeams || [])];
    updated[origIdx] = { ...updated[origIdx], name: newName };
    await saveSettings(teamName, "풋살", { ...rest, dualTeams: updated }, _meta.preset);
    setDualSettings({ ...rest, dualTeams: updated });
    setEditingTeamIdx(null);
  };

  const tc = { padding: "5px 4px", borderBottom: `1px solid ${C.grayDarker}`, fontSize: 10, textAlign: "center" };
  const th = { ...tc, fontWeight: 700, color: C.gray, fontSize: 9 };

  return (
    <div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 8 }}>
        기간: {computed.startDate} ~ {computed.endDate} (설정에서 변경 가능)
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>#</th>
            <th style={th}>팀</th>
            <th style={th}>선수</th>
            <th style={th}>승점</th>
            <th style={th}>개인Pt</th>
            <th style={th}>🍀</th>
            <th style={th}>🍠</th>
            <th style={th}>개인합</th>
            <th style={th}>팀합</th>
          </tr>
        </thead>
        <tbody>
          {computed.teamScores.map((t, i) => (
            t.detail.map((d, di) => (
              <tr key={`${i}-${di}`} style={{ background: i % 2 === 0 ? "transparent" : `${C.grayDarker}22` }}>
                {di === 0 && (
                  <td rowSpan={t.detail.length} style={{ ...tc, verticalAlign: "middle", padding: "4px 2px" }}>
                    {i < 3 ? (
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 22, height: 22, borderRadius: "50%", fontSize: 11, fontWeight: 800,
                        background: i === 0 ? "linear-gradient(135deg, #fbbf24, #f59e0b)" : i === 1 ? "linear-gradient(135deg, #d1d5db, #9ca3af)" : "linear-gradient(135deg, #d97706, #92400e)",
                        color: i === 0 ? "#78350f" : i === 1 ? "#374151" : "#fef3c7",
                      }}>{i + 1}</span>
                    ) : (
                      <span style={{ fontSize: 11, color: C.gray, fontWeight: 600 }}>{i + 1}</span>
                    )}
                  </td>
                )}
                {di === 0 && (
                  <td rowSpan={t.detail.length} style={{ ...tc, fontWeight: 800, color: C.white, fontSize: 11, verticalAlign: "middle" }}>
                    {isAdmin && editingTeamIdx === t.origIdx ? (
                      <form onSubmit={e => { e.preventDefault(); handleTeamNameSave(t.origIdx, editingName); }} style={{ display: "flex", gap: 2, alignItems: "center" }}>
                        <input
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          autoFocus
                          style={{ width: 50, fontSize: 11, fontWeight: 800, background: C.cardLight, color: C.white, border: `1px solid ${C.accent}`, borderRadius: 4, padding: "2px 4px", textAlign: "center" }}
                          onBlur={() => setEditingTeamIdx(null)}
                        />
                        <button type="submit" onMouseDown={e => e.preventDefault()} style={{ fontSize: 10, background: C.accent, color: "#fff", border: "none", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>OK</button>
                      </form>
                    ) : (
                      <span onClick={() => { if (isAdmin) { setEditingTeamIdx(t.origIdx); setEditingName(t.name); } }} style={isAdmin ? { cursor: "pointer" } : undefined}>
                        {t.name}
                      </span>
                    )}
                  </td>
                )}
                <td style={{ ...tc, color: C.white, fontWeight: 600 }}>{d.name}</td>
                <td style={tc}>{d.rankScore}</td>
                <td onClick={() => setDetailPlayer(detailPlayer === d.name ? null : d.name)}
                  style={{ ...tc, color: d.personalPt > 0 ? C.white : d.personalPt < 0 ? RED : C.grayDark, cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dashed" }}>{d.personalPt}</td>
                <td style={{ ...tc, color: d.crova > 0 ? GREEN : C.grayDark }}>{d.crova}</td>
                <td style={{ ...tc, color: d.goguma < 0 ? RED : C.grayDark }}>{d.goguma}</td>
                <td style={{ ...tc, color: C.accent, fontWeight: 700 }}>{d.total}</td>
                {di === 0 && (
                  <td rowSpan={t.detail.length} style={{ ...tc, fontSize: 14, fontWeight: 900, color: C.accent, verticalAlign: "middle" }}>
                    {t.total}
                  </td>
                )}
              </tr>
            ))
          ))}
        </tbody>
      </table>

      {detailPlayer && computed.playerDateDetails[detailPlayer] && (
        <div style={{ marginTop: 12, background: C.cardLight, borderRadius: 10, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.white }}>{detailPlayer} 상세</span>
            <button onClick={() => setDetailPlayer(null)} style={{ background: "transparent", border: "none", color: C.gray, fontSize: 12, cursor: "pointer" }}>닫기</button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>날짜</th>
                <th style={th}>골</th>
                <th style={th}>어시</th>
                <th style={th}>역주행</th>
                <th style={th}>CS</th>
                <th style={th}>합계</th>
              </tr>
            </thead>
            <tbody>
              {computed.playerDateDetails[detailPlayer].sort((a, b) => a.date.localeCompare(b.date)).map((dd, di) => (
                <tr key={di}>
                  <td style={{ ...tc, fontSize: 9 }}>{dd.date.slice(5)}</td>
                  <td style={tc}>{dd.goals}</td>
                  <td style={tc}>{dd.assists}</td>
                  <td style={{ ...tc, color: dd.ownGoals < 0 ? RED : C.grayDark }}>{dd.ownGoals}</td>
                  <td style={tc}>{dd.cleanSheets}</td>
                  <td style={{ ...tc, fontWeight: 700, color: C.accent }}>{dd.personalPt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
