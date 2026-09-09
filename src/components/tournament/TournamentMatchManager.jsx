import { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../../hooks/useTheme';
import RosterSelector from '../game/RosterSelector';
import FormationSetup from '../game/FormationSetup';
import FormationRecorder from '../game/FormationRecorder';
import { ref, set, get } from 'firebase/database';
import { firebaseDb } from '../../config/firebase';
import { calcSoccerScore, buildEventLogRows } from '../../utils/soccerScoring';
import { generateEventId } from '../../utils/idGenerator';
import AppSync from '../../services/appSync';
import { buildRawEventsFromSoccer, buildRawPlayerGamesFromTournament } from '../../utils/rawLogBuilders';
import { refreshAfterFinalize, TOURNAMENT_DATASETS } from '../../utils/refreshAfterFinalize';

export default function TournamentMatchManager({ tournament, schedule: rawSchedule, ourTeamName, attendees: rawAttendees, gameSettings, onScheduleUpdate }) {
  const schedule = rawSchedule || [];
  const attendees = rawAttendees || [];
  const { C } = useTheme();
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [phase, setPhase] = useState("list");
  const [matchState, setMatchState] = useState(null);
  const [scoreEdit, setScoreEdit] = useState(null);
  const saveTimer = useRef(null);

  const teamSafe = (ourTeamName || "").replace(/[.#$/[\]]/g, "_");
  const fbPath = `tournaments/${teamSafe}/${tournament.id}/activeGame`;

  const ourMatches = schedule.filter(m => m.isOurs && m.status !== "finished");
  const otherMatches = schedule.filter(m => !m.isOurs && m.status !== "finished");

  /* ---- Firebase auto-save (debounced) ---- */
  const autoSave = useCallback((state) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const payload = { ...state, matchNum: selectedMatch?.matchNum };
      set(ref(firebaseDb, fbPath), payload).catch(() => {});
    }, 800);
  }, [fbPath, selectedMatch]);

  /* ---- Restore from Firebase on mount ---- */
  useEffect(() => {
    if (!tournament.id || !teamSafe) return;
    get(ref(firebaseDb, fbPath)).then(snap => {
      if (!snap.exists()) return;
      const saved = snap.val();
      // find the matching schedule entry
      const match = (schedule || []).find(m => m.matchNum === saved.matchNum && m.isOurs && m.status !== "finished");
      if (!match) return;
      setSelectedMatch(match);
      setMatchState({ ...saved, events: saved.events || [] });
      // determine phase from saved state
      if (saved.startedAt) setPhase("playing");
      else if (saved.formation) setPhase("formation");
      else if (saved.selectedPlayers) setPhase("roster");
    }).catch(() => {});
  }, [tournament.id, teamSafe, fbPath, schedule]);

  const [matchMinutes, setMatchMinutes] = useState(tournament.defaultMinutes || 90);
  const [matchVenue, setMatchVenue] = useState(tournament.defaultVenue || "");

  /* ---- Phase: roster ---- */
  const handleRosterConfirm = (players) => {
    const state = { selectedPlayers: players, events: [], matchMinutes, venue: matchVenue };
    setMatchState(state);
    autoSave(state);
    setPhase("formation");
  };

  /* ---- Phase: formation ---- */
  const handleFormationConfirm = ({ formation, assignments, gk, positionMap, subs }) => {
    const opponent = selectedMatch.home === ourTeamName ? selectedMatch.away : selectedMatch.home;
    const state = {
      ...matchState,
      formation, assignments, gk, positionMap, subs,
      opponent, startedAt: Date.now(), events: matchState?.events || [],
    };
    setMatchState(state);
    autoSave(state);
    setPhase("playing");
  };

  /* ---- Phase: playing ---- */
  const handleAddEvent = (event) => {
    setMatchState(prev => {
      const ev = { ...event, id: event.id || generateEventId(), timestamp: event.timestamp || Date.now() };
      const events = [...prev.events, ev];
      const next = { ...prev, events };
      autoSave(next);
      return next;
    });
  };

  const handleDeleteEvent = (eventId) => {
    setMatchState(prev => {
      const events = prev.events.filter(e => e.id !== eventId);
      const next = { ...prev, events };
      autoSave(next);
      return next;
    });
  };

  const handleStateChange = (partial) => {
    setMatchState(prev => {
      const next = { ...prev, ...partial };
      autoSave(next);
      return next;
    });
  };

  const handleFinishMatch = async (finalState) => {
    const soccerMatch = {
      matchIdx: selectedMatch.matchNum - 1,
      opponent: matchState.opponent,
      lineup: Object.values(finalState.assignments),
      gk: finalState.gk,
      defenders: Object.entries(finalState.positionMap).filter(([, r]) => r === "DF").map(([n]) => n),
      events: matchState.events,
      startedAt: matchState.startedAt,
      status: "finished",
    };

    const { ourScore, opponentScore } = calcSoccerScore(matchState.events);
    const isHome = selectedMatch.home === ourTeamName;
    const homeScore = isHome ? ourScore : opponentScore;
    const awayScore = isHome ? opponentScore : ourScore;

    await AppSync.updateTournamentMatchScore(tournament.id, selectedMatch.matchNum, homeScore, awayScore);

    const finished = [soccerMatch];
    const eventRows = buildEventLogRows(finished, tournament.startDate || new Date().toISOString().slice(0, 10));
    const rawEvents = buildRawEventsFromSoccer({
      team: ourTeamName,
      mode: '대회',
      tournamentId: tournament.id,
      events: eventRows,
    });
    await Promise.allSettled([
      AppSync.writeTournamentEventLog(tournament.id, { events: eventRows }),
      AppSync.writeRawEvents({ rows: rawEvents }),
    ]);

    // player stats re-aggregate
    const allEvents = await AppSync.getTournamentEventLog(tournament.id);
    const pStats = {};
    const ensure = (n) => { if (!pStats[n]) pStats[n] = { name: n, games: 0, fieldGames: 0, keeperGames: 0, goals: 0, assists: 0, cleanSheets: 0, conceded: 0, owngoals: 0, point: 0 }; };
    for (const e of allEvents) {
      if (e.event === "출전") { ensure(e.player); pStats[e.player].games++; if (e.position === "GK") pStats[e.player].keeperGames++; else pStats[e.player].fieldGames++; }
      if (e.event === "골") { ensure(e.player); pStats[e.player].goals++; if (e.relatedPlayer) { ensure(e.relatedPlayer); pStats[e.relatedPlayer].assists++; } }
      if (e.event === "자책골") { ensure(e.player); pStats[e.player].owngoals++; }
      if (e.event === "실점" && e.player) { ensure(e.player); pStats[e.player].conceded++; }
      if (e.event === "교체") { ensure(e.player); pStats[e.player].games++; if (e.position === "GK") pStats[e.player].keeperGames++; else pStats[e.player].fieldGames++; }
    }
    Object.values(pStats).forEach(p => { p.point = p.goals + p.assists + (p.owngoals * gameSettings.ownGoalPoint) + (p.cleanSheets * gameSettings.cleanSheetPoint); });
    await AppSync.writeTournamentPlayerRecord(tournament.id, { players: Object.values(pStats) });

    // 로그_선수경기 (통합 로그) — 대회 스코프 재집계하여 replaceBy 로 덮어쓰기
    const rawPlayerGames = buildRawPlayerGamesFromTournament({
      team: ourTeamName,
      tournamentId: tournament.id,
      inputTime: new Date().toLocaleString("ko-KR"),
      events: allEvents,
    });
    await AppSync.writeRawPlayerGames({
      rows: rawPlayerGames,
      replaceBy: { team: ourTeamName, sport: '축구', mode: '대회', tournament_id: tournament.id },
    }).catch(e => {
      // 실패해도 경기 종료 플로우(상태 정리)는 계속 — 재집계는 다음 경기 종료 시 replaceBy로 복구됨
      alert("로그_선수경기 저장 실패: " + e.message);
      return null;
    });

    // 로그_이벤트·로그_선수경기 전송을 시도한 뒤 재적재. 이 파일은 원래도 raw 로그
    // 실패를 막지 않고 알림만 띄운 뒤 계속 진행하므로(위 두 블록), 여기서도 성공
    // 여부로 더 엄격히 막지 않는다 — SheetCache.refresh 는 throw 하지 않고, 실패 시
    // 캐시를 강등해 다음 읽기가 시트로 직행하므로 새로 들어올 낡음은 없다.
    // 겸직팀(한 팀에 풋살·축구 탭 공존)에서 AuthUtil.mode 와 어긋나지 않도록 sport 명시
    // (이 파일은 대회=축구 전용, 163행의 replaceBy sport 하드코딩과 동일).
    await refreshAfterFinalize(TOURNAMENT_DATASETS, { sport: '축구' });

    // clear Firebase activeGame
    await set(ref(firebaseDb, fbPath), null);

    onScheduleUpdate();
    setPhase("finished");
  };

  const handleOtherScore = async (matchNum, home, away) => {
    await AppSync.updateTournamentMatchScore(tournament.id, matchNum, home, away);
    onScheduleUpdate();
    setScoreEdit(null);
  };

  /* ---- Render: playing ---- */
  if (phase === "playing" && matchState) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: C.gray }}>제{selectedMatch.matchNum}경기</span>
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: `${C.red}25`, color: C.red, fontWeight: 700, animation: "pulse 1.5s infinite" }}>● LIVE</span>
        </div>
        <FormationRecorder
          formation={matchState.formation || "4-4-2"}
          assignments={matchState.assignments || {}}
          positionMap={matchState.positionMap || {}}
          subs={matchState.subs || []}
          gk={matchState.gk || ""}
          opponent={matchState.opponent || ""}
          startedAt={matchState.startedAt}
          matchMinutes={matchState.matchMinutes || 90}
          events={matchState.events || []}
          onAddEvent={handleAddEvent}
          onDeleteEvent={handleDeleteEvent}
          onFinishMatch={handleFinishMatch}
          onStateChange={handleStateChange}
        />
      </div>
    );
  }

  /* ---- Render: formation ---- */
  if (phase === "formation" && matchState) {
    const opponent = selectedMatch.home === ourTeamName ? selectedMatch.away : selectedMatch.home;
    return (
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 12 }}>vs {opponent} -- 포메이션</div>
        <FormationSetup
          selectedPlayers={matchState.selectedPlayers || []}
          onConfirm={handleFormationConfirm}
          onBack={() => setPhase("roster")}
        />
      </div>
    );
  }

  /* ---- Render: roster ---- */
  if (phase === "roster" && selectedMatch) {
    const opponent = selectedMatch.home === ourTeamName ? selectedMatch.away : selectedMatch.home;
    return (
      <div>
        <button onClick={() => { setPhase("list"); setSelectedMatch(null); setMatchState(null); }}
          style={{ marginBottom: 10, padding: "6px 14px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", fontSize: 12, cursor: "pointer" }}>
          ← 돌아가기
        </button>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 12 }}>vs {opponent}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: C.gray, marginBottom: 4 }}>경기시간(분)</div>
            <input type="number" value={matchMinutes} onChange={e => setMatchMinutes(Number(e.target.value) || 90)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.grayDark}`, background: C.cardLight, color: C.white, fontSize: 14, boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: C.gray, marginBottom: 4 }}>구장</div>
            <input value={matchVenue} onChange={e => setMatchVenue(e.target.value)} placeholder="구장명"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.grayDark}`, background: C.cardLight, color: C.white, fontSize: 14, boxSizing: "border-box" }} />
          </div>
        </div>
        <RosterSelector allPlayers={attendees} onConfirm={handleRosterConfirm} />
      </div>
    );
  }

  /* ---- Render: finished ---- */
  if (phase === "finished") {
    return (
      <div style={{ textAlign: "center", padding: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.green, marginBottom: 8 }}>경기 기록 완료</div>
        <button onClick={() => { setPhase("list"); setSelectedMatch(null); setMatchState(null); }}
          style={{ padding: "10px 24px", borderRadius: 10, background: C.accent, color: C.bg, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>돌아가기</button>
      </div>
    );
  }

  /* ---- Render: list ---- */
  return (
    <div>
      {ourMatches.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, marginBottom: 6 }}>우리팀 경기 (미완료)</div>
          {ourMatches.map(m => {
            const opponent = m.home === ourTeamName ? m.away : m.home;
            return (
              <div key={m.matchNum} onClick={() => { setSelectedMatch(m); setPhase("roster"); }}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: `${C.accent}11`, borderRadius: 10, marginBottom: 6, cursor: "pointer", borderLeft: `3px solid ${C.accent}` }}>
                <div>
                  <div style={{ fontSize: 11, color: C.gray }}>제{m.matchNum}경기 · {m.date || "미정"}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.white, marginTop: 2 }}>vs {opponent}</div>
                </div>
                <div style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>기록 →</div>
              </div>
            );
          })}
        </div>
      )}
      {otherMatches.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.gray, marginBottom: 6 }}>타팀 경기 (스코어 입력)</div>
          {otherMatches.map(m => (
            <div key={m.matchNum} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: C.cardLight, borderRadius: 8, marginBottom: 3 }}>
              <span style={{ flex: 1, fontSize: 12, color: C.white, textAlign: "right" }}>{m.home}</span>
              {scoreEdit?.matchNum === m.matchNum ? (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input value={scoreEdit.home} onChange={e => setScoreEdit(p => ({ ...p, home: e.target.value }))} style={{ width: 30, padding: 4, borderRadius: 4, border: `1px solid ${C.grayDark}`, background: C.card, color: C.white, textAlign: "center", fontSize: 13 }} />
                  <span style={{ color: C.gray }}>:</span>
                  <input value={scoreEdit.away} onChange={e => setScoreEdit(p => ({ ...p, away: e.target.value }))} style={{ width: 30, padding: 4, borderRadius: 4, border: `1px solid ${C.grayDark}`, background: C.card, color: C.white, textAlign: "center", fontSize: 13 }} />
                  <button onClick={() => handleOtherScore(m.matchNum, parseInt(scoreEdit.home), parseInt(scoreEdit.away))}
                    style={{ padding: "2px 8px", borderRadius: 4, background: C.green, color: C.bg, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>OK</button>
                  <button onClick={() => setScoreEdit(null)} style={{ padding: "2px 6px", borderRadius: 4, background: C.grayDark, color: C.gray, border: "none", fontSize: 10, cursor: "pointer" }}>취소</button>
                </div>
              ) : (
                <button onClick={() => setScoreEdit({ matchNum: m.matchNum, home: "", away: "" })}
                  style={{ padding: "4px 10px", borderRadius: 6, background: C.grayDarker, color: C.grayLight, border: "none", fontSize: 11, cursor: "pointer" }}>스코어 입력</button>
              )}
              <span style={{ flex: 1, fontSize: 12, color: C.white }}>{m.away}</span>
            </div>
          ))}
        </div>
      )}
      {ourMatches.length === 0 && otherMatches.length === 0 && <div style={{ textAlign: "center", padding: 20, color: C.gray, fontSize: 13 }}>모든 경기가 완료되었습니다</div>}
    </div>
  );
}
