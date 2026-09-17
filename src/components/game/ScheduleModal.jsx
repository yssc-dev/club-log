import React from 'react';
import { useTheme } from '../../hooks/useTheme';
import { TEAM_COLORS } from '../../config/constants';
import { calcMatchScore } from '../../utils/scoring';
import Modal from '../common/Modal';

export default function ScheduleModal({ schedule, currentRoundIdx, viewingRoundIdx, setViewingRoundIdx, confirmedRounds, allEvents, teamNames, teamColorIndices, courtCount, splitPhase, teamCount, matchMode, rotations, isCup = false, completedMatches = [], onOpenAutoConfig, onViewFreeMatch, onPopScheduleSegment, roundDisplayOffset = 0, onClose, styles: s }) {
  const { C } = useTheme();

  const pill = (teamIdx) => {
    const ci = teamColorIndices?.[teamIdx];
    const tc = ci != null ? TEAM_COLORS[ci] : null;
    return {
      display: "inline-block", padding: "3px 8px", borderRadius: 12, fontSize: 12, fontWeight: 700,
      background: tc ? `${tc.bg}55` : C.cardLight,
      color: C.white,
      border: tc ? `1px solid ${tc.bg}88` : "none",
      whiteSpace: "nowrap",
    };
  };

  const getMatchCell = (pair, ci, ri) => {
    if (!pair) return <span style={{ color: C.grayDark, fontSize: 12 }}>-</span>;
    const confirmed = confirmedRounds[ri];
    let score = null;
    if (confirmed) {
      const matchId = `R${ri + 1}_C${ci}`;
      const evts = allEvents.filter(e => e.matchId === matchId);
      const hs = calcMatchScore(evts, matchId, teamNames[pair[0]]);
      const as_ = calcMatchScore(evts, matchId, teamNames[pair[1]]);
      score = { home: hs, away: as_ };
    }
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
        <span style={pill(pair[0])}>{teamNames[pair[0]]}</span>
        {score ? (
          <span style={{ fontSize: 13, fontWeight: 800, color: C.white, minWidth: 28, textAlign: "center" }}>{score.home}:{score.away}</span>
        ) : (
          <span style={{ fontSize: 11, color: C.grayDark }}>vs</span>
        )}
        <span style={pill(pair[1])}>{teamNames[pair[1]]}</span>
      </div>
    );
  };

  // 세그먼트마다 코트수가 다를 수 있으므로 전역 courtCount 대신
  // schedule 내 라운드별 matches.length 최대값으로 레이아웃 결정
  const maxMatchesPerRound = schedule.reduce((max, r) => Math.max(max, r.matches?.length || 0), 1);
  const is2Court = maxMatchesPerRound >= 2;

  const formatDesc = (() => {
    if (isCup) return `풀리그 1회전 · ${schedule.length}라운드`;
    if (matchMode === "free" && schedule.length > 0) return `자유대진 + 자동 ${schedule.length}라운드 · ${courtCount}코트`;
    if (teamCount === 4 && courtCount === 2 && matchMode === "schedule") return "4팀·2코트 — 동일팀 4번씩 경기 · 12라운드";
    if (teamCount === 5 && courtCount === 2 && matchMode === "schedule") return "5팀·2코트 — 동일팀 2번씩 · 10라운드 · 매R 1팀 휴식";
    if (teamCount === 6 && courtCount === 2 && matchMode === "schedule") return "6팀·2코트 — 그룹 스플릿 · 12라운드";
    if (teamCount === 7 && courtCount === 2 && matchMode === "schedule") return "7팀·2코트 — 전팀 풀리그 · 11라운드 · 매R 3팀 휴식";
    if (teamCount === 8 && courtCount === 2 && matchMode === "schedule") return "8팀·2코트 — 그룹 스플릿 · 12라운드";
    if (courtCount === 1 && matchMode === "schedule") return `${teamCount}팀·1코트 — 라운드로빈 × ${rotations || 1}회전`;
    if (matchMode === "free") return "자유대진 — 매 라운드 직접 선택";
    return `${teamCount}팀 · ${courtCount}코트`;
  })();

  const freeMatches = completedMatches.filter(m => m?.matchId?.startsWith?.('F'));
  const freeMatchCount = freeMatches.length;
  const canOpenAutoConfig = typeof onOpenAutoConfig === 'function';

  return (
    <Modal onClose={onClose} title="대진표">
      {/* 경기방식 요약 */}
      <div style={{
        fontSize: 11, color: C.gray, textAlign: "center", padding: "6px 10px",
        background: C.cardLight, borderRadius: 8, marginBottom: 10,
      }}>
        <span style={{ color: C.accent, fontWeight: 700 }}>경기방식</span>
        <span style={{ margin: "0 6px", opacity: 0.4 }}>|</span>
        {formatDesc}
      </div>
      {freeMatchCount > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, marginBottom: 6, paddingLeft: 2 }}>
            자유 라운드 ({freeMatchCount})
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...s.th, minWidth: 28 }}>#</th>
                <th style={s.th}>대진</th>
                <th style={{ ...s.th, minWidth: 30 }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {freeMatches.map((m, i) => {
                const hc = teamColorIndices?.[m.homeIdx];
                const ac = teamColorIndices?.[m.awayIdx];
                const homePill = hc != null ? TEAM_COLORS[hc] : null;
                const awayPill = ac != null ? TEAM_COLORS[ac] : null;
                const pillStyle = (tc) => ({
                  display: "inline-block", padding: "3px 8px", borderRadius: 12, fontSize: 12, fontWeight: 700,
                  background: tc ? `${tc.bg}55` : C.cardLight,
                  color: C.white,
                  border: tc ? `1px solid ${tc.bg}88` : "none",
                  whiteSpace: "nowrap",
                });
                const canClick = typeof onViewFreeMatch === "function";
                return (
                  <tr key={m.matchId || i}
                      onClick={canClick ? () => onViewFreeMatch(i) : undefined}
                      style={{ cursor: canClick ? "pointer" : "default" }}>
                    <td style={{ ...s.td(), fontSize: 12, fontWeight: 700, color: C.gray }}>F{i + 1}</td>
                    <td style={{ ...s.td(), padding: "6px 2px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                        <span style={pillStyle(homePill)}>{m.homeTeam}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: C.white, minWidth: 28, textAlign: "center" }}>
                          {m.homeScore}:{m.awayScore}
                        </span>
                        <span style={pillStyle(awayPill)}>{m.awayTeam}</span>
                      </div>
                    </td>
                    <td style={{ ...s.td(), padding: "4px 2px" }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 6px", borderRadius: 4, background: "#22c55e22", color: "#22c55e" }}>
                        종료
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {schedule.length === 0 ? (
        <div style={{ textAlign: "center", color: C.gray, padding: "24px 8px", fontSize: 13 }}>
          아직 자동 생성된 대진표가 없습니다.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...s.th, minWidth: 28 }}>R</th>
              {is2Court ? (
                <>
                  <th style={s.th}>A구장</th>
                  <th style={s.th}>B구장</th>
                </>
              ) : (
                <th style={s.th}>대진</th>
              )}
              <th style={{ ...s.th, minWidth: 30 }}>상태</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((round, ri) => {
              const isCurrent = ri === currentRoundIdx;
              const isConfirmed = confirmedRounds[ri];
              const isSplitBoundary = (teamCount === 6 || teamCount === 8) && splitPhase === "second" && ri === 6;
              return (
                <React.Fragment key={ri}>
                  {/* 스플릿 구분선 */}
                  {isSplitBoundary && (
                    <tr>
                      <td colSpan={is2Court ? 4 : 3} style={{ padding: 0 }}>
                        <div style={{
                          textAlign: "center", padding: "8px 0", margin: "4px 0",
                          background: `linear-gradient(90deg, ${C.green}22, ${C.orange}22)`,
                          borderTop: `1px solid ${C.grayDark}`, borderBottom: `1px solid ${C.grayDark}`,
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: C.white }}>
                            ── 그룹 스플릿 ──
                          </span>
                          <div style={{ fontSize: 10, color: C.gray, marginTop: 2 }}>
                            <span style={{ color: C.green }}>상위 리그(1~3위)</span> | <span style={{ color: C.orange }}>하위 리그(4~6위)</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  <tr onClick={() => { setViewingRoundIdx(ri <= currentRoundIdx ? ri : viewingRoundIdx); onClose(); }}
                    style={{ cursor: "pointer", background: isCurrent ? `${C.accent}11` : "transparent" }}>
                    <td style={{ ...s.td(isCurrent), fontSize: 13, fontWeight: 700 }}>{ri + 1 + roundDisplayOffset}</td>
                    {is2Court ? (
                      <>
                        <td style={{ ...s.td(), padding: "6px 2px" }}>{getMatchCell(round.matches?.[0], 0, ri)}</td>
                        <td style={{ ...s.td(), padding: "6px 2px" }}>{getMatchCell(round.matches?.[1], 1, ri)}</td>
                      </>
                    ) : (
                      <td style={{ ...s.td(), padding: "6px 2px" }}>
                        {(round.matches || []).map((pair, mi) => (
                          <div key={mi} style={{ marginBottom: mi < (round.matches?.length ?? 1) - 1 ? 4 : 0 }}>
                            {getMatchCell(pair, mi, ri)}
                          </div>
                        ))}
                      </td>
                    )}
                    <td style={{ ...s.td(), padding: "4px 2px" }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 6px", borderRadius: 4, background: isConfirmed ? "#22c55e22" : isCurrent || ri < currentRoundIdx ? `${C.orange}22` : "transparent", color: isConfirmed ? "#22c55e" : isCurrent || ri < currentRoundIdx ? C.orange : C.grayDark }}>
                        {isConfirmed ? "종료" : isCurrent || ri < currentRoundIdx ? "진행" : "-"}
                      </span>
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}
      {canOpenAutoConfig && (
        <div style={{ marginTop: 12, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={onOpenAutoConfig}
            style={{
              background: C.accent, color: C.bg, border: 0, borderRadius: 999,
              padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}
          >
            + 대진표 자동설정
          </button>
          {schedule.length > 0 && typeof onPopScheduleSegment === "function" && (
            <button
              onClick={() => {
                const input = prompt(`마지막 N개 라운드를 제거합니다 (현재 자동 ${schedule.length}라운드). 제거할 N을 입력:`, "5");
                if (!input) return;
                const n = parseInt(input, 10);
                if (!Number.isFinite(n) || n <= 0) { alert("올바른 숫자를 입력하세요."); return; }
                if (n > schedule.length) { alert(`자동 schedule 라운드 수(${schedule.length})보다 큽니다.`); return; }
                if (!confirm(`마지막 ${n}개 라운드와 그 매치/이벤트 기록을 모두 제거합니다. 진행할까요?`)) return;
                onPopScheduleSegment(n);
              }}
              style={{
                background: "transparent", color: C.orange, border: `1px solid ${C.orange}88`,
                borderRadius: 999, padding: "10px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              마지막 N라운드 제거
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
