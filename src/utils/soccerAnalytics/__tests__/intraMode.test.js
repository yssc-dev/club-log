import { describe, it, expect } from 'vitest';
import { parseSideExtras } from '../parseSideExtras';
import { expandIntraMatchRows } from '../expandIntraMatchRows';
import { calcDefenseAnalysis } from '../calcDefenseAnalysis';
import { calcOpponentBreakdown } from '../calcOpponentBreakdown';
import { calcOpponentLeaders } from '../calcOpponentLeaders';
import { calcOpponentDefense } from '../calcOpponentDefense';

const intraRow = {
  date: '2026-09-18', match_id: '1', game_id: 's_1', mode: '자체전', is_extra: false,
  our_team_name: '주황', opponent_team_name: '파랑',
  our_members_json: JSON.stringify(['a1', 'a2', 'a9']),
  opponent_members_json: JSON.stringify({ players: ['b1', 'b2', 'b9'], formation: '4-3-3', defenders: ['b2'] }),
  our_score: 2, opponent_score: 1, our_gk: 'a1', opponent_gk: 'b1', formation: '4-4-2',
  our_defenders_json: JSON.stringify(['a2']),
};
const harborRow = {
  date: '2026-09-11', match_id: '1', game_id: 's_0', mode: '기본', is_extra: false,
  our_team_name: '하버FC', opponent_team_name: '터틀파크',
  our_members_json: JSON.stringify(['h1', 'h2']), opponent_members_json: '[]',
  our_score: 1, opponent_score: 0, our_gk: 'h1', opponent_gk: '', formation: '4-4-2', our_defenders_json: JSON.stringify(['h2']),
};
const legacyRow = { ...harborRow, mode: '', date: '2026-05-01', game_id: 'legacy_1' };

describe('parseSideExtras', () => {
  it('객체형에서 formation/defenders 를 읽고, 배열형·깨진 값은 빈 값', () => {
    expect(parseSideExtras(intraRow.opponent_members_json)).toEqual({ formation: '4-3-3', defenders: ['b2'] });
    expect(parseSideExtras('["x"]')).toEqual({ formation: '', defenders: [] });
    expect(parseSideExtras('not json')).toEqual({ formation: '', defenders: [] });
    expect(parseSideExtras(undefined)).toEqual({ formation: '', defenders: [] });
  });
});

describe('expandIntraMatchRows', () => {
  it('자체전 1행 → A행+B행(상대 버킷 상수), 비자체전은 그대로', () => {
    const out = expandIntraMatchRows([harborRow, intraRow, legacyRow]);
    expect(out).toHaveLength(4);
    expect(out[0]).toBe(harborRow);
    expect(out[3]).toBe(legacyRow);
    const [a, b] = [out[1], out[2]];
    expect(a).toMatchObject({ our_team_name: '주황', opponent_team_name: '자체전', our_score: 2, opponent_score: 1, our_gk: 'a1', our_defenders_json: JSON.stringify(['a2']) });
    expect(b).toMatchObject({ our_team_name: '파랑', opponent_team_name: '자체전', our_score: 1, opponent_score: 2, our_gk: 'b1', opponent_gk: 'a1', formation: '4-3-3' });
    expect(JSON.parse(b.our_members_json)).toEqual(['b1', 'b2', 'b9']);
    expect(JSON.parse(b.our_defenders_json)).toEqual(['b2']);
  });
});

describe('분석 함수의 자체전 처리', () => {
  it('calcDefenseAnalysis: 양팀 수비수가 집계되고 하버FC 행 결과는 자체전 유무와 무관', () => {
    const withIntra = calcDefenseAnalysis({ matchLogs: [harborRow, intraRow], individualThreshold: 1 });
    const only = calcDefenseAnalysis({ matchLogs: [harborRow], individualThreshold: 1 });
    expect(JSON.stringify(withIntra).includes('b2')).toBe(true);  // B 수비수 등장
    expect(JSON.stringify(withIntra).includes('a2')).toBe(true);
    // 하버FC 수비수 h2 의 생값은 동일(자체전 행은 버킷 '자체전'이라 h2 기준선에 섞이지 않음)
    const pick = (r) => JSON.stringify(r).match(/"h2"[^}]*}/)?.[0];
    expect(pick(withIntra)).toBe(pick(only));
  });
  it('calcOpponentBreakdown: 자체전 골은 어느 상대 버킷에도 안 쌓인다(이벤트 폴백 포함)', () => {
    const eventLogs = [
      { date: '2026-09-18', match_id: '1', event_type: 'goal', player: 'a9', related_player: '', opponent: '파랑' },
      { date: '2026-09-11', match_id: '1', event_type: 'goal', player: 'h1', related_player: '', opponent: '터틀파크' },
    ];
    const r = calcOpponentBreakdown({ eventLogs, matchLogs: [harborRow, intraRow] });
    expect(r.byPlayer.a9).toBeUndefined();
    expect(r.byOpponent['파랑']).toBeUndefined();
    expect(r.byPlayer.h1[0]).toMatchObject({ opponent: '터틀파크', goals: 1 });
  });
  it('calcOpponentLeaders / calcOpponentDefense: 자체전 행 skip', () => {
    const L = calcOpponentLeaders({ eventLogs: [], matchLogs: [intraRow, harborRow], minOpponentMatches: 1, minGames: 1 });
    expect(JSON.stringify(L).includes('파랑')).toBe(false);
    const D = calcOpponentDefense({ matchLogs: [intraRow, harborRow] });
    expect(JSON.stringify(D).includes('파랑')).toBe(false);
    expect(JSON.stringify(D).includes('터틀파크')).toBe(true);
  });
});
