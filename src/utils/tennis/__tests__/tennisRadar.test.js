import { describe, it, expect } from 'vitest';
import { buildPlayerRadar, percentileRank } from '../tennisRadar';

// ── 최소 픽스처 행 빌더 ─────────────────────────────────────
const mkRow = (player, format, result, opts = {}) => ({
  player,
  format,
  result,
  date: opts.date || '2026-01-10',
  season: opts.season || '2026',
  league: format === '단식' ? '길로틴' : '투몽',
  is_guest: false,
  aces: opts.aces ?? '',
  double_faults: opts.double_faults ?? 0,
  tb_played: opts.tb_played ?? 0,
  tb_won: opts.tb_won ?? 0,
  bagels_taken: 0,
  bagels_given: 0,
  partner: opts.partner || '',
  opponents_json: opts.opponents_json || '[]',
  match_id: opts.match_id || 'R1_C1',
  game_id: opts.game_id || 'g1',
  side: 'A',
  grade_at_date: '',
});

// 단식 1게임(두 선수) = 2행
const singlesGame = (winner, loser, gid, date) => ([
  mkRow(winner, '단식', '승', { match_id: gid, game_id: gid, date, opponents_json: `["${loser}"]` }),
  mkRow(loser, '단식', '패', { match_id: gid, game_id: gid, date, opponents_json: `["${winner}"]` }),
]);

const ROSTER = [
  { name: '박준태', grade: '금배' },
  { name: '문형민', grade: '은배' },
  { name: '홍길동', grade: '동배' },
];

// ── percentileRank 유닛 ─────────────────────────────────────
describe('percentileRank', () => {
  it('최댓값보다 크면 1, 최솟값보다 작으면 0', () => {
    expect(percentileRank(5, [1, 2, 3])).toBe(1);
    expect(percentileRank(0, [1, 2, 3])).toBe(0);
  });
  it('중앙값은 (below + 0.5*equal)/N', () => {
    expect(percentileRank(2, [1, 2, 3])).toBeCloseTo(0.5); // below1 + equal1*0.5 = 1.5/3
  });
  it('빈 모집단이면 0 (divide-by-zero 가드)', () => {
    expect(percentileRank(5, [])).toBe(0);
    expect(percentileRank(5, null)).toBe(0);
  });
});

// ── buildPlayerRadar ────────────────────────────────────────
describe('buildPlayerRadar', () => {
  it('5축 반환 — 에이스 없이 TB승률 포함', () => {
    const r = buildPlayerRadar({ rows: [], roster: ROSTER, player: '박준태', asOfDate: '2026-02-01' });
    const keys = r.axes.map(a => a.key);
    expect(r.axes).toHaveLength(5);
    expect(keys).toEqual(['singlesRate', 'doublesRate', 'tbRate', 'points', 'attendance']);
    expect(keys).not.toContain('aces');
    expect(r.axes.find(a => a.key === 'tbRate').label).toBe('TB승률');
  });

  it('단식승률 = 3경기↑ 회원 모집단 대비 백분위', () => {
    // 박준태 3승1패(0.75), 문형민 1승3패(0.25), 둘 다 4게임(≥3) → 모집단 [0.75,0.25]
    const rows = [
      ...singlesGame('박준태', '문형민', 'g1', '2026-01-10'),
      ...singlesGame('박준태', '문형민', 'g2', '2026-01-10'),
      ...singlesGame('박준태', '문형민', 'g3', '2026-01-17'),
      ...singlesGame('문형민', '박준태', 'g4', '2026-01-17'),
    ];
    const r1 = buildPlayerRadar({ rows, roster: ROSTER, player: '박준태', asOfDate: '2026-02-01' });
    const s1 = r1.axes.find(a => a.key === 'singlesRate');
    expect(s1.raw).toBe('75%');                 // 실제값 라벨
    expect(s1.value).toBeCloseTo(0.75);         // below(0.25) + equal(self)*0.5 = 1.5/2

    const r2 = buildPlayerRadar({ rows, roster: ROSTER, player: '문형민', asOfDate: '2026-02-01' });
    const s2 = r2.axes.find(a => a.key === 'singlesRate');
    expect(s2.raw).toBe('25%');
    expect(s2.value).toBeCloseTo(0.25);         // below(none) + equal(self)*0.5 = 0.5/2
  });

  it('TB승률 = tbPlayed 3↑ 회원 모집단 대비 백분위', () => {
    // 박준태 4판3승(0.75), 문형민 4판1승(0.25) → 모집단 [0.75,0.25]
    const rows = [
      mkRow('박준태', '복식', '승', { tb_played: 4, tb_won: 3, date: '2026-01-10' }),
      mkRow('문형민', '복식', '패', { tb_played: 4, tb_won: 1, date: '2026-01-10', match_id: 'R1_C2', game_id: 'g2' }),
    ];
    const r = buildPlayerRadar({ rows, roster: ROSTER, player: '박준태', asOfDate: '2026-02-01' });
    const tb = r.axes.find(a => a.key === 'tbRate');
    expect(tb.raw).toBe('75%');
    expect(tb.value).toBeCloseTo(0.75);
  });

  it('참석 = 전 회원 모집단 대비 백분위(카운트 축)', () => {
    // 박준태 2일, 문형민 1일, 홍길동 0일 → 모집단 [2,1,0]
    const rows = [
      mkRow('박준태', '복식', '승', { date: '2026-01-10' }),
      mkRow('박준태', '복식', '패', { date: '2026-01-17', match_id: 'R2_C1', game_id: 'g2' }),
      mkRow('문형민', '복식', '승', { date: '2026-01-10', match_id: 'R1_C3', game_id: 'g3' }),
    ];
    const r = buildPlayerRadar({ rows, roster: ROSTER, player: '박준태', asOfDate: '2026-02-01' });
    const att = r.axes.find(a => a.key === 'attendance');
    expect(att.raw).toBe('2일');
    expect(att.value).toBeCloseTo((2 + 0.5) / 3); // below{1,0}=2 + equal(self)*0.5 = 2.5/3
  });

  it('데이터 없으면 모든 축 value=0, raw는 실제 0값', () => {
    const r = buildPlayerRadar({ rows: [], roster: ROSTER, player: '존재안함', asOfDate: '2026-02-01' });
    expect(r.player).toBe('존재안함');
    expect(r.axes).toHaveLength(5);
    for (const a of r.axes) expect(a.value).toBe(0);   // 빈 모집단 → 0
    expect(r.axes.find(a => a.key === 'singlesRate').raw).toBe('0%');
    expect(r.axes.find(a => a.key === 'tbRate').raw).toBe('0%');
    expect(r.axes.find(a => a.key === 'points').raw).toBe('0');
    expect(r.axes.find(a => a.key === 'attendance').raw).toBe('0일');
  });

  it('rows/roster가 null이어도 크래시 없이 반환', () => {
    expect(() => buildPlayerRadar({ rows: null, roster: ROSTER, player: '박준태', asOfDate: '2026-01-11' })).not.toThrow();
    expect(() => buildPlayerRadar({ rows: undefined, roster: null, player: '박준태', asOfDate: '2026-01-11' })).not.toThrow();
  });
});
