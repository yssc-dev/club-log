import { useState } from 'react';
import { TEAM_COLORS } from '../../config/constants';
import { useTheme } from '../../hooks/useTheme';
import { calcMatchScore } from '../../utils/scoring';
import { calcNextPushMatch } from '../../utils/pushMatch';
import CourtRecorder from './CourtRecorder';

export default function PushMatchView({
  teams, teamNames, teamColorIndices, gks, gksHistory, allEvents,
  onRecordEvent, onUndoEvent, onDeleteEvent, onEditEvent,
  onConfirmPushRound, onUnconfirmLastRound, completedMatches, attendees, onGkChange,
  liveMercs, onAddLiveMerc, onRemoveLiveMerc,
  onEditPastGk, onEditPastMercAdd, onEditPastMercRemove,
  absentees, onToggleAbsent,
  pushState, styles: s,
}) {
  const { C } = useTheme();
  const [currentMatch, setCurrentMatch] = useState(
    pushState?.suggestedMatch || { home: 0, away: 1 }
  );
  const [editingMatch, setEditingMatch] = useState(false);
  // 대진변경 편집 상태: 연승팀(streak) + 도전팀(challenger)
  const [editStreak, setEditStreak] = useState(null);
  const [editChallenger, setEditChallenger] = useState(null);
  const [streakPickerOpen, setStreakPickerOpen] = useState(false);
  // viewingIdx: completedMatches.length = 현재(라이브), 0~length-1 = 과거 경기
  const [viewingIdx, setViewingIdx] = useState(completedMatches.length);
  // 과거 매치 부분 수정 모드 (이벤트/GK/용병 편집 가능. 매치업은 절대 변경되지 않음)
  const [editingPast, setEditingPast] = useState(false);

  const [lastMatchCount, setLastMatchCount] = useState(completedMatches.length);
  if (completedMatches.length !== lastMatchCount) {
    setLastMatchCount(completedMatches.length);
    setViewingIdx(completedMatches.length); // 새 경기 확정 시 라이브로 이동
    setEditingPast(false);
    if (pushState?.suggestedMatch) {
      setCurrentMatch(pushState.suggestedMatch);
    }
  }

  // 경기 수 변화 없이 suggestedMatch만 원격에서 바뀐 경우(예: 다른 탭의 과거 점수 수정으로
  // 재계산) — 위 가드가 못 잡으므로 별도 추적. 양 탭이 같은 대진을 보게 수렴시킨다.
  // 새 원격 추천은 수동 대진변경보다 우선(수렴 우선 정책). 단 대진 편집 중에는 건드리지 않음.
  const [lastSuggested, setLastSuggested] = useState(pushState?.suggestedMatch ?? null);
  const sm = pushState?.suggestedMatch;
  if (sm && !editingMatch && (sm.home !== lastSuggested?.home || sm.away !== lastSuggested?.away)) {
    setLastSuggested(sm);
    setCurrentMatch(sm);
  }

  const isLive = viewingIdx >= completedMatches.length;
  const viewingPast = !isLive ? completedMatches[viewingIdx] : null;

  // 라이브 경기 정보
  const liveMatchId = `P${completedMatches.length + 1}_C0`;
  const homeIdx = isLive ? currentMatch.home : viewingPast.homeIdx;
  const awayIdx = isLive ? currentMatch.away : viewingPast.awayIdx;
  const currentMatchId = isLive ? liveMatchId : viewingPast.matchId;

  // 과거 경기면 gksHistory에서, 라이브면 gks에서
  const viewGks = isLive ? gks : (gksHistory?.[viewingIdx] || {});

  // 라이브: 현재 teams 사용. 과거: 매치에 저장된 명단 스냅샷 우선, 없으면 폴백.
  const viewHomePlayers = isLive
    ? teams[homeIdx]
    : (viewingPast?.homePlayers || teams[homeIdx]);
  const viewAwayPlayers = isLive
    ? teams[awayIdx]
    : (viewingPast?.awayPlayers || teams[awayIdx]);

  const matchInfo = {
    homeIdx, awayIdx, matchId: currentMatchId,
    homeTeam: teamNames[homeIdx], awayTeam: teamNames[awayIdx],
    homeGk: viewGks[homeIdx] || null, awayGk: viewGks[awayIdx] || null,
    homeColor: TEAM_COLORS[teamColorIndices[homeIdx]],
    awayColor: TEAM_COLORS[teamColorIndices[awayIdx]],
    homePlayers: viewHomePlayers,
    awayPlayers: viewAwayPlayers,
  };

  // CourtRecorder에 넘길 mercs (side 형식). 과거 수정 모드에선 저장된 mercenaries에서 가져옴.
  const sourceMercList = isLive
    ? (liveMercs?.[liveMatchId] || [])
    : (viewingPast?.mercenaries || []);
  const courtMercs = sourceMercList.map(m => ({
    player: m.player,
    side: m.teamIdx === homeIdx ? "home" : (m.teamIdx === awayIdx ? "away" : null),
  })).filter(m => m.side);
  const handleAddMerc = (player, side) => {
    const teamIdx = side === "home" ? homeIdx : awayIdx;
    if (isLive) onAddLiveMerc?.(liveMatchId, teamIdx, player);
    else onEditPastMercAdd?.(currentMatchId, teamIdx, player);
  };
  const handleRemoveMerc = (player) => {
    if (isLive) onRemoveLiveMerc?.(liveMatchId, player);
    else onEditPastMercRemove?.(currentMatchId, player);
  };
  // 과거 수정 모드용 GK 변경: completedMatches[i] + gksHistory를 동시에 갱신.
  const handleGkChangeRouted = (teamIdx, player) => {
    if (isLive) {
      onGkChange?.(teamIdx, player);
      return;
    }
    const side = teamIdx === viewingPast?.homeIdx ? 'home' : (teamIdx === viewingPast?.awayIdx ? 'away' : null);
    if (!side) return;
    onEditPastGk?.(currentMatchId, side, player);
  };

  const handleConfirmRound = () => {
    const evts = allEvents.filter(e => e.matchId === liveMatchId);
    const homeScore = calcMatchScore(evts, liveMatchId, teamNames[currentMatch.home]);
    const awayScore = calcMatchScore(evts, liveMatchId, teamNames[currentMatch.away]);

    const result = {
      matchId: liveMatchId, homeIdx: currentMatch.home, awayIdx: currentMatch.away,
      homeTeam: teamNames[currentMatch.home], awayTeam: teamNames[currentMatch.away],
      homeGk: gks[currentMatch.home] || "", awayGk: gks[currentMatch.away] || "",
      homeScore, awayScore,
      court: "", mercenaries: [], isExtra: false,
    };

    // GK 필수 체크 — 자유대진(FreeMatchView)·대진표 모드와 같은 규칙.
    // 골 입력은 GK가 없으면 CourtRecorder가 막지만 무득점(0:0) 경기는 그 관문을 안 거쳐,
    // 여기서 안 막으면 로그_매치 GK 칸이 빈 채로 올라간다(2026-11-12 P9·P16).
    if (!result.homeGk || !result.awayGk) {
      alert(`키퍼를 지정하세요: ${!result.homeGk ? result.homeTeam : ""}${!result.homeGk && !result.awayGk ? ", " : ""}${!result.awayGk ? result.awayTeam : ""}`);
      return;
    }

    const msg = `${result.homeTeam} ${homeScore}:${awayScore} ${result.awayTeam}`;
    if (!confirm(msg + "\n\n경기결과를 확정하시겠습니까?")) return;

    const newPushState = calcNextPushMatch(
      pushState, { homeIdx: currentMatch.home, awayIdx: currentMatch.away, homeScore, awayScore },
      teams.length, teamNames
    );

    onConfirmPushRound(result, newPushState);
  };

  const streakInfo = pushState?.winStreak;
  const streakTeamIdx = streakInfo?.teamIdx ?? null;

  const handleStartEdit = () => {
    // 연승팀이 있으면 그 팀을 streak로, 없으면 currentMatch.home을 기본
    const initialStreak = streakTeamIdx ?? currentMatch.home;
    const initialChallenger = currentMatch.home === initialStreak ? currentMatch.away : currentMatch.home;
    setEditStreak(initialStreak);
    setEditChallenger(initialChallenger);
    setStreakPickerOpen(false);
    setEditingMatch(true);
  };

  const handleConfirmEdit = () => {
    if (editStreak === null || editChallenger === null || editStreak === editChallenger) return;
    setCurrentMatch({ home: editStreak, away: editChallenger });
    setEditingMatch(false);
  };

  if (editingMatch) {
    const hasStayTeam = !!streakInfo;
    const streakColor = hasStayTeam ? TEAM_COLORS[teamColorIndices[editStreak]] : null;
    const restingIdxs = new Set();
    if (pushState?.forcedRest != null) restingIdxs.add(pushState.forcedRest);
    if (pushState?.lastLoser != null) restingIdxs.add(pushState.lastLoser);
    return (
      <div>
        <div style={{ fontSize: 13, color: C.gray, marginBottom: 8 }}>대진 변경</div>
        <div style={s.card}>
          {hasStayTeam ? (
            <>
              {/* 잔류팀 (1~2연승: 계속 출전) */}
              <div style={{ fontSize: 11, color: C.gray, marginBottom: 6 }}>
                🔥 잔류팀 <span style={{ opacity: 0.7 }}>({streakInfo.count}연승 · 계속 출전 · 탭하여 변경)</span>
              </div>
              <button onClick={() => setStreakPickerOpen(o => !o)}
                style={{
                  width: "100%", padding: "12px 14px", marginBottom: streakPickerOpen ? 6 : 12,
                  borderRadius: 12, border: `1.5px solid ${streakColor?.bg || C.accent}`,
                  background: `${streakColor?.bg || C.accent}22`, color: C.white,
                  fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                <span>{teamNames[editStreak]}{editStreak === streakTeamIdx ? ` · ${streakInfo.count}연승` : ""}</span>
                <span style={{ fontSize: 11, color: C.gray }}>{streakPickerOpen ? "▲ 닫기" : "▼ 변경"}</span>
              </button>
              {streakPickerOpen && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                  {teamNames.map((name, idx) => idx !== editChallenger && (
                    <button key={idx} onClick={() => { setEditStreak(idx); setStreakPickerOpen(false); }}
                      style={{
                        flex: "1 1 30%", padding: "8px 10px", borderRadius: 8,
                        border: `1px solid ${idx === editStreak ? (TEAM_COLORS[teamColorIndices[idx]]?.bg || C.accent) : C.grayDarker}`,
                        background: idx === editStreak ? `${TEAM_COLORS[teamColorIndices[idx]]?.bg || C.accent}33` : "transparent",
                        color: C.white, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                      }}>
                      {name}{streakInfo?.teamIdx === idx ? ` 🔥${streakInfo.count}` : ""}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ textAlign: "center", color: C.gray, fontSize: 14, fontWeight: 800, margin: "4px 0 10px 0" }}>VS</div>

              <div style={{ fontSize: 11, color: C.gray, marginBottom: 6 }}>⚔️ 도전팀 선택</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
                {teamNames.map((name, idx) => idx !== editStreak && (
                  <button key={idx} onClick={() => setEditChallenger(idx)}
                    style={{
                      flex: "1 1 30%", padding: "10px 10px", borderRadius: 10,
                      border: `1.5px solid ${idx === editChallenger ? (TEAM_COLORS[teamColorIndices[idx]]?.bg || C.accent) : C.grayDarker}`,
                      background: idx === editChallenger ? `${TEAM_COLORS[teamColorIndices[idx]]?.bg || C.accent}33` : "transparent",
                      color: C.white, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    }}>
                    {name}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* 잔류팀 없음: 두 팀 자유 선택 */}
              <div style={{ fontSize: 11, color: C.gray, marginBottom: 6 }}>
                ⚔️ 두 팀 선택 <span style={{ opacity: 0.7 }}>(잔류팀 없음 · 탭 순서대로 1번/2번)</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {teamNames.map((name, idx) => {
                  const slot = idx === editStreak ? 1 : idx === editChallenger ? 2 : null;
                  const selected = slot !== null;
                  const teamColor = TEAM_COLORS[teamColorIndices[idx]];
                  const resting = restingIdxs.has(idx);
                  return (
                    <button key={idx}
                      onClick={() => {
                        // 이미 선택된 칩 다시 누르면 해제
                        if (idx === editStreak) { setEditStreak(null); return; }
                        if (idx === editChallenger) { setEditChallenger(null); return; }
                        // 1번 슬롯 비어있으면 채우고, 아니면 2번 슬롯
                        if (editStreak === null) setEditStreak(idx);
                        else if (editChallenger === null) setEditChallenger(idx);
                        else { setEditStreak(editChallenger); setEditChallenger(idx); } // 둘 다 차있으면 가장 오래된 것 교체
                      }}
                      style={{
                        flex: "1 1 30%", padding: "12px 10px", borderRadius: 10,
                        border: `1.5px solid ${selected ? (teamColor?.bg || C.accent) : C.grayDarker}`,
                        background: selected ? `${teamColor?.bg || C.accent}33` : "transparent",
                        color: C.white, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                        opacity: !selected && resting ? 0.5 : 1,
                        position: "relative",
                      }}>
                      {selected && (
                        <span style={{
                          position: "absolute", top: 4, left: 6,
                          fontSize: 10, fontWeight: 800, color: teamColor?.bg || C.accent,
                        }}>{slot}</span>
                      )}
                      {name}
                      {resting && !selected && (
                        <span style={{ display: "block", fontSize: 9, color: C.gray, marginTop: 2 }}>방금 출전</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={() => setEditingMatch(false)} style={s.btn(C.grayDark)}>취소</button>
            <button onClick={handleConfirmEdit}
              disabled={editStreak === null || editChallenger === null || editStreak === editChallenger}
              style={{ ...s.btnFull(C.green), flex: 1, opacity: (editStreak !== null && editChallenger !== null && editStreak !== editChallenger) ? 1 : 0.4 }}>
              확인
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* 상단: 팀별 출전횟수 대시보드 */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {teamNames.map((name, idx) => {
          const isPlaying = isLive && (idx === homeIdx || idx === awayIdx);
          const isResting = pushState?.forcedRest === idx;
          const color = TEAM_COLORS[teamColorIndices[idx]];
          return (
            <div key={idx} style={{
              flex: 1, minWidth: 60, background: C.card, borderRadius: 8, padding: "6px 4px",
              textAlign: "center", borderTop: `3px solid ${color?.bg || C.accent}`,
              opacity: isPlaying ? 1 : 0.6,
              outline: isPlaying ? `2px solid ${color?.bg || C.accent}` : "none",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: color?.bg || C.white, marginBottom: 2 }}>
                {name}
              </div>
              <div style={{ fontSize: 10, color: C.gray }}>
                {pushState?.teamPlayCounts?.[idx] || 0}경기
              </div>
              <div style={{ fontSize: 10, color: C.gray }}>
                {pushState?.teamTotalGoals?.[idx] || 0}골
              </div>
              {isResting && (
                <div style={{ fontSize: 9, color: C.orange, fontWeight: 700, marginTop: 2 }}>휴식</div>
              )}
            </div>
          );
        })}
      </div>

      {/* 경기 네비게이션 + 대진변경 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 6 }}>
        <button onClick={() => setViewingIdx(Math.max(0, viewingIdx - 1))} disabled={viewingIdx === 0}
          style={{ ...s.btnSm(C.grayDark), opacity: viewingIdx === 0 ? 0.3 : 1 }}>◀</button>
        <span style={{ fontSize: 15, fontWeight: 800, color: C.white }}>
          {viewingIdx + 1}경기{!isLive && <span style={{ fontSize: 11, marginLeft: 6, color: C.green, fontWeight: 600 }}>종료됨</span>}
          {isLive && <span style={{ fontSize: 11, marginLeft: 6, color: C.orange, fontWeight: 600 }}>진행중</span>}
        </span>
        <button onClick={() => setViewingIdx(Math.min(completedMatches.length, viewingIdx + 1))} disabled={isLive}
          style={{ ...s.btnSm(C.grayDark), opacity: isLive ? 0.3 : 1 }}>▶</button>
        {isLive && streakInfo && (
          <span style={{ fontSize: 12, color: C.orange, fontWeight: 700 }}>
            {teamNames[streakInfo.teamIdx]} {streakInfo.count}연승
          </span>
        )}
        {isLive && (
          <button onClick={handleStartEdit} style={{ ...s.btnSm(C.grayDark, C.white), fontSize: 10 }}>
            대진변경
          </button>
        )}
      </div>
      {!isLive && editingPast && (
        <div style={{
          fontSize: 11, color: C.orange, textAlign: "center", marginBottom: 6,
          padding: "4px 8px", background: `${C.orange}15`, borderRadius: 6,
        }}>
          수정 가능: 점수·GK·용병 / 두 팀 자체는 변경 불가 · 점수 변경 시 이후 매치 추천이 달라질 수 있습니다
        </div>
      )}

      {/* 경기 기록 */}
      <CourtRecorder
        key={`push_${viewingIdx}_${homeIdx}_${awayIdx}`}
        matchInfo={matchInfo}
        homePlayers={matchInfo.homePlayers}
        awayPlayers={matchInfo.awayPlayers}
        allEvents={allEvents}
        onRecordEvent={onRecordEvent}
        onUndoEvent={onUndoEvent}
        onDeleteEvent={onDeleteEvent}
        onEditEvent={onEditEvent}
        onFinish={() => {}}
        onGkChange={handleGkChangeRouted}
        styles={s}
        courtLabel=""
        attendees={attendees}
        readOnly={!isLive && !editingPast}
        mercs={courtMercs}
        onAddMerc={handleAddMerc}
        onRemoveMerc={handleRemoveMerc}
        absentees={absentees}
        onToggleAbsent={isLive ? onToggleAbsent : undefined}
      />

      {/* 하단 버튼 */}
      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        {isLive ? (
          <button onClick={handleConfirmRound} style={{ ...s.btnFull(C.accent, C.bg) }}>
            경기 확정
          </button>
        ) : (
          <>
            <button onClick={() => setEditingPast(v => !v)}
              style={{ ...s.btnFull(editingPast ? C.orange : C.grayDark, editingPast ? C.bg : C.white), flex: 1 }}>
              {editingPast ? "수정 완료" : "기록 정정"}
            </button>
            {viewingIdx === completedMatches.length - 1 && (
              <button onClick={onUnconfirmLastRound}
                style={{ ...s.btnFull(C.orange, C.bg), flex: 1 }}>
                {viewingIdx + 1}경기 확정취소
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
