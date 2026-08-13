import { describe, it, expect } from 'vitest';
import { calcGkChemistry } from '../calcGkChemistry';

describe('calcGkChemistry', () => {
  it('returns empty for no logs', () => {
    const r = calcGkChemistry({ matchLogs: [], threshold: 1 });
    expect(r.gks).toEqual([]);
    expect(r.byGk).toEqual({});
  });

  it('includeOpponent=false → opponent_gk 집계 안 됨 (축구 모드)', () => {
    const matchLogs = [
      {
        our_gk: 'OurG', our_members_json: '["OurG","X"]',
        opponent_gk: 'ExtG', opponent_members_json: '["ExtG","Y"]',
        our_score: 1, opponent_score: 0,
      },
    ];
    const r = calcGkChemistry({ matchLogs, threshold: 1, includeOpponent: false });
    expect(r.gks).toEqual(['OurG']);
    expect(r.byGk.ExtG).toBeUndefined();
  });

  it('counts rounds with same GK + same field member', () => {
    const matchLogs = [
      { our_gk: 'G', our_members_json: '["G","A","B"]', opponent_score: 0 },
      { our_gk: 'G', our_members_json: '["G","A","B"]', opponent_score: 1 },
      { our_gk: 'G', our_members_json: '["G","A","C"]', opponent_score: 0 },
    ];
    const r = calcGkChemistry({ matchLogs, threshold: 1 });
    const gA = r.byGk.G.pairs.find(p => p.field === 'A');
    expect(gA).toEqual({ field: 'A', rounds: 3, cleanSheets: 2, cleanRate: 2 / 3 });
    const gB = r.byGk.G.pairs.find(p => p.field === 'B');
    expect(gB).toEqual({ field: 'B', rounds: 2, cleanSheets: 1, cleanRate: 1 / 2 });
    const gC = r.byGk.G.pairs.find(p => p.field === 'C');
    expect(gC).toEqual({ field: 'C', rounds: 1, cleanSheets: 1, cleanRate: 1 });
  });

  it('excludes GK from own pair list', () => {
    const matchLogs = [
      { our_gk: 'G', our_members_json: '["G","A"]', opponent_score: 0 },
    ];
    const r = calcGkChemistry({ matchLogs, threshold: 1 });
    expect(r.byGk.G.pairs.find(p => p.field === 'G')).toBeUndefined();
  });

  it('skips rows with empty our_gk', () => {
    const matchLogs = [
      { our_gk: '', our_members_json: '["A","B"]', opponent_score: 0 },
    ];
    const r = calcGkChemistry({ matchLogs, threshold: 1 });
    expect(r.gks).toEqual([]);
  });

  it('threshold filters pairs below rounds', () => {
    const matchLogs = [
      { our_gk: 'G', our_members_json: '["G","A"]', opponent_score: 0 },
    ];
    const r = calcGkChemistry({ matchLogs, threshold: 5 });
    expect(r.byGk.G.pairs).toEqual([]);
    expect(r.byGk.G.worst).toEqual([]);
  });

  it('worst is sorted by cleanRate asc, pairs by desc', () => {
    const matchLogs = [
      { our_gk: 'G', our_members_json: '["G","A"]', opponent_score: 0 },
      { our_gk: 'G', our_members_json: '["G","A"]', opponent_score: 0 },
      { our_gk: 'G', our_members_json: '["G","B"]', opponent_score: 1 },
      { our_gk: 'G', our_members_json: '["G","B"]', opponent_score: 1 },
    ];
    const r = calcGkChemistry({ matchLogs, threshold: 2 });
    expect(r.byGk.G.pairs[0].field).toBe('A');
    expect(r.byGk.G.worst[0].field).toBe('B');
  });

  it('also counts opponent_gk + opponent_members_json (futsal rotation)', () => {
    const matchLogs = [
      // 라운드 1: G가 our 쪽 GK, A·B는 같은 팀 필드. 우리 무실점.
      { our_gk: 'G', our_members_json: '["G","A","B"]', our_score: 2, opponent_score: 0,
        opponent_gk: 'H', opponent_members_json: '["H","C","D"]' },
      // 라운드 2: G가 opp 쪽 GK, X·Y가 같은 팀. opp(G의 팀) 무실점 = our_score==0.
      { our_gk: 'P', our_members_json: '["P","Q","R"]', our_score: 0, opponent_score: 1,
        opponent_gk: 'G', opponent_members_json: '["G","X","Y"]' },
    ];
    const r = calcGkChemistry({ matchLogs, threshold: 1 });
    // G는 양 라운드 모두 GK였고 A, B, X, Y와 페어링되어야 함
    const fields = r.byGk.G.pairs.map(p => p.field).sort();
    expect(fields).toEqual(['A', 'B', 'X', 'Y']);
    // A: 1라운드 같이 + 무실점 1
    expect(r.byGk.G.pairs.find(p => p.field === 'A')).toEqual({ field: 'A', rounds: 1, cleanSheets: 1, cleanRate: 1 });
    // X: 라운드 2 같이 (opp_gk 측), our_score=0이라 isClean=true
    expect(r.byGk.G.pairs.find(p => p.field === 'X')).toEqual({ field: 'X', rounds: 1, cleanSheets: 1, cleanRate: 1 });
    // H는 라운드 1 opp_gk였고 our_score=2라 무실점 아님
    expect(r.byGk.H.pairs.find(p => p.field === 'C')).toEqual({ field: 'C', rounds: 1, cleanSheets: 0, cleanRate: 0 });
  });

  it('skips malformed our_members_json', () => {
    const matchLogs = [
      { our_gk: 'G', our_members_json: 'bad-json', opponent_score: 0 },
      { our_gk: 'G', our_members_json: '["G","A"]', opponent_score: 0 },
    ];
    const r = calcGkChemistry({ matchLogs, threshold: 1 });
    expect(r.byGk.G.pairs.find(p => p.field === 'A').rounds).toBe(1);
  });
});
