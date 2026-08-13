import { describe, it, expect } from 'vitest';
import { DEFENSE_METRICS, DEFENSE_METRIC_KEYS } from '../defenseMetrics';

// calcDefenseAnalysis가 내주는 행 모양(필요한 필드만)
const row = {
  name: 'A', games: 16, cleanSheets: 8,
  concededPerGame: 0.75, delta: 0.512,
  cleanRate: 0.5, cleanDelta: 0.185,
};

describe('DEFENSE_METRICS', () => {
  it('토글 순서는 실점률 → 클린시트율', () => {
    expect(DEFENSE_METRIC_KEYS).toEqual(['conceded', 'clean']);
    expect(DEFENSE_METRIC_KEYS.map(k => DEFENSE_METRICS[k].label)).toEqual(['실점률', '클린시트율']);
  });

  describe('실점률', () => {
    const M = DEFENSE_METRICS.conceded;
    it('주값은 경기당 실점 생값', () => {
      expect(M.formatValue(row)).toBe('0.75실점');
    });
    it('조합 목록 제목은 생값 정렬을 그대로 말한다', () => {
      expect(M.bestLabel).toBe('실점 적은순');
    });
    it('Δ는 소수 2자리 + 부호', () => {
      expect(M.formatDelta(M.deltaOf(row))).toBe('+0.51');
      expect(M.formatDelta(-0.334)).toBe('-0.33');
    });
  });

  describe('클린시트율', () => {
    const M = DEFENSE_METRICS.clean;
    it('주값은 클린시트율 %', () => {
      expect(M.formatValue(row)).toBe('50%');
    });
    it('조합 목록 제목은 생값 정렬을 그대로 말한다', () => {
      expect(M.bestLabel).toBe('무실점률 높은순');
    });
    it('Δ는 %p + 부호', () => {
      expect(M.formatDelta(M.deltaOf(row))).toBe('+19%p');
      expect(M.formatDelta(-0.024)).toBe('-2%p');
    });
  });

  it('두 지표 모두 null Δ는 – 로 표기 (베이스라인 없음)', () => {
    for (const k of DEFENSE_METRIC_KEYS) {
      expect(DEFENSE_METRICS[k].formatDelta(null)).toBe('–');
      expect(DEFENSE_METRICS[k].deltaOf({ delta: null, cleanDelta: null })).toBeNull();
    }
  });

  it('두 지표 모두 sortDefenseRows에 넘길 metric 키를 갖는다', () => {
    for (const k of DEFENSE_METRIC_KEYS) expect(DEFENSE_METRICS[k].key).toBe(k);
  });
});
