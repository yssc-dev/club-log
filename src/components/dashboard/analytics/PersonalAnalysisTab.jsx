import { useState, useMemo } from 'react';
import { calcTrend, calcRelativePosition } from '../../../utils/playerAnalyticsUtils';
import * as futsalCalc from '../../../utils/analyticsV2';
import * as soccerCalc from '../../../utils/soccerAnalytics';
import RoundDistribution from './RoundDistribution';
import SoloGoalDonut from './SoloGoalDonut';
import PersonalSynergyCard from './PersonalSynergyCard';
import PersonalSynergyChart from './PersonalSynergyChart';
import RivalryView from './RivalryView';
import OpponentBreakdownList from './OpponentBreakdownList';

// ─── Radar Chart ────────────────────────────────────────────────────────────

const AXES = [
  { key: "scoring", label: "득점력" },
  { key: "creativity", label: "창의력" },
  { key: "defense", label: "수비력" },
  { key: "keeping", label: "키퍼" },
  { key: "attendance", label: "참석률" },
  { key: "winRate", label: "승리기여" },
];

function RadarChart({ values, size = 200, C }) {
  const cx = size / 2, cy = size / 2, r = size * 0.38;
  const n = AXES.length;
  const angleStep = (Math.PI * 2) / n;
  const startAngle = -Math.PI / 2;

  const getPoint = (i, ratio) => {
    const angle = startAngle + i * angleStep;
    return { x: cx + r * ratio * Math.cos(angle), y: cy + r * ratio * Math.sin(angle) };
  };

  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const dataPoints = AXES.map((_, i) => getPoint(i, (values[i] || 0) / 100));

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {gridLevels.map(level => {
        const pts = Array.from({ length: n }, (_, i) => getPoint(i, level));
        return <polygon key={level} points={pts.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke={C.grayDarker} strokeWidth={0.5} />;
      })}
      {AXES.map((_, i) => {
        const p = getPoint(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={C.grayDarker} strokeWidth={0.5} />;
      })}
      <polygon points={dataPoints.map(p => `${p.x},${p.y}`).join(" ")} fill={C.accent} fillOpacity={0.2} stroke={C.accent} strokeWidth={2} />
      {dataPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill={C.accent} />)}
      {AXES.map((axis, i) => {
        const p = getPoint(i, 1.22);
        return <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fill={C.gray} fontSize={10} fontWeight={600}>{axis.label}</text>;
      })}
    </svg>
  );
}

// ─── Trend Line Chart ────────────────────────────────────────────────────────

function MiniTrendChart({ points, smoothed, valueKey, color, title, yMax, yFormat, C }) {
  const width = 280, height = 96, padL = 36, padR = 10, padT = 14, padB = 18;
  const n = smoothed.length;
  if (n === 0) return null;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const xAt = (i) => padL + (i * innerW / Math.max(1, n - 1));
  const yAt = (v) => padT + innerH - (v / yMax) * innerH;
  const linePath = smoothed.map((s, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(s[valueKey])}`).join(' ');
  const ticks = [0, yMax / 2, yMax];
  const fmtDate = (d) => {
    if (!d) return '';
    const m = String(d).match(/(\d{1,2})[-/.](\d{1,2})$/);
    return m ? `${Number(m[1])}/${Number(m[2])}` : String(d).slice(-5);
  };
  const xLabelIdx = n === 1 ? [0] : n === 2 ? [0, n - 1] : [0, Math.floor((n - 1) / 2), n - 1];
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, marginBottom: 2 }}>{title}</div>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* y-axis ticks + grid */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={yAt(t)} x2={width - padR} y2={yAt(t)} stroke={C.grayDarker} strokeWidth={0.5} strokeDasharray={i === 0 ? '0' : '2,2'} />
            <text x={padL - 4} y={yAt(t) + 3} textAnchor="end" fontSize={9} fill={C.gray}>{yFormat(t)}</text>
          </g>
        ))}
        {/* x-axis labels */}
        {xLabelIdx.map(i => (
          <text key={i} x={xAt(i)} y={height - 4} textAnchor="middle" fontSize={9} fill={C.gray}>
            {fmtDate(points[i]?.date)}
          </text>
        ))}
        {/* smoothed line */}
        <path d={linePath} stroke={color} strokeWidth={2} fill="none" />
        {/* raw dots */}
        {points.map((p, i) => (
          <circle key={i} cx={xAt(i)} cy={yAt(p[valueKey])} r={2} fill={color} fillOpacity={0.5} />
        ))}
      </svg>
    </div>
  );
}

function TrendLineChart({ points, smoothed, C }) {
  if (!smoothed || smoothed.length === 0) return null;
  const maxGA = Math.max(1, ...smoothed.map(s => s.gpg), ...smoothed.map(s => s.apg), ...points.map(p => p.gpg), ...points.map(p => p.apg));
  const niceMax = Math.ceil(maxGA * 10) / 10;
  const fmtNum = (v) => v.toFixed(1);
  const fmtPct = (v) => `${Math.round(v * 100)}%`;
  return (
    <div>
      <MiniTrendChart points={points} smoothed={smoothed} valueKey="gpg" color="#ef4444" title="득점/경기" yMax={niceMax} yFormat={fmtNum} C={C} />
      <MiniTrendChart points={points} smoothed={smoothed} valueKey="apg" color="#3b82f6" title="도움/경기" yMax={niceMax} yFormat={fmtNum} C={C} />
      <MiniTrendChart points={points} smoothed={smoothed} valueKey="winRate" color="#22c55e" title="팀 승률" yMax={1} yFormat={fmtPct} C={C} />
    </div>
  );
}

// ─── Badge helpers ───────────────────────────────────────────────────────────

function getChaosBadge(chaosRate) {
  if (chaosRate >= 0.3) return { emoji: "💣", label: "돌발왕", color: "#ef4444" };
  if (chaosRate >= 0.1) return { emoji: "⚡", label: "돌발주의", color: "#f97316" };
  return null;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function PersonalAnalysisTab({
  playerGameLogs, matchLogs, eventLogs,
  members, C, authUserName, isSoccer = false,
}) {
  // 축구는 soccerAnalytics(분리 계산층), 풋살은 analyticsV2 — 함수 스코프 셰도잉으로 본문 호출부 무변경
  const { buildRadarPopulations, calcRadarValues, getPlayerType, calcTrends, calcStreaks, calcPersonalRecords, calcRoundSlope, calcSoloGoalRatio, calcPersonalSynergy, calcSynergyMatrix, calcAssistLinkMatrix, personalLink, calcPlayerSummary } = isSoccer ? soccerCalc : futsalCalc;
  // 6개 카드 숫자는 모두 matchLogs+eventLogs 단일 소스에서 계산.
  // (이전: playerGameLogs/defenseStats/winStats 혼용 → 같은 "경기수"가 4종 5종으로 갈렸음)
  const summaryV2 = useMemo(
    () => calcPlayerSummary({
      matchLogs: matchLogs || [],
      eventLogs: eventLogs || [],
      playerGameLogs: playerGameLogs || [],
    }),
    [matchLogs, eventLogs, playerGameLogs]
  );
  const playerSummary = summaryV2.perPlayer;

  // 레이더 백분위 비교 모집단 — 표본 있는 활동 선수(≥3경기)만.
  // 0경기 선수를 모집단에 넣으면 다른 선수의 백분위가 왜곡되므로 드롭다운 명단과 분리.
  const ratedPlayers = useMemo(
    () => Object.keys(playerSummary).filter(n => playerSummary[n].rounds >= 3),
    [playerSummary]
  );

  // 드롭다운 명단 — 전체 로스터(members) ∪ 기록 있는 선수. 0경기 선수도 선택 가능.
  const players = useMemo(() => {
    const names = new Set(Object.keys(playerSummary));
    (members || []).forEach(m => { if (m && m.name) names.add(m.name); });
    const list = Array.from(names);
    list.sort((a, b) => {
      if (authUserName) {
        if (a === authUserName) return -1;
        if (b === authUserName) return 1;
      }
      return a.localeCompare(b, "ko");
    });
    return list;
  }, [playerSummary, members, authUserName]);

  const totalSessions = Math.max(summaryV2.totalSessions, 1);

  // ── Selected player state (default to authUserName if present) ────────────
  const [selected, setSelected] = useState(() => {
    // 본인 기록이 있으면 본인, 없으면 기록 있는 선수를 우선 — 열자마자 '기록 없음'으로 시작하지 않도록.
    if (authUserName && playerSummary[authUserName]) return authUserName;
    return ratedPlayers[0] || players.find(p => playerSummary[p]) || players[0] || null;
  });

  // ── Radar 백분위 모집단 — 표본 없는 축은 제외 (999 센티널 금지, calcRadarData 참조) ──
  const radarPops = useMemo(
    () => buildRadarPopulations(playerSummary, ratedPlayers, totalSessions),
    [ratedPlayers, playerSummary, totalSessions]
  );

  const getPlayerData = (name) => {
    const s = playerSummary[name];
    if (!s) return { values: [null, null, null, null, null, null], raw: {}, detail: {} };
    const { values, raw } = calcRadarValues(radarPops, s, totalSessions);
    const detail = {
      goals: s.goals, assists: s.assists, rounds: s.rounds, games: s.games, ownGoals: Math.abs(s.ownGoals || 0),
      keeperRounds: s.keeperRounds, conceded: s.conceded,
      fieldRounds: s.fieldRounds, fieldConceded: s.fieldConceded,
      wins: s.wins, draws: s.draws, losses: s.losses, totalMatches: s.matches,
    };
    return { values, raw, detail };
  };

  const getTrends = () => {
    const points = trendData?.points || [];
    return {
      goals: calcTrend(points.map(p => p.gpg)),
      assists: calcTrend(points.map(p => p.apg)),
    };
  };

  const getRelativePosition = (name) => {
    const s = playerSummary[name];
    if (!s || s.rounds === 0) return null;
    const qualified = ratedPlayers.map(n => playerSummary[n]); // ratedPlayers는 이미 rounds>=3
    const goalsPerRound = qualified.map(ps => ps.goals / ps.rounds);
    const assistsPerRound = qualified.map(ps => ps.assists / ps.rounds);
    return {
      goals: calcRelativePosition(s.goals / s.rounds, goalsPerRound),
      assists: calcRelativePosition(s.assists / s.rounds, assistsPerRound),
    };
  };

  const getGkFieldSplit = (name) => {
    const s = playerSummary[name];
    if (!s) return null;
    return {
      keeper: { rounds: s.keeperRounds, conceded: s.conceded },
      field: { rounds: s.fieldRounds, goals: s.goals, assists: s.assists },
    };
  };

  // ── Trend + Streak data for selected player ───────────────────────────────
  const trendData = useMemo(() => {
    if (!selected || !playerGameLogs || !matchLogs) return null;
    return calcTrends({ playerName: selected, playerLogs: playerGameLogs, matchLogs });
  }, [selected, playerGameLogs, matchLogs]);

  const streakData = useMemo(() => {
    if (!selected || !playerGameLogs) return null;
    // sessionDates 전달 → 결석 세션이 연속 기록을 끊음 (calcStreaks 참조)
    return calcStreaks({ playerName: selected, playerLogs: playerGameLogs, sessionDates: summaryV2.sessionDates });
  }, [selected, playerGameLogs, summaryV2]);

  // ── P3/P4/C5 calculations ─────────────────────────────────────────────────
  const roundSlope = useMemo(() => calcRoundSlope({ eventLogs: eventLogs || [], matchLogs: matchLogs || [], threshold: 10, minSessions: 3 }), [eventLogs, matchLogs]);
  const soloRatio = useMemo(() => calcSoloGoalRatio({ eventLogs: eventLogs || [], threshold: 10 }), [eventLogs]);
  const synergyMatrix = useMemo(() => calcSynergyMatrix({ matchLogs: matchLogs || [], minRounds: 5 }), [matchLogs]);
  const linkMatrix = useMemo(() => calcAssistLinkMatrix({ eventLogs: eventLogs || [] }), [eventLogs]);
  const myPair = useMemo(() => {
    if (!selected) return { partners: [], best: [], worst: [] };
    const base = calcPersonalSynergy({ matrix: synergyMatrix, player: selected });
    const partners = base.partners.map(p => ({
      ...p,
      links: personalLink({ linkMatrix, player: selected, partner: p.partner }),
    }));
    return { ...base, partners };
  }, [synergyMatrix, selected, linkMatrix]);

  // ── Personal Records (PR) for selected player ────────────────────────────
  const pr = useMemo(() =>
    selected ? calcPersonalRecords({ playerName: selected, playerLogs: playerGameLogs || [] }) : null
  , [selected, playerGameLogs]);

  // ── 상대팀별 성적 (축구 전용 — 풋살은 매주 팀 로테이션이라 상대팀 축이 무의미) ──
  const oppBreakdown = useMemo(
    () => (isSoccer ? soccerCalc.calcOpponentBreakdown({ eventLogs: eventLogs || [], matchLogs: matchLogs || [] }) : null),
    [isSoccer, eventLogs, matchLogs]
  );
  const oppRows = useMemo(
    () => (oppBreakdown && selected ? (oppBreakdown.byPlayer[selected] || []) : []),
    [oppBreakdown, selected]
  );
  // 상대팀별 개인 수비 기록 — our_defenders_json이 있는 경기만이라 없는 상대는 '없음'으로 표기된다
  const oppDefense = useMemo(
    () => (isSoccer ? soccerCalc.calcOpponentDefense({ matchLogs: matchLogs || [] }) : null),
    [isSoccer, matchLogs]
  );
  const myOppDefense = useMemo(
    () => (oppDefense && selected ? (oppDefense.byPlayer[selected] || []) : []),
    [oppDefense, selected]
  );

  // ── 개인 수비 지표 (축구 전용) ──
  // 수비케미 탭과 같은 계산층을 재사용하고, 개인 화면이라 개인 임계만 푼다(individualThreshold:1).
  // 조합 임계는 수비케미와 동일(페어 5·트리오 3) — 두 화면이 서로 다른 목록을 보여주면 안 된다.
  const defenseAll = useMemo(
    () => (isSoccer ? soccerCalc.calcDefenseAnalysis({ matchLogs: matchLogs || [], individualThreshold: 1 }) : null),
    [isSoccer, matchLogs]
  );
  // 수비 기록이 없는 선수(GK·공격수만 뛴 선수)는 null → 섹션 자체를 숨긴다
  const myDefense = useMemo(() => {
    if (!defenseAll || !selected) return null;
    const me = defenseAll.individuals.find(x => x.name === selected);
    if (!me) return null;
    const mine = (rows) => soccerCalc.sortDefenseRows(
      (rows || []).filter(r => r.members.includes(selected)),
      { metric: 'conceded', by: 'raw' },
    ).slice(0, 3);
    return { me, pairs: mine(defenseAll.pairs), trios: mine(defenseAll.trios) };
  }, [defenseAll, selected]);

  // ── Derived display values ────────────────────────────────────────────────
  // 출전 라운드가 없으면(0경기 로스터 멤버 또는 골만 있는 이벤트only 선수) 분석 대신 '기록 없음' 표시.
  // rounds===0이면 경기당 지표가 모두 0/모순("N골 / 0경기")이 되므로 풀 분석을 막는다.
  const hasData = !!(selected && playerSummary[selected] && playerSummary[selected].rounds > 0);
  const pd = selected ? getPlayerData(selected) : { values: [50, 50, 50, 50, 50, 50], raw: {}, detail: {} };
  const values = pd.values;
  const type = getPlayerType(values);
  const chaos = getChaosBadge(pd.raw?.chaosRate || 0);

  // ── Style helpers ─────────────────────────────────────────────────────────
  const cardStyle = { marginTop: 24, padding: 14, background: C.cardLight, borderRadius: 12 };
  const cardTitle = { fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 8 };
  const prRow = { display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12 };

  return (
    <div>
      {/* ── PlayerCard section ── */}
      <div style={{ marginBottom: 14 }}>
        <select value={selected || ""} onChange={e => setSelected(e.target.value)}
          style={{ width: "100%", padding: "10px 14px", borderRadius: 50, fontSize: 14, fontWeight: 480, letterSpacing: "-0.14px", background: "transparent", color: C.white, border: `1.2px dashed ${C.grayDark}`, fontFamily: "inherit", appearance: "none", cursor: "pointer" }}>
          {players.map(p => <option key={p} value={p}>{p} ({playerSummary[p]?.rounds || 0}경기)</option>)}
        </select>
      </div>
      {selected && !hasData && (
        <div style={{ textAlign: "center", padding: "32px 16px", color: C.gray, fontSize: 13 }}>
          출전 경기 기록이 없습니다 (0경기)
        </div>
      )}
      {hasData && (
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 24, fontWeight: 400, letterSpacing: "-0.6px", color: C.white }}>{selected}</span>
            {type.label && (
              <span style={{ fontSize: 10, fontWeight: 500, padding: "3px 10px", borderRadius: 50, border: `1px dashed ${type.color}`, color: type.color }}>{type.label}</span>
            )}
            {chaos && (
              <span style={{ fontSize: 10, fontWeight: 500, padding: "3px 10px", borderRadius: 50, border: `1px dashed ${chaos.color}`, color: chaos.color }}>{chaos.emoji} {chaos.label}</span>
            )}
          </div>
          <RadarChart values={values} C={C} />
          {pd.detail && (
            <div style={{ marginTop: 12, textAlign: "left" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <tbody>
                  {[
                    { label: "득점력", score: values[0], desc: `${pd.detail.goals}골 / ${pd.detail.rounds}경기 = 경기당 ${pd.raw.scoring?.toFixed(2)}골` },
                    { label: "창의력", score: values[1], desc: `${pd.detail.assists}어시 / ${pd.detail.rounds}경기 = 경기당 ${pd.raw.creativity?.toFixed(2)}어시` },
                    { label: "수비력", score: values[2], desc: pd.detail.fieldRounds > 0 ? `필드 ${pd.detail.fieldRounds}경기, 팀실점 ${pd.detail.fieldConceded} = 경기당 ${pd.raw.defense?.toFixed(2)}실점` : "필드 경기 없음" },
                    { label: "키퍼", score: values[3], desc: pd.detail.keeperRounds > 0 ? `${pd.detail.keeperRounds}경기, ${pd.detail.conceded}실점 = 경기당 ${pd.raw.keeping?.toFixed(2)}실점` : "키퍼 경기 없음" },
                    { label: "참석률", score: values[4], desc: `${pd.detail.games} / ${totalSessions}게임 = ${Math.round(pd.raw.attendance * 100)}%` },
                    { label: "승리기여", score: values[5], desc: `${pd.detail.totalMatches}경기 ${pd.detail.wins}승 ${pd.detail.draws}무 ${pd.detail.losses}패 = 승률 ${Math.round(pd.raw.winRate * 100)}%` },
                  ].map(row => (
                    <tr key={row.label} style={{ borderBottom: `1px dashed ${C.grayDarker}` }}>
                      <td style={{ padding: "8px 4px", color: C.gray, fontSize: 10, width: 70 }}>{row.label}</td>
                      <td style={{ padding: "8px 4px", color: row.score == null ? C.gray : C.white, fontWeight: 480, fontSize: 18, letterSpacing: "-0.4px", fontVariantNumeric: "tabular-nums", width: 38, textAlign: "center" }}>{row.score == null ? "–" : Math.round(row.score)}</td>
                      <td style={{ padding: "8px 4px", color: C.gray, fontSize: 10 }}>{row.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {selected && (() => {
            const trends = getTrends();
            const relPos = getRelativePosition(selected);
            const split = getGkFieldSplit(selected);
            const hasAnything = trends.goals || trends.assists || relPos || (split && split.keeper.rounds > 0 && split.field.rounds > 0) || playerSummary[selected]?.teamGoals > 0;
            if (!hasAnything) return null;
            return (
              <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: C.cardLight, fontSize: 11, lineHeight: 1.9, textAlign: "left" }}>
                {trends.goals && (
                  <div>
                    <span style={{ color: C.gray }}>득점 추세: </span>
                    <span style={{ color: C.white, fontWeight: 700 }}>{trends.goals.icon} {trends.goals.label}</span>
                  </div>
                )}
                {trends.assists && (
                  <div>
                    <span style={{ color: C.gray }}>도움 추세: </span>
                    <span style={{ color: C.white, fontWeight: 700 }}>{trends.assists.icon} {trends.assists.label}</span>
                  </div>
                )}
                {relPos && (
                  <div>
                    <span style={{ color: C.gray }}>팀 평균 대비: </span>
                    <span style={{ color: relPos.goals >= 0 ? C.accent : "#ef4444", fontWeight: 700 }}>
                      득점 {relPos.goals >= 0 ? "+" : ""}{relPos.goals}%
                    </span>
                    <span style={{ color: C.gray }}> · </span>
                    <span style={{ color: relPos.assists >= 0 ? C.accent : "#ef4444", fontWeight: 700 }}>
                      도움 {relPos.assists >= 0 ? "+" : ""}{relPos.assists}%
                    </span>
                  </div>
                )}
                {split && split.keeper.rounds > 0 && split.field.rounds > 0 && (
                  <div>
                    <span style={{ color: C.gray }}>GK/필드: </span>
                    <span style={{ color: C.white }}>
                      GK {split.keeper.rounds}경기 {split.keeper.conceded}실 · 필드 {split.field.rounds}경기 {split.field.goals}골 {split.field.assists}어시
                    </span>
                  </div>
                )}
                {playerSummary[selected]?.teamGoals > 0 && (
                  <div>
                    <span style={{ color: C.gray }} title="본인 출전 매치의 팀 득점 중 골+어시로 관여한 비율">팀 득점 관여율: </span>
                    <span style={{ color: C.accent, fontWeight: 700 }}>
                      {Math.round(playerSummary[selected].goalInvolvement * 100)}%
                    </span>
                    <span style={{ color: C.gray }}>
                      {' '}(팀 {playerSummary[selected].teamGoals}골 중 {playerSummary[selected].goals + playerSummary[selected].assists}회 관여)
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
          {streakData && (streakData.scoringStreak.best > 0 || streakData.cleanSheetStreak.best > 0) && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: C.cardLight, fontSize: 11, lineHeight: 1.9, textAlign: "left" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.white, marginBottom: 4 }}>연속 기록</div>
              {streakData.scoringStreak.best > 0 && (
                <div>
                  <span style={{ color: C.gray }}>득점 연속: </span>
                  <span style={{ color: C.white, fontWeight: 700 }}>
                    현재 {streakData.scoringStreak.current} / 역대 {streakData.scoringStreak.best}게임
                  </span>
                </div>
              )}
              {streakData.cleanSheetStreak.best > 0 && (
                <div>
                  <span style={{ color: C.gray }}>GK 무실점 연속: </span>
                  <span style={{ color: C.white, fontWeight: 700 }}>
                    현재 {streakData.cleanSheetStreak.current} / 역대 {streakData.cleanSheetStreak.best}게임
                  </span>
                </div>
              )}
            </div>
          )}
          {isSoccer && oppRows.length > 0 && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: C.cardLight, fontSize: 11, textAlign: "left" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.white, marginBottom: 6 }}>상대팀별 성적</div>
              <OpponentBreakdownList
                rows={oppRows} playerName={selected}
                attackByOpponent={oppBreakdown?.byOpponent}
                defenseByOpponent={oppDefense?.byOpponent}
                C={C}
              />
              <div style={{ marginTop: 6, fontSize: 9.5, color: C.gray, lineHeight: 1.5 }}>
                공격 = 골+어시 총합 · 수비 = 경기당 실점(수비수 기록 경기만). 내 순위 ±2명만 표시.
              </div>
            </div>
          )}
          {isSoccer && myDefense && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: C.cardLight, fontSize: 11, textAlign: "left" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.white, marginBottom: 6 }}>수비 기록</div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 6, paddingBottom: 6, borderBottom: `1px dashed ${C.grayDarker}` }}>
                <span style={{ color: C.gray }}>{myDefense.me.games}경기 수비 출전</span>
                <span style={{ color: C.white, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {myDefense.me.concededPerGame.toFixed(2)}실점 · 무실점 {Math.round(myDefense.me.cleanRate * 100)}%
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 6, padding: "6px 0", fontSize: 10 }}>
                <span style={{ color: C.gray }}>본인 부재 경기 대비</span>
                <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", color: myDefense.me.delta == null ? C.gray : (myDefense.me.delta >= 0 ? C.green : C.red) }}>
                  {myDefense.me.delta == null
                    ? "– (비교할 부재 경기 없음)"
                    : `${myDefense.me.delta >= 0 ? "+" : ""}${myDefense.me.delta.toFixed(2)}실점 ${myDefense.me.delta >= 0 ? "억제" : "허용"}`}
                </span>
              </div>
              {[
                { title: "함께 선 2인", rows: myDefense.pairs, minGames: 5 },
                { title: "함께 선 3인", rows: myDefense.trios, minGames: 3 },
              ].map(({ title, rows, minGames }) => (
                <div key={title} style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 10, color: C.gray, fontWeight: 700, marginBottom: 2 }}>{title} (실점 적은순)</div>
                  {rows.length === 0 ? (
                    <div style={{ fontSize: 10, color: C.gray }}>{minGames}경기 이상 함께 선 조합 없음</div>
                  ) : rows.map(r => (
                    <div key={r.members.join("|")} style={{ display: "flex", justifyContent: "space-between", gap: 6, padding: "3px 0" }}>
                      <span style={{ color: C.gray, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.members.join("·")} <span style={{ fontSize: 9 }}>({r.games})</span>
                      </span>
                      <span style={{ color: C.green, fontWeight: 600, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                        {r.concededPerGame.toFixed(2)}실점
                      </span>
                    </div>
                  ))}
                </div>
              ))}
              <div style={{ marginTop: 6, fontSize: 9.5, color: C.gray, lineHeight: 1.5 }}>
                수비수로 기록된 경기만 (레코더 도입 후). 조합은 2인 5경기·3인 3경기 이상.
                <br />⚠️ 상대팀·GK 영향이 섞인 참고 지표.
              </div>
            </div>
          )}
          {trendData && trendData.points.length >= 3 && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: C.cardLight }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.white, marginBottom: 8, textAlign: "left" }}>
                최근 {trendData.points.length}게임 추세
              </div>
              <TrendLineChart points={trendData.points} smoothed={trendData.smoothed} C={C} />
              <div style={{ fontSize: 10, color: C.gray, marginTop: 6, textAlign: "left", lineHeight: 1.55 }}>
                <div>실선 = 최근 3게임 이동평균 · 점 = 그날 원시값</div>
                <div><b>득점/도움</b> 한 경기(라운드)당 평균 · <b>팀 승률</b> 그날 본인 출전 라운드의 우리팀 승률</div>
              </div>
            </div>
          )}
        </div>
      )}

      {hasData && (<>
      {/* ── P3: Round Distribution — 축구는 라운드 개념이 없어 숨김 (match_id가 라운드 포맷이 아님) ── */}
      {!isSoccer && (
      <div style={cardStyle}>
        <RoundDistribution data={roundSlope.perPlayer[selected]} C={C} />
      </div>
      )}

      {/* ── P4: Solo Goal Donut ── */}
      <div style={cardStyle}>
        <SoloGoalDonut data={soloRatio.perPlayer[selected]} C={C} />
      </div>

      {/* ── C5: 개인 시너지 차트 — 선수 선택은 이 탭 상단 드롭다운(selected)을 따른다 ── */}
      <div style={cardStyle}>
        <PersonalSynergyChart
          matchLogs={matchLogs} eventLogs={eventLogs}
          player={selected} C={C} isSoccer={isSoccer}
        />
      </div>

      {/* ── 대결 케미(라이벌) — 풋살 전용. 축구 상대는 외부팀이라 성립하지 않는다.
             선수 선택은 이 탭 상단 드롭다운(selected)을 따른다 ── */}
      {!isSoccer && (
        <div style={cardStyle}>
          <RivalryView matchLogs={matchLogs} player={selected} C={C} />
        </div>
      )}

      {/* ── PersonalSynergyCard('나의 짝꿍') — 2026-08-14 노출 보류 ──
          위 시너지 차트가 상하위 요약을 맡으면서 역할이 겹쳐 숨김.
          복구하려면 아래 블록의 주석만 풀면 된다(myPair 계산·컴포넌트 모두 살아 있음).
      <div style={cardStyle}>
        <PersonalSynergyCard data={myPair} C={C} />
      </div>
      */}

      {/* ── PR: Personal Records (selected player와 연동) ── */}
      <div style={cardStyle}>
        <div style={cardTitle}>🏆 개인 기록 (PR)</div>
        {pr ? (
          <>
            <div style={prRow}>
              <span style={{ color: C.gray }}>⚽ 최다골</span>
              {pr.mostGoals ? (
                <span style={{ color: C.white, fontWeight: 700 }}>{pr.mostGoals.value}골 <span style={{ color: C.gray, fontWeight: 400 }}>({pr.mostGoals.date})</span></span>
              ) : <span style={{ color: C.gray }}>-</span>}
            </div>
            <div style={{ ...prRow, borderTop: `1px dashed ${C.grayDarker}` }}>
              <span style={{ color: C.gray }}>🅰 최다어시</span>
              {pr.mostAssists ? (
                <span style={{ color: C.white, fontWeight: 700 }}>{pr.mostAssists.value}어시 <span style={{ color: C.gray, fontWeight: 400 }}>({pr.mostAssists.date})</span></span>
              ) : <span style={{ color: C.gray }}>-</span>}
            </div>
            <div style={{ ...prRow, borderTop: `1px dashed ${C.grayDarker}` }}>
              <span style={{ color: C.gray }} title="GK로 출전한 경기일을 시간순으로 봤을 때 무실점이 연속된 최대 길이">🧤 GK 최장 무실점</span>
              {pr.longestCleanSheet ? (
                <span style={{ color: C.white, fontWeight: 700 }}>{pr.longestCleanSheet.value}회 <span style={{ color: C.gray, fontWeight: 400 }}>({pr.longestCleanSheet.startDate}~{pr.longestCleanSheet.endDate})</span></span>
              ) : <span style={{ color: C.gray }}>-</span>}
            </div>
            {pr.keeperSummary && (
              <div style={{ ...prRow, borderTop: `1px dashed ${C.grayDarker}` }}>
                <span style={{ color: C.gray }} title="PG 누적 — 클린시트율은 무실점 세션 비율, 실점은 키퍼 경기당">🧤 키퍼 누적</span>
                <span style={{ color: C.white, fontWeight: 700 }}>
                  클린시트율 {Math.round(pr.keeperSummary.cleanSheetRate * 100)}%
                  <span style={{ color: C.gray, fontWeight: 400 }}> · 경기당 {pr.keeperSummary.concededPerGame.toFixed(2)}실점 ({pr.keeperSummary.keeperGames}경기)</span>
                </span>
              </div>
            )}
            {pr.rankScore && pr.rankScore.total > 0 && (
              <div style={{ ...prRow, borderTop: `1px dashed ${C.grayDarker}` }}>
                <span style={{ color: C.gray }} title="세션 팀순위 배점(rank_score) 누적 — 승/무/패보다 세밀한 세션 기여 지표">🏅 랭크점수</span>
                <span style={{ color: C.white, fontWeight: 700 }}>
                  누적 {pr.rankScore.total}
                  <span style={{ color: C.gray, fontWeight: 400 }}> · 세션당 {pr.rankScore.avg.toFixed(1)}{pr.bestRankScore ? ` · 최고 ${pr.bestRankScore.value} (${pr.bestRankScore.date})` : ''}</span>
                </span>
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
        )}
      </div>
      </>)}
    </div>
  );
}
