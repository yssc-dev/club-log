// src/components/cup/CupDetail.jsx
// 대회 상세 — 스펙 §6.1: 시작·이어서·팀 관리·상태·삭제. 3단계(2026-09-26 스펙 §4.2·§5): 컵 뷰 2종을 읽어
// 누적 순위표·개인기록·경기일별 결과를 그리고, 잠금은 lockedAt OR 로그 파생(collectPlayedPairs).
// 컵 전용 지표(2026-10-02 스펙 §5.1): 시상·맞대결 전적·필드 지표(수비력·관여 통합) 섹션. 키퍼는 개인기록에 통합.
// 탭 구조(2026-10-02): 대시보드 · 분석 · 팀 관리 세 탭으로 분리.
import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import CupSync from '../../services/cupSync';
import SheetCache from '../../services/sheetCache';
import { validateTeams, isLocked } from '../../utils/cup/cupEntity';
import { isCupSession } from '../../utils/cup/cupSession';
import { selectCupRows, calcCupStandings, calcCupPlayerRecords, collectPlayedPairs } from '../../utils/cup/cupRecords';
import { calcCupHeadToHead, calcCupKeepers, calcCupAwards, calcCupOnOff, mergePlayerKeeperRecords } from '../../utils/cup/cupInsights';
import { getCupSettings } from '../../config/settings';
import CupTeamEditor from './CupTeamEditor';
import CupStandingsTable from './CupStandingsTable';
import CupPlayerRecordsTable from './CupPlayerRecordsTable';
import CupDayResults from './CupDayResults';
import CupAwardsCards from './CupAwardsCards';
import CupHeadToHead from './CupHeadToHead';
import CupFieldImpactTable from './CupFieldImpactTable';

export default function CupDetail({ teamName, cup, members, pendingGames = [], isAdmin, onStartGame, onContinueGame, onBack, onChanged }) {
  const { C } = useTheme();
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  // 팀이 하나도 없는 새 대회는 관리자에게 편집기를 바로 연다(요약할 것이 없으므로).
  const [editing, setEditing] = useState(() => isAdmin && (cup.teams?.length ?? 0) === 0);
  // 초기 탭: 관리자이고 팀이 0개면 'teams', 아니면 'dashboard'.
  const [activeTab, setActiveTab] = useState(() =>
    isAdmin && (cup.teams?.length ?? 0) === 0 ? 'teams' : 'dashboard'
  );
  const cupId = cup.meta.id;
  // 컵 뷰 읽기. sport 를 명시한다 — AuthUtil.mode 는 대시보드 종목 토글을 따라오지 않는다(겸직팀 함정).
  // alive 플래그로 대회 전환·언마운트 뒤 늦게 도착한 응답을 폐기한다. retry 는 "다시 시도" 카운터.
  const [records, setRecords] = useState({ status: 'loading', matchRows: [], eventRows: [] });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!cupId) return undefined;
    let alive = true;
    setRecords(r => ({ ...r, status: 'loading' }));
    Promise.all([
      SheetCache.get('cupMatchLog', { sport: '풋살' }),
      SheetCache.get('cupEventLog', { sport: '풋살' }),
    ]).then(([matchRows, eventRows]) => {
      if (alive) setRecords({ status: 'ok', matchRows: matchRows || [], eventRows: eventRows || [] });
    }).catch(() => {
      if (alive) setRecords({ status: 'error', matchRows: [], eventRows: [] });
    });
    return () => { alive = false; };
  }, [cupId, retry]);

  const computed = useMemo(() => {
    const sel = selectCupRows({ matchRows: records.matchRows, eventRows: records.eventRows, cupId });
    const { standings, days } = calcCupStandings({ matchRows: sel.matchRows, cup });
    const players = calcCupPlayerRecords({ matchRows: sel.matchRows, eventRows: sel.eventRows, cup });
    const keepers = calcCupKeepers({ matchRows: sel.matchRows });
    const onoff = calcCupOnOff({ matchRows: sel.matchRows, cup });
    const awards = calcCupAwards({ players, keepers, onoff, days });
    const mergedPlayers = mergePlayerKeeperRecords(players, keepers);
    return {
      hasMatches: sel.matchRows.length > 0,
      standings, days,
      players,
      mergedPlayers,
      keepers,
      awards,
      onoff,
      h2h: calcCupHeadToHead({ matchRows: sel.matchRows, cup }),
      playedPairs: collectPlayedPairs(records.matchRows, cupId),
    };
  }, [records.matchRows, records.eventRows, cupId, cup]);
  const ownGoalPoint = useMemo(() => getCupSettings(teamName)?.ownGoalPoint ?? -1, [teamName]);
  const locked = isLocked(cup, computed.playedPairs);
  const active = cup.meta.status === 'active';
  const validation = validateTeams(cup.teams);
  const canStart = isAdmin && active && validation.ok;
  const pendingCup = pendingGames.find(g => isCupSession(g.state) && g.state.tournamentId === cup.meta.id);

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); await onChanged?.(); }
    catch (e) { alert(`저장 실패: ${e?.message || e}`); }
    finally { setBusy(false); }
  };
  const handleSave = async (teams) => {
    setBusy(true); setSaving(true);
    try { await CupSync.saveTeams(teamName, cup.meta.id, teams); await onChanged?.(); setEditing(false); }
    catch (e) { alert(`저장 실패: ${e?.message || e}`); }
    finally { setSaving(false); setBusy(false); }
  };
  const toggleStatus = () => run(() => CupSync.setStatus(teamName, cup.meta.id, active ? 'finished' : 'active'));
  const handleDelete = () => {
    if (!confirm(`"${cup.meta.name}" 대회를 삭제할까요? 팀 구성이 사라집니다.`)) return;
    run(async () => { await CupSync.deleteCup(teamName, cup.meta.id); onBack?.(); });
  };

  const section = { padding: "0 20px", marginBottom: 18 };
  const title = { fontSize: 13, color: C.gray, marginBottom: 8, paddingLeft: 4 };
  const card = { background: C.card, borderRadius: 14, padding: 14, border: `1px solid ${C.borderColor}` };
  const btn = (bg, fg = "#fff", extra = {}) => ({ background: bg, color: fg, border: "none", borderRadius: 12, padding: "12px 16px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", width: "100%", ...extra });
  const tabBtn = (isActive) => ({
    flex: 1, padding: "12px 6px", textAlign: "center",
    fontSize: 14, fontWeight: isActive ? 600 : 500, whiteSpace: "nowrap",
    border: "none", cursor: "pointer", background: "transparent", fontFamily: "inherit",
    color: isActive ? C.accent : C.gray,
    borderBottom: isActive ? `2px solid ${C.accent}` : "2px solid transparent",
  });

  // 로딩/에러/빈 상태를 분석 탭과 대시보드 탭이 공유한다.
  const renderRecordsStatus = () => {
    if (records.status === 'loading') {
      return <div data-role="cup-records-loading" style={{ color: C.gray, fontSize: 13, padding: 8 }}>기록 불러오는 중…</div>;
    }
    if (records.status === 'error') {
      return (
        <div data-role="cup-records-error" style={{ ...card, color: "var(--app-red)", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span>기록을 불러오지 못했습니다</span>
          <button data-role="cup-records-retry" onClick={() => setRetry(n => n + 1)} style={btn("var(--app-bg-row)", C.white, { width: "auto", padding: "6px 10px", fontSize: 12 })}>다시 시도</button>
        </div>
      );
    }
    if (records.status === 'ok' && !computed.hasMatches) {
      return <div data-role="cup-records-empty" style={{ color: C.gray, fontSize: 13, padding: 8 }}>아직 마감된 경기가 없습니다</div>;
    }
    return null;
  };

  const recordsOk = records.status === 'ok' && computed.hasMatches;

  return (
    <div>
      {/* 헤더: 탭 위에 항상 표시 */}
      <div style={section}>
        <button onClick={onBack} style={{ background: "transparent", border: "none", color: C.accent, fontSize: 14, cursor: "pointer", padding: "4px 0", fontFamily: "inherit" }}>← 대회 목록</button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.white }}>🏆 {cup.meta.name}</div>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: active ? "rgba(52,199,89,0.15)" : "var(--app-bg-row)", color: active ? "var(--app-green)" : C.gray }}>{active ? '진행중' : '완료'}</span>
          {locked && <span style={{ fontSize: 11, color: "var(--app-orange)" }}>🔒 잠김</span>}
        </div>
        <div style={{ fontSize: 12, color: C.gray, marginTop: 4 }}>{cup.teams.length}팀 · 경기일별 풀리그</div>
      </div>

      {/* 탭 바 */}
      <div data-role="cup-tabs" style={{ display: "flex", borderBottom: `1px solid ${C.borderColor}`, marginBottom: 8 }}>
        <button data-role="cup-tab" data-tab="dashboard" aria-selected={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} style={tabBtn(activeTab === 'dashboard')}>대시보드</button>
        <button data-role="cup-tab" data-tab="analysis" aria-selected={activeTab === 'analysis'} onClick={() => setActiveTab('analysis')} style={tabBtn(activeTab === 'analysis')}>분석</button>
        <button data-role="cup-tab" data-tab="teams" aria-selected={activeTab === 'teams'} onClick={() => setActiveTab('teams')} style={tabBtn(activeTab === 'teams')}>팀 관리</button>
      </div>

      {/* 대시보드 탭 */}
      {activeTab === 'dashboard' && (
        <>
          {pendingCup && (
            <div style={section}>
              <div style={{ ...card, background: "rgba(0,122,255,0.08)", border: "0.5px solid rgba(0,122,255,0.25)", cursor: "pointer" }} onClick={() => onContinueGame?.(pendingCup.gameId)}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--app-blue)" }}>진행 중인 컵 세션이 있습니다</div>
                <button style={{ ...btn("var(--app-blue)"), marginTop: 8 }}>이어서 기록</button>
              </div>
            </div>
          )}

          {isAdmin && (
            <div style={section}>
              <button disabled={!canStart || busy} onClick={() => onStartGame?.('cup', { cupId: cup.meta.id })}
                style={btn("var(--app-orange)", "#fff", { opacity: canStart && !busy ? 1 : 0.45 })}>오늘 컵 경기 시작</button>
              {!active && <div style={{ fontSize: 12, color: C.gray, marginTop: 6 }}>완료된 대회입니다. "다시 열기" 후 시작할 수 있습니다.</div>}
              {active && !validation.ok && <div style={{ fontSize: 12, color: "var(--app-red)", marginTop: 6 }}>{validation.errors.join(' · ')}</div>}
            </div>
          )}

          <div style={section}>
            <div style={title}>순위표 (누적)</div>
            {renderRecordsStatus() ?? (
              <div style={card}><CupStandingsTable standings={computed.standings} finished={cup.meta.status === 'finished'} /></div>
            )}
          </div>

          {recordsOk && (
            <>
              {computed.awards.length > 0 && (
                <div style={section}>
                  <div style={title}>시상</div>
                  <CupAwardsCards awards={computed.awards} />
                </div>
              )}
              <div style={section}>
                <div style={title}>경기일별 결과</div>
                <CupDayResults days={computed.days} />
              </div>
            </>
          )}
        </>
      )}

      {/* 분석 탭 */}
      {activeTab === 'analysis' && (
        <>
          {records.status !== 'ok' || !computed.hasMatches ? (
            <div style={section}>{renderRecordsStatus()}</div>
          ) : (
            <>
              <div style={section}>
                <div style={title}>개인기록</div>
                <div style={card}><CupPlayerRecordsTable records={computed.mergedPlayers} ownGoalPoint={ownGoalPoint} /></div>
              </div>
              <div style={section}>
                <div style={title}>맞대결 전적</div>
                <div style={card}><CupHeadToHead teams={computed.h2h.teams} cells={computed.h2h.cells} /></div>
              </div>
              <div style={section}>
                <div style={title}>필드 지표</div>
                <div style={card}><CupFieldImpactTable minOn={computed.onoff.minOn} rated={computed.onoff.rated} unrated={computed.onoff.unrated} /></div>
              </div>
            </>
          )}
        </>
      )}

      {/* 팀 관리 탭 */}
      {activeTab === 'teams' && (
        <>
          <div style={section}>
            {!editing ? (
              <>
                <div data-role="team-summary-list">
                  {cup.teams.map(t => {
                    const players = t.players || [];
                    return (
                      <div key={t.id} data-role="team-summary" data-team={t.id} style={{ ...card, marginBottom: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.white }}>{t.name} <span style={{ fontSize: 12, color: C.gray, fontWeight: 400 }}>· {players.length}명</span></div>
                        <div style={{ fontSize: 12, color: C.gray, marginTop: 4 }}>{players.length ? players.map(p => (p === t.captain ? `★${p}` : p)).join(', ') : '팀원 없음'}</div>
                      </div>
                    );
                  })}
                  {cup.teams.length === 0 && <div style={{ fontSize: 12, color: C.gray, padding: 4 }}>아직 팀이 없습니다</div>}
                </div>
                {locked && <div style={{ fontSize: 12, color: "var(--app-orange)", marginTop: 4 }}>🔒 첫 경기 마감 후 팀명·팀 수는 고정. 팀원·팀장은 편집 가능</div>}
                {isAdmin && <button data-role="team-edit" onClick={() => setEditing(true)} style={btn("var(--app-bg-row)", C.white, { marginTop: 8 })}>팀 편집</button>}
              </>
            ) : (
              <CupTeamEditor key={`${cup.meta.id}:${cup.meta.updatedAt}`} teams={cup.teams} members={members} locked={locked} disabled={!isAdmin} saving={saving} onSave={handleSave} onCancel={() => setEditing(false)} />
            )}
          </div>

          {isAdmin && (
            <div style={{ ...section, display: "flex", gap: 8 }}>
              <button disabled={busy} onClick={toggleStatus} style={btn("var(--app-bg-row)", C.white)}>{active ? '대회 종료' : '다시 열기'}</button>
              {/* 진행 중인 세션이 있으면 삭제를 막는다. 삭제되면 그 세션의 마감은 로그 3종에 tournament_id 를
                  그대로 쓰지만 markLocked 는 "대회를 찾을 수 없습니다"로 실패하고(경고만 남는다) 대회 엔티티가
                  사라져, 시트에 주인 없는 행만 남는다. CupSync.deleteCup 은 lockedAt 만 보므로 여기서 막는다. */}
              <button disabled={busy || locked || !!pendingCup} onClick={handleDelete}
                title={locked ? '경기 기록이 있는 대회는 삭제할 수 없습니다' : (pendingCup ? '진행 중인 컵 세션이 있습니다. 마감 후 삭제하세요' : '')}
                style={btn("rgba(255,59,48,0.12)", "var(--app-red)", { opacity: (locked || pendingCup) ? 0.45 : 1 })}>대회 삭제</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
