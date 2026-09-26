// src/utils/__tests__/cupRecords.test.js
// 마스터스컵 3단계 스펙 §3 — 순수 계산 규칙 고정. fixture 열 이름은 로그_매치·로그_이벤트 실제 열.
import { describe, it, expect } from 'vitest';
import {
  isExtraRow, matchKeyOf, selectCupRows, collectPlayedPairs,
} from '../cup/cupRecords';

const A5 = ['a1', 'a2', 'a3', 'a4', 'a5'];
const B5 = ['b1', 'b2', 'b3', 'b4', 'b5'];
export const M = (over = {}) => ({
  team: '마스터FC', sport: '풋살', mode: '대회', tournament_id: 'CUP', date: '2026-10-01', game_id: 'g1', match_idx: 1,
  round_idx: 1, court_id: 0, match_id: 'R1_C0', our_team_name: '팀A', opponent_team_name: '팀B',
  our_members_json: JSON.stringify(A5), opponent_members_json: JSON.stringify(B5),
  our_score: 0, opponent_score: 0, our_gk: 'a1', opponent_gk: 'b1', formation: '', our_defenders_json: '[]',
  is_extra: false, input_time: '', ...over,
});
export const E = (over = {}) => ({
  team: '마스터FC', sport: '풋살', mode: '대회', tournament_id: 'CUP', date: '2026-10-01', match_id: 'R1_C0',
  our_team: '팀A', opponent: '팀B', event_type: 'goal', player: 'a2', related_player: '', concede_gk: 'b1',
  position: '', input_time: '', game_id: 'g1', ...over,
});

describe('isExtraRow / matchKeyOf', () => {
  it('boolean true 와 문자열 TRUE 둘 다 임시 라운드', () => {
    expect(isExtraRow(M({ is_extra: true }))).toBe(true);
    expect(isExtraRow(M({ is_extra: 'TRUE' }))).toBe(true);
    expect(isExtraRow(M({ is_extra: 'true' }))).toBe(true);
    expect(isExtraRow(M({ is_extra: false }))).toBe(false);
    expect(isExtraRow(M({ is_extra: 'FALSE' }))).toBe(false);
    expect(isExtraRow(M({ is_extra: '' }))).toBe(false);
    expect(isExtraRow(null)).toBe(false);
  });
  it('경기 키는 date|game_id|정규화 match_id', () => {
    expect(matchKeyOf(M())).toBe('2026-10-01|g1|R1_C0');
    expect(matchKeyOf(M({ match_id: '1라운드 매치1' }))).toBe('2026-10-01|g1|R1_C0');
    expect(matchKeyOf(E())).toBe(matchKeyOf(M()));
  });
});

describe('selectCupRows', () => {
  it('다른 대회·정규 행은 경기·이벤트 모두 제외', () => {
    const { matchRows, eventRows } = selectCupRows({
      matchRows: [M(), M({ tournament_id: 'OTHER', match_id: 'R1_C1' }), M({ tournament_id: '', mode: '기본', match_id: 'R2_C0' })],
      eventRows: [E(), E({ tournament_id: 'OTHER' }), E({ tournament_id: '' })],
      cupId: 'CUP',
    });
    expect(matchRows).toHaveLength(1);
    expect(eventRows).toHaveLength(1);
  });
  it('임시 라운드 경기와 그 경기의 이벤트를 함께 걷어낸다(문자열 TRUE 포함)', () => {
    const { matchRows, eventRows } = selectCupRows({
      matchRows: [M(), M({ match_id: 'R2_C0', is_extra: true }), M({ match_id: 'R3_C0', is_extra: 'TRUE' })],
      eventRows: [E(), E({ match_id: 'R2_C0' }), E({ match_id: 'R3_C0' })],
      cupId: 'CUP',
    });
    expect(matchRows.map(r => r.match_id)).toEqual(['R1_C0']);
    expect(eventRows.map(r => r.match_id)).toEqual(['R1_C0']);
  });
  it('로그_매치에 짝이 없는 이벤트는 남기고, 골 이벤트는 중복 제거하지 않는다', () => {
    const { eventRows } = selectCupRows({ matchRows: [M()], eventRows: [E(), E(), E({ match_id: 'R9_C0' })], cupId: 'CUP' });
    expect(eventRows).toHaveLength(3);
  });
  it('tournament_id 가 숫자로 들어와도 문자열 cupId 와 맞춘다', () => {
    const { matchRows } = selectCupRows({ matchRows: [M({ tournament_id: 2026 })], eventRows: [], cupId: '2026' });
    expect(matchRows).toHaveLength(1);
  });
  it('입력이 undefined 여도 빈 배열', () => {
    expect(selectCupRows({ cupId: 'CUP' })).toEqual({ matchRows: [], eventRows: [] });
  });
});

describe('collectPlayedPairs', () => {
  it('홈·원정 순서 무관 같은 키, 임시 라운드·다른 대회 제외, "팀 A" 공백 정규화', () => {
    const pairs = collectPlayedPairs([
      M(), M({ our_team_name: '팀B', opponent_team_name: '팀A', match_id: 'R2_C0' }),
      M({ our_team_name: '팀 A', opponent_team_name: '팀C', match_id: 'R3_C0' }),
      M({ opponent_team_name: '팀C', is_extra: true, match_id: 'R4_C0' }),
      M({ tournament_id: 'OTHER', our_team_name: '팀X', opponent_team_name: '팀Y' }),
    ], 'CUP');
    expect([...pairs].sort()).toEqual(['팀A|팀B', '팀A|팀C']);
  });
  it('빈 입력은 빈 Set', () => {
    expect(collectPlayedPairs(undefined, 'CUP').size).toBe(0);
  });
});
