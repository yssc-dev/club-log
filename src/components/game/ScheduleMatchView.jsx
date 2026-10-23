import { useMemo, useState } from 'react';
import { TEAM_COLORS } from '../../config/constants';
import { BackIcon } from '../common/icons';
import CourtRecorder from './CourtRecorder';
import { resolveRoundGks } from '../../utils/roundGks';

export default function ScheduleMatchView({ schedule, currentRoundIdx, viewingRoundIdx, setViewingRoundIdx, confirmedRounds, onConfirmRound, teams, teamNames, teamColorIndices, gks, gksHistory, courtCount, allEvents, onRecordEvent, onUndoEvent, onDeleteEvent, onEditEvent, completedMatches, attendees, onGkChange, liveMercs, onAddLiveMerc, onRemoveLiveMerc, onEditPastGk, onEditPastMercAdd, onEditPastMercRemove, onEditPastAbsent, splitPhase, absentees, onToggleAbsent, styles: s, roundDisplayOffset = 0, onWrapToLastFree }) {
  const [compose, setCompose] = useState(null);
  const round = schedule[viewingRoundIdx];
  const matches = round?.matches || [];
  const isConfirmed = confirmedRounds[viewingRoundIdx] || false;
  // 확정된 라운드는 잠금(readOnly). 골/GK/용병/휴식 수정은 "확정취소" 후 라이브 상태에서만.
  const editingThisRound = false;

  // GK는 확정 여부와 무관하게 라운드별 기록(gksHistory[roundIdx]) 하나만 본다.
  // 확정취소로 미확정 라운드가 둘 이상 생겨도 서로 섞이지 않는다(2026-10-23).
  const roundGks = resolveRoundGks({ gksHistory, gks, confirmedRounds, currentRoundIdx }, viewingRoundIdx);

  // 확정된 라운드의 매치 명단 스냅샷을 matchId 기준으로 lookup
  const completedByMatchId = useMemo(() => {
    const m = {};
    (completedMatches || []).forEach(c => { if (c?.matchId) m[c.matchId] = c; });
    return m;
  }, [completedMatches]);

  const matchInfos = useMemo(() => {
    // 라이브 라운드: 같은 라운드 내 다른 매치로 차출된 player set 계산 (base에서 제외)
    const matchIds = matches.map((_, i) => `R${viewingRoundIdx + 1}_C${i}`);
    const liveBorrowedByMatch = {};
    matchIds.forEach(mid => {
      const list = liveMercs?.[mid] || [];
      liveBorrowedByMatch[mid] = new Set(list.map(m => m.player));
    });
    return matches.map((pair, i) => {
      const matchId = matchIds[i];
      const past = isConfirmed ? completedByMatchId[matchId] : null;
      let homePlayers, awayPlayers;
      if (past) {
        // 과거 라운드: 저장된 스냅샷 사용 (이미 차출자 제외 반영됨)
        homePlayers = past.homePlayers || teams[pair[0]] || [];
        awayPlayers = past.awayPlayers || teams[pair[1]] || [];
      } else {
        // 라이브: 다른 매치로 차출된 player를 base에서 제외
        const borrowedOut = new Set();
        matchIds.forEach(otherMid => {
          if (otherMid === matchId) return;
          (liveBorrowedByMatch[otherMid] || []).forEach(p => borrowedOut.add(p));
        });
        homePlayers = (teams[pair[0]] || []).filter(p => !borrowedOut.has(p));
        awayPlayers = (teams[pair[1]] || []).filter(p => !borrowedOut.has(p));
      }
      return {
        homeIdx: pair[0], awayIdx: pair[1],
        matchId,
        homeTeam: teamNames[pair[0]], awayTeam: teamNames[pair[1]],
        homeGk: roundGks[pair[0]] || null, awayGk: roundGks[pair[1]] || null,
        homeColor: TEAM_COLORS[teamColorIndices[pair[0]]],
        awayColor: TEAM_COLORS[teamColorIndices[pair[1]]],
        homePlayers,
        awayPlayers,
      };
    });
  }, [viewingRoundIdx, matches, teamNames, roundGks, teamColorIndices, teams, isConfirmed, completedByMatchId, liveMercs]);

  const roundNavBtn = (disabled) => ({
    width: 36, height: 36, borderRadius: 999,
    background: "var(--app-bg-row)", border: "0.5px solid var(--app-divider)",
    color: "var(--app-text-primary)", cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.3 : 1, padding: 0, fontFamily: "inherit",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
  });

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 8, marginBottom: 14, padding: "4px 0",
      }}>
        <button onClick={() => {
            if (viewingRoundIdx === 0 && typeof onWrapToLastFree === 'function') {
              // 자유 라운드가 앞에 있는 혼합 모드: R1에서 ◀ → 마지막 F로 점프
              onWrapToLastFree();
            } else {
              setViewingRoundIdx(Math.max(0, viewingRoundIdx - 1));
            }
          }}
          disabled={viewingRoundIdx === 0 && typeof onWrapToLastFree !== 'function'}
          style={roundNavBtn(viewingRoundIdx === 0 && typeof onWrapToLastFree !== 'function')}>
          <BackIcon width={16} />
        </button>
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: 17, fontWeight: 600, color: "var(--app-text-primary)",
            letterSpacing: "-0.022em",
          }}>
            라운드 {viewingRoundIdx + 1 + roundDisplayOffset} <span style={{ color: "var(--app-text-tertiary)", fontWeight: 500 }}>/ {schedule.length + roundDisplayOffset}</span>
          </div>
          <div style={{
            fontSize: 11, fontWeight: 600, marginTop: 2,
            color: isConfirmed ? "var(--app-green)" : "var(--app-orange)",
          }}>
            {isConfirmed ? "종료됨" : "진행중"}
          </div>
        </div>
        <button onClick={() => setViewingRoundIdx(Math.min(currentRoundIdx, viewingRoundIdx + 1))}
          disabled={viewingRoundIdx >= currentRoundIdx}
          style={roundNavBtn(viewingRoundIdx >= currentRoundIdx)}>
          <BackIcon width={16} style={{ transform: "rotate(180deg)" }} />
        </button>
      </div>

      {/* split 후반부에서 전반 라운드를 정정할 때 재생성 흐름 안내 */}
      {isConfirmed && splitPhase === "second" && viewingRoundIdx < 6 && (
        <div style={{
          fontSize: 11, color: "var(--app-orange)", textAlign: "center", marginBottom: 12,
          padding: "6px 10px", background: "rgba(255,149,0,0.1)", borderRadius: 6,
        }}>
          후반 일정은 이미 전반 순위로 생성됨 · 점수 변경 시 후반을 재생성하려면 7라운드부터 확정취소하세요
        </div>
      )}

      {/* 그룹 스플릿 배너: 7라운드 시작 시 표시 */}
      {splitPhase === "second" && viewingRoundIdx === 6 && (
        <div style={{
          textAlign: "center", padding: "12px 14px", marginBottom: 12, borderRadius: 12,
          background: "rgba(0,122,255,0.1)",
          border: "0.5px solid rgba(0,122,255,0.25)",
        }}>
          <div style={{
            fontSize: 15, fontWeight: 600, color: "var(--app-text-primary)",
            letterSpacing: "-0.014em",
          }}>그룹 스플릿</div>
          <div style={{ fontSize: 12, color: "var(--app-text-secondary)", marginTop: 2 }}>
            전반 6라운드 순위 기준으로 상위/하위 리그가 편성되었습니다
          </div>
        </div>
      )}

      {matchInfos.map((mi, i) => {
        const isSecondHalf = splitPhase === "second" && viewingRoundIdx >= 6;
        const currentMatchCount = round?.matches?.length || 1;
        const courtLabel = isSecondHalf
          ? (i === 0 ? "상위 리그" : "하위 리그")
          : currentMatchCount >= 2 ? (i === 0 ? "A구장" : "B구장") : `매치 ${i + 1}`;
        const courtColorVar = isSecondHalf
          ? (i === 0 ? "var(--app-green)" : "var(--app-orange)")
          : (i === 0 ? "var(--app-blue)" : "var(--app-orange)");
        return (
        <div key={`${viewingRoundIdx}_${i}`} style={{ marginBottom: 18 }}>
          <div style={{
            fontSize: 12, fontWeight: 600,
            color: courtColorVar,
            letterSpacing: "-0.01em",
            marginBottom: 8, marginLeft: 4,
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: courtColorVar }} />
            {courtLabel}
          </div>
          <CourtRecorder
            matchInfo={mi}
            homePlayers={mi.homePlayers}
            awayPlayers={mi.awayPlayers}
            allEvents={allEvents}
            onRecordEvent={onRecordEvent}
            onUndoEvent={onUndoEvent}
            onDeleteEvent={onDeleteEvent}
            onEditEvent={onEditEvent}
            onFinish={() => { }}
            onGkChange={(teamIdx, player) => {
              if (isConfirmed && editingThisRound) {
                const side = teamIdx === mi.homeIdx ? 'home' : (teamIdx === mi.awayIdx ? 'away' : null);
                if (side) onEditPastGk?.(mi.matchId, side, player);
              } else {
                // 보고 있는 라운드에 귀속시켜 기록(전역 한 칸 공유 금지)
                onGkChange?.(teamIdx, player, viewingRoundIdx);
              }
            }}
            styles={s}
            courtLabel={courtLabel}
            attendees={attendees}
            readOnly={isConfirmed && !editingThisRound}
            compose={compose}
            setCompose={setCompose}
            mercs={(isConfirmed
              ? (completedByMatchId[mi.matchId]?.mercenaries || [])
              : (liveMercs?.[mi.matchId] || [])
            ).map(m => ({
              player: m.player,
              side: m.teamIdx === mi.homeIdx ? "home" : (m.teamIdx === mi.awayIdx ? "away" : null),
            })).filter(m => m.side)}
            onAddMerc={(player, side) => {
              const teamIdx = side === "home" ? mi.homeIdx : mi.awayIdx;
              if (isConfirmed && editingThisRound) onEditPastMercAdd?.(mi.matchId, teamIdx, player);
              else onAddLiveMerc?.(mi.matchId, teamIdx, player);
            }}
            onRemoveMerc={(player) => {
              if (isConfirmed && editingThisRound) onEditPastMercRemove?.(mi.matchId, player);
              else onRemoveLiveMerc?.(mi.matchId, player);
            }}
            absentees={isConfirmed
              ? { [mi.matchId]: {
                  [mi.homeIdx]: completedByMatchId[mi.matchId]?.homeAbsent || [],
                  [mi.awayIdx]: completedByMatchId[mi.matchId]?.awayAbsent || [],
                } }
              : absentees}
            onToggleAbsent={isConfirmed
              ? (onEditPastAbsent ? (({ matchId, teamIdx, player }) => onEditPastAbsent({ matchId, teamIdx, player })) : undefined)
              : onToggleAbsent}
          />
        </div>
        );
      })}
    </div>
  );
}
