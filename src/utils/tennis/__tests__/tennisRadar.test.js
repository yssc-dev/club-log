import { describe, it, expect } from 'vitest';
import { buildPlayerRadar } from '../tennisRadar';

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
  tb_played: 0,
  tb_won: 0,
  bagels_taken: 0,
  bagels_given: 0,
  partner: opts.partner || '',
  opponents_json: opts.opponents_json || '[]',
  match_id: opts.match_id || 'R1_C1',
  game_id: opts.game_id || 'g1',
  side: 'A',
  grade_at_date: '',
});

const ROSTER = [
  { name: '박준태', grade: '금배' },
  { name: '문형민', grade: '은배' },
  { name: '홍길동', grade: '동배' },
];

// ── 테스트 ──────────────────────────────────────────────────
describe('buildPlayerRadar', () => {
  it('에이스가 로스터 최댓값으로 정규화된다', () => {
    // 박준태 에이스 6 (max), 문형민 에이스 3 (0.5), 홍길동 에이스 0
    const rows = [
      mkRow('박준태', '단식', '승', { aces: 6, match_id: 'R1_C1', game_id: 'g1', opponents_json: '["문형민"]' }),
      mkRow('문형민', '단식', '패', { aces: 3, match_id: 'R1_C1', game_id: 'g1', opponents_json: '["박준태"]' }),
      mkRow('홍길동', '단식', '승', { aces: 0, match_id: 'R2_C1', game_id: 'g2', opponents_json: '["박준태"]' }),
    ];

    const r1 = buildPlayerRadar({ rows, roster: ROSTER, player: '박준태', asOfDate: '2026-01-11' });
    const acesAxis1 = r1.axes.find(a => a.key === 'aces');
    expect(acesAxis1.value).toBe(1);        // 6/6 = 1 (로스터 최댓값)
    expect(acesAxis1.raw).toBe('6');

    const r2 = buildPlayerRadar({ rows, roster: ROSTER, player: '문형민', asOfDate: '2026-01-11' });
    const acesAxis2 = r2.axes.find(a => a.key === 'aces');
    expect(acesAxis2.value).toBeCloseTo(0.5); // 3/6
    expect(acesAxis2.raw).toBe('3');
  });

  it('참석일이 로스터 최댓값으로 정규화된다', () => {
    // 박준태 2일 (max), 문형민 1일 → 0.5, 홍길동 0일 → 0
    const rows = [
      mkRow('박준태', '복식', '승', { date: '2026-01-10' }),
      mkRow('박준태', '복식', '패', { date: '2026-01-17' }),
      mkRow('문형민', '복식', '승', { date: '2026-01-10' }),
    ];

    const r1 = buildPlayerRadar({ rows, roster: ROSTER, player: '박준태', asOfDate: '2026-01-18' });
    const att1 = r1.axes.find(a => a.key === 'attendance');
    expect(att1.value).toBe(1);
    expect(att1.raw).toBe('2일');

    const r2 = buildPlayerRadar({ rows, roster: ROSTER, player: '문형민', asOfDate: '2026-01-18' });
    const att2 = r2.axes.find(a => a.key === 'attendance');
    expect(att2.value).toBeCloseTo(0.5);
    expect(att2.raw).toBe('1일');
  });

  it('전 선수의 특정 축이 0이면 해당 축 value=0 (divide-by-zero 가드)', () => {
    // aces='' → 미기록, 모든 선수 에이스 0
    const rows = [
      mkRow('박준태', '복식', '승', { aces: '' }),
      mkRow('문형민', '복식', '패', { aces: '' }),
    ];
    const result = buildPlayerRadar({ rows, roster: ROSTER, player: '박준태', asOfDate: '2026-01-11' });
    const acesAxis = result.axes.find(a => a.key === 'aces');
    expect(acesAxis.value).toBe(0);
    // raw는 0 (buildPlayerSummary aces는 ''를 0으로 더하지 않음 — 미기록 행이므로)
  });

  it('단식 승률은 0~1 직접 패스스루 (로스터 최댓값으로 나누지 않는다)', () => {
    // 박준태 2승1패 → 2/3 ≈ 0.667
    const rows = [
      mkRow('박준태', '단식', '승', { match_id: 'R1_C1', game_id: 'g1', opponents_json: '["문형민"]', date: '2026-01-10' }),
      mkRow('문형민', '단식', '패', { match_id: 'R1_C1', game_id: 'g1', opponents_json: '["박준태"]', date: '2026-01-10' }),
      mkRow('박준태', '단식', '승', { match_id: 'R1_C2', game_id: 'g2', opponents_json: '["홍길동"]', date: '2026-01-10' }),
      mkRow('홍길동', '단식', '패', { match_id: 'R1_C2', game_id: 'g2', opponents_json: '["박준태"]', date: '2026-01-10' }),
      mkRow('박준태', '단식', '패', { match_id: 'R2_C1', game_id: 'g3', opponents_json: '["문형민"]', date: '2026-01-17' }),
      mkRow('문형민', '단식', '승', { match_id: 'R2_C1', game_id: 'g3', opponents_json: '["박준태"]', date: '2026-01-17' }),
    ];

    const result = buildPlayerRadar({ rows, roster: ROSTER, player: '박준태', asOfDate: '2026-01-18' });
    const singlesAxis = result.axes.find(a => a.key === 'singlesRate');
    expect(singlesAxis.value).toBeCloseTo(2 / 3, 5);
    expect(singlesAxis.raw).toBe('67%');
  });

  it('로스터에 없는 선수도 크래시 없이 5개 축 반환 (빈 값으로)', () => {
    const rows = [];
    const result = buildPlayerRadar({ rows, roster: ROSTER, player: '존재안함', asOfDate: '2026-01-11' });
    expect(result.player).toBe('존재안함');
    expect(result.axes).toHaveLength(5);

    const singlesAxis = result.axes.find(a => a.key === 'singlesRate');
    expect(singlesAxis.value).toBe(0);
    expect(singlesAxis.raw).toBe('0%');

    const doublesAxis = result.axes.find(a => a.key === 'doublesRate');
    expect(doublesAxis.value).toBe(0);

    // 빈 rows → 모든 max=0 → 포인트·참석·에이스 모두 0
    const pointsAxis = result.axes.find(a => a.key === 'points');
    expect(pointsAxis.value).toBe(0);
    expect(pointsAxis.raw).toBe('0');
  });

  it('rows가 null/undefined이어도 크래시 없이 반환', () => {
    expect(() => buildPlayerRadar({ rows: null, roster: ROSTER, player: '박준태', asOfDate: '2026-01-11' })).not.toThrow();
    expect(() => buildPlayerRadar({ rows: undefined, roster: null, player: '박준태', asOfDate: '2026-01-11' })).not.toThrow();
  });
});
