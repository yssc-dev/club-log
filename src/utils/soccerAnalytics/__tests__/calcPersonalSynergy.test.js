import { describe, it, expect } from 'vitest';
import { calcSynergyMatrix } from '../calcSynergyMatrix';
import { calcPersonalSynergy } from '../calcPersonalSynergy';

// 각 항목에 고유 match_id를 부여해 (date, match_id) dedup이 경기별로 1건씩 집계되도록 함
let _mid = 0;
const mk = (members, our_score, opponent_score) => ({
  our_members_json: JSON.stringify(members),
  our_score,
  opponent_score,
  match_id: String(++_mid),
  date: '2024-01-01',
});

describe('calcPersonalSynergy', () => {
  it('returns empty for unknown player', () => {
    const matrix = calcSynergyMatrix({ matchLogs: [], minRounds: 1 });
    const r = calcPersonalSynergy({ matrix, player: 'X' });
    expect(r).toEqual({ partners: [], best: [], worst: [] });
  });

  it('partners list includes all who played with target (any games >0)', () => {
    const matchLogs = [
      mk(['A', 'B'], 1, 0),
      mk(['A', 'C'], 0, 1),
    ];
    const matrix = calcSynergyMatrix({ matchLogs, minRounds: 5 });
    const r = calcPersonalSynergy({ matrix, player: 'A' });
    const names = r.partners.map(p => p.partner).sort();
    expect(names).toEqual(['B', 'C']);
    // 둘 다 minRounds(5) 미만이라 isLowSample=true
    expect(r.partners.every(p => p.isLowSample)).toBe(true);
  });

  it('항상 동행 페어는 baselineUnavailable 패스스루', () => {
    const matchLogs = Array.from({ length: 5 }, () => mk(['A', 'B'], 1, 0));
    const matrix = calcSynergyMatrix({ matchLogs, minRounds: 1 });
    const r = calcPersonalSynergy({ matrix, player: 'A' });
    const b = r.partners.find(p => p.partner === 'B');
    expect(b.baselineUnavailable).toBe(true);
  });

  it('partners entries include winRate and liftSymmetric', () => {
    const matchLogs = Array.from({ length: 5 }, () => mk(['A', 'B'], 1, 0));
    const matrix = calcSynergyMatrix({ matchLogs, minRounds: 1 });
    const r = calcPersonalSynergy({ matrix, player: 'A' });
    const b = r.partners.find(p => p.partner === 'B');
    expect(b.winRate).toBe(1);
    expect(b.liftSymmetric).toBe(0); // A,B solo도 모두 1.0이므로 lift 0
    expect(b.isLowSample).toBe(false);
  });

  it('extracts row of player, sorted best/worst', () => {
    const matchLogs = [
      // A,B 같이 5경기 5승
      ...Array.from({ length: 5 }, () => mk(['A', 'B'], 1, 0)),
      // A,C 같이 5경기 0승 5패
      ...Array.from({ length: 5 }, () => mk(['A', 'C'], 0, 1)),
      // A,D 같이 5경기 3승 2패
      ...Array.from({ length: 3 }, () => mk(['A', 'D'], 1, 0)),
      ...Array.from({ length: 2 }, () => mk(['A', 'D'], 0, 1)),
    ];
    const matrix = calcSynergyMatrix({ matchLogs, minRounds: 5 });
    const r = calcPersonalSynergy({ matrix, player: 'A', topN: 3 });
    expect(r.best.map(p => p.partner)).toEqual(['B', 'D', 'C']);
    expect(r.worst.map(p => p.partner)).toEqual(['C', 'D', 'B']);
  });

  it('excludes diagonal (self pair)', () => {
    const matchLogs = Array.from({ length: 5 }, () => mk(['A', 'B'], 1, 0));
    const matrix = calcSynergyMatrix({ matchLogs, minRounds: 1 });
    const r = calcPersonalSynergy({ matrix, player: 'A', topN: 5 });
    expect(r.best.find(p => p.partner === 'A')).toBeUndefined();
  });

  it('filters pairs below matrix.minRounds', () => {
    const matchLogs = [
      // A,B 1경기만
      mk(['A', 'B'], 1, 0),
    ];
    const matrix = calcSynergyMatrix({ matchLogs, minRounds: 5 });
    const r = calcPersonalSynergy({ matrix, player: 'A', topN: 3 });
    expect(r.best).toEqual([]);
    expect(r.worst).toEqual([]);
  });

  it('topN slices results', () => {
    const matchLogs = [];
    for (const partner of ['B', 'C', 'D', 'E', 'F']) {
      for (let i = 0; i < 5; i++) {
        matchLogs.push(mk(['A', partner], 1, 0));
      }
    }
    const matrix = calcSynergyMatrix({ matchLogs, minRounds: 5 });
    const r = calcPersonalSynergy({ matrix, player: 'A', topN: 2 });
    expect(r.best).toHaveLength(2);
    expect(r.worst).toHaveLength(2);
  });
});
