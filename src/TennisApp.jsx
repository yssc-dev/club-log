import { useEffect, useState, useMemo, useRef } from 'react';
import { useTennisReducer } from './hooks/useTennisReducer';
import { useTheme } from './hooks/useTheme';
import { makeStyles } from './styles/theme';
import { getEffectiveSettings } from './config/settings';
import FirebaseSync from './services/firebaseSync';
import TennisSync from './services/tennisSync';
import { normalizeTennisMatch } from './utils/tennis/normalizeTennisMatch';
import { buildTennisMatchRows, buildTennisPlayerGameRows, resolveGradeSource } from './utils/tennis/tennisRowBuilders';
import { nowKST } from './utils/tennis/tennisTime';
import { allRoundsConfirmed, isLastRoundConfirmed } from './utils/tennis/roundConfirm';
import TennisAttendeeSelector from './components/tennis/TennisAttendeeSelector';
import TennisRoundNav from './components/tennis/TennisRoundNav';
import TennisCourtCard from './components/tennis/TennisCourtCard';
import TennisConfirmBar from './components/tennis/TennisConfirmBar';
import MatchHeader from './components/game/MatchHeader';
import MatchTabBar from './components/game/MatchTabBar';
import Modal from './components/common/Modal';
import TennisAttendeeModal from './components/tennis/TennisAttendeeModal';
import TennisResultsModal from './components/tennis/TennisResultsModal';
import TennisPlayerStatsModal from './components/tennis/TennisPlayerStatsModal';
import TennisSummaryView from './components/tennis/TennisSummaryView';

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function TennisApp({ authUser, teamContext, isNewGame, gameMode: _gameMode, gameId, onLogout: _onLogout, onBackToMenu }) {
  const [state, dispatch] = useTennisReducer();
  const { C } = useTheme();
  const s = makeStyles(C);
  const [roster, setRoster] = useState([]);
  const [busy, setBusy] = useState(false);
  const [matchModal, setMatchModal] = useState(null);
  const team = teamContext?.team || '';

  useEffect(() => { TennisSync.getRoster().then(setRoster); }, []);

  // 등급 스냅샷 — 명부가 손에 들어오면 그 즉시 state에 고정한다.
  // "빈 맵 무시 / 최초 1회만 / phase==='done' 제외" 판단은 전부 리듀서가 하므로 여기선 조건 없이 던진다.
  useEffect(() => {
    if (!state.gameId || roster.length === 0) return;
    dispatch({
      type: 'SET_GRADE_SNAPSHOT',
      grades: Object.fromEntries(roster.filter(m => m && m.name).map(m => [m.name, m.grade || ''])),
    });
  }, [roster, state.gameId, dispatch]);

  // 신규 경기면 메타를 세팅하고, 아니면 RTDB에서 복원한다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isNewGame) {
      const date = todayLocal();
      dispatch({ type: 'SET_GAME_META', gameId, team, gameDate: date, season: Number(date.slice(0, 4)), gameCreator: authUser?.name || '' });
      const eff = getEffectiveSettings(team, '테니스');
      if (eff?.scoringRules) dispatch({ type: 'SET_SCORING_RULES', rules: eff.scoringRules });
      return;
    }
    FirebaseSync.loadStateReconstructed(team, gameId).then(raw => {
      if (raw) dispatch({ type: 'INIT_STATE', state: normalizeTennisMatch(raw) });
    });
  }, [isNewGame, gameId, team]);

  // 상태가 바뀔 때마다 RTDB에 통째로 저장한다. (테니스는 코트 수가 적어 diff 없이도 충분하다)
  const skipFirst = useRef(true);
  useEffect(() => {
    if (skipFirst.current) { skipFirst.current = false; return; }
    if (!team || !state.gameId) return;
    FirebaseSync.saveState(team, state.gameId, state).catch(() => {});
  }, [state, team]);

  const round = useMemo(
    () => state.rounds.find(r => r.roundIdx === state.viewingRoundIdx) || state.rounds[0],
    [state.rounds, state.viewingRoundIdx]);

  const usedNames = useMemo(() => {
    const set = new Set();
    for (const c of (round?.courts || [])) { c.sideA.forEach(n => set.add(n)); c.sideB.forEach(n => set.add(n)); }
    return set;
  }, [round]);

  const viewingConfirmed = !!(state.confirmedRounds || {})[state.viewingRoundIdx];
  const canAddRound = isLastRoundConfirmed(state.rounds, state.confirmedRounds);
  const canFinish = allRoundsConfirmed(state.rounds, state.confirmedRounds);

  const handleConfirmRound = () => {
    if (!confirm(`라운드 ${round.roundIdx}을 확정할까요?\n확정하면 이 라운드는 수정할 수 없습니다(확정취소로 해제 가능).`)) return;
    dispatch({ type: 'CONFIRM_ROUND', roundIdx: round.roundIdx });
  };
  const handleUnconfirmRound = () => {
    if (!confirm(`라운드 ${round.roundIdx} 확정을 취소할까요?\n취소하면 이 라운드를 다시 수정할 수 있습니다.`)) return;
    dispatch({ type: 'UNCONFIRM_ROUND', roundIdx: round.roundIdx });
  };

  // summary의 "기록확정" — 시트 전송 + FINALIZE. 실패 시 미확정 유지(기존 규칙).
  const handleSubmitRecords = async () => {
    setBusy(true);
    try {
      // 회원/용병 구분은 참석자 선택 시점에 확정된 state(attendees\guests)를 진실 소스로 삼는다.
      // (명부 재조회 roster는 로딩 실패·지연 시 비어 전원 게스트로 오기록되는 사고의 원인이었음.)
      // 등급은 경기 시작 때 박아둔 state.gradeSnapshot이 1순위 — 명부 로딩 실패와 무관해진다.
      const { memberSet, gradeByPlayer, fromSnapshot } = resolveGradeSource(state, roster);
      // 스냅샷도 명부도 없을 때만 경고 — 이때만 grade_at_date가 비어 포인트가 어긋날 수 있다.
      if (!fromSnapshot && roster.length === 0 &&
          !confirm('회원 명부를 불러오지 못했습니다. 등급 정보가 비어 포인트가 어긋날 수 있어요. 그래도 전송할까요?')) {
        return;
      }
      const inputTime = nowKST();
      const inputBy = authUser?.name || '';
      const matchRows = buildTennisMatchRows({ team, state, inputTime, inputBy, memberSet });
      const pgRows = buildTennisPlayerGameRows({ team, state, inputTime, inputBy, memberSet, gradeByPlayer });
      const results = await Promise.allSettled([
        TennisSync.writeMatches(matchRows),
        TennisSync.writePlayerGames(pgRows),
      ]);
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        alert(`전송 실패 ${failed.length}건 — 미확정 상태를 유지합니다.\n${failed.map(f => f.reason?.message).join('\n')}`);
        return;
      }
      dispatch({ type: 'FINALIZE' });
      alert('전송 완료 — 아카이브 저장으로 마무리하세요.');
    } finally {
      setBusy(false);
    }
  };

  // "아카이브 저장" — finalized 노드 보관 후 active 제거(풋살 Archive 관례).
  const handleArchive = async () => {
    setBusy(true);
    try {
      await FirebaseSync.saveFinalized(team, state.gameId, { ...state, gameFinalized: true });
      await FirebaseSync.clearState(team, state.gameId);
      alert('아카이브 완료');
      onBackToMenu();
    } catch (e) {
      alert(`아카이브 실패 — 데이터 보존을 위해 경기를 지우지 않았습니다.\n${e?.message || ''}`);
    } finally {
      setBusy(false);
    }
  };

  const deleteTennisGame = async () => {
    if (!confirm('오늘의 테니스 경기 기록이 모두 삭제됩니다.\n이 작업은 되돌릴 수 없습니다. 삭제하시겠습니까?')) return;
    if (!confirm('정말 삭제하시겠습니까? 되돌릴 수 없습니다.')) return;
    await FirebaseSync.clearState(team, state.gameId);
    onBackToMenu();
  };

  if (state.phase === 'setup') {
    return (
      <div style={s.app}>
        <div style={s.header}>
          <div style={s.title}>🎾 테니스</div>
          <div style={s.subtitle}>{state.gameDate} · 참석자 설정</div>
        </div>
        <TennisAttendeeSelector roster={roster} attendees={state.attendees} guests={state.guests}
          gameDate={state.gameDate} dispatch={dispatch} C={C} styles={s}
          scoringRules={state.scoringRules}
          onStart={() => dispatch({ type: 'ADD_ROUND' })} />
      </div>
    );
  }

  if (state.phase === 'summary' || state.phase === 'done') {
    return (
      <div style={s.app}>
        <div style={s.header}>
          <div style={s.title}>🎾 경기 마감</div>
          <div style={s.subtitle}>{state.gameDate} · 기록 확인</div>
        </div>
        <TennisSummaryView state={state} isAdmin={teamContext?.role === '관리자'} busy={busy}
          onBack={() => dispatch({ type: 'SET_PHASE', phase: 'playing' })}
          onSubmit={handleSubmitRecords} onArchive={handleArchive} C={C} styles={s} />
      </div>
    );
  }

  return (
    <div style={s.app}>
      <MatchHeader
        title="경기 진행"
        subtitle={`${state.gameDate} · 테니스 · ${state.rounds.length}라운드`}
        onHome={onBackToMenu}
      >
        <MatchTabBar tabs={[
          { key: 'attendees',  label: '참석명단', onClick: () => setMatchModal('attendees') },
          { key: 'results',    label: '오늘 결과', onClick: () => setMatchModal('results') },
          { key: 'playerStats', label: '개인기록', onClick: () => setMatchModal('playerStats') },
          {
            key: 'finish', label: '경기 마감', tone: 'green',
            strong: canFinish,
            onClick: () => {
              if (!canFinish) {
                alert('모든 라운드를 확정해야 마감할 수 있습니다.');
                return;
              }
              dispatch({ type: 'SET_PHASE', phase: 'summary' });
            },
          },
          { key: 'delete', label: '경기삭제', tone: 'red', onClick: deleteTennisGame, hidden: teamContext?.role !== '관리자' },
        ]} />
      </MatchHeader>

      {matchModal === 'attendees' && (
        <Modal onClose={() => setMatchModal(null)} title="참석명단">
          <TennisAttendeeModal
            roster={roster}
            attendees={state.attendees}
            guests={state.guests}
            dispatch={dispatch}
            C={C}
            styles={s}
          />
        </Modal>
      )}

      {matchModal === 'results' && (
        <Modal onClose={() => setMatchModal(null)} title="오늘 결과">
          <TennisResultsModal
            rounds={state.rounds}
            C={C}
            styles={s}
          />
        </Modal>
      )}

      {matchModal === 'playerStats' && (
        <Modal onClose={() => setMatchModal(null)} title="개인기록">
          <TennisPlayerStatsModal
            team={team}
            state={state}
            roster={roster}
            C={C}
            styles={s}
          />
        </Modal>
      )}

      <TennisRoundNav rounds={state.rounds} viewingRoundIdx={state.viewingRoundIdx} dispatch={dispatch} C={C} styles={s} canAddRound={canAddRound} />

      <div style={s.section}>
        {(round?.courts || []).map(c => (
          <TennisCourtCard key={c.courtId} court={c} roundIdx={round.roundIdx}
            attendees={state.attendees} usedNames={usedNames} dispatch={dispatch} C={C} styles={s}
            canDelete={(round.courts || []).length > 1} locked={viewingConfirmed}
            scoringRules={state.scoringRules} />
        ))}
        {!viewingConfirmed && (
          <button onClick={() => dispatch({ type: 'ADD_COURT', roundIdx: round.roundIdx })}
            style={{
              display: 'block', width: '100%', padding: 12, marginTop: 4,
              border: `1.5px dashed ${C.grayDarker}`, borderRadius: 12,
              background: 'transparent', color: C.gray, cursor: 'pointer',
              fontSize: 14, fontFamily: 'inherit',
            }}>
            + 코트
          </button>
        )}
      </div>

      <TennisConfirmBar round={round} isConfirmed={viewingConfirmed} onConfirm={handleConfirmRound} onUnconfirm={handleUnconfirmRound} canAddRound={canAddRound} onAddRound={() => dispatch({ type: 'ADD_ROUND' })} C={C} styles={s} />
    </div>
  );
}
