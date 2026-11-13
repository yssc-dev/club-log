import { describe, it, expect } from 'vitest';
import { METRIC_BASIS, withBasis } from '../metricBasis';

describe('지표 Top5 근거 문구', () => {
  it('지표별 근거', () => {
    expect(METRIC_BASIS.scoring({ goals: 34, rounds: 92 })).toBe('34골/92경기');
    expect(METRIC_BASIS.creativity({ assists: 24, rounds: 92 })).toBe('24어시/92경기');
    expect(METRIC_BASIS.keeping({ conceded: 24, keeperRounds: 41 })).toBe('24실점/41경기');
    expect(METRIC_BASIS.attendance({ games: 42, totalSessions: 43 })).toBe('42/43일');
    expect(METRIC_BASIS.winRate({ wins: 50, draws: 20, losses: 30 })).toBe('50승 20무 30패');
    expect(METRIC_BASIS.involvement({ goals: 30, assists: 15, teamGoals: 90 })).toBe('45/90골');
  });

  it('필드가 없으면 빈 문자열(근거 칸을 그리지 않음)', () => {
    expect(METRIC_BASIS.scoring({ goals: 3 })).toBe('');
    expect(METRIC_BASIS.winRate({})).toBe('');
  });

  it('withBasis 는 원본을 바꾸지 않고 sub 를 붙인다', () => {
    const rows = [{ player: 'A', value: 0.5, goals: 1, rounds: 2 }];
    const out = withBasis('scoring', rows);
    expect(out[0]).toMatchObject({ player: 'A', value: 0.5, sub: '1골/2경기' });
    expect(rows[0].sub).toBeUndefined();
  });
});
