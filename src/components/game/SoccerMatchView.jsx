import { useState, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { calcSoccerScore, getCleanSheetPlayers, getSoccerPlayedPlayers, getNonPlayers, soccerResultLabel } from '../../utils/soccerScoring';
import { generateEventId } from '../../utils/idGenerator';
import { FORMATIONS, defendersFromPositionMap } from '../../utils/formations';
import Modal from '../common/Modal';
import OpponentSelector from './OpponentSelector';
import FormationSetup from './FormationSetup';
import FormationRecorder from './FormationRecorder';
import FormationPitch from './FormationPitch';
import LineupEditView from './LineupEditView';
import RoundNav from './RoundNav';
import ConfirmBar from './ConfirmBar';
// 축구 기록화면: 단일 navIdx 연속체로 [과거 경기…] + [진행중/새 경기]를 오간다(풋살 ScheduleMatchView 패턴).
// 노드 본문 결정 권위 = navIdx + 경기 status. viewState는 서브플로우(formation)와 유휴만.
export default function SoccerMatchView({
  soccerMatches, currentMatchIdx, attendees, opponents,
  onCreateMatch, onAddEvent, onDeleteEvent, onFinishMatch,
  onUpdateMatchFormation, onReopenMatch, onCreateRestMatch,
  onAddOpponent, onRemoveOpponent, onRenameOpponent, onGoToSummary, gameSettings, styles: s,
  savedFormation, onFormationChange,
  onSetMatchOpponent, onCorrectLineup, onSwapLineupPositions, gameFinalized,
}) {
  const { C } = useTheme();

  // 서브플로우 뷰 상태만 유지: "selectOpponent"(유휴) / "formation"
  const [viewState, setViewState] = useState(() =>
    savedFormation?.viewState === "formation" ? savedFormation.viewState : "selectOpponent");
  const [selectedOpponent, setSelectedOpponent] = useState(savedFormation?.selectedOpponent || null);
  const [selectedPlayers, setSelectedPlayers] = useState(savedFormation?.selectedPlayers || []);
  const [navLocked, setNavLocked] = useState(false);            // goalFlow 열림 중 ◀▶ 잠금
  const [opponentModalIdx, setOpponentModalIdx] = useState(null); // 상대팀 변경 모달 대상 matchIdx
  const [lineupEditIdx, setLineupEditIdx] = useState(null);       // 라인업 편집기 대상 matchIdx

  // 멀티탭 동기화: 서브플로우 상태만 따라감(playing/selectOpponent는 노드 권위가 아니므로 sync에서 제외).
  useEffect(() => {
    if (savedFormation?.viewState === "formation") setViewState("formation");
  }, [savedFormation?.viewState]);
  useEffect(() => { setSelectedOpponent(savedFormation?.selectedOpponent || null); }, [savedFormation?.selectedOpponent]);
  useEffect(() => { setSelectedPlayers(savedFormation?.selectedPlayers || []); }, [savedFormation?.selectedPlayers]);

  const saveFormationState = (updates) => {
    onFormationChange?.({ viewState, selectedOpponent, selectedPlayers, ...updates });
  };

  // ── 연속체 파생 ──
  const orderedMatches = [...soccerMatches].sort((a, b) => a.matchIdx - b.matchIdx);
  const playingPos = orderedMatches.findIndex(m => m.status === "playing");
  const hasPlaying = playingPos >= 0;
  const totalNodes = orderedMatches.length + (hasPlaying ? 0 : 1);
  const editableIdx = hasPlaying ? playingPos : orderedMatches.length; // 진행중 경기 or 트레일링 새 경기
  // 진행 중 경기가 사라지면(로컬 종료·외부 마감·다른 경기 확정취소) 네비 잠금 해제 — 멀티탭 stuck 방지
  // (hasPlaying 선언 뒤에 위치해야 함 — dep 배열이 렌더 중 즉시 평가되므로 TDZ 회피)
  useEffect(() => { if (!hasPlaying) setNavLocked(false); }, [hasPlaying]);

  const [navIdx, setNavIdx] = useState(editableIdx);
  // 구조가 바뀌면(생성/종료/확정취소/휴식) 편집 노드로 자동 포커스(풋살 FreeMatchView 가드 패턴).
  const sig = `${orderedMatches.length}:${playingPos}`;
  const [lastSig, setLastSig] = useState(sig);
  if (sig !== lastSig) { setLastSig(sig); setNavIdx(editableIdx); }

  const safeNavIdx = Math.max(0, Math.min(navIdx, totalNodes - 1));
  const currentMatch = currentMatchIdx >= 0 ? soccerMatches[currentMatchIdx] : null;

  // 경기 객체에서 레코더용 포메이션 복원(저장돼 있으면 그대로, 없으면 lineup/gk/defenders로 4-4-2 재구성)
  const reconstructFormation = (m) => {
    if (m.formation && m.assignments && m.positionMap) {
      return { formation: m.formation, assignments: m.assignments, positionMap: m.positionMap, gk: m.gk || "", subs: m.subs || [] };
    }
    const formation = "4-4-2";
    const positions = FORMATIONS[formation].positions;
    const gk = m.gk || "";
    const defenders = m.defenders || [];
    const lineup = m.lineup || [];
    const others = lineup.filter(n => n !== gk && !defenders.includes(n));
    const assignments = {}; const positionMap = {};
    let di = 0, oi = 0;
    positions.forEach((pos, idx) => {
      let name = null;
      if (pos.role === "GK") name = gk || others[oi++] || null;
      else if (pos.role === "DF") name = defenders[di++] ?? others[oi++] ?? null;
      else name = others[oi++] ?? null;
      if (name) { assignments[idx] = name; positionMap[name] = pos.role; }
    });
    let curGk = gk;
    let curSubs = [...(m.subs || [])];
    const slotOf = (player) => Object.keys(assignments).find(idx => assignments[idx] === player);
    // gkChange는 replay 불필요 — 편집기 SWAP은 gkChange를 안 남기고, 라이브 gkChange는 modern 매치(저장된 배치)로 복원됨.
    [...(m.events || [])].sort((a, b) => a.timestamp - b.timestamp).forEach(e => {
      if (e.type === "sub") {
        const slot = slotOf(e.playerOut);
        if (slot !== undefined) {
          const role = positions[slot].role;
          assignments[slot] = e.playerIn;
          delete positionMap[e.playerOut];
          positionMap[e.playerIn] = role;
          if (role === "GK") curGk = e.playerIn;
        }
        curSubs = curSubs.filter(n => n !== e.playerIn);
        if (!curSubs.includes(e.playerOut)) curSubs.push(e.playerOut);
      } else if (e.type === "redCard") {
        const slot = slotOf(e.player);
        if (slot !== undefined) { delete assignments[slot]; delete positionMap[e.player]; }
      }
    });
    return { formation, assignments, positionMap, gk: curGk, subs: curSubs };
  };

  // 상대팀 선택 → 포메이션 서브플로우
  const handleOpponentSelect = (name) => {
    setSelectedOpponent(name);
    setSelectedPlayers(attendees);
    setViewState("formation");
    saveFormationState({ viewState: "formation", selectedOpponent: name, selectedPlayers: attendees });
  };

  // 포메이션 확정 → 경기 생성(status playing). viewState는 유휴로 복귀(노드는 status에서 파생).
  const handleFormationConfirm = ({ formation, assignments, gk, positionMap, subs }) => {
    const lineup = Object.values(assignments);
    const defenders = defendersFromPositionMap(positionMap);
    onCreateMatch({ opponent: selectedOpponent, lineup, gk, defenders, subs, formation, assignments, positionMap });
    // 경기 생성 후 selectedOpponent/selectedPlayers 클리어(로컬+RTDB) — 안 지우면 다른 탭이
    // FormationSetup에 갇혀 확정 시 유령 2번째 경기를 만드는 멀티탭 회귀 발생. handleFinishMatch와 동일 정리.
    setSelectedOpponent(null);
    setSelectedPlayers([]);
    setViewState("selectOpponent");
    saveFormationState({ viewState: "selectOpponent", selectedOpponent: null, selectedPlayers: [] });
  };

  const handleFormationStateChange = (updates) => {
    onUpdateMatchFormation?.(currentMatchIdx, updates);
  };

  // 끝난 경기 다시 열기(풀편집). viewState/navIdx는 손대지 않음 — 구조 변경으로 navIdx가 자동 리셋된다.
  const handleReopenMatch = (matchIdx) => {
    const m = soccerMatches.find(x => x.matchIdx === matchIdx);
    if (!m) return;
    if (!confirm(`제${matchIdx + 1}경기 (vs ${m.opponent}) 기록을 다시 열어 수정하시겠습니까?`)) return;
    onReopenMatch?.(matchIdx);
    if (!(m.formation && m.assignments && m.positionMap)) {
      onUpdateMatchFormation?.(matchIdx, reconstructFormation(m));
    }
  };

  const handleAddEvent = (event) => {
    onAddEvent(currentMatchIdx, { ...event, id: event.id || generateEventId(), timestamp: event.timestamp || Date.now() });
  };
  const handleDeleteEvent = (eventId) => { onDeleteEvent(currentMatchIdx, eventId); };

  // 경기 종료. viewState 유휴 유지, navIdx는 구조 변경으로 새 경기 노드로 자동 이동.
  const handleFinishMatch = (finalSnapshot) => {
    if (finalSnapshot && typeof finalSnapshot === "object") onUpdateMatchFormation?.(currentMatchIdx, finalSnapshot);
    onFinishMatch(currentMatchIdx);
    setNavLocked(false);
    setSelectedOpponent(null);
    setSelectedPlayers([]);
    setViewState("selectOpponent");
    saveFormationState({ viewState: "selectOpponent", selectedOpponent: null });
  };

  // ── 서브플로우(전체화면, RoundNav 없음) ──
  if (viewState === "formation" && selectedOpponent) {
    // 풀은 상대 선택 시점 스냅샷(selectedPlayers)이 아니라 실시간 참석자.
    // 스냅샷을 쓰면 상대 선택 후 참석명단에 추가된 선수가 배치 화면에 안 보인다
    // (8/18 김래상 사고). 경기 중 교체 후보가 참석자 실시간 파생인 것과 대칭을 맞춘다.
    return (
      <FormationSetup selectedPlayers={attendees} onConfirm={handleFormationConfirm}
        onBack={() => setViewState("selectOpponent")} title={`vs ${selectedOpponent}`} />
    );
  }
  // 라인업 편집기(전체화면) — formation 서브플로우와 동일하게 조기 반환.
  if (lineupEditIdx !== null) {
    const m = soccerMatches.find(x => x.matchIdx === lineupEditIdx);
    if (!m) { setLineupEditIdx(null); return null; }
    const fm = reconstructFormation(m);
    // 정정 후보 = 참석자 − 출전자. m.subs(생성 시점 스냅샷) 대신 현재 참석자를 본다 —
    // 나중에 참석 처리된 지각자도 후보가 돼야 하기 때문. 출전자 제외는 CORRECT 중복 방지.
    const bench = getNonPlayers(m, attendees);
    return (
      <LineupEditView
        formation={fm.formation} assignments={fm.assignments} bench={bench}
        title={`제${m.matchIdx + 1}경기 vs ${m.opponent} — 라인업 편집`}
        onSwapPositions={(aIdx, bIdx) => onSwapLineupPositions?.(m.matchIdx, aIdx, bIdx)}
        onCorrect={(out, inn) => {
          // remapPlayerInSoccerEvents가 이관하는 모든 필드를 커버
          const outHasRecords = (m.events || []).some(e =>
            e.player === out || e.assist === out || e.currentGk === out ||
            e.playerIn === out || e.playerOut === out);
          const msg = outHasRecords
            ? `${out}의 기록이 ${inn}로 이관됩니다. 계속?`
            : `${out}를 미출전 처리하고 ${inn}를 출전으로 바꿉니다. 계속?`;
          if (!confirm(msg)) return false;
          onCorrectLineup?.(m.matchIdx, out, inn);
          return true;
        }}
        onBack={() => setLineupEditIdx(null)}
      />
    );
  }

  // ── 연속체 노드 ──
  const atNewNode = safeNavIdx >= orderedMatches.length;      // 트레일링 새 경기 노드
  const node = atNewNode ? null : orderedMatches[safeNavIdx];
  const isRest = !!node && node.opponent === "휴식";
  const isPlayingNode = !!node && node.status === "playing";

  const navLabel = atNewNode ? `제${soccerMatches.length + 1}경기` : `제${node.matchIdx + 1}경기`;
  const navStatusText = atNewNode ? "새 경기" : isRest ? "휴식" : isPlayingNode ? "진행중" : "종료됨";
  const navStatusTone = isPlayingNode ? "orange" : atNewNode ? "gray" : "green";

  const goPrev = () => { if (safeNavIdx > 0 && !navLocked) setNavIdx(safeNavIdx - 1); };
  const goNext = () => { if (safeNavIdx < totalNodes - 1 && !navLocked) setNavIdx(safeNavIdx + 1); };

  const canChangeOpponent = !!node && !atNewNode && !isRest;
  const openOpponentModal = () => {
    if (!node) return;
    if (gameFinalized && !confirm("이미 구글시트로 전송(마감)된 경기입니다.\n상대팀을 바꾸면 최종집계 화면의 '수정 후 재전송'으로 다시 전송해야 시트가 정합됩니다.\n계속하시겠습니까?")) return;
    setOpponentModalIdx(node.matchIdx);
  };
  const openLineupEditor = () => {
    if (!node) return;
    if (navLocked) return; // 득점 입력(goalFlow) 중엔 레코더 언마운트=골 유실 → 진입 차단
    if (gameFinalized && !confirm("이미 구글시트로 전송(마감)된 경기입니다.\n라인업을 바꾸면 최종집계 화면의 '수정 후 재전송'으로 다시 전송해야 시트가 정합됩니다.\n계속하시겠습니까?")) return;
    // 레거시 경기(formation 미저장)는 SWAP이 raw assignments(null)로 no-op 되므로 modern 승격 후 편집
    if (!(node.formation && node.assignments && node.positionMap)) {
      onUpdateMatchFormation?.(node.matchIdx, reconstructFormation(node));
    }
    setLineupEditIdx(node.matchIdx);
  };

  return (
    <div>
      <RoundNav
        label={navLabel} total={totalNodes}
        statusText={navStatusText} statusTone={navStatusTone}
        canPrev={safeNavIdx > 0 && !navLocked}
        canNext={safeNavIdx < totalNodes - 1 && !navLocked}
        onPrev={goPrev} onNext={goNext}
      />

      {canChangeOpponent && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 10 }}>
          <button onClick={openLineupEditor} disabled={navLocked}
            style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, background: C.grayDark, color: navLocked ? C.gray : C.white, border: "none", cursor: navLocked ? "not-allowed" : "pointer", opacity: navLocked ? 0.5 : 1 }}>
            🔁 출전 수정
          </button>
          <button onClick={openOpponentModal}
            style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", cursor: "pointer" }}>
            🔁 상대팀 변경
          </button>
        </div>
      )}

      {/* 새 경기 노드 */}
      {atNewNode && (
        <div style={{ ...s.card }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 10 }}>제{soccerMatches.length + 1}경기</div>
          <OpponentSelector opponents={opponents} onSelect={handleOpponentSelect} onAddOpponent={onAddOpponent}
            onRemoveOpponent={onRemoveOpponent} onRenameOpponent={onRenameOpponent} styles={s} />
          <button onClick={() => { if (!confirm("이번 라운드를 휴식으로 처리하시겠습니까?")) return; onCreateRestMatch(); }}
            style={{ marginTop: 10, width: "100%", padding: "12px 0", borderRadius: 10, border: `1px dashed ${C.grayDark}`, background: "transparent", fontSize: 13, color: C.gray, cursor: "pointer" }}>
            😴 휴식 (이번 라운드 스킵)
          </button>
        </div>
      )}

      {/* 진행 중 노드 — FormationRecorder(편집). goalFlow 열림 중 ◀▶ 잠금. */}
      {isPlayingNode && currentMatch && (() => {
        const live = reconstructFormation(currentMatch);
        return (
          <FormationRecorder
            key={currentMatch.matchIdx}
            formation={live.formation} assignments={live.assignments} positionMap={live.positionMap}
            gk={live.gk} attendees={attendees} opponent={currentMatch.opponent}
            startedAt={currentMatch.startedAt || Date.now()} events={currentMatch.events || []}
            onAddEvent={handleAddEvent} onDeleteEvent={handleDeleteEvent} onFinishMatch={handleFinishMatch}
            onStateChange={handleFormationStateChange} onFlowActiveChange={setNavLocked}
          />
        );
      })()}

      {/* 과거(종료/휴식) 노드 — 읽기전용 요약 */}
      {node && !atNewNode && !isPlayingNode && (() => {
        const { ourScore, opponentScore } = calcSoccerScore(node.events);
        const csPlayers = getCleanSheetPlayers(node);
        const result = soccerResultLabel(ourScore, opponentScore);
        const resultColor = result === "승" ? C.green : result === "패" ? C.red : C.gray;
        // 그 경기의 배치(누가 어느 포지션으로 뛰었는지) 읽기전용. 모던=저장된 최종 배치, 레거시=재구성.
        const fm = isRest ? null : reconstructFormation(node);
        const form = fm ? (FORMATIONS[fm.formation] || FORMATIONS["4-4-2"]) : null;
        // 출전 = lineup ∪ sub 투입 ∪ 최종 assignments(단일 소스 헬퍼).
        // sub 이벤트가 삭제돼 배치에만 남은 선수도 출전으로 표시(레드카드 퇴장자는 lineup이라 포함).
        const played = fm ? getSoccerPlayedPlayers(node) : [];
        const benchNeverPlayed = fm ? getNonPlayers(node, attendees) : [];
        return (
          <>
            <div style={{ ...s.card, textAlign: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 900, margin: "8px 0" }}>
                <span style={{ color: ourScore > opponentScore ? C.green : C.white }}>{ourScore}</span>
                <span style={{ color: C.gray }}> : </span>
                <span style={{ color: opponentScore > ourScore ? C.red : C.white }}>{opponentScore}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>vs {node.opponent}{isRest ? "" : <span style={{ color: resultColor }}> — {result}</span>}</div>
              {csPlayers.length > 0 && <div style={{ fontSize: 11, color: C.yellow, marginTop: 6 }}>🛡 클린시트: {csPlayers.join(", ")}</div>}
            </div>
            {fm && (
              <div style={{ ...s.card, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 8, textAlign: "center" }}>📋 포메이션 · {form.label}</div>
                <FormationPitch positions={form.positions} assignments={fm.assignments} size={300} />
                {played.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 11, color: C.grayLight, textAlign: "center", lineHeight: 1.6 }}>
                    <span style={{ fontWeight: 700, color: C.white }}>출전 ({played.length}):</span> {played.join(", ")}
                  </div>
                )}
                {benchNeverPlayed.length > 0 && (
                  <div style={{ marginTop: 4, fontSize: 11, color: C.gray, textAlign: "center" }}>
                    <span style={{ fontWeight: 600 }}>미출전:</span> {benchNeverPlayed.join(", ")}
                  </div>
                )}
              </div>
            )}
            {[...(node.events || [])].filter(e => e.type !== "gkChange").sort((a, b) => a.timestamp - b.timestamp).map(e => (
              <div key={e.id} style={{ padding: "5px 10px", background: C.cardLight, borderRadius: 6, marginBottom: 3, fontSize: 11, color: C.white }}>
                {e.type === "goal" && `⚽ ${e.player}${e.assist ? ` · 🅰️ ${e.assist}` : ""}`}
                {e.type === "owngoal" && `🔴 ${e.player} (자책골)`}
                {e.type === "opponentGoal" && `⚽ 상대골 (GK: ${e.currentGk || ""})`}
                {e.type === "opponentOwnGoal" && `🔴 상대 자책골`}
                {e.type === "sub" && `🔄 ${e.playerOut} → ${e.playerIn} (${e.position})`}
                {e.type === "yellowCard" && `🟨 ${e.player} 옐로카드`}
                {e.type === "redCard" && `🟥 ${e.player} 레드카드`}
              </div>
            ))}
            <div style={{ height: 72 }} />
            <ConfirmBar>
              <span style={{ color: C.green, fontWeight: 700, fontSize: 13 }}>제{node.matchIdx + 1}경기 {isRest ? "휴식" : "종료됨"}</span>
              {!isRest && (
                <button onClick={() => handleReopenMatch(node.matchIdx)}
                  style={{ padding: "6px 16px", borderRadius: 8, background: C.orange, color: C.bg, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>확정취소</button>
              )}
            </ConfirmBar>
          </>
        );
      })()}

      {/* 상대팀 변경 모달 — 논리 matchIdx로 교체 */}
      {opponentModalIdx !== null && (
        <Modal onClose={() => setOpponentModalIdx(null)} title="상대팀 변경">
          <OpponentSelector
            opponents={opponents}
            onSelect={(name) => { onSetMatchOpponent?.(opponentModalIdx, name); setOpponentModalIdx(null); }}
            onAddOpponent={onAddOpponent} onRemoveOpponent={onRemoveOpponent} onRenameOpponent={onRenameOpponent}
            styles={s} />
        </Modal>
      )}

    </div>
  );
}
