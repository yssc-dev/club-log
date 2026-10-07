// 로그_매치 roles_json 적재 계약.
// ★ 열은 반드시 맨 끝이어야 한다 — Apps Script 가 열 순서를 하드코딩(_rawMatchToArray /
//   _getRawMatches)하므로 중간에 끼우면 기존 데이터 전체가 오독된다.
import { describe, it, expect } from 'vitest';
import { RAW_MATCH_COLUMNS, buildRoundRowsFromSoccer, buildRoundRowsFromFutsal } from '../matchRowBuilder';

const soccerState = (matches) => ({ soccerMatches: matches });
const match = (extra = {}) => ({
  matchIdx: 1, opponent: '한울', status: 'finished', startedAt: 1700000000000,
  lineup: ['A', 'B'], gk: 'A', defenders: ['B'], subs: [], formation: '4-4-2',
  assignments: { 0: 'A', 1: 'B' }, events: [], ...extra,
});
const build = (matches) => buildRoundRowsFromSoccer({
  team: '하버FC', date: '2026-10-07', stateJSON: soccerState(matches), inputTime: 'now',
});

describe('RAW_MATCH_COLUMNS', () => {
  it('roles_json 이 마지막 열이다', () => {
    expect(RAW_MATCH_COLUMNS[RAW_MATCH_COLUMNS.length - 1]).toBe('roles_json');
  });

  it('기존 열 순서가 그대로다 (앞 22개 불변)', () => {
    expect(RAW_MATCH_COLUMNS.slice(0, 22)).toEqual([
      'team', 'sport', 'mode', 'tournament_id',
      'date', 'game_id', 'match_idx',
      'round_idx', 'court_id', 'match_id',
      'our_team_name', 'opponent_team_name',
      'our_members_json', 'opponent_members_json',
      'our_score', 'opponent_score',
      'our_gk', 'opponent_gk',
      'formation', 'our_defenders_json',
      'is_extra', 'input_time',
    ]);
    expect(RAW_MATCH_COLUMNS).toHaveLength(23);
  });
});

describe('buildRoundRowsFromSoccer — roles_json', () => {
  it('역할이 있으면 JSON 으로 적재한다', () => {
    const rows = build([match({ roles: { camera: ['X', 'Y'], referee: 'Z', assistants: ['A'] } })]);
    expect(JSON.parse(rows[0].roles_json))
      .toEqual({ camera: ['X', 'Y'], referee: 'Z', assistants: ['A'] });
  });

  it('전원 공석이면 빈 문자열이다 (시트 JSON 도배 방지)', () => {
    const rows = build([match({ roles: { camera: [], referee: '', assistants: [] } })]);
    expect(rows[0].roles_json).toBe('');
  });

  it('roles 가 없는 레거시 경기도 빈 문자열이다', () => {
    const rows = build([match()]);
    expect(rows[0].roles_json).toBe('');
  });

  it('RTDB 드롭 모양({referee}만)도 정규화해 적재한다', () => {
    const rows = build([match({ roles: { referee: 'Z' } })]);
    expect(JSON.parse(rows[0].roles_json))
      .toEqual({ camera: [], referee: 'Z', assistants: [] });
  });

  it('다른 열은 영향받지 않는다', () => {
    const rows = build([match({ roles: { referee: 'Z' } })]);
    expect(rows[0].sport).toBe('축구');
    expect(rows[0].our_team_name).toBe('하버FC');
    expect(rows[0].match_idx).toBe(1);
  });
});

describe('buildRoundRowsFromFutsal — 무변경', () => {
  it('풋살 행은 roles_json 키를 만들지 않는다 (Apps Script 가 ||"" 로 받는다)', () => {
    const rows = buildRoundRowsFromFutsal({
      team: '마스터FC', date: '2026-10-07', inputTime: 'now',
      stateJSON: {
        gameId: 'g_1', teams: [['A'], ['B']],
        completedMatches: [{
          matchId: 'R1_C1', homeIdx: 0, awayIdx: 1, homeTeam: '1팀', awayTeam: '2팀',
          homeScore: 1, awayScore: 0, homeGk: 'A', awayGk: 'B',
        }],
      },
    });
    expect(rows[0].roles_json).toBeUndefined();
    expect(rows[0].sport).toBe('풋살');
  });
});
