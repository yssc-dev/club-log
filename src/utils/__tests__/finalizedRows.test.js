// src/utils/__tests__/finalizedRows.test.js
// 스펙 §5 우회 경로 — 설정 화면 "Firebase → 로그_매치 정확 덮어쓰기" 가 컵 세션을 태그 없이
// 재기록하면 rowFilter 를 우회해 정규 분석이 오염된다. 태그는 반드시 세션 state 에서 나온다.
import { describe, it, expect } from 'vitest';
import { rowsForFinalizedSession } from '../finalizedRows';

const futsalState = (extra = {}) => ({
  gameId: 'g_1', teams: [['a1'], ['b1']],
  completedMatches: [{ matchId: 'R1_C0', homeIdx: 0, awayIdx: 1, homeTeam: '팀A', awayTeam: '팀B', homeScore: 1, awayScore: 0 }],
  ...extra,
});

describe('rowsForFinalizedSession', () => {
  it('정규 풋살 세션: mode=기본, tournament_id 빈 문자열', () => {
    const rows = rowsForFinalizedSession({ team: '마스터FC', sport: '풋살', gameDate: '2026-09-13', savedAt: 't', state: futsalState() });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ mode: '기본', tournament_id: '', date: '2026-09-13', input_time: 't', our_team_name: '팀A' });
  });
  it('컵 풋살 세션: mode=대회, tournament_id=대회명', () => {
    const rows = rowsForFinalizedSession({ team: '마스터FC', sport: '풋살', gameDate: '2026-09-20', savedAt: '', state: futsalState({ tournamentId: '마스터스컵 2026' }) });
    expect(rows[0]).toMatchObject({ mode: '대회', tournament_id: '마스터스컵 2026' });
  });
  it('축구 세션은 축구 빌더를 쓴다(soccerMatches 기준, 기존 동작)', () => {
    const state = { soccerMatches: [{ matchIdx: 1, opponent: '상대', events: [], lineup: [], startedAt: 1 }] };
    const rows = rowsForFinalizedSession({ team: '하버FC', sport: '축구', gameDate: '2026-09-13', savedAt: 't', state });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sport: '축구', mode: '기본', tournament_id: '', opponent_team_name: '상대' });
  });
  it('completedMatches 가 없으면 빈 배열', () => {
    expect(rowsForFinalizedSession({ team: '마스터FC', sport: '풋살', gameDate: '2026-09-13', savedAt: '', state: {} })).toEqual([]);
  });
});
