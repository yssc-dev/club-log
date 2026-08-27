import { describe, it, expect } from 'vitest';
import {
  determineCompetition, buildTennisMatchRows, buildTennisPlayerGameRows, membersFromState, resolveGradeSource,
} from '../tennisRowBuilders';
import { TENNIS_MATCH_COLUMNS, TENNIS_PLAYER_GAME_COLUMNS } from '../tennisSchema';

const members = new Set(['성언', '다빈', '원희', '철우']);
const grades = { 성언: '은배', 다빈: '동배', 원희: '은배', 철우: '은배' };

const doneSet = (a, b, tbA = 0, tbB = 0) => ({ a, b, tbA, tbB, done: true });

const state = {
  gameId: 'g_1', gameDate: '2026-08-06', season: 2026,
  rounds: [{
    roundIdx: 1,
    courts: [
      { courtId: 1, format: '복식', bestOf: 1, status: 'done',
        sideA: ['성언', '다빈'], sideB: ['원희', '민환'],
        sets: [doneSet(6, 1)],
        stats: { 성언: { aces: 2, df: 1 }, 다빈: { aces: 0, df: 0 }, 원희: { aces: 1, df: 3 } } },
      { courtId: 2, format: '단식', bestOf: 1, status: 'playing',   // 미완료 — 버려야 함
        sideA: ['철우'], sideB: ['원희'], sets: [{ a: 3, b: 2, tbA: 0, tbB: 0, done: false }], stats: {} },
    ],
  }],
};

describe('determineCompetition', () => {
  it('단식은 양쪽 다 회원이어야 길로틴', () => {
    expect(determineCompetition('단식', ['성언'], ['철우'], members)).toBe('길로틴');
    expect(determineCompetition('단식', ['성언'], ['민환'], members)).toBe('미반영');
  });

  it('복식은 4명 전원 회원이어야 투몽 — 게스트 1명이면 번외(미반영)', () => {
    expect(determineCompetition('복식', ['성언', '다빈'], ['원희', '철우'], members)).toBe('투몽');
    expect(determineCompetition('복식', ['성언', '다빈'], ['원희', '민환'], members)).toBe('미반영'); // 게스트 1명
    expect(determineCompetition('복식', ['성언', '다빈'], ['용병1', '용병2'], members)).toBe('미반영');
  });
});

describe('membersFromState', () => {
  it('용병(리듀서가 attendees·guests 양쪽에 넣음)을 회원에서 제외', () => {
    // ADD_ATTENDEE(isGuest)는 이름을 attendees와 guests 모두에 넣는다 → attendees ⊇ guests.
    const s = { attendees: ['성언', '다빈', '민환'], guests: ['민환'] };
    const m = membersFromState(s);
    expect(m.has('성언')).toBe(true);
    expect(m.has('다빈')).toBe(true);
    expect(m.has('민환')).toBe(false);   // 용병은 회원 아님
  });
  it('빈/누락 상태 안전', () => {
    expect([...membersFromState({})]).toEqual([]);
    expect([...membersFromState({ attendees: ['성언'] })]).toEqual(['성언']); // guests 없으면 전원 회원
    expect([...membersFromState(undefined)]).toEqual([]);
  });
  it('용병칸에 잘못 들어간 회원은 명부로 교정(가산) — 명부 없으면 종전대로 제외', () => {
    // 성언이 guests에 갇힘(용병칸 오입력+제거 불가). 명부에 있으면 회원으로 되살린다.
    const st = { attendees: ['성언', '민환'], guests: ['성언', '민환'] };
    expect(membersFromState(st, [{ name: '성언' }]).has('성언')).toBe(true);  // 명부로 교정
    expect(membersFromState(st, [{ name: '성언' }]).has('민환')).toBe(false); // 진짜 용병은 여전히 제외
    expect(membersFromState(st, []).has('성언')).toBe(false);                 // 명부 비면 종전(attendees\guests)대로
  });

  it('통합: 용병이 attendees에 있어도 is_guest=TRUE·매치는 번외로 기록된다', () => {
    const st = {
      gameId: 'g_x', gameDate: '2026-08-15', season: 2026,
      attendees: ['성언', '다빈', '원희', '민환'], guests: ['민환'], // 민환=용병
      rounds: [{ roundIdx: 1, courts: [
        { courtId: 1, format: '복식', bestOf: 1, status: 'done',
          sideA: ['성언', '다빈'], sideB: ['원희', '민환'],
          sets: [doneSet(6, 1)], stats: {} },
      ] }],
    };
    const memberSet = membersFromState(st);
    const rows = buildTennisPlayerGameRows({ team: 'T', state: st, inputTime: '', memberSet, gradeByPlayer: {} });
    const 민환 = rows.find(r => r.player === '민환');
    const 성언 = rows.find(r => r.player === '성언');
    expect(민환.is_guest).toBe(true);      // 용병은 게스트
    expect(성언.is_guest).toBe(false);     // 회원은 회원
    expect(rows.every(r => r.league === '미반영')).toBe(true); // 용병 낀 판 → 번외
  });
});

describe('buildTennisMatchRows', () => {
  const rows = buildTennisMatchRows({ team: '몽피스', state, inputTime: '2026-08-06 20:00:00', memberSet: members });

  it('미완료 판은 버린다 — 1행만 나온다', () => {
    expect(rows).toHaveLength(1);
  });

  it('모든 컬럼 키가 스키마와 정확히 일치한다', () => {
    expect(Object.keys(rows[0]).sort()).toEqual([...TENNIS_MATCH_COLUMNS].sort());
  });

  it('식별자와 집계', () => {
    expect(rows[0]).toMatchObject({
      team: '몽피스', sport: '테니스', season: 2026, date: '2026-08-06',
      game_id: 'g_1', round_idx: 1, court_id: 1, match_idx: 1, match_id: 'R1_C1',
      format: '복식', best_of: 1,
      sets_a: 1, sets_b: 0, games_a: 6, games_b: 1, winner: 'A',
      league: '미반영',   // 민환(게스트) 포함 → 번외
    });
  });

  it('side_a_json은 항상 왼쪽 팀', () => {
    expect(JSON.parse(rows[0].side_a_json)).toEqual(['성언', '다빈']);
    expect(JSON.parse(rows[0].side_b_json)).toEqual(['원희', '민환']);
  });

  it('sets_json에 타이브레이크 점수가 담긴다', () => {
    const tb = buildTennisMatchRows({
      team: '몽피스', memberSet: members, inputTime: 't',
      state: { ...state, rounds: [{ roundIdx: 1, courts: [{
        courtId: 1, format: '단식', bestOf: 1, status: 'done',
        sideA: ['성언'], sideB: ['철우'], sets: [doneSet(6, 5, 7, 4)], stats: {},
      }] }] },
    });
    expect(JSON.parse(tb[0].sets_json)).toEqual([{ a: 6, b: 5, tbA: 7, tbB: 4 }]);
  });
});

describe('buildTennisPlayerGameRows', () => {
  const rows = buildTennisPlayerGameRows({
    team: '몽피스', state, inputTime: '2026-08-06 20:00:00',
    memberSet: members, gradeByPlayer: grades,
  });

  it('완료된 판의 선수 수만큼 나온다 (복식 4명)', () => {
    expect(rows).toHaveLength(4);
  });

  it('모든 컬럼 키가 스키마와 정확히 일치한다', () => {
    expect(Object.keys(rows[0]).sort()).toEqual([...TENNIS_PLAYER_GAME_COLUMNS].sort());
  });

  it('승자 쪽 행 — 파트너·상대·집계', () => {
    const r = rows.find(x => x.player === '성언');
    expect(r).toMatchObject({
      side: 'A', result: '승', partner: '다빈',
      sets_won: 1, sets_lost: 0, games_won: 6, games_lost: 1,
      tb_played: 0, tb_won: 0,
      aces: 2, double_faults: 1,
      bagels_taken: 0, bagels_given: 0,
      grade_at_date: '은배', is_guest: false, league: '미반영',   // 민환(게스트) 포함 → 번외
    });
    expect(JSON.parse(r.opponents_json)).toEqual(['원희', '민환']);
  });

  it('패자 쪽은 득실이 뒤집힌다', () => {
    const r = rows.find(x => x.player === '원희');
    expect(r).toMatchObject({ side: 'B', result: '패', games_won: 1, games_lost: 6, partner: '민환' });
  });

  it('용병은 is_guest=true, grade_at_date는 빈 문자열', () => {
    const r = rows.find(x => x.player === '민환');
    expect(r.is_guest).toBe(true);
    expect(r.grade_at_date).toBe('');
  });

  it('에이스/DF는 선수별로 나뉜다 — 팀 합계가 아니다', () => {
    expect(rows.find(x => x.player === '성언').aces).toBe(2);
    expect(rows.find(x => x.player === '다빈').aces).toBe(0);
    expect(rows.find(x => x.player === '원희').double_faults).toBe(3);
    expect(rows.find(x => x.player === '민환').double_faults).toBe(0); // stats 없는 선수는 0
  });

  it('단식은 partner가 빈 문자열', () => {
    const single = buildTennisPlayerGameRows({
      team: '몽피스', memberSet: members, gradeByPlayer: grades, inputTime: 't',
      state: { ...state, rounds: [{ roundIdx: 1, courts: [{
        courtId: 1, format: '단식', bestOf: 1, status: 'done',
        sideA: ['성언'], sideB: ['철우'], sets: [doneSet(6, 0)], stats: {},
      }] }] },
    });
    expect(single).toHaveLength(2);
    expect(single[0].partner).toBe('');
  });

  it('베이글 — 6:0 진 쪽이 taken, 이긴 쪽이 given', () => {
    const bagel = buildTennisPlayerGameRows({
      team: '몽피스', memberSet: members, gradeByPlayer: grades, inputTime: 't',
      state: { ...state, rounds: [{ roundIdx: 1, courts: [{
        courtId: 1, format: '단식', bestOf: 1, status: 'done',
        sideA: ['성언'], sideB: ['철우'], sets: [doneSet(6, 0)], stats: {},
      }] }] },
    });
    expect(bagel.find(x => x.player === '성언')).toMatchObject({ bagels_given: 1, bagels_taken: 0 });
    expect(bagel.find(x => x.player === '철우')).toMatchObject({ bagels_given: 0, bagels_taken: 1 });
  });

  it('타이브레이크 — 이긴 쪽만 tb_won, 양쪽 다 tb_played', () => {
    const tb = buildTennisPlayerGameRows({
      team: '몽피스', memberSet: members, gradeByPlayer: grades, inputTime: 't',
      state: { ...state, rounds: [{ roundIdx: 1, courts: [{
        courtId: 1, format: '단식', bestOf: 1, status: 'done',
        sideA: ['성언'], sideB: ['철우'], sets: [doneSet(6, 5, 7, 4)], stats: {},
      }] }] },
    });
    expect(tb.find(x => x.player === '성언')).toMatchObject({ tb_played: 1, tb_won: 1 });
    expect(tb.find(x => x.player === '철우')).toMatchObject({ tb_played: 1, tb_won: 0 });
  });
});

describe('input_by', () => {
  it('inputBy가 매치/선수경기 행에 input_by로 들어간다', () => {
    const matchRows = buildTennisMatchRows({ team: 'T', state, inputTime: '2026-08-12 21:00:00', inputBy: '서라현', memberSet: new Set() });
    const pgRows = buildTennisPlayerGameRows({ team: 'T', state, inputTime: '2026-08-12 21:00:00', inputBy: '서라현', memberSet: new Set(), gradeByPlayer: {} });
    expect(matchRows[0].input_by).toBe('서라현');
    expect(pgRows[0].input_by).toBe('서라현');
  });

  it('inputBy 미전달 시 빈 문자열', () => {
    expect(buildTennisMatchRows({ team: 'T', state, inputTime: '', memberSet: new Set() })[0].input_by).toBe('');
  });
});

describe('resolveGradeSource', () => {
  const base = { attendees: ['성언', '다빈', '민환'], guests: ['민환'] };

  it('스냅샷이 있으면 명부를 보지 않는다', () => {
    const st = { ...base, gradeSnapshot: { 성언: '은배', 다빈: '동배' } };
    const r = resolveGradeSource(st, [{ name: '성언', grade: '금배' }]);   // 명부는 다른 등급
    expect(r.fromSnapshot).toBe(true);
    expect(r.gradeByPlayer).toEqual({ 성언: '은배', 다빈: '동배' });
  });

  it('스냅샷이 없으면 명부에서 등급 맵을 만든다', () => {
    const r = resolveGradeSource(base, [{ name: '성언', grade: '은배' }, { name: '다빈', grade: '동배' }]);
    expect(r.fromSnapshot).toBe(false);
    expect(r.gradeByPlayer).toEqual({ 성언: '은배', 다빈: '동배' });
  });

  it('스냅샷 이름이 membersFromState 교정에 쓰인다 — 용병칸에 잘못 넣은 회원을 되살린다', () => {
    const st = { attendees: ['성언', '민환'], guests: ['민환'], gradeSnapshot: { 성언: '은배', 민환: '동배' } };
    expect(resolveGradeSource(st, []).memberSet.has('민환')).toBe(true);
  });

  it('스냅샷도 명부도 없으면 등급은 비고 회원은 attendees\\guests 그대로다', () => {
    const r = resolveGradeSource(base, []);
    expect(r.gradeByPlayer).toEqual({});
    expect([...r.memberSet].sort()).toEqual(['다빈', '성언']);
  });
});
