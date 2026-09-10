import { describe, it, expect } from 'vitest';
import { buildIntraRows, mergeEventRowsByTimestamp } from '../buildIntraRows';
import { buildEventLogRows, buildPointLogRows, buildPlayerLogRows } from '../../soccerScoring';
import { buildRawEventsFromSoccer, buildRawPlayerGamesFromSoccer } from '../../rawLogBuilders';
import { buildRoundRowsFromSoccer } from '../../matchRowBuilder';

const T = '빅마스터FC', D = '2026-09-18', IT = '2026. 9. 18. 오후 9:00:00';
const eleven = (p) => Array.from({ length: 11 }, (_, i) => `${p}${i + 1}`);
const asg = (names) => Object.fromEntries(names.map((n, i) => [i, n]));
const pm = (names) => Object.fromEntries(names.map((n, i) => [n, i === 0 ? 'GK' : i < 5 ? 'DF' : 'FW']));

const intra = {
  matchIdx: 0, status: 'finished', startedAt: 1758200000000, opponent: '파랑',
  lineup: eleven('a'), gk: 'a1', defenders: ['a2', 'a3', 'a4', 'a5'], formation: '4-4-2',
  assignments: asg(eleven('a')), positionMap: pm(eleven('a')), subs: ['a12'],
  sideA: { name: '주황' },
  sideB: { name: '파랑', lineup: eleven('b'), gk: 'b1', defenders: ['b2', 'b3', 'b4', 'b5'], formation: '4-3-3',
           assignments: asg(eleven('b')), positionMap: pm(eleven('b')), subs: ['b12'] },
  events: [
    { id: 'g1', type: 'goal', side: 'A', player: 'a9', assist: 'a8', concedeGk: 'b1', timestamp: 1758200100000 },
    { id: 'g2', type: 'goal', side: 'A', player: 'a10', assist: null, concedeGk: 'b1', timestamp: 1758200200000 },
    { id: 'g3', type: 'goal', side: 'B', player: 'b9', assist: 'b8', concedeGk: 'a1', timestamp: 1758200300000 },
    { id: 's1', type: 'sub', side: 'B', playerOut: 'b6', playerIn: 'b12', position: 'FW', posIdx: 5, timestamp: 1758200400000 },
  ],
};
const external = {
  matchIdx: 1, status: 'finished', startedAt: 1758203600000, opponent: '터틀파크',
  lineup: eleven('a'), gk: 'a1', defenders: ['a2', 'a3'], formation: '4-4-2',
  assignments: asg(eleven('a')), positionMap: pm(eleven('a')), subs: [],
  events: [
    { id: 'x1', type: 'goal', side: 'A', player: 'a9', assist: null, timestamp: 1758203700000 },
    { id: 'x2', type: 'opponentGoal', side: 'A', currentGk: 'a1', timestamp: 1758203800000 },
  ],
};

// 같은 날 2번째 자체전 — 후반 팀 재편성으로 a11↔b11 이 편을 바꾼다(스펙 §5: 재편성은 새 경기).
const lineupA2 = [...eleven('a').slice(0, 10), 'b11'];
const lineupB2 = [...eleven('b').slice(0, 10), 'a11'];
const intra2 = {
  ...intra,
  matchIdx: 1,
  startedAt: intra.startedAt + 3600000,
  lineup: lineupA2, assignments: asg(lineupA2), positionMap: pm(lineupA2),
  sideB: { ...intra.sideB, lineup: lineupB2, assignments: asg(lineupB2), positionMap: pm(lineupB2) },
  events: intra.events.map(e => ({ ...e, id: `${e.id}_2`, timestamp: e.timestamp + 3600000 })),
};

// Apps Script _writeRawPlayerGames 가 건너뛰기 판정에 쓰는 키(apps-script/Code.js:1751).
const pgKey = (r) => [r.team, r.sport, r.mode, r.tournament_id, r.date, r.player].join('|');

// 하버FC SoccerApp.handleFinalize(248-271) 를 그대로 옮긴 기준 구현
function harborRows(finished) {
  const eventLogRows = buildEventLogRows(finished, D);
  const pointLogRows = buildPointLogRows(finished, D, IT);
  const playerLogRows = buildPlayerLogRows(finished, D, IT);
  const sessionGameId = finished[0].startedAt ? `s_${finished[0].startedAt}` : `s_${D}_${finished[0].matchIdx + 1}`;
  const matchRows = buildRoundRowsFromSoccer({ team: T, mode: '기본', tournamentId: '', date: D,
    stateJSON: { soccerMatches: finished.map(m => ({ ...m, matchIdx: m.matchIdx + 1 })) }, inputTime: IT });
  matchRows.forEach(r => { r.game_id = sessionGameId; });
  return {
    sessionGameId, pointLogRows, playerLogRows,
    rawEvents: buildRawEventsFromSoccer({ team: T, gameId: sessionGameId, events: eventLogRows }),
    rawPlayerGames: buildRawPlayerGamesFromSoccer({ team: T, inputTime: IT, players: playerLogRows }),
    matchRows,
  };
}

describe('buildIntraRows — 외부전 = 하버FC 출력과 동일', () => {
  it('외부전만 있으면 하버FC 빌더 출력과 deep-equal', () => {
    expect(buildIntraRows({ team: T, dateStr: D, inputTime: IT, finished: [external] })).toEqual(harborRows([external]));
  });
});

describe('buildIntraRows — 자체전', () => {
  const out = buildIntraRows({ team: T, dateStr: D, inputTime: IT, finished: [intra] });
  it('로그_매치 1행: 양팀 명단·GK·점수 방향·객체형 B 명단·mode', () => {
    expect(out.matchRows).toHaveLength(1);
    const r = out.matchRows[0];
    expect(r.mode).toBe('자체전');
    expect(r.game_id).toBe(`s_${intra.startedAt}`);
    expect(r.match_id).toBe('1');                       // matchIdx+1 (이벤트 행과 동일)
    expect(r.our_team_name).toBe('주황');
    expect(r.opponent_team_name).toBe('파랑');
    expect(r.our_score).toBe(2);
    expect(r.opponent_score).toBe(1);
    expect(r.our_gk).toBe('a1');
    expect(r.opponent_gk).toBe('b1');
    expect(JSON.parse(r.our_members_json)).toEqual(expect.arrayContaining(eleven('a')));
    const ob = JSON.parse(r.opponent_members_json);
    expect(ob.players).toEqual(expect.arrayContaining([...eleven('b'), 'b12']));
    expect(ob.formation).toBe('4-3-3');
    expect(ob.defenders).toEqual(['b2', 'b3', 'b4', 'b5']);
    expect(r.formation).toBe('4-4-2');
    expect(JSON.parse(r.our_defenders_json)).toEqual(['a2', 'a3', 'a4', 'a5']);
    expect(r.is_extra).toBe(false);
  });
  it('로그_이벤트: 출전 22 + 골 3 + 실점 3 + 교체 1, our_team 은 편 이름, match_id 일치', () => {
    const byType = (t) => out.rawEvents.filter(e => e.event_type === t);
    expect(out.rawEvents.every(e => e.mode === '자체전' && e.game_id === `s_${intra.startedAt}` && e.match_id === out.matchRows[0].match_id)).toBe(true);
    expect(byType('goal').map(e => [e.our_team, e.player, e.related_player, e.opponent]))
      .toEqual([['주황', 'a9', 'a8', '파랑'], ['주황', 'a10', '', '파랑'], ['파랑', 'b9', 'b8', '주황']]);
    expect(byType('concede').map(e => [e.our_team, e.concede_gk])).toEqual([['파랑', 'b1'], ['파랑', 'b1'], ['주황', 'a1']]);
    expect(byType('sub')).toHaveLength(1);
    expect(byType('sub')[0].our_team).toBe('파랑');
    expect(out.rawEvents.filter(e => e.our_team === '주황').length).toBe(11 + 2 + 1);   // 출전11 + 골2 + 실점1
    expect(out.rawEvents.filter(e => e.our_team === '파랑').length).toBe(11 + 1 + 2 + 1); // 출전11 + 골1 + 실점2 + 교체1
  });
  // session_team 은 편 이름이 아니라 상수 '자체전' — 한 선수가 같은 날 양 편을 뛸 수 있기 때문(F-C1).
  it('로그_선수경기: 선수당 1행, session_team 자체전, 클린시트/실점 편별', () => {
    const pg = out.rawPlayerGames;
    expect(pg).toHaveLength(23); // a1..a11 + b1..b11 + b12(교체 투입)
    expect(new Set(pg.map(p => p.player)).size).toBe(23);
    expect(pg.every(p => p.mode === '자체전')).toBe(true);
    expect(pg.find(p => p.player === 'a1')).toMatchObject({ session_team: '자체전', keeper_games: 1, conceded: 1, cleansheets: 0 });
    expect(pg.find(p => p.player === 'b1')).toMatchObject({ session_team: '자체전', keeper_games: 1, conceded: 2, cleansheets: 0 });
    expect(pg.find(p => p.player === 'a9')).toMatchObject({ goals: 1, assists: 0 });
    expect(pg.find(p => p.player === 'b8')).toMatchObject({ goals: 0, assists: 1 });
    expect(pg.find(p => p.player === 'b12')).toMatchObject({ session_team: '자체전', games: 1 });
  });
  it('선수별집계는 양팀 합, 포인트 로그는 0행', () => {
    expect(out.playerLogRows).toHaveLength(23);
    expect(out.pointLogRows).toEqual([]);
  });
  it('자체전+외부전 혼합: 외부전 행은 mode 기본, 포인트 로그는 외부전만', () => {
    const mixed = buildIntraRows({ team: T, dateStr: D, inputTime: IT, finished: [intra, external] });
    expect(mixed.matchRows.map(r => r.mode)).toEqual(['자체전', '기본']);
    expect(mixed.pointLogRows).toEqual(buildPointLogRows([external], D, IT));
    expect(mixed.sessionGameId).toBe(`s_${intra.startedAt}`);
    expect(mixed.matchRows.every(r => r.game_id === mixed.sessionGameId)).toBe(true);
  });
});

// F-C1: Apps Script 의 로그_선수경기 dedupe 키는 (team|sport|mode|tournament_id|date|player) 라
// 경기×편 1행이면 같은 날 2번째 경기의 행이 조용히 버려진다 → 날짜 기준 집계 1행.
describe('buildIntraRows — 같은 날 자체전 2경기(팀 재편성)', () => {
  const out = buildIntraRows({ team: T, dateStr: D, inputTime: IT, finished: [intra, intra2] });

  it('로그_선수경기: 선수당 1행(중복 player 없음), 경기수는 합산', () => {
    const pg = out.rawPlayerGames;
    expect(pg).toHaveLength(23);                                  // a1..a11 + b1..b12
    expect(new Set(pg.map(p => p.player)).size).toBe(23);
    expect(pg.every(p => p.games === 2)).toBe(true);               // 23명 모두 두 경기 출전
    expect(pg.find(p => p.player === 'a11')).toMatchObject({ games: 2, session_team: '자체전' });
    expect(pg.find(p => p.player === 'b11')).toMatchObject({ games: 2, session_team: '자체전' });
    expect(pg.every(p => p.mode === '자체전' && p.session_team === '자체전')).toBe(true);
  });

  it('로그_선수경기: Apps Script dedupe 키가 행마다 유일', () => {
    const keys = out.rawPlayerGames.map(pgKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('선수별집계: 선수당 1행, 골·키퍼 경기수 합산', () => {
    expect(out.playerLogRows).toHaveLength(23);
    expect(new Set(out.playerLogRows.map(p => p.name)).size).toBe(23);
    expect(out.playerLogRows.find(p => p.name === 'a9').goals).toBe(2);
    expect(out.playerLogRows.find(p => p.name === 'a1')).toMatchObject({ keeperGames: 2, conceded: 2 });
    expect(out.playerLogRows.find(p => p.name === 'a11').games).toBe(2);
  });

  it('로그_매치는 경기당 1행 그대로(집계 대상 아님)', () => {
    expect(out.matchRows).toHaveLength(2);
    expect(out.matchRows.map(r => r.match_id)).toEqual(['1', '2']);
  });
});

// F-I2: rowsX[i] ↔ eventsX[i] 짝이 어긋나면(행을 만드는 이벤트 타입 집합이 ROW_EVENT_TYPES 와 달라지면)
// 행이 엉뚱한 timestamp 자리에 섞여 조용히 잘못 기록된다 → 길이 불일치는 즉시 throw.
describe('mergeEventRowsByTimestamp — 행/이벤트 수 불일치', () => {
  const ev = (t) => ({ timestamp: t });
  it('A 쪽 길이가 어긋나면 throw', () => {
    expect(() => mergeEventRowsByTimestamp(['r1'], [ev(1), ev(2)], [], []))
      .toThrow(/이벤트 행\/이벤트 수 불일치/);
  });
  it('B 쪽 길이가 어긋나면 throw', () => {
    expect(() => mergeEventRowsByTimestamp([], [], ['r1', 'r2'], [ev(1)]))
      .toThrow(/SOCCER_EVENT_MAP 과 ROW_EVENT_TYPES 가 어긋났습니다/);
  });
  it('길이가 맞으면 timestamp 순으로 합친다', () => {
    expect(mergeEventRowsByTimestamp(['a1', 'a2'], [ev(10), ev(30)], ['b1'], [ev(20)]))
      .toEqual(['a1', 'b1', 'a2']);
  });
});

describe('buildIntraRows — 혼합일(외부전 1 + 자체전 1) 집계', () => {
  const out = buildIntraRows({ team: T, dateStr: D, inputTime: IT, finished: [intra, external] });

  it('로그_선수경기: 외부전 집계는 mode 기본, 자체전 집계는 mode 자체전', () => {
    const pg = out.rawPlayerGames;
    const ext = pg.filter(p => p.mode === '기본');
    const itr = pg.filter(p => p.mode === '자체전');
    expect(ext).toHaveLength(11);                                  // 외부전 출전 a1..a11
    expect(itr).toHaveLength(23);
    expect(pg).toHaveLength(34);
    expect(ext.every(p => p.session_team === T)).toBe(true);        // 하버FC 경로 그대로
    expect(itr.every(p => p.session_team === '자체전')).toBe(true);
    expect(new Set(ext.map(p => p.player)).size).toBe(11);
    expect(new Set(itr.map(p => p.player)).size).toBe(23);
  });

  it('로그_선수경기: Apps Script dedupe 키가 행마다 유일', () => {
    const keys = out.rawPlayerGames.map(pgKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('선수별집계: 외부전+자체전 양편을 한 번에 집계, 선수당 1행', () => {
    expect(out.playerLogRows).toHaveLength(23);
    expect(new Set(out.playerLogRows.map(p => p.name)).size).toBe(23);
    expect(out.playerLogRows.find(p => p.name === 'a1')).toMatchObject({ games: 2, keeperGames: 2, conceded: 2 });
    expect(out.playerLogRows.find(p => p.name === 'a9').goals).toBe(2);
    expect(out.playerLogRows.find(p => p.name === 'b12').games).toBe(1);
  });
});
