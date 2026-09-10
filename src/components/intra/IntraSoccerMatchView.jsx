import { useState, useEffect } from 'react';
import { goalLabel } from '../../utils/soccerGoalEvent';
import { useTheme } from '../../hooks/useTheme';
import { calcSoccerScore, getCleanSheetPlayers, getSoccerPlayedPlayers, getNonPlayers, soccerResultLabel } from '../../utils/soccerScoring';
import { generateEventId } from '../../utils/idGenerator';
import { FORMATIONS, defendersFromPositionMap } from '../../utils/formations';
import Modal from '../common/Modal';
import OpponentSelector from '../game/OpponentSelector';
import FormationSetup from '../game/FormationSetup';
import FormationRecorder from '../game/FormationRecorder';
import FormationPitch from '../game/FormationPitch';
import LineupEditView from '../game/LineupEditView';
import RoundNav from '../game/RoundNav';
import ConfirmBar from '../game/ConfirmBar';
import { isIntra, sideView, fieldsOfA, fieldsOfB } from '../../utils/intraSoccer/sideView';
import { subPool } from '../../utils/intraSoccer/subPool';
import { planAddEvent, planDeleteEvent, sideBSwapPatch, sideBCorrectPatch, pickSidePatch } from '../../utils/intraSoccer/handlers';
// 빅마스터FC 기록화면 = SoccerMatchView(하버FC) 포크. 외부전 경로는 원본과 동일하고,
// 자체전(A팀 vs B팀)은 한 경기 객체에 두 편을 저장한 뒤 A/B 탭으로 한 기기에서 기록한다.
// 단일 navIdx 연속체로 [과거 경기…] + [진행중/새 경기]를 오간다(풋살 ScheduleMatchView 패턴).
// 노드 본문 결정 권위 = navIdx + 경기 status. viewState는 서브플로우(formation/formationA/formationB)와 유휴만.
// ⚠️ 저장된 경기 객체는 반드시 sideView(m, side)를 거쳐 읽는다 — A/B 편 필드와 시점 이벤트가 여기서만 정리된다.
export default function IntraSoccerMatchView({
  soccerMatches, currentMatchIdx, attendees, opponents,
  onCreateMatch, onAddEvent, onDeleteEvent, onFinishMatch,
  onUpdateMatchFormation, onReopenMatch, onCreateRestMatch,
  onAddOpponent, onRemoveOpponent, onRenameOpponent, onGoToSummary, gameSettings, styles: s,
  savedFormation, onFormationChange,
  onSetMatchOpponent, onCorrectLineup, onSwapLineupPositions, gameFinalized,
  onPatchSide,
}) {
  const { C } = useTheme();

  // 서브플로우 뷰 상태만 유지: "selectOpponent"(유휴) / "formation" / 자체전 "formationA" · "formationB"
  const [viewState, setViewState] = useState(() =>
    savedFormation?.viewState === "formation" ? savedFormation.viewState : "selectOpponent");
  const [selectedOpponent, setSelectedOpponent] = useState(savedFormation?.selectedOpponent || null);
  const [selectedPlayers, setSelectedPlayers] = useState(savedFormation?.selectedPlayers || []);
  const [navLocked, setNavLocked] = useState(false);            // goalFlow 열림 중 ◀▶ 잠금
  const [opponentModalIdx, setOpponentModalIdx] = useState(null); // 상대팀 변경 모달 대상 matchIdx
  const [lineupEdit, setLineupEdit] = useState(null);             // 라인업 편집기 대상 { matchIdx, side }
  // [자체전] 경기 유형·편 이름·A 배치 임시 저장·기록 탭
  // 전부 로컬(RTDB 미동기) — 한 기기 한 기록자 전제. 새로고침 시 자체전 배치 단계는 처음부터 다시 한다
  // (saveFormationState의 저장 모양은 원본과 동일하게 유지 = 외부전 멀티탭 복원 계약 불변).
  const [matchType, setMatchType] = useState(null);            // '자체전' | '외부전' | null(선택 전)
  const [sideNames, setSideNames] = useState({ A: 'A팀', B: 'B팀' });
  const [pendingA, setPendingA] = useState(null);              // 자체전 A 배치 결과(FormationSetup onConfirm)
  const [tab, setTab] = useState('A');                         // 기록 탭 'A' | 'B'

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
    setMatchType(null);
    setViewState("selectOpponent");
    saveFormationState({ viewState: "selectOpponent", selectedOpponent: null, selectedPlayers: [] });
  };

  // [자체전] 경기 유형 카드 → A 배치. 이름은 여기서 확정(생성 후 변경 비범위)하므로 미리 정규화한다.
  const startIntra = () => {
    const a = (sideNames.A || '').trim() || 'A팀';
    const b = (sideNames.B || '').trim() || 'B팀';
    // "휴식"은 휴식 라운드 노드(opponent === "휴식")와 구분이 불가능해 편 이름으로 쓸 수 없다.
    if (a === "휴식" || b === "휴식") { alert('팀 이름으로 "휴식"은 쓸 수 없습니다(휴식 라운드와 구분 불가).'); return; }
    if (a === b) { alert("A팀과 B팀 이름이 같습니다. 서로 다르게 정해주세요."); return; }
    setSideNames({ A: a, B: b });
    setMatchType("자체전");
    setViewState("formationA");
  };

  // [자체전] B 배치 확정 → 경기 1개 생성(A = 기존 '우리' 필드) + 편 이름/ B 편 전 필드 patch.
  // newIdx는 CREATE_SOCCER_MATCH가 부여하는 matchIdx(= 현재 길이, append-only 불변식)와 같다.
  const handleIntraConfirm = (resA, resB) => {
    // ⚠️ 경기 생성 "전에" 터뜨린다 — onPatchSide가 없으면 sideB 없는 경기(= 유령 팀 상대 외부전)가
    // 남아 세션 전체가 잘못 기록된다. 생성 후에 던지면 이미 만들어진 경기를 되돌릴 수 없다.
    if (typeof onPatchSide !== "function") throw new Error("IntraSoccerMatchView: onPatchSide prop이 필요합니다(자체전 B 편 저장 불가)");
    const lineupA = Object.values(resA.assignments), lineupB = Object.values(resB.assignments);
    const newIdx = soccerMatches.length;
    // A 벤치에서 B 선발을 뺀다 — resA.subs는 A 배치 시점의 "참석자 − A 11명"이라 B 로스터 전원을 포함한다.
    const bStarters = new Set(lineupB);
    onCreateMatch({
      opponent: sideNames.B, lineup: lineupA, gk: resA.gk, defenders: defendersFromPositionMap(resA.positionMap),
      subs: resA.subs.filter(n => !bStarters.has(n)),
      formation: resA.formation, assignments: resA.assignments, positionMap: resA.positionMap,
    });
    // 옵셔널 체이닝 없음 — onCreateMatch/onAddEvent/onFinishMatch와 같은 규약(위 가드 참조).
    onPatchSide(newIdx, 'A', { name: sideNames.A });
    onPatchSide(newIdx, 'B', {
      name: sideNames.B, lineup: lineupB, gk: resB.gk, defenders: defendersFromPositionMap(resB.positionMap),
      subs: resB.subs, formation: resB.formation, assignments: resB.assignments, positionMap: resB.positionMap,
    });
    // 생성 후 정리는 handleFormationConfirm(외부전)과 동일 — 안 지우면 배치 화면에 갇혀 유령 경기가 생긴다.
    setPendingA(null);
    setMatchType(null);
    setTab('A');
    setViewState("selectOpponent");
    saveFormationState({ viewState: "selectOpponent", selectedOpponent: null, selectedPlayers: [] });
  };

  // 레코더가 내보낸 배치 변경(교체·위치교대·포메이션·퇴장) → 기록 중인 편으로 라우팅.
  const handleFormationStateChange = (updates, side) => {
    if (side === 'B') onPatchSide?.(currentMatchIdx, 'B', pickSidePatch(updates));
    else onUpdateMatchFormation?.(currentMatchIdx, updates);
  };

  // 끝난 경기 다시 열기(풀편집). viewState/navIdx는 손대지 않음 — 구조 변경으로 navIdx가 자동 리셋된다.
  const handleReopenMatch = (matchIdx) => {
    const m = soccerMatches.find(x => x.matchIdx === matchIdx);
    if (!m) return;
    const vA = sideView(m, 'A');   // 자체전은 B 편 이름, 외부전은 m.opponent와 동일
    if (!confirm(`제${matchIdx + 1}경기 (vs ${vA.opponent}) 기록을 다시 열어 수정하시겠습니까?`)) return;
    onReopenMatch?.(matchIdx);
    // 레거시 승격은 A 편만 — B 편은 항상 FormationSetup이 배치를 남긴다.
    if (!(vA.formation && vA.assignments && vA.positionMap)) {
      onUpdateMatchFormation?.(matchIdx, reconstructFormation(vA));
    }
  };

  // 레코더 이벤트 입력. 자체전 "⚽ 상대골"은 저장하지 않고 상대 편 탭으로 가는 단축키가 된다.
  const handleAddEvent = (event, side) => {
    const ev = { ...event, id: event.id || generateEventId(), timestamp: event.timestamp || Date.now() };
    const plan = planAddEvent(currentMatch, side, ev);
    if (plan.kind === 'redirect') {
      setTab(plan.toSide);
      const nm = plan.toSide === 'A' ? fieldsOfA(currentMatch).name : fieldsOfB(currentMatch).name;
      alert(`${nm} 골은 ${nm} 탭에서 득점자를 선택해 입력하세요.`);
      return;
    }
    onAddEvent(currentMatchIdx, plan.event);
  };
  // 삭제: 리듀서 DELETE는 A 편 교체만 되돌린다 — B 편 교체 되돌림 patch는 planDeleteEvent가 만든다.
  const handleDeleteEvent = (eventId) => {
    for (const a of planDeleteEvent(currentMatch, currentMatchIdx, eventId)) {
      if (a.type === 'DELETE_SOCCER_EVENT') onDeleteEvent(a.matchIdx, a.eventId);
      else if (a.type === 'PATCH_SOCCER_SIDE') onPatchSide?.(a.matchIdx, a.side, a.patch);
    }
  };

  // 경기 종료. viewState 유휴 유지, navIdx는 구조 변경으로 새 경기 노드로 자동 이동.
  // 최종 배치는 종료를 누른 탭의 편으로 라우팅한다(B 탭 종료가 A 배치를 덮지 않게).
  const handleFinishMatch = (finalSnapshot, side) => {
    if (finalSnapshot && typeof finalSnapshot === "object") handleFormationStateChange(finalSnapshot, side);
    onFinishMatch(currentMatchIdx);
    setNavLocked(false);
    setSelectedOpponent(null);
    setSelectedPlayers([]);
    setMatchType(null);
    setTab('A');
    setViewState("selectOpponent");
    saveFormationState({ viewState: "selectOpponent", selectedOpponent: null, selectedPlayers: [] });
  };

  // ── 서브플로우(전체화면, RoundNav 없음) ──
  if (viewState === "formation" && selectedOpponent) {
    // 풀은 상대 선택 시점 스냅샷(selectedPlayers)이 아니라 실시간 참석자.
    // 스냅샷을 쓰면 상대 선택 후 참석명단에 추가된 선수가 배치 화면에 안 보인다
    // (8/18 김래상 사고). 경기 중 교체 후보가 참석자 실시간 파생인 것과 대칭을 맞춘다.
    return (
      <FormationSetup key="setup-ext" selectedPlayers={attendees} onConfirm={handleFormationConfirm}
        onBack={() => setViewState("selectOpponent")} title={`vs ${selectedOpponent}`} />
    );
  }
  // [자체전] 배치 2단계 — A 11명 → (A에 뽑힌 선수 제외) B 11명. 결과는 B 확정 시 한 번에 생성.
  // ⚠️ key 필수 — FormationSetup은 내부 assignments를 useState로 들고 있고(uncontrolled),
  // A/B 단계가 트리 같은 자리의 같은 타입이라 key 없이는 B 화면이 A의 배치를 11/11로 물려받는다
  // (→ B 선발이 A와 같은 선수로 생성되는 사고). key가 다르면 단계 전환마다 remount = 빈 배치.
  // 대가: B에서 뒤로 가면 A 배치를 다시 지정해야 한다(FormationSetup은 초기 배치 prop이 없음).
  if (viewState === "formationA") {
    return (
      <FormationSetup key="setup-intra-A" selectedPlayers={attendees} title={`${sideNames.A} 선발 11명`}
        onConfirm={(resA) => { setPendingA(resA); setViewState("formationB"); }}
        onBack={() => { setPendingA(null); setMatchType(null); setViewState("selectOpponent"); }} />
    );
  }
  if (viewState === "formationB" && pendingA) {
    const aNames = new Set(Object.values(pendingA.assignments));
    const poolB = attendees.filter(n => !aNames.has(n));
    return (
      <FormationSetup key="setup-intra-B" selectedPlayers={poolB} title={`${sideNames.B} 선발 11명`}
        onConfirm={(resB) => handleIntraConfirm(pendingA, resB)}
        onBack={() => { setPendingA(null); setViewState("formationA"); }} />
    );
  }
  // 라인업 편집기(전체화면) — formation 서브플로우와 동일하게 조기 반환. 자체전은 편(side)별로 연다.
  if (lineupEdit !== null) {
    const m = soccerMatches.find(x => x.matchIdx === lineupEdit.matchIdx);
    if (!m) { setLineupEdit(null); return null; }
    const side = isIntra(m) ? lineupEdit.side : 'A';
    const v = sideView(m, side);
    const fm = reconstructFormation(v);
    // 정정 후보 = 참석자 − 출전자. m.subs(생성 시점 스냅샷) 대신 현재 참석자를 본다 —
    // 나중에 참석 처리된 지각자도 후보가 돼야 하기 때문. 출전자 제외는 CORRECT 중복 방지.
    // 자체전은 참석자 대신 subPool — 상대 편 피치 위 선수를 이 편으로 끌어오지 못하게 한다.
    const bench = getNonPlayers(v, subPool(m, side, attendees));
    const sideLabel = isIntra(m) ? (side === 'A' ? fieldsOfA(m).name : fieldsOfB(m).name) : `vs ${v.opponent}`;
    return (
      <LineupEditView
        formation={fm.formation} assignments={fm.assignments} bench={bench}
        title={`제${m.matchIdx + 1}경기 ${sideLabel} — 라인업 편집`}
        onSwapPositions={(aIdx, bIdx) => side === 'B'
          ? onPatchSide?.(m.matchIdx, 'B', sideBSwapPatch(m, aIdx, bIdx))
          : onSwapLineupPositions?.(m.matchIdx, aIdx, bIdx)}
        onCorrect={(out, inn) => {
          // remapPlayerInSoccerEvents가 이관하는 모든 필드를 커버
          const outHasRecords = (v.events || []).some(e =>
            e.player === out || e.assist === out || e.currentGk === out ||
            e.playerIn === out || e.playerOut === out);
          const msg = outHasRecords
            ? `${out}의 기록이 ${inn}로 이관됩니다. 계속?`
            : `${out}를 미출전 처리하고 ${inn}를 출전으로 바꿉니다. 계속?`;
          if (!confirm(msg)) return false;
          // B 편은 CORRECT_SOCCER_LINEUP을 쓰면 A 필드를 건드린다 — 편 patch + remapEvents로 처리.
          if (side === 'B') {
            const r = sideBCorrectPatch(m, out, inn);
            onPatchSide?.(m.matchIdx, 'B', r.patch, r.remapEvents);
          } else {
            onCorrectLineup?.(m.matchIdx, out, inn);
          }
          return true;
        }}
        onBack={() => setLineupEdit(null)}
      />
    );
  }

  // ── 연속체 노드 ──
  const atNewNode = safeNavIdx >= orderedMatches.length;      // 트레일링 새 경기 노드
  const node = atNewNode ? null : orderedMatches[safeNavIdx];
  const nodeA = node ? sideView(node, 'A') : null;             // 노드 읽기는 A 시점 뷰로(외부전은 node와 동일 참조)
  const isRest = !!nodeA && nodeA.opponent === "휴식";
  const isPlayingNode = !!node && node.status === "playing";
  const nodeIntra = isIntra(node);
  const canIntra = (attendees || []).length >= 22;             // 자체전은 양 편 선발 11+11 필요

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
  const openLineupEditor = (side) => {
    if (!node) return;
    if (navLocked) return; // 득점 입력(goalFlow) 중엔 레코더 언마운트=골 유실 → 진입 차단
    if (gameFinalized && !confirm("이미 구글시트로 전송(마감)된 경기입니다.\n라인업을 바꾸면 최종집계 화면의 '수정 후 재전송'으로 다시 전송해야 시트가 정합됩니다.\n계속하시겠습니까?")) return;
    // 레거시 경기(formation 미저장)는 SWAP이 raw assignments(null)로 no-op 되므로 modern 승격 후 편집.
    // A 편만 해당 — B 편은 FormationSetup이 항상 배치를 남기므로 승격할 레거시가 없다.
    if (side === 'A' && !(nodeA.formation && nodeA.assignments && nodeA.positionMap)) {
      onUpdateMatchFormation?.(node.matchIdx, reconstructFormation(nodeA));
    }
    setLineupEdit({ matchIdx: node.matchIdx, side });
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
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {(nodeIntra ? ["A", "B"] : ["A"]).map(sd => (
            <button key={sd} onClick={() => openLineupEditor(sd)} disabled={navLocked}
              style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, background: C.grayDark, color: navLocked ? C.gray : C.white, border: "none", cursor: navLocked ? "not-allowed" : "pointer", opacity: navLocked ? 0.5 : 1 }}>
              🔁 출전 수정{nodeIntra ? ` ${sd === "A" ? fieldsOfA(node).name : fieldsOfB(node).name}` : ""}
            </button>
          ))}
          {/* 자체전은 상대팀 = B 편 이름이고 생성 시 확정 — 상대팀 변경 없음 */}
          {!nodeIntra && (
            <button onClick={openOpponentModal}
              style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", cursor: "pointer" }}>
              🔁 상대팀 변경
            </button>
          )}
        </div>
      )}

      {/* 새 경기 노드 — 경기 유형(자체전/외부전) 선택 후 외부전만 상대팀 선택으로 넘어간다 */}
      {atNewNode && (
        <div style={{ ...s.card }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 10 }}>제{soccerMatches.length + 1}경기</div>
          {matchType === "외부전" ? (
            <>
              {/* 유형 선택으로 되돌아갈 길 — 없으면 외부전을 고른 뒤 자체전으로 못 돌아간다 */}
              <button onClick={() => { setMatchType(null); setSelectedOpponent(null); }}
                style={{ marginBottom: 8, fontSize: 12, padding: "4px 10px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", cursor: "pointer" }}>
                ← 경기 유형
              </button>
              <OpponentSelector opponents={opponents} onSelect={handleOpponentSelect} onAddOpponent={onAddOpponent}
                onRemoveOpponent={onRemoveOpponent} onRenameOpponent={onRenameOpponent} styles={s} />
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.white, marginBottom: 8 }}>경기 유형</div>
              {/* 편 이름은 경기 생성 시 확정된다(생성 후 변경 비범위) — 자체전 버튼보다 위에 둔다 */}
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input style={s.input} value={sideNames.A} onChange={e => setSideNames(n => ({ ...n, A: e.target.value }))} placeholder="A팀 이름" />
                <input style={s.input} value={sideNames.B} onChange={e => setSideNames(n => ({ ...n, B: e.target.value }))} placeholder="B팀 이름" />
              </div>
              <button onClick={() => { if (canIntra) startIntra(); }} disabled={!canIntra}
                style={{ ...s.btnFull(C.accent, C.bg), marginBottom: 8, opacity: canIntra ? 1 : 0.4, cursor: canIntra ? "pointer" : "not-allowed" }}>
                {canIntra ? `자체전 (${sideNames.A || "A팀"} vs ${sideNames.B || "B팀"} · 참석 ${attendees.length}명)` : `자체전 — 참석자 22명 이상 필요 (현재 ${attendees.length}명)`}
              </button>
              <button onClick={() => { setMatchType("외부전"); setViewState("selectOpponent"); }}
                style={s.btnFull(C.cardLight, C.white)}>외부전 (상대팀 선택)</button>
            </>
          )}
          <button onClick={() => { if (!confirm("이번 라운드를 휴식으로 처리하시겠습니까?")) return; onCreateRestMatch(); }}
            style={{ marginTop: 10, width: "100%", padding: "12px 0", borderRadius: 10, border: `1px dashed ${C.grayDark}`, background: "transparent", fontSize: 13, color: C.gray, cursor: "pointer" }}>
            😴 휴식 (이번 라운드 스킵)
          </button>
        </div>
      )}

      {/* 진행 중 노드 — FormationRecorder(편집). goalFlow 열림 중 ◀▶·A/B 탭 잠금. */}
      {isPlayingNode && currentMatch && (() => {
        const intra = isIntra(currentMatch);
        const side = intra ? tab : 'A';
        const v = sideView(currentMatch, side);          // 기록 탭의 '하버FC 모양' 경기
        const live = reconstructFormation(v);
        const scoreA = intra ? calcSoccerScore(sideView(currentMatch, 'A').events) : null;
        return (
          <>
            {intra && (
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                {["A", "B"].map(sd => {
                  const name = sd === "A" ? fieldsOfA(currentMatch).name : fieldsOfB(currentMatch).name;
                  return (
                    <button key={sd} disabled={navLocked} onClick={() => { if (!navLocked) setTab(sd); }}
                      style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", fontWeight: 800, cursor: navLocked ? "not-allowed" : "pointer",
                        background: tab === sd ? C.accent : C.cardLight, color: tab === sd ? C.bg : C.grayLight, opacity: navLocked && tab !== sd ? 0.4 : 1 }}>
                      {name} 기록{tab === sd ? "" : " →"}
                    </button>
                  );
                })}
              </div>
            )}
            {intra && (
              <div style={{ textAlign: "center", fontSize: 18, fontWeight: 900, color: C.white, marginBottom: 8 }}>
                {fieldsOfA(currentMatch).name} {scoreA.ourScore} : {scoreA.opponentScore} {fieldsOfB(currentMatch).name}
              </div>
            )}
            <FormationRecorder
              key={`${currentMatch.matchIdx}:${side}`}
              formation={live.formation} assignments={live.assignments} positionMap={live.positionMap}
              gk={live.gk} attendees={subPool(currentMatch, side, attendees)} opponent={v.opponent}
              startedAt={currentMatch.startedAt || Date.now()} events={v.events || []}
              onAddEvent={(ev) => handleAddEvent(ev, side)} onDeleteEvent={handleDeleteEvent}
              onFinishMatch={(snap) => handleFinishMatch(snap, side)}
              onStateChange={(updates) => handleFormationStateChange(updates, side)} onFlowActiveChange={setNavLocked}
            />
          </>
        );
      })()}

      {/* 과거(종료/휴식) 노드 — 읽기전용 요약 */}
      {node && !atNewNode && !isPlayingNode && (() => {
        const vA = nodeA;                                        // 점수·득점자·배치는 A 시점(자체전 점수 = A : B)
        const { ourScore, opponentScore } = calcSoccerScore(vA.events);
        const csPlayers = getCleanSheetPlayers(vA);
        const result = soccerResultLabel(ourScore, opponentScore);
        const resultColor = result === "승" ? C.green : result === "패" ? C.red : C.gray;
        // 그 경기의 배치(누가 어느 포지션으로 뛰었는지) 읽기전용. 모던=저장된 최종 배치, 레거시=재구성.
        const fm = isRest ? null : reconstructFormation(vA);
        const form = fm ? (FORMATIONS[fm.formation] || FORMATIONS["4-4-2"]) : null;
        // 출전 = lineup ∪ sub 투입 ∪ 최종 assignments(단일 소스 헬퍼).
        // sub 이벤트가 삭제돼 배치에만 남은 선수도 출전으로 표시(레드카드 퇴장자는 lineup이라 포함).
        const played = fm ? getSoccerPlayedPlayers(vA) : [];
        // 미출전 = 참석자 − 출전자. 자체전은 B 편 출전자도 빼야 한다(안 빼면 B 선발 11명이 미출전으로 뜬다).
        const benchNeverPlayed = fm
          ? (nodeIntra ? getNonPlayers(vA, getNonPlayers(sideView(node, 'B'), attendees)) : getNonPlayers(vA, attendees))
          : [];
        return (
          <>
            <div style={{ ...s.card, textAlign: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 900, margin: "8px 0" }}>
                <span style={{ color: ourScore > opponentScore ? C.green : C.white }}>{ourScore}</span>
                <span style={{ color: C.gray }}> : </span>
                <span style={{ color: opponentScore > ourScore ? C.red : C.white }}>{opponentScore}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>
                {nodeIntra ? `${fieldsOfA(node).name} vs ${fieldsOfB(node).name}` : `vs ${vA.opponent}`}
                {isRest ? "" : <span style={{ color: resultColor }}> — {result}</span>}
              </div>
              {csPlayers.length > 0 && <div style={{ fontSize: 11, color: C.yellow, marginTop: 6 }}>🛡 클린시트: {csPlayers.join(", ")}</div>}
            </div>
            {/* 자체전 B 편 득점 — 점수·배치 패널은 A 시점이라 B 득점자가 안 보인다 */}
            {nodeIntra && (() => {
              const vB = sideView(node, 'B');
              const goals = vB.events.filter(e => e.type === "goal").sort((a, b) => a.timestamp - b.timestamp);
              return goals.length > 0 && (
                <div style={{ ...s.card, marginBottom: 12, fontSize: 11, color: C.grayLight }}>
                  <b style={{ color: C.white }}>{fieldsOfB(node).name} 득점:</b> {goals.map(e => goalLabel(e.player, e.assist)).join(", ")}
                </div>
              );
            })()}
            {fm && (
              <div style={{ ...s.card, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 8, textAlign: "center" }}>📋 {nodeIntra ? `${fieldsOfA(node).name} ` : ""}포메이션 · {form.label}</div>
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
            {[...(vA.events || [])].filter(e => e.type !== "gkChange").sort((a, b) => a.timestamp - b.timestamp).map(e => (
              <div key={e.id} style={{ padding: "5px 10px", background: C.cardLight, borderRadius: 6, marginBottom: 3, fontSize: 11, color: C.white }}>
                {e.type === "goal" && `⚽ ${goalLabel(e.player, e.assist)}`}
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
