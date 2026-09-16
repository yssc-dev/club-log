// 통합 로우 로그 (로그_이벤트, 로그_선수경기) 쓰기용 row 빌더 모음.
// React/DOM 의존성 없음. Apps Script 스키마와 1:1 대응.

import { normalizeMatchId } from './matchIdNormalizer';

export const RAW_EVENT_COLUMNS = [
  "team", "sport", "mode", "tournament_id",
  "date", "match_id", "our_team", "opponent",
  "event_type", "player", "related_player", "concede_gk", "position",
  "input_time", "game_id",
];

export const RAW_PLAYER_GAME_COLUMNS = [
  "team", "sport", "mode", "tournament_id", "date",
  "player", "session_team",
  "games", "field_games", "keeper_games",
  "goals", "assists", "owngoals", "fouls", "conceded", "cleansheets",
  "crova", "goguma", "rank_score",
  "input_time",
];

/**
 * 풋살 pointEvents → 로그_이벤트 rows
 * @param {{ team:string, gameId?:string, events:Array<object>, mode?:string, tournamentId?:string }} input
 */
export function buildRawEventsFromFutsal({ team, gameId = '', events, mode = '기본', tournamentId = '' }) {
  const out = [];
  (events || []).forEach(e => {
    const common = {
      team, sport: '풋살', mode, tournament_id: tournamentId,
      date: e.gameDate || '',
      match_id: normalizeMatchId(e.matchId || '', '풋살'),
      our_team: e.myTeam || '', opponent: e.opponentTeam || '',
      position: '', input_time: e.inputTime || '',
      game_id: gameId,
    };
    if (e.scorer) {
      out.push({ ...common, event_type: 'goal', player: e.scorer, related_player: e.assist || '', concede_gk: e.concedingGk || '' });
    } else if (e.ownGoalPlayer) {
      out.push({ ...common, event_type: 'owngoal', player: e.ownGoalPlayer, related_player: '', concede_gk: e.concedingGk || '' });
    } else if (e.foulPlayer) {
      out.push({ ...common, event_type: 'foul', player: e.foulPlayer, related_player: '', concede_gk: e.concedingGk || '' });
    } else if (e.concedingGk) {
      out.push({ ...common, event_type: 'concede', player: e.concedingGk, related_player: '', concede_gk: e.concedingGk });
    }
  });
  return out;
}

export function buildRawPlayerGamesFromFutsal({ team, inputTime, players, mode = '기본', tournamentId = '' }) {
  return (players || []).map(p => ({
    team, sport: '풋살', mode, tournament_id: tournamentId,
    date: p.gameDate || '', player: p.name || '', session_team: p.playerTeam || '',
    games: 0, field_games: 0, keeper_games: Number(p.keeperGames) || 0,
    goals: Number(p.goals) || 0,
    assists: Number(p.assists) || 0,
    owngoals: Number(p.owngoals) || 0,
    fouls: Number(p.fouls) || 0,
    conceded: Number(p.conceded) || 0,
    cleansheets: Number(p.cleanSheets) || 0,
    crova: Number(p.crova) || 0,
    goguma: Number(p.goguma) || 0,
    rank_score: Number(p.rankScore) || 0,
    input_time: inputTime || '',
  }));
}

const SOCCER_EVENT_MAP = {
  '출전': 'lineup',
  '골': 'goal',
  '자책골': 'owngoal',
  '실점': 'concede',
  '교체': 'sub',
  '상대자책골': 'opponent_owngoal', // 우리팀 +1, 귀속 선수 없음(분석에선 무시되나 로그 완전성 위해 기록)
};

/**
 * 축구 이벤트로그 row → 로그_이벤트 rows (기본/대회 공통)
 * @param {{ team, mode, tournamentId, gameId, events }} input
 */
export function buildRawEventsFromSoccer({ team, mode = '기본', tournamentId = '', gameId = '', events }) {
  const out = [];
  (events || []).forEach(e => {
    const type = SOCCER_EVENT_MAP[e.event];
    if (!type) return;
    out.push({
      team, sport: '축구', mode, tournament_id: tournamentId || '',
      date: e.gameDate || '',
      match_id: normalizeMatchId(String(e.matchNum ?? ''), '축구'),
      our_team: team, opponent: e.opponent || '',
      event_type: type,
      player: e.player || '', related_player: e.relatedPlayer || '',
      concede_gk: type === 'concede' ? (e.player || '') : '',
      position: e.position || '', input_time: e.inputTime || '',
      game_id: gameId,
    });
  });
  return out;
}

export function buildRawPlayerGamesFromSoccer({ team, inputTime, players }) {
  return (players || []).map(p => ({
    team, sport: '축구', mode: '기본', tournament_id: '',
    date: p.gameDate || '', player: p.name || '', session_team: team,
    games: Number(p.games) || 0,
    field_games: Number(p.fieldGames) || 0,
    keeper_games: Number(p.keeperGames) || 0,
    goals: Number(p.goals) || 0,
    assists: Number(p.assists) || 0,
    owngoals: Number(p.owngoals) || 0,
    fouls: Number(p.fouls) || 0,
    conceded: Number(p.conceded) || 0,
    cleansheets: Number(p.cleanSheets) || 0,
    crova: 0, goguma: 0, rank_score: 0,
    input_time: inputTime || '',
  }));
}

export function buildRawPlayerGamesFromTournament({ team, tournamentId, inputTime, events }) {
  const byDatePlayer = {};
  const ensure = (date, name) => {
    const k = date + '|' + name;
    if (!byDatePlayer[k]) {
      byDatePlayer[k] = { date, player: name, games: 0, field_games: 0, keeper_games: 0, goals: 0, assists: 0, owngoals: 0, conceded: 0, cleansheets: 0 };
    }
    return byDatePlayer[k];
  };
  (events || []).forEach(e => {
    const d = e.gameDate || '';
    if (e.event === '출전') {
      const s = ensure(d, e.player); s.games++;
      if (e.position === 'GK') s.keeper_games++; else s.field_games++;
    } else if (e.event === '골') {
      ensure(d, e.player).goals++;
      if (e.relatedPlayer) ensure(d, e.relatedPlayer).assists++;
    } else if (e.event === '자책골') {
      ensure(d, e.player).owngoals++;
    } else if (e.event === '실점' && e.player) {
      ensure(d, e.player).conceded++;
    } else if (e.event === '교체') {
      const s = ensure(d, e.player); s.games++;
      if (e.position === 'GK') s.keeper_games++; else s.field_games++;
    }
  });
  Object.values(byDatePlayer).forEach(s => {
    s.cleansheets = (s.keeper_games > 0 && s.conceded === 0) ? 1 : 0;
  });
  return Object.values(byDatePlayer).map(s => ({
    team, sport: '축구', mode: '대회', tournament_id: tournamentId || '',
    date: s.date, player: s.player, session_team: team,
    games: s.games, field_games: s.field_games, keeper_games: s.keeper_games,
    goals: s.goals, assists: s.assists, owngoals: s.owngoals, fouls: 0,
    conceded: s.conceded, cleansheets: s.cleansheets,
    crova: 0, goguma: 0, rank_score: 0,
    input_time: inputTime || '',
  }));
}
