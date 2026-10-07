import { describe, it, expect } from 'vitest';
import { buildRoundRowsFromFutsal, buildRoundRowsFromSoccer, RAW_MATCH_COLUMNS } from '../matchRowBuilder';

describe('RAW_MATCH_COLUMNS', () => {
  it('필수 컬럼 순서', () => {
    expect(RAW_MATCH_COLUMNS).toEqual([
      'team', 'sport', 'mode', 'tournament_id',
      'date', 'game_id', 'match_idx',
      'round_idx', 'court_id', 'match_id',
      'our_team_name', 'opponent_team_name',
      'our_members_json', 'opponent_members_json',
      'our_score', 'opponent_score',
      'our_gk', 'opponent_gk',
      'formation', 'our_defenders_json',
      'is_extra', 'input_time',
      'roles_json',
    ]);
  });
});

describe('buildRoundRowsFromFutsal', () => {
  const baseState = {
    gameId: 'g_1713000000000',
    teams: [
      ['김성태', '이준호', '박민', '최영', '홍길동'],
      ['강백호', '서태웅', '정대만', '송태섭', '채치수'],
    ],
    teamNames: ['Team A', 'Team B'],
    completedMatches: [
      {
        matchId: 'R1_C0',
        homeIdx: 0, awayIdx: 1,
        homeTeam: 'Team A', awayTeam: 'Team B',
        homeScore: 3, awayScore: 1,
        homeGk: '김성태', awayGk: '강백호',
        isExtra: false,
      },
    ],
  };

  it('1라운드 → 1 row 반환', () => {
    const rows = buildRoundRowsFromFutsal({
      team: 'masterfc', mode: '기본', date: '2026-04-10',
      stateJSON: baseState, inputTime: '2026-04-10T20:00:00',
    });
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.team).toBe('masterfc');
    expect(r.sport).toBe('풋살');
    expect(r.mode).toBe('기본');
    expect(r.game_id).toBe('g_1713000000000');
    expect(r.date).toBe('2026-04-10');
    expect(r.match_id).toBe('R1_C0');
    expect(r.round_idx).toBe(1);
    expect(r.court_id).toBe(0);
    expect(r.match_idx).toBe(1);
    expect(r.our_team_name).toBe('Team A');
    expect(r.opponent_team_name).toBe('Team B');
    expect(r.our_score).toBe(3);
    expect(r.opponent_score).toBe(1);
    expect(r.our_gk).toBe('김성태');
    expect(r.opponent_gk).toBe('강백호');
    expect(JSON.parse(r.our_members_json)).toEqual(['김성태', '이준호', '박민', '최영', '홍길동']);
    expect(JSON.parse(r.opponent_members_json)).toEqual(['강백호', '서태웅', '정대만', '송태섭', '채치수']);
    expect(r.is_extra).toBe(false);
    expect(r.formation).toBe('');
    expect(JSON.parse(r.our_defenders_json)).toEqual([]);
  });

  it('컵 세션 행은 mode=대회 · tournament_id 를 단다(정규 집계 혼입 방지의 마지막 관문)', () => {
    const rows = buildRoundRowsFromFutsal({
      team: '마스터FC', mode: '대회', tournamentId: '마스터스컵 2026',
      date: '2026-09-24', stateJSON: baseState, inputTime: '2026-09-24T12:00:00Z',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].mode).toBe('대회');
    expect(rows[0].tournament_id).toBe('마스터스컵 2026');
    expect(rows[0].sport).toBe('풋살');
  });

  it('정규 세션 행의 tournament_id 는 빈 문자열(기본값)', () => {
    const rows = buildRoundRowsFromFutsal({ team: '마스터FC', date: '2026-09-24', stateJSON: baseState, inputTime: '' });
    expect(rows[0].mode).toBe('기본');
    expect(rows[0].tournament_id).toBe('');
  });

  it('match_id 파싱으로 round_idx / court_id 추출', () => {
    const state = {
      ...baseState,
      completedMatches: [{ ...baseState.completedMatches[0], matchId: 'R5_C1' }],
    };
    const rows = buildRoundRowsFromFutsal({ team: 't', mode: '기본', date: '2026-04-10', stateJSON: state, inputTime: '' });
    expect(rows[0].round_idx).toBe(5);
    expect(rows[0].court_id).toBe(1);
  });

  it('is_extra 경기도 포함 (is_extra=true)', () => {
    const state = {
      ...baseState,
      completedMatches: [{ ...baseState.completedMatches[0], isExtra: true }],
    };
    const rows = buildRoundRowsFromFutsal({ team: 't', mode: '기본', date: '2026-04-10', stateJSON: state, inputTime: '' });
    expect(rows[0].is_extra).toBe(true);
  });

  it('completedMatches 비어있으면 빈 배열', () => {
    const rows = buildRoundRowsFromFutsal({ team: 't', mode: '기본', date: '2026-04-10', stateJSON: { ...baseState, completedMatches: [] }, inputTime: '' });
    expect(rows).toEqual([]);
  });

  it('매치에 homePlayers/awayPlayers 스냅샷이 있으면 우선 사용 (용병 포함)', () => {
    const state = {
      ...baseState,
      completedMatches: [{
        ...baseState.completedMatches[0],
        // 용병 정동근이 Team A에 합류한 라운드
        homePlayers: ['김성태', '이준호', '박민', '최영', '홍길동', '정동근'],
        awayPlayers: ['강백호', '서태웅', '정대만', '송태섭', '채치수'],
        mercenaries: [{ player: '정동근', teamIdx: 0 }],
      }],
    };
    const rows = buildRoundRowsFromFutsal({ team: 't', mode: '기본', date: '2026-04-10', stateJSON: state, inputTime: '' });
    expect(JSON.parse(rows[0].our_members_json)).toContain('정동근');
    expect(JSON.parse(rows[0].our_members_json)).toHaveLength(6);
  });

  it('스냅샷이 없는 구버전 매치는 현재 teams로 폴백', () => {
    const rows = buildRoundRowsFromFutsal({
      team: 'masterfc', mode: '기본', date: '2026-04-10',
      stateJSON: baseState, inputTime: '',
    });
    expect(JSON.parse(rows[0].our_members_json)).toEqual(['김성태', '이준호', '박민', '최영', '홍길동']);
  });

  it('homeAbsent/awayAbsent 있으면 our_members_json이 객체 형식으로 직렬화', () => {
    const state = {
      ...baseState,
      completedMatches: [{
        ...baseState.completedMatches[0],
        homePlayers: ['A', 'B', 'C', 'D', 'E', 'F'],
        homeAbsent: ['F'],
        awayPlayers: ['X', 'Y', 'Z'],
        awayAbsent: [],
      }],
    };
    const rows = buildRoundRowsFromFutsal({ team: 't', mode: '기본', date: '2026-04-10', stateJSON: state, inputTime: '' });
    expect(JSON.parse(rows[0].our_members_json)).toEqual({
      players: ['A', 'B', 'C', 'D', 'E', 'F'], absent: ['F'],
    });
    // 휴식 없으면 배열 형식 유지
    expect(JSON.parse(rows[0].opponent_members_json)).toEqual(['X', 'Y', 'Z']);
  });

  it('match_idx는 배열 순서대로 1부터', () => {
    const state = {
      ...baseState,
      completedMatches: [
        { ...baseState.completedMatches[0], matchId: 'R1_C0' },
        { ...baseState.completedMatches[0], matchId: 'R2_C0' },
        { ...baseState.completedMatches[0], matchId: 'R3_C0' },
      ],
    };
    const rows = buildRoundRowsFromFutsal({ team: 't', mode: '기본', date: '2026-04-10', stateJSON: state, inputTime: '' });
    expect(rows.map(r => r.match_idx)).toEqual([1, 2, 3]);
  });
});

describe('buildRoundRowsFromSoccer', () => {
  const baseSoccerState = {
    soccerMatches: [
      {
        matchIdx: 1,
        opponent: '라이벌FC',
        // lineup은 선수 이름 문자열 배열 (production: Object.values(assignments))
        lineup: ['손흥민', '김민재', '이강인', '조현우', '황희찬', '황인범', '김영권', '이재성', '정우영', '김진수', '송민규'],
        formation: '4-3-3',
        gk: '조현우',
        defenders: ['김민재', '김영권', '김진수'],
        // 점수는 events에서 도출(2:1) — 단일소스
        events: [
          { type: 'goal', player: '손흥민' },
          { type: 'goal', player: '이강인', assist: '손흥민' },
          { type: 'opponentGoal', currentGk: '조현우' },
          { type: 'sub', playerIn: '오현규', playerOut: '황희찬', position: 'FW' },
        ],
        ourScore: 2, opponentScore: 1,
        status: 'completed',
        startedAt: 1713000000000,
      },
    ],
  };

  it('풋살과 동일 스키마, 축구 전용 필드 채움', () => {
    const rows = buildRoundRowsFromSoccer({
      team: 'FC테스트', mode: '기본', date: '2026-04-10',
      stateJSON: baseSoccerState, inputTime: '2026-04-10T22:00:00',
    });
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.sport).toBe('축구');
    expect(r.game_id).toBe('s_1713000000000');
    expect(r.match_id).toBe('1');
    expect(r.match_idx).toBe(1);
    expect(r.round_idx).toBe(null);
    expect(r.court_id).toBe(null);
    expect(r.our_team_name).toBe('FC테스트');
    expect(r.opponent_team_name).toBe('라이벌FC');
    expect(r.our_score).toBe(2);
    expect(r.opponent_score).toBe(1);
    expect(r.our_gk).toBe('조현우');
    expect(r.opponent_gk).toBe('');
    expect(r.formation).toBe('4-3-3');
    expect(JSON.parse(r.our_defenders_json)).toEqual(['김민재', '김영권', '김진수']);
    const ourMembers = JSON.parse(r.our_members_json);
    expect(ourMembers).toContain('손흥민');
    expect(ourMembers).toContain('오현규');
    expect(ourMembers).toContain('황희찬');
    expect(JSON.parse(r.opponent_members_json)).toEqual([]);
  });

  it('lineup에 없어도 출전한 선수(득점자/어시/자책/GK/수비/교체in·out)를 our_members에 포함', () => {
    const state = {
      soccerMatches: [{
        matchIdx: 1, opponent: 'X',
        lineup: ['A', 'B'],          // 일부만 lineup에 기록
        assignments: { '0': 'A', '7': 'PITCHONLY' }, // 포메이션 편집으로만 들어온 선수(이벤트 없음)
        gk: 'GK1',                   // lineup에 없는 GK
        defenders: ['DEF1'],         // lineup에 없는 수비수
        events: [
          { type: 'goal', player: '박동휘', assist: 'C' }, // lineup에 없는 득점자/어시
          { type: 'owngoal', player: 'D' },                // lineup에 없는 자책
          { type: 'sub', playerIn: 'E', playerOut: 'F' },  // 교체 in/out
          { type: 'opponentGoal', currentGk: 'GK1' },
        ],
        status: 'finished', startedAt: 1713000000000,
      }],
    };
    const rows = buildRoundRowsFromSoccer({ team: 'T', mode: '기본', date: '2026-04-10', stateJSON: state, inputTime: '' });
    const members = JSON.parse(rows[0].our_members_json);
    ['A', 'B', 'PITCHONLY', 'GK1', 'DEF1', '박동휘', 'C', 'D', 'E', 'F'].forEach(n => expect(members).toContain(n));
    expect(members.length).toBe(new Set(members).size); // 중복 없음
  });

  it('startedAt 없으면 s_{date}_{matchIdx} 폴백', () => {
    const state = { soccerMatches: [{ ...baseSoccerState.soccerMatches[0], startedAt: null }] };
    const rows = buildRoundRowsFromSoccer({ team: 'T', mode: '기본', date: '2026-04-10', stateJSON: state, inputTime: '' });
    expect(rows[0].game_id).toBe('s_2026-04-10_1');
  });

  it('soccerMatches 없으면 빈 배열', () => {
    expect(buildRoundRowsFromSoccer({ team: 'T', mode: '기본', date: '2026-04-10', stateJSON: {}, inputTime: '' })).toEqual([]);
  });
});
