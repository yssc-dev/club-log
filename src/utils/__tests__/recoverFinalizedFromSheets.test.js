// 스펙 §5·불변식 9 — 복구 유틸은 AppSync 를 직접 읽는 유일한 우회 경로라 같은 필터를 갖는다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ matches: [], events: [], players: [] }));
vi.mock('../../services/appSync', () => ({
  default: {
    getMatchLog: () => Promise.resolve({ rows: h.matches }),
    getEventLog: () => Promise.resolve({ rows: h.events }),
    getPlayerGameLog: () => Promise.resolve({ rows: h.players }),
  },
}));

import { recoverFinalizedStateFromSheets } from '../recoverFinalizedFromSheets';

const T = '마스터FC', D = '2026-09-20';
const regMatch = { team: T, date: D, game_id: 'g_1', match_idx: 1, match_id: 'R1_C0', court_id: 0, tournament_id: '', our_team_name: '팀A', opponent_team_name: '팀B', our_members_json: '["a1"]', opponent_members_json: '["b1"]', our_score: 2, opponent_score: 1, is_extra: false };
const cupMatch = { ...regMatch, match_idx: 2, match_id: 'R2_C0', tournament_id: '마스터스컵 2026', our_team_name: '팀C', opponent_team_name: '팀D', our_members_json: '["c1"]', opponent_members_json: '["d1"]' };
const regEv = { team: T, date: D, match_id: 'R1_C0', event_type: 'goal', player: 'a1', related_player: '', our_team: '팀A', opponent: '팀B', tournament_id: '', input_time: '' };
const cupEv = { ...regEv, match_id: 'R2_C0', player: 'c1', our_team: '팀C', opponent: '팀D', tournament_id: '마스터스컵 2026' };
const regPg = { team: T, date: D, player: 'a1', tournament_id: '' };
const cupPg = { team: T, date: D, player: 'c1', tournament_id: '마스터스컵 2026' };

beforeEach(() => { h.matches = []; h.events = []; h.players = []; });

describe('recoverFinalizedStateFromSheets — 컵 행 제외', () => {
  it('같은 날 정규+컵 행이 섞여 있어도 정규 행만 복구한다', async () => {
    h.matches = [regMatch, cupMatch]; h.events = [regEv, cupEv]; h.players = [regPg, cupPg];
    const { state } = await recoverFinalizedStateFromSheets({ team: T, date: D });
    expect(state.completedMatches.map(m => m.matchId)).toEqual(['R1_C0']);
    expect(state.allEvents.map(e => e.player)).toEqual(['a1']);
    expect(state.teamNames).toEqual(['팀A', '팀B']);
    expect(state.attendees).not.toContain('c1');
  });

  it('컵 행만 있는 날짜는 "데이터 없음" 으로 throw (컵 세션은 아카이브에 이미 있다)', async () => {
    h.matches = [cupMatch]; h.events = [cupEv]; h.players = [cupPg];
    await expect(recoverFinalizedStateFromSheets({ team: T, date: D })).rejects.toThrow('데이터 없음');
  });
});
