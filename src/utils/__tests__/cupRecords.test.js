// src/utils/__tests__/cupRecords.test.js
// 마스터스컵 3단계 스펙 §3 — 순수 계산 규칙 고정. fixture 열 이름은 로그_매치·로그_이벤트 실제 열.
import { describe, it, expect } from 'vitest';
import {
  isExtraRow, matchKeyOf, selectCupRows, collectPlayedPairs, calcCupStandings, calcCupPlayerRecords,
} from '../cup/cupRecords';

const A5 = ['a1', 'a2', 'a3', 'a4', 'a5'];
const B5 = ['b1', 'b2', 'b3', 'b4', 'b5'];
export const M = (over = {}) => ({
  team: '마스터FC', sport: '풋살', mode: '대회', tournament_id: 'CUP', date: '2026-10-01', game_id: 'g1', match_idx: 1,
  round_idx: 1, court_id: 0, match_id: 'R1_C0', our_team_name: '팀A', opponent_team_name: '팀B',
  our_members_json: JSON.stringify(A5), opponent_members_json: JSON.stringify(B5),
  our_score: 0, opponent_score: 0, our_gk: 'a1', opponent_gk: 'b1', formation: '', our_defenders_json: '[]',
  is_extra: false, input_time: '', ...over,
});
export const E = (over = {}) => ({
  team: '마스터FC', sport: '풋살', mode: '대회', tournament_id: 'CUP', date: '2026-10-01', match_id: 'R1_C0',
  our_team: '팀A', opponent: '팀B', event_type: 'goal', player: 'a2', related_player: '', concede_gk: 'b1',
  position: '', input_time: '', game_id: 'g1', ...over,
});

describe('isExtraRow / matchKeyOf', () => {
  it('boolean true 와 문자열 TRUE 둘 다 임시 라운드', () => {
    expect(isExtraRow(M({ is_extra: true }))).toBe(true);
    expect(isExtraRow(M({ is_extra: 'TRUE' }))).toBe(true);
    expect(isExtraRow(M({ is_extra: 'true' }))).toBe(true);
    expect(isExtraRow(M({ is_extra: false }))).toBe(false);
    expect(isExtraRow(M({ is_extra: 'FALSE' }))).toBe(false);
    expect(isExtraRow(M({ is_extra: '' }))).toBe(false);
    expect(isExtraRow(null)).toBe(false);
  });
  it('경기 키는 date|game_id|정규화 match_id', () => {
    expect(matchKeyOf(M())).toBe('2026-10-01|g1|R1_C0');
    expect(matchKeyOf(M({ match_id: '1라운드 매치1' }))).toBe('2026-10-01|g1|R1_C0');
    expect(matchKeyOf(E())).toBe(matchKeyOf(M()));
  });
});

describe('selectCupRows', () => {
  it('다른 대회·정규 행은 경기·이벤트 모두 제외', () => {
    const { matchRows, eventRows } = selectCupRows({
      matchRows: [M(), M({ tournament_id: 'OTHER', match_id: 'R1_C1' }), M({ tournament_id: '', mode: '기본', match_id: 'R2_C0' })],
      eventRows: [E(), E({ tournament_id: 'OTHER' }), E({ tournament_id: '' })],
      cupId: 'CUP',
    });
    expect(matchRows).toHaveLength(1);
    expect(eventRows).toHaveLength(1);
  });
  it('임시 라운드 경기와 그 경기의 이벤트를 함께 걷어낸다(문자열 TRUE 포함)', () => {
    const { matchRows, eventRows } = selectCupRows({
      matchRows: [M(), M({ match_id: 'R2_C0', is_extra: true }), M({ match_id: 'R3_C0', is_extra: 'TRUE' })],
      eventRows: [E(), E({ match_id: 'R2_C0' }), E({ match_id: 'R3_C0' })],
      cupId: 'CUP',
    });
    expect(matchRows.map(r => r.match_id)).toEqual(['R1_C0']);
    expect(eventRows.map(r => r.match_id)).toEqual(['R1_C0']);
  });
  it('로그_매치에 짝이 없는 이벤트는 남기고, 골 이벤트는 중복 제거하지 않는다', () => {
    const { eventRows } = selectCupRows({ matchRows: [M()], eventRows: [E(), E(), E({ match_id: 'R9_C0' })], cupId: 'CUP' });
    expect(eventRows).toHaveLength(3);
  });
  it('tournament_id 가 숫자로 들어와도 문자열 cupId 와 맞춘다', () => {
    const { matchRows } = selectCupRows({ matchRows: [M({ tournament_id: 2026 })], eventRows: [], cupId: '2026' });
    expect(matchRows).toHaveLength(1);
  });
  it('입력이 undefined 여도 빈 배열', () => {
    expect(selectCupRows({ cupId: 'CUP' })).toEqual({ matchRows: [], eventRows: [] });
  });
});

describe('collectPlayedPairs', () => {
  it('홈·원정 순서 무관 같은 키, 임시 라운드·다른 대회 제외, "팀 A" 공백 정규화', () => {
    const pairs = collectPlayedPairs([
      M(), M({ our_team_name: '팀B', opponent_team_name: '팀A', match_id: 'R2_C0' }),
      M({ our_team_name: '팀 A', opponent_team_name: '팀C', match_id: 'R3_C0' }),
      M({ opponent_team_name: '팀C', is_extra: true, match_id: 'R4_C0' }),
      M({ tournament_id: 'OTHER', our_team_name: '팀X', opponent_team_name: '팀Y' }),
    ], 'CUP');
    expect([...pairs].sort()).toEqual(['팀A|팀B', '팀A|팀C']);
  });
  it('빈 입력은 빈 Set', () => {
    expect(collectPlayedPairs(undefined, 'CUP').size).toBe(0);
  });
});

const A7 = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'];
const B6 = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];
export const CUP = {
  meta: { id: 'CUP', name: 'CUP', sport: '풋살', status: 'active', createdAt: 1, createdBy: '', updatedAt: 1, lockedAt: null },
  teams: [
    { id: 't1', name: '팀A', captain: '', players: A7, order: 0 },
    { id: 't2', name: '팀B', captain: '', players: B6, order: 1 },
    { id: 't3', name: '팀C', captain: '', players: ['c1'], order: 2 },
  ],
};
const row = (standings, name) => standings.find(s => s.name === name);
const stand = (rows) => calcCupStandings({ matchRows: selectCupRows({ matchRows: rows, eventRows: [], cupId: 'CUP' }).matchRows, cup: CUP });

describe('calcCupStandings — 경기 단위 승점·가점', () => {
  it('0:0 → 양 팀 무 1점 + 무실점 1점', () => {
    const { standings } = stand([M({ our_score: 0, opponent_score: 0 })]);
    expect(row(standings, '팀A')).toMatchObject({ games: 1, draws: 1, points: 1, bonusClean: 1, bonusMargin: 0, bonusAttend: 0, total: 2 });
    expect(row(standings, '팀B')).toMatchObject({ games: 1, draws: 1, points: 1, bonusClean: 1, total: 2 });
  });
  it('2:0 → 이긴 팀 3 + 무실점 1, 진 팀 0', () => {
    const { standings } = stand([M({ our_score: 2, opponent_score: 0 })]);
    expect(row(standings, '팀A')).toMatchObject({ wins: 1, points: 3, bonusMargin: 0, bonusClean: 1, total: 4, gf: 2, ga: 0, gd: 2 });
    expect(row(standings, '팀B')).toMatchObject({ losses: 1, points: 0, bonusClean: 0, total: 0, gd: -2 });
  });
  it('0:1 → 원정 승 3 + 무실점 1', () => {
    const { standings } = stand([M({ our_score: 0, opponent_score: 1 })]);
    expect(row(standings, '팀B')).toMatchObject({ wins: 1, points: 3, bonusClean: 1, total: 4 });
    expect(row(standings, '팀A')).toMatchObject({ losses: 1, total: 0 });
  });
  it('3:0 → 다득점 1 + 무실점 1 (합계 5)', () => {
    const { standings } = stand([M({ our_score: 3, opponent_score: 0 })]);
    expect(row(standings, '팀A')).toMatchObject({ points: 3, bonusMargin: 1, bonusClean: 1, bonus: 2, total: 5 });
  });
  it('4:1 → 다득점만(합계 4), 3:1 → 가점 없음(합계 3)', () => {
    expect(row(stand([M({ our_score: 4, opponent_score: 1 })]).standings, '팀A')).toMatchObject({ bonusMargin: 1, bonusClean: 0, total: 4 });
    expect(row(stand([M({ our_score: 3, opponent_score: 1 })]).standings, '팀A')).toMatchObject({ bonusMargin: 0, bonusClean: 0, total: 3 });
  });
  it('스코어가 문자열로 와도 숫자로 센다', () => {
    const { standings } = stand([M({ our_score: '3', opponent_score: '0' })]);
    expect(row(standings, '팀A')).toMatchObject({ gf: 3, total: 5 });
  });
});

describe('calcCupStandings — 경기일 단위 참석 가점', () => {
  it('등록 팀원 6명 참석은 0, 7명은 +1', () => {
    const six = stand([M({ our_members_json: JSON.stringify(A7.slice(0, 6)) })]);
    expect(row(six.standings, '팀A').bonusAttend).toBe(0);
    const seven = stand([M({ our_members_json: JSON.stringify(A7) })]);
    expect(row(seven.standings, '팀A').bonusAttend).toBe(1);
    expect(seven.days[0].teams['팀A']).toMatchObject({ registered: true, present: 7, bonusAttend: 1, guests: [] });
  });
  it('같은 날짜에 세션(game_id)이 둘이어도 경기일당 1, 다른 날짜면 날짜마다', () => {
    const sameDay = stand([
      M({ our_members_json: JSON.stringify(A7) }),
      M({ game_id: 'g2', match_id: 'R1_C0', our_members_json: JSON.stringify(A7) }),
    ]);
    expect(row(sameDay.standings, '팀A').bonusAttend).toBe(1);
    expect(sameDay.days).toHaveLength(1);
    const twoDays = stand([
      M({ our_members_json: JSON.stringify(A7) }),
      M({ date: '2026-10-08', game_id: 'g2', our_members_json: JSON.stringify(A7) }),
    ]);
    expect(row(twoDays.standings, '팀A').bonusAttend).toBe(2);
    expect(twoDays.days.map(d => d.date)).toEqual(['2026-10-01', '2026-10-08']);
  });
  it('용병 이동: A 등록 팀원이 B 명단으로 뛰면 A 참석에 들어가고 B 참석에는 안 들어간다(서라현 예시)', () => {
    // A 명단 6명(a1~a6), B 명단 = 등록 6명 + a7. a7 은 A 등록 팀원.
    const { standings, days } = stand([M({
      our_members_json: JSON.stringify(A7.slice(0, 6)),
      opponent_members_json: JSON.stringify([...B6, 'a7']),
    })]);
    expect(row(standings, '팀A').bonusAttend).toBe(1);   // 등록 7명이 그날 왔다
    expect(row(standings, '팀B').bonusAttend).toBe(0);   // 등록 팀원은 6명뿐
    expect(days[0].teams['팀A']).toMatchObject({ present: 7, guests: [] });
    expect(days[0].teams['팀B']).toMatchObject({ present: 6, guests: ['a7'] });
  });
  it('휴식 라운드 선수도 참석으로 센다({players, absent} 형식)', () => {
    const { standings } = stand([M({ our_members_json: JSON.stringify({ players: A7, absent: ['a7'] }) })]);
    expect(row(standings, '팀A').bonusAttend).toBe(1);
  });
  it('이름 장식(★)·공백은 등록 팀원과 같은 사람으로 본다', () => {
    const { standings } = stand([M({ our_members_json: JSON.stringify(['a1 ★', ' a2', 'a3', 'a4', 'a5', 'a6', 'a7']) })]);
    expect(row(standings, '팀A').bonusAttend).toBe(1);
  });
  it('미등록 팀명은 registered:false 이고 7명이 와도 참석 가점이 없다', () => {
    const { standings, days } = stand([M({ our_team_name: '팀X', our_members_json: JSON.stringify(['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7']) })]);
    expect(row(standings, '팀X')).toMatchObject({ registered: false, bonusAttend: 0, games: 1 });
    expect(days[0].teams['팀X']).toMatchObject({ registered: false, present: 0, guests: [] });
  });
  it('그날 경기가 없는 등록 팀도 days.teams 에 나오고 참석 0', () => {
    const { days } = stand([M()]);
    expect(days[0].teams['팀C']).toMatchObject({ registered: true, present: 0, bonusAttend: 0, points: 0 });
  });
});

describe('calcCupStandings — 합산·정렬·출력 모양', () => {
  it('두 경기일·같은 조합 재대결을 모두 합산한다', () => {
    const { standings } = stand([
      M({ our_score: 1, opponent_score: 0 }),
      M({ match_id: 'R2_C0', match_idx: 2, our_score: 0, opponent_score: 2 }),
      M({ date: '2026-10-08', game_id: 'g2', our_score: 1, opponent_score: 1 }),
    ]);
    expect(row(standings, '팀A')).toMatchObject({ games: 3, wins: 1, draws: 1, losses: 1, gf: 2, ga: 3, gd: -1, points: 4, bonusClean: 1, total: 5 });
    expect(row(standings, '팀B')).toMatchObject({ games: 3, wins: 1, draws: 1, losses: 1, gf: 3, ga: 2, gd: 1, points: 4, bonusClean: 1, total: 5 });
  });
  it('정렬: 합계 → 골득실 → 다득점 → 팀명', () => {
    // A 1:0 B (A 4점, gd+1, gf1) / C 2:0 B (C 4점, gd+2) → C, A
    const s1 = stand([M({ our_score: 1, opponent_score: 0 }), M({ our_team_name: '팀C', our_members_json: '["c1"]', match_id: 'R1_C1', match_idx: 2, our_score: 2, opponent_score: 0 })]).standings;
    expect(s1.map(s => s.name)).toEqual(['팀C', '팀A', '팀B']);
    // A 3:2 B (3점, gd+1, gf3) / C 2:1 B (3점, gd+1, gf2) → A, C
    const s2 = stand([M({ our_score: 3, opponent_score: 2 }), M({ our_team_name: '팀C', our_members_json: '["c1"]', match_id: 'R1_C1', match_idx: 2, our_score: 2, opponent_score: 1 })]).standings;
    expect(s2.map(s => s.name)).toEqual(['팀A', '팀C', '팀B']);
    // A 1:0 B / C 1:0 B → 완전 동률 → 팀명 순 A, C
    const s3 = stand([M({ our_score: 1, opponent_score: 0 }), M({ our_team_name: '팀C', our_members_json: '["c1"]', match_id: 'R1_C1', match_idx: 2, our_score: 1, opponent_score: 0 })]).standings;
    expect(s3.map(s => s.name)).toEqual(['팀A', '팀C', '팀B']);
  });
  it('0경기 등록 팀도 전부 0으로 나온다 — 골득실 0이라 골득실 음수인 팀 앞에 선다', () => {
    // A 1:0 B → A(4, +1), C(0경기, 0, gd 0), B(0, gd −1) → A, C, B
    const { standings } = stand([M({ our_score: 1, opponent_score: 0 })]);
    expect(standings.map(s => s.name)).toEqual(['팀A', '팀C', '팀B']);
    expect(standings[1]).toMatchObject({ name: '팀C', registered: true, games: 0, total: 0, gd: 0 });
  });
  it('합계 동률이면 경기 수와 무관하게 골득실로 가른다(경기 수는 정렬 기준이 아니다)', () => {
    // A: 1경기 2:0 → 3+무실점1 = 4, gd +2 / C: 2경기 1:0 승·0:1 패 → 4, gd 0 / B: 3경기 0:2 패·0:1 패·1:0 승 → 4, gd −2
    const { standings } = stand([
      M({ our_score: 2, opponent_score: 0 }),
      M({ our_team_name: '팀C', our_members_json: '["c1"]', match_id: 'R1_C1', match_idx: 2, our_score: 1, opponent_score: 0 }),
      M({ our_team_name: '팀B', opponent_team_name: '팀C', our_members_json: JSON.stringify(B5), opponent_members_json: '["c1"]', match_id: 'R2_C0', match_idx: 3, our_score: 1, opponent_score: 0 }),
    ]);
    expect(standings.map(s => ({ n: s.name, g: s.games, t: s.total, gd: s.gd }))).toEqual([
      { n: '팀A', g: 1, t: 4, gd: 2 }, { n: '팀C', g: 2, t: 4, gd: 0 }, { n: '팀B', g: 3, t: 4, gd: -2 },
    ]);
  });
  it('경기가 없으면 등록 팀만 0으로, days 는 빈 배열', () => {
    const { standings, days } = calcCupStandings({ matchRows: [], cup: CUP });
    expect(standings.map(s => s.name)).toEqual(['팀A', '팀B', '팀C']);
    expect(days).toEqual([]);
  });
  it('days.matches 는 match_idx 오름차순이고 경기 가점을 양쪽에 단다', () => {
    const { days } = stand([
      M({ match_idx: 2, match_id: 'R2_C0', our_score: 0, opponent_score: 0 }),
      M({ match_idx: 1, match_id: 'R1_C0', our_score: 3, opponent_score: 0 }),
    ]);
    expect(days[0].matches.map(m => m.matchId)).toEqual(['R1_C0', 'R2_C0']);
    expect(days[0].matches[0]).toMatchObject({ home: '팀A', away: '팀B', homeScore: 3, awayScore: 0, homeBonus: { margin: 1, clean: 1 }, awayBonus: { margin: 0, clean: 0 }, key: '2026-10-01|g1|R1_C0' });
    expect(days[0].matches[1]).toMatchObject({ homeBonus: { margin: 0, clean: 1 }, awayBonus: { margin: 0, clean: 1 } });
    expect(days[0].teams['팀A']).toMatchObject({ points: 4, bonusMargin: 1, bonusClean: 2 });
  });
  it('cup 이 teams 없이 와도(RTDB 빈 배열 누락) 행의 팀만으로 계산한다', () => {
    const { standings } = calcCupStandings({ matchRows: [M({ our_score: 1, opponent_score: 0 })], cup: { meta: { id: 'CUP' } } });
    expect(standings.map(s => s.name)).toEqual(['팀A', '팀B']);
    expect(standings[0]).toMatchObject({ registered: false, total: 4 });
  });
});


const recs = (rows, events) => {
  const sel = selectCupRows({ matchRows: rows, eventRows: events, cupId: 'CUP' });
  return calcCupPlayerRecords({ matchRows: sel.matchRows, eventRows: sel.eventRows, cup: CUP });
};
const rec = (list, name) => list.find(r => r.name === name);

describe('calcCupPlayerRecords', () => {
  it('골·어시·자책골은 로그_이벤트에서', () => {
    const list = recs([M()], [
      E({ player: 'a2', related_player: 'a3' }), E({ player: 'a2' }), E({ event_type: 'owngoal', player: 'b1', related_player: '' }),
    ]);
    expect(rec(list, 'a2')).toMatchObject({ goals: 2, assists: 0, ownGoals: 0 });
    expect(rec(list, 'a3')).toMatchObject({ goals: 0, assists: 1 });
    expect(rec(list, 'b1')).toMatchObject({ ownGoals: 1, goals: 0 });
  });
  it('클린시트는 로그_매치 GK 열·경기 단위: 2:0 은 홈 GK 만, 0:0 은 양쪽', () => {
    const list = recs([
      M({ our_score: 2, opponent_score: 0 }),
      M({ match_id: 'R2_C0', match_idx: 2, our_score: 0, opponent_score: 0 }),
    ], []);
    expect(rec(list, 'a1').cleanSheets).toBe(2);
    expect(rec(list, 'b1').cleanSheets).toBe(1);
  });
  it('GK 열이 비어 있으면 클린시트를 아무에게도 주지 않는다', () => {
    const list = recs([M({ our_gk: '', opponent_gk: '', our_score: 0, opponent_score: 0 })], []);
    expect(list.every(r => r.cleanSheets === 0)).toBe(true);
  });
  it('원정 명단·원정 GK 로만 뛴 선수도 참석·클린시트가 잡힌다', () => {
    const list = recs([M({ our_score: 0, opponent_score: 1, opponent_gk: 'b6', opponent_members_json: JSON.stringify(B6) })], []);
    expect(rec(list, 'b6')).toMatchObject({ cleanSheets: 1, days: 1, team: '팀B', guest: false });
  });
  it('참석횟수는 라운드 수가 아니라 날짜 수', () => {
    const list = recs([
      M(), M({ match_id: 'R2_C0', match_idx: 2 }), M({ date: '2026-10-08', game_id: 'g2' }),
    ], []);
    expect(rec(list, 'a1').days).toBe(2);
  });
  it('휴식 라운드에 있던 선수도 그날 참석', () => {
    const list = recs([M({ our_members_json: JSON.stringify({ players: A5, absent: ['a5'] }) })], []);
    expect(rec(list, 'a5').days).toBe(1);
  });
  it('등록 팀원 전원이 0 기록으로도 나온다, 등록 안 된 이름은 용병', () => {
    const list = recs([M({ opponent_members_json: JSON.stringify([...B5, 'z1']) })], []);
    expect(rec(list, 'c1')).toMatchObject({ team: '팀C', guest: false, goals: 0, days: 0 });
    expect(rec(list, 'z1')).toMatchObject({ team: '', guest: true, days: 1 });
  });
  it('이름 장식·공백은 같은 사람', () => {
    const list = recs([M({ our_members_json: JSON.stringify(['a1 ★', 'a2']) })], [E({ player: ' a2 ' })]);
    expect(rec(list, 'a1').days).toBe(1);
    expect(rec(list, 'a2')).toMatchObject({ goals: 1, days: 1 });
    expect(list.filter(r => r.name.includes('★'))).toHaveLength(0);
  });
  it('임시 라운드의 골은 selectCupRows 를 거치면 빠진다', () => {
    const list = recs([M(), M({ match_id: 'R2_C0', is_extra: true })], [E(), E({ match_id: 'R2_C0' })]);
    expect(rec(list, 'a2').goals).toBe(1);
  });
  it('정렬: 골 → 어시 → 클린시트 → 이름', () => {
    const list = recs([M({ our_score: 1, opponent_score: 0 })], [
      E({ player: 'b2', related_player: 'b3' }), E({ player: 'a4', related_player: 'a3' }), E({ player: 'a3' }),
    ]);
    // a3: 1골 1어시 / a4·b2: 1골 0어시 → 이름 순 a4, b2 / a1: 0골 CS1 / b3: 0골 1어시
    expect(list.slice(0, 3).map(r => r.name)).toEqual(['a3', 'a4', 'b2']);
    expect(list[3].name).toBe('b3');
    expect(list[4].name).toBe('a1');
  });
});
