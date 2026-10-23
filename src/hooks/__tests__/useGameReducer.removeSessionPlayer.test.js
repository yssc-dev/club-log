import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

function withState(overrides) {
  return { ...initialState, ...overrides };
}

// 2026-10-23 마스터스컵 사례: 늦게라도 온다던 선수를 출전 명단에 넣고 라운드마다 휴식으로
// 돌렸는데 결국 불참. 팀에서 빼도 (1) 확정된 라운드 명단 스냅샷 (2) 참석자 목록에 남아
// 마감 화면·로그_매치 our_members_json·컵 참석 가점까지 그 선수가 따라다녔다.
describe('gameReducer — REMOVE_SESSION_PLAYER (오늘 완전 불참 처리)', () => {
  const baseState = () => withState({
    attendees: ['김성환', '김종현', '김형욱', '박재운', '노필선'],
    teams: [['김성환', '김종현', '박재운'], ['노필선']],
    teamNames: ['광땡', '국뽕'],
    absentees: { 'R8_C0': { 0: ['김형욱'] } },
    liveMercs: { 'R8_C0': [{ player: '김형욱', teamIdx: 1 }] },
    completedMatches: [
      {
        matchId: 'R7_C0', homeIdx: 0, awayIdx: 1, homeTeam: '광땡', awayTeam: '국뽕',
        homePlayers: ['김성환', '김종현', '김형욱', '박재운'], homeAbsent: ['김형욱'],
        awayPlayers: ['노필선'], awayAbsent: [],
        mercenaries: [{ player: '김형욱', teamIdx: 0 }],
      },
      {
        matchId: 'R6_C0', homeIdx: 0, awayIdx: 1, homeTeam: '광땡', awayTeam: '국뽕',
        homePlayers: ['김성환', '박재운'], homeAbsent: [],
        awayPlayers: ['노필선'], awayAbsent: [],
      },
    ],
  });

  it('참석자·팀 명단·라이브 휴식에서 제거', () => {
    const next = gameReducer(baseState(), { type: 'REMOVE_SESSION_PLAYER', player: '김형욱' });
    expect(next.attendees).toEqual(['김성환', '김종현', '박재운', '노필선']);
    expect(next.teams).toEqual([['김성환', '김종현', '박재운'], ['노필선']]);
    expect(next.absentees['R8_C0']).toBeUndefined();
  });

  it('확정된 라운드의 명단 스냅샷(휴식 포함)에서도 제거 — 로그_매치/참석 가점의 근원', () => {
    const next = gameReducer(baseState(), { type: 'REMOVE_SESSION_PLAYER', player: '김형욱' });
    const r7 = next.completedMatches.find(m => m.matchId === 'R7_C0');
    expect(r7.homePlayers).toEqual(['김성환', '김종현', '박재운']);
    expect(r7.homeAbsent).toEqual([]);
    expect(r7.mercenaries).toEqual([]);
  });

  it('라이브 용병 등록에서도 제거하고, 빈 배열은 키째 지운다 (RTDB 빈 배열 누락 대비)', () => {
    const next = gameReducer(baseState(), { type: 'REMOVE_SESSION_PLAYER', player: '김형욱' });
    expect(next.liveMercs['R8_C0']).toBeUndefined();
  });

  it('GK로 지정돼 있으면 그 자리도 해제', () => {
    const s = { ...baseState(), gks: { 0: '김형욱', 1: '노필선' } };
    const next = gameReducer(s, { type: 'REMOVE_SESSION_PLAYER', player: '김형욱' });
    expect(next.gks).toEqual({ 1: '노필선' });
  });

  it('무관한 선수·매치는 그대로 (객체 동일성까지 유지)', () => {
    const s = baseState();
    const next = gameReducer(s, { type: 'REMOVE_SESSION_PLAYER', player: '김형욱' });
    const r6Before = s.completedMatches.find(m => m.matchId === 'R6_C0');
    const r6After = next.completedMatches.find(m => m.matchId === 'R6_C0');
    expect(r6After).toBe(r6Before);
  });

  // 2026-10-23 운영 사고: RTDB update() 는 값에 undefined 가 있으면 통째로 거부한다.
  // ("values argument contains undefined in property '...matches.R1_C1.mercenaries'")
  // 원래 없던 키를 undefined 로 만들어 붙이면 그 경기 저장이 전부 실패한다.
  it('원래 없던 필드를 undefined 로 만들어 붙이지 않는다 (RTDB update 거부 방지)', () => {
    const s = withState({
      attendees: ['김형욱', '박재운'],
      teams: [['박재운'], []],
      completedMatches: [{
        matchId: 'R1_C1', homeIdx: 0, awayIdx: 1,
        homePlayers: ['김형욱', '박재운'], awayPlayers: ['노필선'],
        // homeAbsent / awayAbsent / mercenaries 키 자체가 없는 매치 (용병·휴식 없던 경기)
      }],
    });
    const next = gameReducer(s, { type: 'REMOVE_SESSION_PLAYER', player: '김형욱' });
    const m = next.completedMatches[0];
    expect(m.homePlayers).toEqual(['박재운']);
    for (const [k, v] of Object.entries(m)) {
      expect(v, `${k} 가 undefined`).not.toBeUndefined();
    }
    expect('mercenaries' in m).toBe(false);
    expect('homeAbsent' in m).toBe(false);
  });

  it('용병 목록이 그대로면 배열 참조도 유지한다 (불필요한 RTDB 쓰기 방지)', () => {
    const mercs = [{ player: '용병', teamIdx: 0 }];
    const s = withState({
      attendees: ['김형욱'],
      teams: [['김형욱'], []],
      completedMatches: [{
        matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
        homePlayers: ['김형욱'], awayPlayers: [], mercenaries: mercs,
      }],
    });
    const next = gameReducer(s, { type: 'REMOVE_SESSION_PLAYER', player: '김형욱' });
    expect(next.completedMatches[0].mercenaries).toBe(mercs);
  });

  it('player 가 없으면 state 그대로', () => {
    const s = baseState();
    expect(gameReducer(s, { type: 'REMOVE_SESSION_PLAYER', player: '' })).toBe(s);
  });
});
