import { useState, useEffect, useRef } from 'react';
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
import { resolvePair, setupPoolA, setupPoolB, sidePool, canIntra, mergeFormationState, teamsOf } from '../../utils/intraSoccer/pools';
import { planAddEvent, planDeleteEvent, sideBSwapPatch, sideBCorrectPatch, pickSidePatch } from '../../utils/intraSoccer/handlers';
import { formationFingerprint, decideRemount } from '../../utils/intraSoccer/liveSync';
// 빅마스터FC 기록화면 = SoccerMatchView(하버FC) 포크. 외부전 경로는 원본과 동일하고,
// 자체전(A팀 vs B팀)은 한 경기 객체에 두 편을 저장한 뒤 A/B 탭으로 한 기기에서 기록한다.
// 단일 navIdx 연속체로 [과거 경기…] + [진행중/새 경기]를 오간다(풋살 ScheduleMatchView 패턴).
// 노드 본문 결정 권위 = navIdx + 경기 status. viewState는 서브플로우(formation/formationA/formationB)와 유휴만.
// ⚠️ 저장된 경기 객체는 반드시 sideView(m, side)를 거쳐 읽는다 — A/B 편 필드와 시점 이벤트가 여기서만 정리된다.
export default function IntraSoccerMatchView({
  soccerMatches, currentMatchIdx, attendees, opponents,
  onCreateMatch, onAddEvent, onDeleteEvent, onFinishMatch,
  onUpdateMatchFormation, onCreateRestMatch,
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
  // [자체전] 경기 유형·A 배치 임시 저장·기록 탭
  // 전부 로컬(RTDB 미동기) — 한 기기 한 기록자 전제. 새로고침 시 자체전 배치 단계는 처음부터 다시 한다.
  // 편 이름/명단은 로컬이 아니라 시트 → savedFormation.intra(동기 필드)에서 온다(아래 파생값).
  const [matchType, setMatchType] = useState(null);            // '자체전' | '외부전' | null(선택 전)
  const [pendingA, setPendingA] = useState(null);              // 자체전 A 배치 결과(FormationSetup onConfirm)
  const [tab, setTab] = useState('A');                         // 기록 탭 'A' | 'B'

  // 멀티탭 동기화: 서브플로우 상태만 따라감(playing/selectOpponent는 노드 권위가 아니므로 sync에서 제외).
  useEffect(() => {
    if (savedFormation?.viewState === "formation") setViewState("formation");
  }, [savedFormation?.viewState]);
  useEffect(() => { setSelectedOpponent(savedFormation?.selectedOpponent || null); }, [savedFormation?.selectedOpponent]);
  useEffect(() => { setSelectedPlayers(savedFormation?.selectedPlayers || []); }, [savedFormation?.selectedPlayers]);

  // ⚠️ soccerFormation은 whole-replace 동기 필드 — savedFormation을 펼치지 않으면 저장 한 번에
  // intra(시트 팀 명단)가 RTDB에서 사라진다. 병합은 mergeFormationState 한 군데서만 한다.
  const saveFormationState = (updates) => {
    onFormationChange?.(mergeFormationState(savedFormation, { viewState, selectedOpponent, selectedPlayers }, updates));
  };

  // [증분 2] 팀 명단·선택 쌍은 시트 → soccerFormation.intra (IntraSoccerApp이 채운다). 편 이름은 팀 이름 그대로.
  const intra = savedFormation?.intra || { teams: [] };
  // teamsOf 가 배열화·players 배열화까지 단일 지점에서 보장한다(RTDB 객체화 방어, pools.js).
  const teams = teamsOf(savedFormation);
  const pair = resolvePair(teams, intra.selectedPair);
  const teamA = teams[pair[0]] || null, teamB = teams[pair[1]] || null;
  const gate = canIntra({ teams, attendees, pair });
  // teams 를 다시 써 넣어 쓰기 경로도 치유한다 — intra.teams 가 RTDB 에서 객체화된 채로
  // 읽혔더라도 이 저장 이후에는 정규화된 배열 모양으로 남는다.
  const setPair = (p) => saveFormationState({ intra: { ...intra, teams, selectedPair: p } });

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

  // ── [증분 3] 실시간 전파: 원격 배치 변경이 오면 레코더를 새 props 로 재마운트한다(스펙 §14.3) ──
  // FormationRecorder 는 uncontrolled(배치를 마운트 시 1회 시드, FormationRecorder.jsx:24-27)라
  // prop 변경만으로는 화면이 갱신되지 않고, 갱신 없이 내가 다음 교체를 하면 stale 배치를 기준으로
  // 저장해 남의 변경을 조용히 되돌린다(스펙 §14.2). 이벤트·점수는 이미 prop 파생이라 지문에서 제외한다.
  // ⚠️ 아래 두 값은 진행중 노드 IIFE 밖(최상위)에서 한 번만 계산한다 — 훅 의존성으로 써야 하고,
  // 지문과 렌더가 서로 다른 편(side)을 보면 판정이 틀린다. IIFE 안에서 재계산하지 말 것.
  const liveSide = currentMatch && isIntra(currentMatch) ? tab : 'A';
  const liveFp = currentMatch ? formationFingerprint(sideView(currentMatch, liveSide)) : '';
  const [recorderRev, setRecorderRev] = useState(0);   // 레코더 key 의 세대 번호(증가 = 재마운트)
  const [pendingRemote, setPendingRemote] = useState(false);
  const [busy, setBusy] = useState(false);             // 레코더가 onBusyChange 로 알려주는 '입력 중'
  const seedFpRef = useRef('');                        // 지금 마운트된 레코더가 시드로 받은 지문
  const localFpsRef = useRef(new Set());               // 내가 보냈지만 아직 echo 가 안 온 지문들

  // (A) 경기·편이 바뀌면 새 시드 — liveFp 를 의존성에 넣지 않는다(넣으면 시드가 매 변경을 따라가
  //     currentFp === seedFp 가 항상 성립해 재마운트가 영영 일어나지 않는다).
  useEffect(() => {
    seedFpRef.current = liveFp;
    localFpsRef.current = new Set();
    setPendingRemote(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMatch?.matchIdx, liveSide]);

  // (B) 재마운트 판정 — 같은 렌더에서 effect 는 선언 순서대로 실행되므로 (A) 초기화가 항상 먼저다.
  // 불변식 두 개를 지킨다: seedFpRef = '지금 마운트된 레코더가 화면에 들고 있는 배치',
  // localFpsRef = '그 마운트 이후 내가 보낸 예상 지문들'. 둘이 어긋나면 오판이 난다 —
  //   · consume 때 시드를 안 올리면: 시드(옛 상태) ≠ 화면(내 변경)이라, 다음 무관한 업데이트
  //     (원격 골 하나로도 currentMatch 참조가 바뀐다)에서 내 변경이 원격으로 재판정돼 헛재마운트
  //     → 열려 있던 상대골 메뉴(onBusyChange 대상이 아니다)가 손 밑에서 닫힌다.
  //   · 재마운트 때 예상 지문을 안 비우면: 시드는 원격 상태인데 내 옛 예상이 남아, 뒤늦게 도착한
  //     내 쓰기(통짜 쓰기라 원격 배치를 덮는다)를 echo 로 보고 넘겨 화면이 시트와 영구히 갈린다.
  useEffect(() => {
    if (!currentMatch) return;                         // 종료 전파로 currentMatchIdx=-1 → 무의미한 rev 증가 방지
    const r = decideRemount({ currentFp: liveFp, seedFp: seedFpRef.current, localFps: localFpsRef.current, busy });
    if (r.consume) { localFpsRef.current.delete(r.consume); seedFpRef.current = liveFp; }
    if (r.remount) { seedFpRef.current = liveFp; localFpsRef.current = new Set(); setRecorderRev(n => n + 1); }
    setPendingRemote(r.pending);
  }, [liveFp, busy, currentMatch]);

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

  // [증분 3] 동시 생성 가드(스펙 §14.4) — 다른 기기가 이미 경기를 시작했으면 생성하지 않고
  // 배치 상태를 정리해 유형 카드로 돌려보낸다. 그냥 만들면 같은 soccerMatches/{idx} 경로를 두 기기가 노린다.
  // 정직한 범위: '이미 진행 중 경기가 있는' 경우만 막는다(경기 0개에서 완전 동시 생성은 비범위, 스펙 §14.5).
  const hasRemoteStart = () => {
    if (!soccerMatches.some(m => m.status === 'playing')) return false;
    alert('다른 기기에서 이미 경기를 시작했습니다.');
    setPendingA(null);
    setMatchType(null);
    setViewState('selectOpponent');
    return true;
  };

  // 포메이션 확정 → 경기 생성(status playing). viewState는 유휴로 복귀(노드는 status에서 파생).
  const handleFormationConfirm = ({ formation, assignments, gk, positionMap, subs }) => {
    if (hasRemoteStart()) return;
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

  // [자체전] 경기 유형 카드 → A 배치. 이름 검증은 없다 — 파서가 "휴식"·중복 팀명을 이미 거른다.
  const startIntra = () => {
    if (!gate.ok || !teamA || !teamB) return;
    setMatchType("자체전");
    setViewState("formationA");
  };

  // [자체전] B 배치 확정 → 경기 1개 생성(A = 기존 '우리' 필드) + 편 이름/ B 편 전 필드 patch.
  // newIdx는 CREATE_SOCCER_MATCH가 부여하는 matchIdx(= 현재 길이, append-only 불변식)와 같다.
  const handleIntraConfirm = (resA, resB) => {
    // ⚠️ 경기 생성 "전에" 터뜨린다 — onPatchSide가 없으면 sideB 없는 경기(= 유령 팀 상대 외부전)가
    // 남아 세션 전체가 잘못 기록된다. 생성 후에 던지면 이미 만들어진 경기를 되돌릴 수 없다.
    if (typeof onPatchSide !== "function") throw new Error("IntraSoccerMatchView: onPatchSide prop이 필요합니다(자체전 B 편 저장 불가)");
    // 배치 중 다른 탭이 명단을 재연동해 선택 쌍이 사라질 수 있다 — 이름 없이 생성하면 유령 경기가 된다.
    if (!teamA || !teamB) return;
    // 동시 생성 가드는 onPatchSide 가드 뒤 — 규약 위반(prop 미연결)은 조용히 넘기지 않는다.
    if (hasRemoteStart()) return;
    const lineupA = Object.values(resA.assignments), lineupB = Object.values(resB.assignments);
    const newIdx = soccerMatches.length;
    // A 벤치에서 B 선발을 뺀다 — resA.subs는 "A 풀 − A 11명"(A 풀 = A 팀 명단 ∪ 유동 인원)이고
    // 유동 인원(팀 열에 없는 참석자)은 B 풀에도 들어가므로, A 벤치에 남은 유동 인원이 B 선발로 뽑힐 수 있다.
    const bStarters = new Set(lineupB);
    onCreateMatch({
      opponent: teamB.name, lineup: lineupA, gk: resA.gk, defenders: defendersFromPositionMap(resA.positionMap),
      subs: resA.subs.filter(n => !bStarters.has(n)),
      formation: resA.formation, assignments: resA.assignments, positionMap: resA.positionMap,
    });
    // 옵셔널 체이닝 없음 — onCreateMatch/onAddEvent/onFinishMatch와 같은 규약(위 가드 참조).
    onPatchSide(newIdx, 'A', { name: teamA.name });
    onPatchSide(newIdx, 'B', {
      name: teamB.name, lineup: lineupB, gk: resB.gk, defenders: defendersFromPositionMap(resB.positionMap),
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
    // [증분 3] 내가 보낸 변경의 왕복 echo 를 원격 변경으로 오인해 재마운트하지 않도록 예상 지문을 남긴다.
    // 저장 경로(리듀서 UPDATE_SOCCER_MATCH_FORMATION · PATCH_SOCCER_SIDE)가 지문 대상 5필드를 모두
    // 화이트리스트로 반영하므로 {현재 편 뷰 + updates} 가 곧 도착할 상태다.
    if (currentMatch) {
      const fps = localFpsRef.current;
      fps.add(formationFingerprint({ ...sideView(currentMatch, side), ...updates }));
      while (fps.size > 8) fps.delete(fps.values().next().value);   // Set 은 삽입 순서 보존 — 오래된 것부터
    }
    if (side === 'B') onPatchSide?.(currentMatchIdx, 'B', pickSidePatch(updates));
    else onUpdateMatchFormation?.(currentMatchIdx, updates);
  };

  // [증분 2] 종료 = 확정(수정 불가) — 확정취소·출전 수정·상대팀 변경을 제공하지 않는다(외부전 포함, 스펙 §13).
  // 리듀서 REOPEN_SOCCER_MATCH는 남아 있으나 빅마스터FC 화면에서는 도달 불가(onReopenMatch를 쓰지 않는다).

  // [증분 3] 종료된 경기 입력 차단(스펙 §14.4). 두 핸들러가 같은 문구·같은 조건을 쓰도록 한 군데로 모은다.
  // 정직한 범위: status 가 전파되면 레코더 자체가 사라지므로(isPlayingNode) 이것은 같은 틱에 진행 중이던
  // 클릭을 막는 방어 심화다. 전파 이전 0.3~1초 창에 찍힌 입력은 막지 못한다(스펙 §14.5).
  const isMatchLive = () => {
    if (currentMatch && currentMatch.status === 'playing') return true;
    alert('다른 기기에서 이미 종료된 경기입니다. 잠시 후 화면이 갱신됩니다.');
    return false;
  };

  // 레코더 이벤트 입력. 자체전 "⚽ 상대골"은 저장하지 않고 상대 편 탭으로 가는 단축키가 된다.
  const handleAddEvent = (event, side) => {
    if (!isMatchLive()) return;
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
    if (!isMatchLive()) return;
    for (const a of planDeleteEvent(currentMatch, currentMatchIdx, eventId)) {
      if (a.type === 'DELETE_SOCCER_EVENT') onDeleteEvent(a.matchIdx, a.eventId);
      else if (a.type === 'PATCH_SOCCER_SIDE') onPatchSide?.(a.matchIdx, a.side, a.patch);
    }
  };

  // 경기 종료. viewState 유휴 유지, navIdx는 구조 변경으로 새 경기 노드로 자동 이동.
  // 최종 배치는 종료를 누른 탭의 편으로 라우팅한다(B 탭 종료가 A 배치를 덮지 않게).
  const handleFinishMatch = (finalSnapshot, side) => {
    // [증분 3] 이벤트 입력과 같은 가드 — 반드시 최종 배치 전송 "전에". 다른 기기가 이미 종료한 경기에
    // 늦은 종료 press 가 들어오면 종료된 경기에 배치 스냅샷을 덮어쓴다.
    if (!isMatchLive()) return;
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
  // 풀은 그 팀 명단 ∪ 유동 인원(팀 열에 없는 참석자) ∩ 참석자 — 상대 팀 소속은 애초에 고를 수 없다.
  // teamA/teamB가 null이면(명단 재연동으로 선택 쌍 소멸) 조기 반환을 건너뛰어 유형 카드로 돌아간다.
  if (viewState === "formationA" && teamA) {
    return (
      <FormationSetup key="setup-intra-A" selectedPlayers={setupPoolA({ teams, a: pair[0], attendees })} title={`${teamA.name} 선발 11명`}
        onConfirm={(resA) => { setPendingA(resA); setViewState("formationB"); }}
        onBack={() => { setPendingA(null); setMatchType(null); setViewState("selectOpponent"); }} />
    );
  }
  if (viewState === "formationB" && pendingA && teamA && teamB) {
    const poolB = setupPoolB({ teams, b: pair[1], attendees, aAssigned: Object.values(pendingA.assignments) });
    return (
      <FormationSetup key="setup-intra-B" selectedPlayers={poolB} title={`${teamB.name} 선발 11명`}
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
    // 자체전은 참석자 대신 sidePool — 자기 팀 명단 ∪ 유동 인원으로 좁히고 상대 편 피치 위 선수를 뺀다.
    const bench = getNonPlayers(v, sidePool(m, side, attendees, teams));
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

  const navLabel = atNewNode ? `제${soccerMatches.length + 1}경기` : `제${node.matchIdx + 1}경기`;
  const navStatusText = atNewNode ? "새 경기" : isRest ? "휴식" : isPlayingNode ? "진행중" : "종료됨";
  const navStatusTone = isPlayingNode ? "orange" : atNewNode ? "gray" : "green";

  const goPrev = () => { if (safeNavIdx > 0 && !navLocked) setNavIdx(safeNavIdx - 1); };
  const goNext = () => { if (safeNavIdx < totalNodes - 1 && !navLocked) setNavIdx(safeNavIdx + 1); };

  // [증분 2] 종료된 경기는 읽기 전용 — 출전 수정·상대팀 변경 버튼을 아예 렌더하지 않는다.
  const canEditNode = !!node && !atNewNode && !isRest && node.status !== "finished";
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

      {canEditNode && (
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
              {/* 편 이름·명단은 시트가 정한다(입력 없음). 팀이 3개 이상이면 맞붙을 두 팀을 고른다 — selectedPair는 동기 필드. */}
              {teams.length >= 3 && (
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  {[0, 1].map(k => (
                    <select key={k} value={pair[k]} onChange={e => { const v = Number(e.target.value); const other = pair[1 - k]; if (v !== other) setPair(k === 0 ? [v, other] : [other, v]); }}
                      style={{ ...s.input, flex: 1, minWidth: 0 }}>
                      {/* t.players: teamsOf 가 배열을 보장하므로 여기서 다시 || [] 방어할 필요가 없다. */}
                      {teams.map((t, i) => <option key={t.name} value={i}>{t.name} ({t.players.filter(n => attendees.includes(n)).length}명)</option>)}
                    </select>
                  ))}
                </div>
              )}
              <button onClick={startIntra} disabled={!gate.ok}
                style={{ ...s.btnFull(C.accent, C.bg), marginBottom: 8, opacity: gate.ok ? 1 : 0.4, cursor: gate.ok ? "pointer" : "not-allowed" }}>
                {gate.ok ? `자체전 (${teamA.name} vs ${teamB.name} · 참석 ${attendees.length}명)` : `자체전 — ${gate.reason}`}
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
        const isIntraMatch = isIntra(currentMatch);
        const side = liveSide;                           // 최상위 파생 재사용 — 지문(liveFp)과 같은 편을 보장
        const v = sideView(currentMatch, side);          // 기록 탭의 '하버FC 모양' 경기
        const live = reconstructFormation(v);
        const scoreA = isIntraMatch ? calcSoccerScore(sideView(currentMatch, 'A').events) : null;
        return (
          <>
            {isIntraMatch && (
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
            {isIntraMatch && (
              <div style={{ textAlign: "center", fontSize: 18, fontWeight: 900, color: C.white, marginBottom: 8 }}>
                {fieldsOfA(currentMatch).name} {scoreA.ourScore} : {scoreA.opponentScore} {fieldsOfB(currentMatch).name}
              </div>
            )}
            {/* 위 헤더는 항상 A:B, 아래 레코더의 점수판은 '현재 편 : 상대 편' — 모순으로 읽히지 않게 기준을 명시한다 */}
            {isIntraMatch && (
              <div style={{ textAlign: "center", fontSize: 11, color: C.gray, marginBottom: 6 }}>
                아래는 {side === "A" ? fieldsOfA(currentMatch).name : fieldsOfB(currentMatch).name} 시점 점수판
              </div>
            )}
            {/* [증분 3] 입력 중(골 플로우·모달) 도착한 원격 배치 변경은 입력을 마칠 때까지 보류한다 —
                손 밑에서 모달이 닫히지 않게. busy 가 풀리면 effect (B)가 재실행돼 자동 반영된다. */}
            {pendingRemote && (
              <div style={{ textAlign: "center", fontSize: 11, color: C.orange, marginBottom: 6 }}>
                다른 기기에서 배치가 변경됐습니다 · 입력을 마치면 화면에 반영됩니다
              </div>
            )}
            {/* key 에 recorderRev — 원격 배치 변경이 오면 세대를 올려 재마운트해 최신 배치로 재시드한다
                (uncontrolled 레코더라 prop 변경만으로는 안 보이고, stale 배치 기준 저장이 남의 변경을 덮는다). */}
            <FormationRecorder
              key={`${currentMatch.matchIdx}:${side}:${recorderRev}`}
              formation={live.formation} assignments={live.assignments} positionMap={live.positionMap}
              gk={live.gk} attendees={sidePool(currentMatch, side, attendees, teams)} opponent={v.opponent}
              startedAt={currentMatch.startedAt || Date.now()} events={v.events || []}
              onAddEvent={(ev) => handleAddEvent(ev, side)} onDeleteEvent={handleDeleteEvent}
              onFinishMatch={(snap) => handleFinishMatch(snap, side)}
              onStateChange={(updates) => handleFormationStateChange(updates, side)} onFlowActiveChange={setNavLocked}
              onBusyChange={setBusy}
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
                    {/* 자체전은 이 패널 전체가 A 시점이라 출전 줄도 A 편 — 편 이름을 붙여 B 줄과 구분한다 */}
                    <span style={{ fontWeight: 700, color: C.white }}>{nodeIntra ? `${fieldsOfA(node).name} ` : ""}출전 ({played.length}):</span> {played.join(", ")}
                  </div>
                )}
                {nodeIntra && (() => {
                  const playedB = getSoccerPlayedPlayers(sideView(node, 'B'));
                  return playedB.length > 0 && (
                    <div style={{ marginTop: 4, fontSize: 11, color: C.grayLight, textAlign: "center", lineHeight: 1.6 }}>
                      <span style={{ fontWeight: 700, color: C.white }}>{fieldsOfB(node).name} 출전 ({playedB.length}):</span> {playedB.join(", ")}
                    </div>
                  );
                })()}
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
              <span style={{ color: C.green, fontWeight: 700, fontSize: 13 }}>제{node.matchIdx + 1}경기 {isRest ? "휴식" : "종료됨 · 확정(수정 불가)"}</span>
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
