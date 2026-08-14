import { useState, useEffect, useMemo, useRef } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { calcMatchScore } from '../../utils/scoring';
import { teamAbsentList } from '../../utils/absentees';
import { XIcon, PlusIcon, GloveIcon } from '../common/icons';
import EventLog from './EventLog';

function MercPicker({ side, candidates, opposingPlayers, teamName, onAdd, onClose }) {
  // 용병 목록은 팀 카드 그리드 아래에 붙어서 모바일에선 화면 밖에 열린다.
  // 열릴 때(그리고 좌/우 팀을 바꿔 열 때) 목록으로 스크롤해 바로 보이게 함.
  const boxRef = useRef(null);
  useEffect(() => {
    const el = boxRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [side]);
  return (
    <div ref={boxRef} style={{
      background: "var(--app-bg-row)", borderRadius: 12, padding: 14, marginTop: 10,
      border: "0.5px solid var(--app-divider)",
    }}>
      <div style={{ fontSize: 13, marginBottom: 10, color: "var(--app-orange)", fontWeight: 500 }}>
        + {teamName}에 추가
      </div>
      {candidates.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--app-text-tertiary)" }}>추가 가능한 선수가 없습니다.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {[...candidates].sort((a, b) => {
            const aOpp = opposingPlayers.includes(a) ? 1 : 0;
            const bOpp = opposingPlayers.includes(b) ? 1 : 0;
            if (aOpp !== bOpp) return aOpp - bOpp;
            return a.localeCompare(b, 'ko');
          }).map(p => {
            const isOpposing = opposingPlayers.includes(p);
            return (
              <button key={p} onClick={() => onAdd(p, side)} style={{
                padding: "6px 10px", borderRadius: 999,
                background: isOpposing ? "rgba(255,149,0,0.12)" : "var(--app-bg-row-hover)",
                color:      isOpposing ? "var(--app-orange)"   : "var(--app-text-primary)",
                border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}>
                {p}
                {isOpposing && <span style={{
                  fontSize: 10, fontWeight: 500, padding: "1px 5px", borderRadius: 4,
                  background: "rgba(255,149,0,0.2)",
                }}>상대팀</span>}
              </button>
            );
          })}
        </div>
      )}
      <button onClick={onClose} style={{
        marginTop: 10, padding: "6px 12px", borderRadius: 999,
        background: "transparent", color: "var(--app-text-secondary)",
        border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
      }}>닫기</button>
    </div>
  );
}

// Apple UIMenu-style: uniform neutral; 골은 primary(blue filled), active는 blue text
const popoverBtn = ({ primary = false, active = false, disabled = false, subtle = false, isLast = false } = {}) => {
  // 모든 버튼이 동일한 padding/box를 사용해야 grid 컬럼이 시각적으로도 정렬됨.
  const base = {
    padding: "8px 6px",
    border: "none",
    fontSize: 13, fontWeight: active || primary ? 600 : 500, letterSpacing: "-0.01em",
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit",
    minWidth: 0, whiteSpace: "nowrap",
    transition: "background 0.1s",
  };
  if (primary) {
    return {
      ...base,
      background: "var(--app-blue)", color: "#fff",
      borderRight: isLast ? "none" : "0.5px solid rgba(255,255,255,0.2)",
    };
  }
  const color = disabled ? "var(--app-text-tertiary)"
              : active ? "var(--app-blue)"
              : subtle ? "var(--app-text-secondary)"
              : "var(--app-text-primary)";
  return {
    ...base,
    background: "transparent",
    color,
    borderRight: isLast ? "none" : "0.5px solid var(--app-divider)",
    opacity: disabled ? 0.4 : 1,
  };
};

export default function CourtRecorder({ matchInfo, homePlayers: initHomePlayers, awayPlayers: initAwayPlayers, allEvents, onRecordEvent, onUndoEvent, onDeleteEvent, onEditEvent, onFinish, onMatchInfoUpdate, onGkChange, styles: s, courtLabel, attendees, readOnly, compose, setCompose, mercs: mercsProp, onAddMerc, onRemoveMerc, absentees, onToggleAbsent }) {
  const { C } = useTheme();
  const [homeGk, setHomeGk] = useState(matchInfo.homeGk || null);
  const [awayGk, setAwayGk] = useState(matchInfo.awayGk || null);
  // 부모(=원격 동기화 포함) 가 GK 를 바꾸면 로컬 state 도 따라가야 함.
  // 멀티탭 동기화에서 다른 탭이 GK 를 바꿨을 때 이 탭에 즉시 반영되게 함.
  useEffect(() => { setHomeGk(matchInfo.homeGk || null); }, [matchInfo.homeGk]);
  useEffect(() => { setAwayGk(matchInfo.awayGk || null); }, [matchInfo.awayGk]);
  // controlled (props 제공) / uncontrolled (fallback) 양쪽 지원 — 기존 호출부 호환
  const [localMercs, setLocalMercs] = useState([]);
  const mercs = mercsProp !== undefined ? mercsProp : localMercs;
  const [showMercPicker, setShowMercPicker] = useState(null);
  const [openPopover, setOpenPopover] = useState(null); // { player, isHome }
  // 부모(ScheduleMatchView)가 compose 상태를 hoist하지 않은 경우(PushMatchView/FreeMatchView) 내부 state로 fallback
  const [localCompose, setLocalCompose] = useState(null);
  const composeState = setCompose ? compose : localCompose;
  const setComposeState = setCompose || setLocalCompose;

  const { homeIdx, awayIdx, matchId, homeTeam, awayTeam, homeColor, awayColor } = matchInfo;

  const homeMercs = mercs.filter(m => m.side === "home").map(m => m.player);
  const awayMercs = mercs.filter(m => m.side === "away").map(m => m.player);
  // initHomePlayers가 이미 mercs를 포함할 수 있어(confirmed 스냅샷) 중복 방지를 위해 mercs는 한 번만 append
  const homePlayers = [...initHomePlayers.filter(p => !awayMercs.includes(p) && !homeMercs.includes(p)), ...homeMercs].sort((a, b) => a.localeCompare(b, 'ko'));
  const awayPlayers = [...initAwayPlayers.filter(p => !homeMercs.includes(p) && !awayMercs.includes(p)), ...awayMercs].sort((a, b) => a.localeCompare(b, 'ko'));
  // 매치별 휴식 (teamIdx 기준). 지금 그 팀 명단에 있는 사람만 인정 —
  // 용병이 팀을 옮기면 이전 팀에 이름이 남는데, 그걸 그대로 믿으면
  // 🪑 표시는 안 되면서 입력만 막히는 유령 휴식이 된다.
  const homeAbsent = teamAbsentList(absentees, matchId, homeIdx, homePlayers);
  const awayAbsent = teamAbsentList(absentees, matchId, awayIdx, awayPlayers);
  const getMercCandidates = (side) => {
    const myPlayers = side === "home" ? homePlayers : awayPlayers;
    return (attendees || []).filter(p => !myPlayers.includes(p));
  };

  const matchEvents = allEvents.filter(e => e.matchId === matchId);
  const homeScore = calcMatchScore(allEvents, matchId, homeTeam);
  const awayScore = calcMatchScore(allEvents, matchId, awayTeam);

  const myCompose = composeState && composeState.pitchId === matchId ? composeState : null;

  const playerStats = useMemo(() => {
    const stats = {};
    const ensure = (p) => { if (!stats[p]) stats[p] = { g: 0, a: 0, og: 0, f: 0 }; return stats[p]; };
    matchEvents.forEach(e => {
      if (e.type === "goal") {
        ensure(e.player).g += 1;
        if (e.assist) ensure(e.assist).a += 1;
      } else if (e.type === "owngoal") {
        ensure(e.player).og += 1;
      } else if (e.type === "foul") {
        ensure(e.player).f += 1;
      }
    });
    return stats;
  }, [matchEvents]);

  useEffect(() => {
    if (!openPopover) return;
    const handler = (e) => {
      if (!e.target.closest || !e.target.closest('[data-popover-region="1"]')) {
        setOpenPopover(null);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [openPopover]);

  const readOnlyAlert = () => alert("확정된 라운드입니다. 수정하려면 확정취소를 먼저 진행해주세요.");

  const checkGk = () => {
    if (!homeGk || !awayGk) { alert(`키퍼를 먼저 지정하세요: ${!homeGk ? homeTeam : ""}${!homeGk && !awayGk ? ", " : ""}${!awayGk ? awayTeam : ""}`); return false; }
    return true;
  };

  const isPlayerHome = (player) => homePlayers.includes(player);
  // 휴식 판정은 그 선수가 서 있는 팀 기준. 양 팀 명단을 합집합으로 보면
  // 반대 팀에 남은 이름 때문에 🪑 표시 없이 입력만 막히는 상태가 된다.
  const isPlayerAbsent = (player, isHome) => (isHome ? homeAbsent : awayAbsent).includes(player);

  const toggleGk = (player, isHome) => {
    if (readOnly) { readOnlyAlert(); return; }
    if (isPlayerAbsent(player, isHome)) { alert("휴식 중인 선수입니다. 먼저 휴식을 해제해 주세요."); return; }
    const currentGk = isHome ? homeGk : awayGk;
    const newGk = currentGk === player ? null : player;
    if (isHome) { setHomeGk(newGk); } else { setAwayGk(newGk); }
    if (onGkChange) onGkChange(isHome ? homeIdx : awayIdx, newGk);
  };

  const recordGoalEvent = (scorer, assist) => {
    const isHome = isPlayerHome(scorer);
    onRecordEvent(courtLabel, {
      type: "goal", matchId, player: scorer, assist: assist || null,
      team: isHome ? homeTeam : awayTeam, scoringTeam: isHome ? homeTeam : awayTeam,
      concedingTeam: isHome ? awayTeam : homeTeam, concedingGk: isHome ? awayGk : homeGk,
      concedingGkLoss: 1, homeTeam, awayTeam,
    });
  };

  const recordOwnGoalEvent = (player) => {
    const isHome = isPlayerHome(player);
    const ownTeam = isHome ? homeTeam : awayTeam;
    onRecordEvent(courtLabel, {
      type: "owngoal", matchId, player,
      team: ownTeam, scoringTeam: isHome ? awayTeam : homeTeam, concedingTeam: ownTeam,
      concedingGk: isHome ? homeGk : awayGk, concedingGkLoss: 2, assist: null, homeTeam, awayTeam,
    });
  };

  // 반칙 (옐로카드) — 스코어·GK 실점 무영향, 개인 포인트(foulPoint)만 반영.
  // scoringTeam/concedingTeam은 시트 opponent 매핑·편집 UI용 팀 정보로만 유지(calcMatchScore가 foul을 미집계).
  const recordFoulEvent = (player) => {
    const isHome = isPlayerHome(player);
    const ownTeam = isHome ? homeTeam : awayTeam;
    onRecordEvent(courtLabel, {
      type: "foul", matchId, player,
      team: ownTeam, scoringTeam: isHome ? awayTeam : homeTeam, concedingTeam: ownTeam,
      concedingGk: null, concedingGkLoss: 0, assist: null, homeTeam, awayTeam,
    });
  };

  // ── 역할 조작 ──
  const applyGoalRole = (player, isHome) => {
    if (readOnly) { readOnlyAlert(); return; }
    if (isPlayerAbsent(player, isHome)) { alert("휴식 중인 선수입니다. 먼저 휴식을 해제해 주세요."); return; }
    if (myCompose?.scorer === player) { setComposeState(null); return; }
    if (!checkGk()) return;
    setComposeState({ pitchId: matchId, scorer: player, scorerIsHome: isHome, assist: null });
  };

  const applyAssistRole = (player, isHome) => {
    if (readOnly) { readOnlyAlert(); return; }
    if (!myCompose || !myCompose.scorer) return;
    if (myCompose.scorerIsHome !== isHome) return;
    if (myCompose.scorer === player) return;
    if (!checkGk()) return;
    recordGoalEvent(myCompose.scorer, player);
    setComposeState(null);
  };

  // 어시 먼저 — 어시 지정 후 같은 팀의 다른 선수를 탭하면 그 선수가 득점자가 되어 저장
  const applyAssistFirstRole = (player, isHome) => {
    if (readOnly) { readOnlyAlert(); return; }
    if (isPlayerAbsent(player, isHome)) { alert("휴식 중인 선수입니다. 먼저 휴식을 해제해 주세요."); return; }
    // 이미 본인이 assist로 잡혀있으면 해제 토글
    if (myCompose?.assist === player && !myCompose.scorer) { setComposeState(null); return; }
    if (!checkGk()) return;
    setComposeState({ pitchId: matchId, scorer: null, assist: player, scorerIsHome: isHome });
  };

  const applyOwnGoalRole = (player, isHome) => {
    if (readOnly) { readOnlyAlert(); return; }
    if (isPlayerAbsent(player, isHome)) { alert("휴식 중인 선수입니다. 먼저 휴식을 해제해 주세요."); return; }
    if (!checkGk()) return;
    recordOwnGoalEvent(player);
  };

  const applyFoulRole = (player, isHome) => {
    if (readOnly) { readOnlyAlert(); return; }
    if (isPlayerAbsent(player, isHome)) { alert("휴식 중인 선수입니다. 먼저 휴식을 해제해 주세요."); return; }
    // 반칙은 GK 실점 귀속이 없으므로 키퍼 미지정이어도 기록 가능
    recordFoulEvent(player);
  };

  const saveSolo = () => {
    if (!myCompose || !myCompose.scorer) return;
    if (!checkGk()) return;
    recordGoalEvent(myCompose.scorer, null);
    setComposeState(null);
  };

  const cancelCompose = () => setComposeState(null);

  const addMerc = (player, side) => {
    if (onAddMerc) onAddMerc(player, side);
    else setLocalMercs(prev => [...prev, { player, side }]);
    setShowMercPicker(null);
  };
  const removeMerc = (player) => {
    if (onRemoveMerc) onRemoveMerc(player);
    else setLocalMercs(prev => prev.filter(m => m.player !== player));
  };

  const renderPlayerCard = (player, isHome, placeBelow) => {
    const mercsArr = isHome ? homeMercs : awayMercs;
    const isMerc = mercsArr.includes(player);
    const isGk = (isHome ? homeGk : awayGk) === player;
    const absentArr = isHome ? homeAbsent : awayAbsent;
    const isAbsent = absentArr.includes(player);
    const sideTeamIdx = isHome ? homeIdx : awayIdx;
    const color = isHome ? homeColor : awayColor;
    const roleInCompose = myCompose?.scorer === player ? 'scorer'
                        : myCompose?.assist === player ? 'assist'
                        : null;
    const isPopoverOpen = openPopover?.player === player && openPopover.isHome === isHome;
    const stats = playerStats[player];

    // compose는 scorer-first 또는 assist-first 두 가지 흐름
    const isScorerFirst = !!myCompose?.scorer;
    const isAssistFirst = !!myCompose?.assist && !myCompose?.scorer;
    const isComposeActive = isScorerFirst || isAssistFirst;
    const isCrossTeamDuringCompose = isComposeActive && myCompose.scorerIsHome !== isHome;
    // 어시 후보 (scorer-first 흐름): 같은 팀 + scorer 아님
    const isAssistCandidate = isScorerFirst && myCompose.scorerIsHome === isHome && myCompose.scorer !== player;
    // 골 후보 (assist-first 흐름): 같은 팀 + assist 아님
    const isScorerCandidate = isAssistFirst && myCompose.scorerIsHome === isHome && myCompose.assist !== player;

    const ringColor = roleInCompose === 'scorer' ? "var(--app-green)"
                    : roleInCompose === 'assist' && isAssistFirst ? "var(--app-blue)"
                    : isAssistCandidate ? "var(--app-blue)"
                    : isScorerCandidate ? "var(--app-green)"
                    : null;

    const cardBg = roleInCompose === 'scorer' ? "rgba(52,199,89,0.14)"
                 : roleInCompose === 'assist' && isAssistFirst ? "rgba(0,122,255,0.14)"
                 : isAssistCandidate ? "rgba(0,122,255,0.08)"
                 : isScorerCandidate ? "rgba(52,199,89,0.08)"
                 : "var(--app-bg-elevated)";

    const border = ringColor
      ? `0.5px solid ${ringColor}`
      : "0.5px solid var(--app-divider)";

    return (
      <div
        key={player}
        style={{ position: "relative" }}
        {...(isPopoverOpen ? { 'data-popover-region': '1' } : {})}
      >
        <button
          onClick={() => {
            if (readOnly) { readOnlyAlert(); return; }
            // Block cross-team during compose
            if (isCrossTeamDuringCompose) return;
            // 휴식 상태에서도 팝오버는 열어야 휴식 해제 가능. compose 흐름만 차단.
            if (isAbsent && (isAssistCandidate || isScorerCandidate)) return;
            // Fast-path A (scorer-first): compose에 scorer 있고 같은팀 다른 선수 탭 → 어시+저장
            if (isAssistCandidate) {
              if (!checkGk()) return;
              recordGoalEvent(myCompose.scorer, player);
              setComposeState(null);
              return;
            }
            // Fast-path B (assist-first): compose에 assist 있고 같은팀 다른 선수 탭 → 골+저장
            if (isScorerCandidate) {
              if (!checkGk()) return;
              recordGoalEvent(player, myCompose.assist);
              setComposeState(null);
              return;
            }
            setOpenPopover(isPopoverOpen ? null : { player, isHome });
          }}
          disabled={isCrossTeamDuringCompose}
          aria-label={`${player} 역할 선택`}
          style={{
            width: "100%",
            background: cardBg,
            color: "var(--app-text-primary)",
            border,
            borderRadius: 10,
            padding: "14px 6px", minHeight: 68,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 4,
            cursor: isCrossTeamDuringCompose ? "not-allowed" : "pointer",
            opacity: isCrossTeamDuringCompose ? 0.35 : (isAbsent ? 0.4 : 1),
            fontFamily: "inherit",
            fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em",
            position: "relative",
            transition: "background 0.15s, border-color 0.15s, opacity 0.15s",
          }}
        >
          {isGk && (
            <span style={{
              position: "absolute", top: 4, right: 6,
              width: 16, height: 16, borderRadius: 3,
              background: "var(--app-orange)", color: "#fff",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 700, letterSpacing: 0, lineHeight: 1,
            }}>GK</span>
          )}
          {isAbsent && (
            <span style={{
              position: "absolute", top: 4, right: isGk ? 26 : 6,
              fontSize: 11, lineHeight: 1,
            }} aria-label="휴식">🪑</span>
          )}
          {stats && stats.f > 0 && (
            <span style={{
              position: "absolute", bottom: 4, right: 4,
              width: 14, height: 18, borderRadius: 2,
              background: "#eab308", color: "#fff",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontWeight: 800, lineHeight: 1,
              boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
            }} aria-label={`반칙 ${stats.f}회`}>{stats.f}</span>
          )}
          {isMerc && (
            <span style={{
              position: "absolute", top: 4, left: 6,
              fontSize: 9, fontWeight: 600,
              padding: "1px 4px", borderRadius: 3,
              background: "rgba(255,149,0,0.2)", color: "var(--app-orange)",
              letterSpacing: 0,
            }}>용병</span>
          )}
          <span style={{
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
          }}>{player}</span>
          {stats && (stats.g > 0 || stats.a > 0 || stats.og > 0 || stats.f > 0) && (
            <span style={{
              fontSize: 10, color: "var(--app-text-tertiary)", fontVariantNumeric: "tabular-nums",
              display: "inline-flex", gap: 5,
            }}>
              {stats.g > 0 && <span>⚽{stats.g}</span>}
              {stats.a > 0 && <span>🅰{stats.a}</span>}
              {stats.og > 0 && <span style={{ color: "var(--app-red)" }}>🔴{stats.og}</span>}
              {stats.f > 0 && <span style={{ color: "#eab308" }}>🟨{stats.f}</span>}
            </span>
          )}
        </button>
        {isMerc && !readOnly && (
          <button
            onClick={(e) => { e.stopPropagation(); removeMerc(player); }}
            aria-label="용병 제거"
            style={{
              position: "absolute", bottom: 4, right: 4,
              width: 18, height: 18, borderRadius: 999,
              background: "rgba(255,59,48,0.15)", color: "var(--app-red)",
              border: "none", cursor: "pointer", padding: 0,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <XIcon width={9} color="var(--app-red)" />
          </button>
        )}
        {isPopoverOpen && (() => {
          const below = !placeBelow ? false : true;
          const popPos = below
            ? { top: "calc(100% + 6px)" }
            : { bottom: "calc(100% + 6px)" };
          // 홈팀 카드는 좌측 앵커, 어웨이팀 카드는 우측 앵커 → 화면 우측 끝 팝업 잘림 방지
          const popHoriz = isHome ? { left: 0 } : { right: 0 };
          const isScorer = roleInCompose === 'scorer';
          return (
            <div style={{
              position: "absolute",
              ...popHoriz,
              ...popPos,
              zIndex: 40,
              background: "var(--app-bg-elevated)",
              border: "0.5px solid var(--app-divider)",
              borderRadius: 12,
              boxShadow: "0 6px 20px rgba(0,0,0,0.14)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              display: "flex", flexDirection: "column", alignItems: "stretch",
              minWidth: 220,
              maxWidth: "min(92vw, 280px)",
              overflow: "hidden",
            }}>
              {/* Row 1: 골 / 어시 / GK */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderBottom: "0.5px solid var(--app-divider)" }}>
                <button
                  onClick={(e) => { e.stopPropagation(); applyGoalRole(player, isHome); setOpenPopover(null); }}
                  style={popoverBtn({ primary: !isScorer, active: isScorer })}
                >{isScorer ? "✓ ⚽ 골" : "⚽ 골"}</button>
                <button
                  onClick={(e) => { e.stopPropagation(); applyAssistFirstRole(player, isHome); setOpenPopover(null); }}
                  style={popoverBtn({ active: roleInCompose === 'assist' && isAssistFirst })}
                >{(roleInCompose === 'assist' && isAssistFirst) ? "✓ 🅰 어시" : "🅰 어시"}</button>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleGk(player, isHome); setOpenPopover(null); }}
                  style={popoverBtn({ active: isGk, isLast: true })}
                >{isGk ? "✓ 🧤 GK" : "🧤 GK"}</button>
              </div>
              {/* Row 2: 자책 / 반칙 / 휴식 */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
                <button
                  onClick={(e) => { e.stopPropagation(); applyOwnGoalRole(player, isHome); setOpenPopover(null); }}
                  style={popoverBtn()}
                >🔴 자책</button>
                <button
                  onClick={(e) => { e.stopPropagation(); applyFoulRole(player, isHome); setOpenPopover(null); }}
                  style={popoverBtn()}
                >🟨 반칙</button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // 휴식으로 전환 시: GK이면 먼저 GK 해제 (휴식자는 골키퍼 불가)
                    if (!isAbsent && isGk) {
                      if (isHome) setHomeGk(null); else setAwayGk(null);
                      if (onGkChange) onGkChange(isHome ? homeIdx : awayIdx, null);
                    }
                    if (onToggleAbsent) onToggleAbsent({ matchId, teamIdx: sideTeamIdx, player });
                    // 휴식으로 바뀌면 compose 영향 차단: scorer/assist에 잡혀있던 본인은 빠지게
                    if (!isAbsent && composeState) {
                      if (composeState.scorer === player || composeState.assist === player) setComposeState(null);
                    }
                    setOpenPopover(null);
                  }}
                  style={popoverBtn({ active: isAbsent, isLast: true })}
                >{isAbsent ? "✓ 🪑 휴식" : "🪑 휴식"}</button>
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  const homePanelTint = homeColor?.bg ? `color-mix(in srgb, ${homeColor.bg} 7%, transparent)` : "transparent";
  const awayPanelTint = awayColor?.bg ? `color-mix(in srgb, ${awayColor.bg} 7%, transparent)` : "transparent";

  return (
    <div style={{
      background: "var(--app-bg-row)", borderRadius: 14, padding: 14,
      border: "0.5px solid var(--app-divider)",
      position: "relative",
    }}>

      {/* Compose bar */}
      {myCompose && (
        <div style={{
          marginBottom: 12, padding: "10px 10px 10px 12px", borderRadius: 12,
          background: "var(--app-bg-elevated)",
          border: "0.5px solid var(--app-divider)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, flexWrap: "wrap", minWidth: 0 }}>
            {myCompose.scorer ? (
              <span style={{
                padding: "4px 8px", borderRadius: 6,
                background: "rgba(52,199,89,0.18)", color: "var(--app-green)",
                fontSize: 12, fontWeight: 600,
                display: "inline-flex", alignItems: "center", gap: 4,
              }}>⚽ {myCompose.scorer}</span>
            ) : (
              <span style={{
                padding: "4px 8px", borderRadius: 6,
                background: "rgba(0,122,255,0.14)", color: "var(--app-blue)",
                fontSize: 12, fontWeight: 600,
                display: "inline-flex", alignItems: "center", gap: 4,
              }}>🅰 {myCompose.assist}</span>
            )}
            <span style={{
              padding: "4px 8px", borderRadius: 6,
              background: "transparent", color: "var(--app-text-tertiary)",
              fontSize: 11, fontWeight: 500,
              border: "0.5px dashed var(--app-divider)",
            }}>{myCompose.scorer ? "어시: 선수 탭" : "골: 선수 탭"}</span>
            {myCompose.scorer && (
              <>
                <span style={{ fontSize: 11, color: "var(--app-text-tertiary)", fontWeight: 500 }}>또는</span>
                <button onClick={saveSolo} disabled={!myCompose.scorer}
                  style={{
                    padding: "5px 12px", borderRadius: 6,
                    background: "var(--app-blue)", color: "#fff",
                    border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                    fontFamily: "inherit", opacity: myCompose.scorer ? 1 : 0.4,
                    letterSpacing: "-0.01em",
                    display: "inline-flex", alignItems: "center", gap: 4,
                  }}>⚡ 단독</button>
              </>
            )}
            {(() => {
              const concGk = myCompose.scorerIsHome ? awayGk : homeGk;
              return concGk ? (
                <span style={{
                  padding: "4px 8px", borderRadius: 6,
                  background: "var(--app-bg-row)", color: "var(--app-text-secondary)",
                  fontSize: 12, fontWeight: 500,
                  display: "inline-flex", alignItems: "center", gap: 4,
                  marginLeft: "auto",
                }}>🧤 {concGk}</span>
              ) : null;
            })()}
          </div>
          <button onClick={cancelCompose} aria-label="취소"
            style={{
              width: 32, height: 32, borderRadius: 999,
              background: "var(--app-bg-row)", color: "var(--app-text-secondary)",
              border: "0.5px solid var(--app-divider)", fontSize: 14, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              padding: 0, flexShrink: 0,
            }}>✕</button>
        </div>
      )}

      {/* Scoreboard */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center", gap: 12, padding: "8px 0 14px",
      }}>
        <div style={{ textAlign: "center", opacity: homeScore < awayScore ? 0.55 : 1, transition: "opacity .2s" }}>
          <div style={{
            fontSize: 13, color: "var(--app-text-secondary)", fontWeight: 500,
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: homeColor?.bg }} />
            {homeTeam}
          </div>
          <div style={{
            fontSize: 40, fontWeight: 700, letterSpacing: "-0.022em", lineHeight: 1.05,
            fontVariantNumeric: "tabular-nums",
            color: homeColor?.bg || "var(--app-text-primary)", marginTop: 2,
          }}>{homeScore}</div>
          {homeGk && (
            <div style={{ fontSize: 12, color: "var(--app-text-tertiary)", marginTop: 4,
                          display: "inline-flex", alignItems: "center", gap: 4 }}>
              <GloveIcon width={11} color="var(--app-text-tertiary)" />
              {homeGk}
            </div>
          )}
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--app-text-tertiary)", paddingBottom: 8 }}>VS</div>
        <div style={{ textAlign: "center", opacity: awayScore < homeScore ? 0.55 : 1, transition: "opacity .2s" }}>
          <div style={{
            fontSize: 13, color: "var(--app-text-secondary)", fontWeight: 500,
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: awayColor?.bg }} />
            {awayTeam}
          </div>
          <div style={{
            fontSize: 40, fontWeight: 700, letterSpacing: "-0.022em", lineHeight: 1.05,
            fontVariantNumeric: "tabular-nums",
            color: awayColor?.bg || "var(--app-text-primary)", marginTop: 2,
          }}>{awayScore}</div>
          {awayGk && (
            <div style={{ fontSize: 12, color: "var(--app-text-tertiary)", marginTop: 4,
                          display: "inline-flex", alignItems: "center", gap: 4 }}>
              <GloveIcon width={11} color="var(--app-text-tertiary)" />
              {awayGk}
            </div>
          )}
        </div>
      </div>

      {/* Teams side-by-side */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
      }}>
        {[
          { tint: homePanelTint, color: homeColor, teamName: homeTeam, players: homePlayers, isHome: true, side: "home" },
          { tint: awayPanelTint, color: awayColor, teamName: awayTeam, players: awayPlayers, isHome: false, side: "away" },
        ].map(t => (
          <div key={t.side} style={{
            background: t.tint, padding: "10px 8px 10px",
            borderRadius: 10,
            display: "flex", flexDirection: "column",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginLeft: 2, marginBottom: 8, gap: 6,
            }}>
              <div style={{
                fontSize: 12, fontWeight: 500, color: "var(--app-text-secondary)",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: t.color?.bg }} />
                {t.teamName}
              </div>
              {/* 득점자 팀에만 단독 저장 버튼 노출 — 어시 후보 카드 바로 옆에서 즉시 탭 가능 */}
              {!readOnly && myCompose?.scorer && t.isHome === myCompose.scorerIsHome && (
                <button onClick={(e) => { e.stopPropagation(); saveSolo(); }}
                  style={{
                    padding: "5px 10px", borderRadius: 999,
                    background: "var(--app-blue)", color: "#fff",
                    border: "none", fontSize: 11, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit",
                    display: "inline-flex", alignItems: "center", gap: 3,
                    letterSpacing: "-0.01em",
                  }}>⚡ 단독</button>
              )}
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 6, flex: 1,
            }}>
              {t.players.map(p => renderPlayerCard(p, t.isHome, t.isHome))}
              {Array.from({ length: Math.max(homePlayers.length, awayPlayers.length) - t.players.length }).map((_, i) => (
                <div key={`pad-${t.side}-${i}`} style={{ visibility: "hidden", minHeight: 68 }} aria-hidden="true" />
              ))}
            </div>
            {!readOnly && (
              <button onClick={() => setShowMercPicker(t.side)} style={{
                marginTop: 8, background: "transparent",
                border: "1px dashed rgba(255,149,0,0.5)", borderRadius: 10,
                padding: "9px", fontSize: 12, fontWeight: 500,
                color: "var(--app-orange)", cursor: "pointer", fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
                width: "100%",
              }}><PlusIcon width={12} color="var(--app-orange)" /> 용병</button>
            )}
          </div>
        ))}
      </div>

      {!readOnly && (
        <div style={{
          fontSize: 11, color: "var(--app-text-tertiary)", textAlign: "center",
          marginTop: 10, letterSpacing: "-0.01em",
        }}>
          탭 → 역할 선택 · 골 선택 후 같은 팀 선수 탭 = 어시+저장, [단독] = 단독 저장
        </div>
      )}

      {!readOnly && showMercPicker && (
        <MercPicker side={showMercPicker} candidates={getMercCandidates(showMercPicker)}
          opposingPlayers={showMercPicker === "home" ? awayPlayers : homePlayers}
          teamName={showMercPicker === "home" ? homeTeam : awayTeam}
          onAdd={addMerc} onClose={() => setShowMercPicker(null)} />
      )}

      <EventLog
        matchEvents={matchEvents} allEvents={allEvents} matchId={matchId}
        homePlayers={homePlayers} awayPlayers={awayPlayers}
        homeTeam={homeTeam} awayTeam={awayTeam}
        homeGk={homeGk} awayGk={awayGk}
        homeColor={homeColor} awayColor={awayColor}
        onDeleteEvent={onDeleteEvent} onEditEvent={onEditEvent} styles={s} readOnly={readOnly}
      />
    </div>
  );
}
