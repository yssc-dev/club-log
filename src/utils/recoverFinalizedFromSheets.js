// 시트(로그_매치/로그_이벤트/로그_선수경기) → finalized state JSON 복구.
// HistoryView 가 필요로 하는 핵심 필드(completedMatches/allEvents/teams/teamNames/attendees 등)
// 만 정확히 채우고 나머지는 합리적 기본값으로 채운다.

import AppSync from '../services/appSync';

// "1라운드 B구장" → "R1_C1"  (이미 R<n>_C<m> 형식이면 그대로)
function labelToCanonicalMatchId(label) {
  if (!label) return '';
  const s = String(label);
  if (/^[RFP]\d+_C\d+$/.test(s)) return s;
  const m = s.match(/^(\d+)라운드\s*([AB])구장$/);
  if (m) return `R${m[1]}_C${m[2] === 'A' ? '0' : '1'}`;
  const m2 = s.match(/^(\d+)경기(?:\s+([AB])구장)?$/);
  if (m2) {
    const court = m2[2] === 'B' ? '1' : '0';
    return `F${m2[1]}_C${court}`;
  }
  return s;
}

function uniquePush(arr, v) { if (v && !arr.includes(v)) arr.push(v); }

/**
 * @param {{ team: string, date: string, settingsSnapshot?: object }} opts
 * @returns {Promise<{ gameId: string, state: object, summary: object }>}
 */
export async function recoverFinalizedStateFromSheets({ team, date, settingsSnapshot }) {
  if (!team) throw new Error('team 필요');
  if (!date) throw new Error('date 필요 (YYYY-MM-DD)');

  const [mlRes, evRes, pgRes] = await Promise.all([
    AppSync.getMatchLog({}),
    AppSync.getEventLog({}),
    AppSync.getPlayerGameLog({}),
  ]);
  if (!mlRes || !evRes || !pgRes) throw new Error('Apps Script 호출 실패');

  // 컵(tournament_id 있음) 행은 복구 대상이 아니다 — 컵 세션은 saveFinalized 로 아카이브에 이미 있다(스펙 §5).
  // 이 유틸은 SheetCache 를 거치지 않는 유일한 로그 직접 읽기라 같은 필터를 여기서도 건다.
  const isRegular = (r) => !r.tournament_id;
  const matches = (mlRes.rows || []).filter(r => isRegular(r) && String(r.date) === date && r.team === team);
  const events = (evRes.rows || []).filter(r => isRegular(r) && String(r.date) === date && r.team === team);
  const players = (pgRes.rows || []).filter(r => isRegular(r) && String(r.date) === date && r.team === team);

  if (matches.length === 0) throw new Error(`로그_매치에 ${team} ${date} 데이터 없음`);

  // gameId 는 firebaseSync._kstDateFromGameId 가 파싱 가능한 `g_<epoch_ms>` 형식이어야
  // HistoryView 가 정확한 날짜로 표시한다. legacy_ 같은 형식이면 입력 date 기반으로 재생성.
  const VALID_GAME_ID = /^g_\d+$/;
  const sheetGameIds = [...new Set(matches.map(m => m.game_id).filter(Boolean))];
  let gameId = sheetGameIds.find(id => VALID_GAME_ID.test(id));
  if (!gameId) {
    const midnightKst = new Date(`${date}T00:00:00+09:00`).getTime();
    gameId = `g_${midnightKst}`;
  }

  // teamNames: 등장 순서 유지
  const teamNames = [];
  matches.forEach(m => { uniquePush(teamNames, m.our_team_name); uniquePush(teamNames, m.opponent_team_name); });

  // teams: teamName 별 멤버 union (로그_매치의 our/opponent_members_json 기준)
  const teamMembers = {};
  teamNames.forEach(t => { teamMembers[t] = new Set(); });
  matches.forEach(m => {
    // 휴식 정보 포함 객체 형식도 지원, 팀 로스터는 players(전체) 기준으로 union
    const parseRoster = (s) => {
      try {
        const v = JSON.parse(s || '[]');
        if (Array.isArray(v)) return v.filter(x => typeof x === 'string' && x);
        if (v && typeof v === 'object' && Array.isArray(v.players)) {
          return v.players.filter(x => typeof x === 'string' && x);
        }
        return [];
      } catch { return []; }
    };
    const oM = parseRoster(m.our_members_json);
    const pM = parseRoster(m.opponent_members_json);
    if (m.our_team_name && teamMembers[m.our_team_name]) oM.forEach(p => teamMembers[m.our_team_name].add(p));
    if (m.opponent_team_name && teamMembers[m.opponent_team_name]) pM.forEach(p => teamMembers[m.opponent_team_name].add(p));
  });
  const teams = teamNames.map(t => Array.from(teamMembers[t]));
  const teamColorIndices = teamNames.map((_, i) => i);
  const teamCount = teamNames.length;

  // attendees: 멤버 union ∪ 선수경기 시트 player
  const attendeesSet = new Set();
  Object.values(teamMembers).forEach(s => s.forEach(p => attendeesSet.add(p)));
  players.forEach(p => { if (p.player) attendeesSet.add(p.player); });
  const attendees = Array.from(attendeesSet);

  // courtCount
  const courtIds = [...new Set(matches.map(m => Number(m.court_id) || 0))];
  const courtCount = courtIds.length >= 2 ? 2 : 1;

  // matchMode
  const sample = matches.find(m => m.match_id) || {};
  const sid = String(sample.match_id || '');
  const matchMode = sid.startsWith('F') ? 'free' : sid.startsWith('P') ? 'push' : 'schedule';

  // completedMatches
  const completedMatches = matches
    .slice()
    .sort((a, b) => Number(a.match_idx) - Number(b.match_idx))
    .map(m => ({
      matchId: m.match_id,
      homeTeam: m.our_team_name,
      awayTeam: m.opponent_team_name,
      homeScore: Number(m.our_score) || 0,
      awayScore: Number(m.opponent_score) || 0,
      homeGk: m.our_gk || '',
      awayGk: m.opponent_gk || '',
      isExtra: !!m.is_extra,
    }));

  // allEvents (goal/owngoal/foul — concede 행은 concede_gk 컬럼으로 이미 보존됨)
  // foul: 상대팀 +1실점 처리(owngoal과 같은 방향, loss=1). assist는 goal에만.
  const allEvents = events
    .filter(e => e.event_type === 'goal' || e.event_type === 'owngoal' || e.event_type === 'foul')
    .map(e => {
      const matchId = labelToCanonicalMatchId(e.match_id);
      const isGoal = e.event_type === 'goal';
      return {
        matchId,
        type: e.event_type, // 'goal' | 'owngoal' | 'foul'
        player: e.player || '',
        assist: isGoal ? (e.related_player || '') : '',
        team: e.our_team || '',
        scoringTeam: isGoal ? (e.our_team || '') : (e.opponent || ''),
        concedingTeam: isGoal ? (e.opponent || '') : (e.our_team || ''),
        concedingGk: e.concede_gk || '',
        concedingGkLoss: e.event_type === 'owngoal' ? 2 : 1,
      };
    });

  const finalSettings = settingsSnapshot || {
    useCrovaGoguma: true,
    crovaPoint: 1,
    gogumaPoint: -1,
    ownGoalPoint: -1, // 표준 기본값(settings.js)과 일치 — 양수면 복구 시 자책골이 가점으로 뒤집힘
  };

  const state = {
    gameId,
    phase: 'summary',
    teams,
    teamNames,
    teamColorIndices,
    teamCount,
    courtCount,
    matchMode,
    attendees,
    allEvents,
    completedMatches,
    schedule: [],
    currentRoundIdx: 0,
    confirmedRounds: {},
    earlyFinish: true,
    isExtraRound: false,
    splitPhase: 'all',
    rotations: [],
    pushState: null,
    settingsSnapshot: finalSettings,
    gks: {},
    gksHistory: {},
    gameFinalized: true,
    gameCreator: '시트복구',
    lastEditor: '시트복구',
    authUser: '시트복구',
    _recoveredFromSheets: true,
    _recoveredAt: new Date().toISOString(),
  };

  return {
    gameId,
    state,
    summary: {
      matches: completedMatches.length,
      events: allEvents.length,
      players: players.length,
      teamNames,
      attendeesCount: attendees.length,
    },
  };
}
