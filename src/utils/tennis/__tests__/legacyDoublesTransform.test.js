import { describe, it, expect } from 'vitest';
import { deriveNameMap, parseDoublesTab, buildLegacyDoublesRows } from '../legacyDoublesTransform';

const roster = [
  { name: '박성언', grade: '금배' }, { name: '김원희', grade: '은배' },
  { name: '공윤택', grade: '동배' }, { name: '조원택', grade: '동배' },
  { name: '남현철', grade: '은배' },
];

describe('deriveNameMap', () => {
  it('성 뺀 2글자 축약명으로 매핑한다', () => {
    const { map } = deriveNameMap(roster);
    expect(map.get('성언')).toEqual({ name: '박성언', grade: '금배' });
    expect(map.get('윤택').name).toBe('공윤택');
    expect(map.get('원택').name).toBe('조원택'); // 원택≠윤택 별개 인물
  });
  it('축약명 충돌은 ambiguous로 빼고 overrides로 해소한다', () => {
    const dup = [...roster, { name: '이성언', grade: '초보자' }];
    const out = deriveNameMap(dup);
    expect(out.map.has('성언')).toBe(false);
    expect(out.ambiguous).toContain('성언');
    const fixed = deriveNameMap(dup, { 성언: '박성언' });
    expect(fixed.map.get('성언').name).toBe('박성언');
  });
});

describe('parseDoublesTab', () => {
  const rows2d = [
    [], ['', '날짜', 'A_P1', 'A_P2', 'B_P1', 'B_P2', '', 'A점수', ' B점수'],
    ['', '2026-02-02 00:00', '성언', '현철', '재민', '원택', '', '6', '4'],
    ['', '2026-02-02 00:00', '학모', '대철', '성환', '두리', '', '', ''],   // 점수 없음
    ['', '2026-02-03 00:00', '성언', '원희', '윤택', '현철', '', '5', '5'], // 동점
  ];
  it('점수 있는 판만 파싱, 나머지는 사유와 함께 skipped', () => {
    const { matches, skipped } = parseDoublesTab(rows2d, { expectMonth: '2026-02' });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ date: '2026-02-02', a1: '성언', scoreA: 6, scoreB: 4 });
    expect(skipped).toHaveLength(2);
  });
});

describe('buildLegacyDoublesRows', () => {
  const { map } = deriveNameMap(roster);
  const base = { team: '몽피스', nameMap: map, inputTime: '2026-08-10 12:00:00' };

  it('6-5는 TB sentinel, 6-0은 베이글, 회원3인+게스트1인·전원회원 모두 투몽(회원 3명 이상 규정)', () => {
    const matches = [
      { date: '2026-02-02', a1: '성언', a2: '현철', b1: '원희', b2: '두리', scoreA: 6, scoreB: 5 }, // 두리=게스트, 회원 3 → 투몽
      { date: '2026-02-02', a1: '성언', a2: '현철', b1: '원희', b2: '윤택', scoreA: 6, scoreB: 0 }, // 전원 회원 → 투몽
    ];
    const { matchRows, playerGameRows, report } = buildLegacyDoublesRows({ ...base, matches });

    expect(matchRows[0]).toMatchObject({
      game_id: 'legacy_2026-02-02', round_idx: 1, court_id: 1, match_idx: 1,
      match_id: 'R1_C1', format: '복식', best_of: 1, season: 2026, winner: 'A', league: '투몽',
    });
    expect(matchRows[1].match_id).toBe('R2_C1'); // 판별 유일
    expect(JSON.parse(matchRows[0].sets_json)).toEqual([{ a: 6, b: 5, tbA: 1, tbB: 0 }]);
    expect(JSON.parse(matchRows[1].sets_json)).toEqual([{ a: 6, b: 0 }]);

    const p = playerGameRows.filter(r => r.match_id === 'R1_C1');
    expect(p).toHaveLength(4);
    const seongeon = p.find(r => r.player === '박성언');
    expect(seongeon).toMatchObject({
      is_guest: false, side: 'A', partner: '남현철', result: '승',
      tb_played: 1, tb_won: 1, aces: '', double_faults: '', grade_at_date: '금배',
    });
    expect(JSON.parse(seongeon.opponents_json)).toEqual(['김원희', '두리']);
    const duri = p.find(r => r.player === '두리');
    expect(duri).toMatchObject({ is_guest: true, grade_at_date: '', result: '패', tb_won: 0 });

    const bagel = playerGameRows.find(r => r.match_id === 'R2_C1' && r.player === '김원희');
    expect(bagel.bagels_taken).toBe(1);
    expect(report.leagueDist).toEqual({ 투몽: 2 });
    expect(report.guests).toEqual({ 두리: 1 });
  });

  it('회원 2인 이하는 미반영, 6 미만 우세 점수는 우세승 + nonStandardScores 기록', () => {
    const matches = [
      { date: '2026-03-01', a1: '성언', a2: '두리', b1: '민환', b2: '지웅', scoreA: 5, scoreB: 4 },
    ];
    const { matchRows, playerGameRows, report } = buildLegacyDoublesRows({ ...base, matches });
    expect(matchRows[0].league).toBe('미반영');
    expect(matchRows[0].winner).toBe('A');
    expect(playerGameRows.find(r => r.player === '박성언').result).toBe('승');
    expect(playerGameRows.find(r => r.player === '박성언').sets_won).toBe(1);
    expect(report.nonStandardScores).toEqual([{ date: '2026-03-01', score: '5-4' }]);
    expect(report.leagueDist).toEqual({ 미반영: 1 });
  });
});
