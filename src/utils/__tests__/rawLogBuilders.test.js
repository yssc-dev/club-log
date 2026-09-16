import { describe, it, expect } from 'vitest';
import { RAW_EVENT_COLUMNS, RAW_PLAYER_GAME_COLUMNS, buildRawEventsFromFutsal, buildRawPlayerGamesFromFutsal, buildRawEventsFromSoccer, buildRawPlayerGamesFromSoccer, buildRawPlayerGamesFromTournament } from '../rawLogBuilders';

describe('raw log column constants', () => {
  it('RAW_EVENT_COLUMNS: 15개, 스펙 순서대로', () => {
    expect(RAW_EVENT_COLUMNS).toHaveLength(15);
    expect(RAW_EVENT_COLUMNS[0]).toBe('team');
    expect(RAW_EVENT_COLUMNS[8]).toBe('event_type');
    expect(RAW_EVENT_COLUMNS[11]).toBe('concede_gk');
    expect(RAW_EVENT_COLUMNS[13]).toBe('input_time');
  });

  it('RAW_PLAYER_GAME_COLUMNS: 20개 (fouls 포함, 역주행 제거), 풋살 전용 필드 포함', () => {
    expect(RAW_PLAYER_GAME_COLUMNS).toHaveLength(20);
    expect(RAW_PLAYER_GAME_COLUMNS[0]).toBe('team');
    expect(RAW_PLAYER_GAME_COLUMNS[19]).toBe('input_time');
    expect(RAW_PLAYER_GAME_COLUMNS).toContain('crova');
    expect(RAW_PLAYER_GAME_COLUMNS).toContain('goguma');
    expect(RAW_PLAYER_GAME_COLUMNS).not.toContain('역주행'); // owngoals와 중복이라 제거됨
    expect(RAW_PLAYER_GAME_COLUMNS).toContain('rank_score');
    expect(RAW_PLAYER_GAME_COLUMNS).toContain('fouls');
  });
});

describe('buildRawEventsFromFutsal', () => {
  const base = {
    team: '마스터FC',
    events: [{
      gameDate: '2026-04-10', matchId: '1라운드 A구장',
      myTeam: '블루', opponentTeam: '레드',
      scorer: '홍길동', assist: '김철수',
      ownGoalPlayer: '', concedingGk: '',
      inputTime: '2026-04-10 20:00:00',
    }],
  };

  it('득점 이벤트 → goal row 1개 (assist는 related_player)', () => {
    const rows = buildRawEventsFromFutsal(base);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      team: '마스터FC', sport: '풋살', mode: '기본', tournament_id: '',
      date: '2026-04-10', match_id: 'R1_C0',
      our_team: '블루', opponent: '레드',
      event_type: 'goal', player: '홍길동', related_player: '김철수',
      position: '', input_time: '2026-04-10 20:00:00',
    });
  });

  it('자책골 이벤트 → ownGoal row', () => {
    const rows = buildRawEventsFromFutsal({
      team: '마스터FC',
      events: [{
        gameDate: '2026-04-10', matchId: '1라운드 A구장',
        myTeam: '블루', opponentTeam: '레드',
        scorer: '', assist: '', ownGoalPlayer: '이영수', concedingGk: '',
        inputTime: '2026-04-10 20:00:00',
      }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('owngoal');
    expect(rows[0].player).toBe('이영수');
    expect(rows[0].related_player).toBe('');
  });

  it('반칙 (foulPlayer 있음) → foul row, concede_gk 포함', () => {
    const rows = buildRawEventsFromFutsal({
      team: '마스터FC',
      events: [{
        gameDate: '2026-04-10', matchId: '1라운드 A구장',
        myTeam: '블루', opponentTeam: '레드',
        scorer: '', assist: '', ownGoalPlayer: '', foulPlayer: '김반칙',
        concedingGk: '박지성',
        inputTime: '2026-04-10 20:00:00',
      }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('foul');
    expect(rows[0].player).toBe('김반칙');
    expect(rows[0].related_player).toBe('');
    expect(rows[0].concede_gk).toBe('박지성');
  });

  it('실점 (scorer 공란, concedingGk 있음) → concede row', () => {
    const rows = buildRawEventsFromFutsal({
      team: '마스터FC',
      events: [{
        gameDate: '2026-04-10', matchId: '1라운드 A구장',
        myTeam: '블루', opponentTeam: '레드',
        scorer: '', assist: '', ownGoalPlayer: '', concedingGk: '박지성',
        inputTime: '2026-04-10 20:00:00',
      }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('concede');
    expect(rows[0].player).toBe('박지성');
  });

  it('한 event에 goal + concedingGk 동시 → goal만 생성 (scorer 우선)', () => {
    const rows = buildRawEventsFromFutsal({
      team: '마스터FC',
      events: [{
        gameDate: '2026-04-10', matchId: '1',
        myTeam: '블루', opponentTeam: '레드',
        scorer: '홍길동', assist: '', ownGoalPlayer: '', concedingGk: '박지성',
        inputTime: '2026-04-10 20:00:00',
      }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('goal');
  });

  it('빈 events → 빈 배열', () => {
    expect(buildRawEventsFromFutsal({ team: 'X', events: [] })).toEqual([]);
  });
});

describe('buildRawPlayerGamesFromFutsal', () => {
  it('플레이어 1명 → 1 row, 스키마 맞음', () => {
    const rows = buildRawPlayerGamesFromFutsal({
      team: '마스터FC', inputTime: '2026-04-10 21:00:00',
      players: [{
        gameDate: '2026-04-10', name: '홍길동',
        goals: 3, assists: 1, owngoals: 0, conceded: 0, cleanSheets: 1,
        crova: 1, goguma: 0, keeperGames: 1, rankScore: 4,
        역주행: 0, playerTeam: '블루',
      }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      team: '마스터FC', sport: '풋살', mode: '기본', tournament_id: '',
      date: '2026-04-10', player: '홍길동', session_team: '블루',
      games: 0, field_games: 0,       // 풋살은 games 원본 없음 → 0 기본
      keeper_games: 1,
      goals: 3, assists: 1, owngoals: 0, conceded: 0, cleansheets: 1,
      crova: 1, goguma: 0, rank_score: 4,
      input_time: '2026-04-10 21:00:00',
    });
  });

  it('역주행 컬럼은 스키마에서 제거됨 (owngoals와 중복)', () => {
    const rows = buildRawPlayerGamesFromFutsal({
      team: '마스터FC', inputTime: 't',
      players: [{ gameDate: '2026-04-10', name: 'A', goals:0, assists:0, owngoals:0,
                  conceded:0, cleanSheets:0, crova:0, goguma:0, keeperGames:0, rankScore:0,
                  playerTeam:'블루' }],
    });
    expect(rows[0]).not.toHaveProperty('역주행');
  });

  it('빈 players → 빈 배열', () => {
    expect(buildRawPlayerGamesFromFutsal({ team: 'X', players: [] })).toEqual([]);
  });
});

describe('buildRawEventsFromSoccer', () => {
  const mk = (ev) => ({
    team: '하버FC', mode: '기본', tournamentId: '',
    events: [{ gameDate: '2026-04-10', matchNum: 1, opponent: '상대A', ...ev }],
  });

  it('출전 → lineup', () => {
    const rows = buildRawEventsFromSoccer(mk({ event: '출전', player: 'A', relatedPlayer: '', position: 'GK', inputTime: 't' }));
    expect(rows[0]).toMatchObject({
      team: '하버FC', sport: '축구', mode: '기본', tournament_id: '',
      date: '2026-04-10', match_id: '1', our_team: '하버FC', opponent: '상대A',
      event_type: 'lineup', player: 'A', related_player: '', position: 'GK', input_time: 't',
    });
  });

  it('골 → goal (relatedPlayer 유지)', () => {
    const rows = buildRawEventsFromSoccer(mk({ event: '골', player: 'B', relatedPlayer: 'C', position: '', inputTime: 't' }));
    expect(rows[0].event_type).toBe('goal');
    expect(rows[0].player).toBe('B');
    expect(rows[0].related_player).toBe('C');
  });

  it('자책골 → owngoal', () => {
    const rows = buildRawEventsFromSoccer(mk({ event: '자책골', player: 'D', relatedPlayer: '', position: '', inputTime: 't' }));
    expect(rows[0].event_type).toBe('owngoal');
  });

  it('실점 → concede, position GK', () => {
    const rows = buildRawEventsFromSoccer(mk({ event: '실점', player: 'E', relatedPlayer: '', position: 'GK', inputTime: 't' }));
    expect(rows[0].event_type).toBe('concede');
    expect(rows[0].position).toBe('GK');
  });

  it('교체 → sub (playerIn/playerOut)', () => {
    const rows = buildRawEventsFromSoccer(mk({ event: '교체', player: 'IN', relatedPlayer: 'OUT', position: 'FW', inputTime: 't' }));
    expect(rows[0].event_type).toBe('sub');
    expect(rows[0].player).toBe('IN');
    expect(rows[0].related_player).toBe('OUT');
  });

  it('대회모드 → mode="대회", tournament_id 세팅', () => {
    const rows = buildRawEventsFromSoccer({
      team: '하버FC', mode: '대회', tournamentId: '하버리그2026',
      events: [{ gameDate: '2026-05-01', matchNum: 3, opponent: 'X', event: '골', player: 'Y', relatedPlayer: '', position: '', inputTime: 't' }],
    });
    expect(rows[0].mode).toBe('대회');
    expect(rows[0].tournament_id).toBe('하버리그2026');
  });

  it('알 수 없는 event → 스킵', () => {
    const rows = buildRawEventsFromSoccer(mk({ event: '경고', player: 'A', relatedPlayer: '', position: '', inputTime: 't' }));
    expect(rows).toHaveLength(0);
  });

  it('matchNum=0 → match_id="0" (not empty)', () => {
    const rows = buildRawEventsFromSoccer({
      team: '하버FC', mode: '기본', tournamentId: '',
      events: [{ gameDate: '2026-04-10', matchNum: 0, opponent: 'X',
                 event: '골', player: 'A', relatedPlayer: '', position: '', inputTime: 't' }],
    });
    expect(rows[0].match_id).toBe('0');
  });
});

describe('buildRawPlayerGamesFromSoccer', () => {
  it('매핑 정확', () => {
    const rows = buildRawPlayerGamesFromSoccer({
      team: '하버FC', inputTime: 't',
      players: [{ gameDate: '2026-04-10', name: 'A',
                  games: 3, fieldGames: 2, keeperGames: 1,
                  goals: 2, assists: 1, cleanSheets: 1, conceded: 3, owngoals: 0 }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      team: '하버FC', sport: '축구', mode: '기본', tournament_id: '',
      date: '2026-04-10', player: 'A', session_team: '하버FC',
      games: 3, field_games: 2, keeper_games: 1,
      goals: 2, assists: 1, owngoals: 0, conceded: 3, cleansheets: 1,
      crova: 0, goguma: 0, rank_score: 0,
      input_time: 't',
    });
  });

  it('빈 players → 빈 배열', () => {
    expect(buildRawPlayerGamesFromSoccer({ team: 'X', players: [] })).toEqual([]);
  });
});

describe('buildRawPlayerGamesFromTournament', () => {
  const base = {
    team: '하버FC', tournamentId: 'T1', inputTime: 't',
  };

  it('날짜 × 선수 단위로 집계, mode="대회", tournament_id 세팅', () => {
    const rows = buildRawPlayerGamesFromTournament({
      ...base,
      events: [
        { gameDate: '2026-05-01', matchNum: 1, event: '출전', player: 'A', position: 'GK', relatedPlayer: '' },
        { gameDate: '2026-05-01', matchNum: 1, event: '출전', player: 'B', position: 'FW', relatedPlayer: '' },
        { gameDate: '2026-05-01', matchNum: 1, event: '골', player: 'B', relatedPlayer: '' },
      ],
    });
    const a = rows.find(r => r.player === 'A');
    const b = rows.find(r => r.player === 'B');
    expect(a).toMatchObject({ team: '하버FC', sport: '축구', mode: '대회', tournament_id: 'T1', date: '2026-05-01', session_team: '하버FC', games: 1, keeper_games: 1, field_games: 0, cleansheets: 1 });
    expect(b).toMatchObject({ games: 1, field_games: 1, keeper_games: 0, goals: 1, cleansheets: 0 });
  });

  it('여러 경기 합산 (같은 날짜)', () => {
    const rows = buildRawPlayerGamesFromTournament({
      ...base,
      events: [
        { gameDate: '2026-05-01', matchNum: 1, event: '출전', player: 'A', position: 'FW' },
        { gameDate: '2026-05-01', matchNum: 1, event: '골', player: 'A' },
        { gameDate: '2026-05-01', matchNum: 2, event: '출전', player: 'A', position: 'FW' },
        { gameDate: '2026-05-01', matchNum: 2, event: '골', player: 'A' },
        { gameDate: '2026-05-01', matchNum: 2, event: '골', player: 'A' },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ player: 'A', games: 2, field_games: 2, goals: 3 });
  });

  it('다른 날짜는 별개 row', () => {
    const rows = buildRawPlayerGamesFromTournament({
      ...base,
      events: [
        { gameDate: '2026-05-01', event: '출전', player: 'A', position: 'FW' },
        { gameDate: '2026-05-02', event: '출전', player: 'A', position: 'FW' },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.date).sort()).toEqual(['2026-05-01', '2026-05-02']);
  });

  it('골 + 어시스트 (relatedPlayer)', () => {
    const rows = buildRawPlayerGamesFromTournament({
      ...base,
      events: [
        { gameDate: '2026-05-01', event: '골', player: 'A', relatedPlayer: 'B' },
      ],
    });
    expect(rows.find(r => r.player === 'A').goals).toBe(1);
    expect(rows.find(r => r.player === 'B').assists).toBe(1);
  });

  it('실점은 player(GK) 에게 카운트, cleansheets 0', () => {
    const rows = buildRawPlayerGamesFromTournament({
      ...base,
      events: [
        { gameDate: '2026-05-01', event: '출전', player: 'A', position: 'GK' },
        { gameDate: '2026-05-01', event: '실점', player: 'A', position: 'GK' },
      ],
    });
    const a = rows.find(r => r.player === 'A');
    expect(a.conceded).toBe(1);
    expect(a.cleansheets).toBe(0);
    expect(a.keeper_games).toBe(1);
  });

  it('자책골', () => {
    const rows = buildRawPlayerGamesFromTournament({
      ...base,
      events: [
        { gameDate: '2026-05-01', event: '자책골', player: 'A' },
      ],
    });
    expect(rows[0].owngoals).toBe(1);
  });

  it('교체 in → games/field 증가', () => {
    const rows = buildRawPlayerGamesFromTournament({
      ...base,
      events: [
        { gameDate: '2026-05-01', event: '교체', player: 'IN', relatedPlayer: 'OUT', position: 'FW' },
      ],
    });
    const inR = rows.find(r => r.player === 'IN');
    expect(inR).toMatchObject({ games: 1, field_games: 1, keeper_games: 0 });
    // OUT 은 별도 row 없음 (교체로 들어온 IN만 카운트)
    expect(rows.find(r => r.player === 'OUT')).toBeUndefined();
  });

  it('빈 events → 빈 배열', () => {
    expect(buildRawPlayerGamesFromTournament({ ...base, events: [] })).toEqual([]);
  });
});

describe('RAW_EVENT_COLUMNS with game_id', () => {
  it('game_id, concede_gk 포함, 총 15개 컬럼', () => {
    expect(RAW_EVENT_COLUMNS).toHaveLength(15);
    expect(RAW_EVENT_COLUMNS).toContain('game_id');
    expect(RAW_EVENT_COLUMNS).toContain('concede_gk');
    expect(RAW_EVENT_COLUMNS.indexOf('game_id')).toBe(14);
  });
});

describe('buildRawEventsFromFutsal event_type 표준화 + game_id', () => {
  it('ownGoal → owngoal 표준값 사용, game_id 포함', () => {
    const rows = buildRawEventsFromFutsal({
      team: '마스터FC',
      gameId: 'g_1713000000000',
      events: [{
        gameDate: '2026-04-10', matchId: 'R1_C0',
        myTeam: '블루', opponentTeam: '레드',
        ownGoalPlayer: '홍길동', inputTime: '2026-04-10 20:00:00',
      }],
    });
    expect(rows[0].event_type).toBe('owngoal');
    expect(rows[0].game_id).toBe('g_1713000000000');
  });

  it('match_id 이미 표준 포맷이면 그대로 유지', () => {
    const rows = buildRawEventsFromFutsal({
      team: '마스터FC',
      gameId: 'g_1',
      events: [{
        gameDate: '2026-04-10', matchId: '3라운드 매치1',
        myTeam: '블루', opponentTeam: '레드',
        scorer: '홍길동', inputTime: '',
      }],
    });
    expect(rows[0].match_id).toBe('R3_C0');
  });
});

describe('buildRawEventsFromFutsal concede_gk 컬럼', () => {
  it('한 포인트 이벤트(scorer + concedingGk) → 한 로그_이벤트 행 (concede_gk 컬럼)', () => {
    const events = [{
      gameDate: '2026-04-28', matchId: 'R1_C0', myTeam: 'A', opponentTeam: 'B',
      scorer: '홍길동', assist: '김철수', ownGoalPlayer: '', concedingGk: '박GK',
      inputTime: '2026-04-28 10:00:00'
    }];
    const rows = buildRawEventsFromFutsal({ team: '마스터FC', gameId: 'g1', events });
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('goal');
    expect(rows[0].player).toBe('홍길동');
    expect(rows[0].related_player).toBe('김철수');
    expect(rows[0].concede_gk).toBe('박GK');
  });

  it('자책골 + concedingGk → 한 owngoal 행', () => {
    const events = [{
      gameDate: '2026-04-28', matchId: 'R1_C0', myTeam: 'A', opponentTeam: 'B',
      scorer: '', assist: '', ownGoalPlayer: '나자책', concedingGk: '나GK',
      inputTime: 't'
    }];
    const rows = buildRawEventsFromFutsal({ team: '마스터FC', events });
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('owngoal');
    expect(rows[0].player).toBe('나자책');
    expect(rows[0].concede_gk).toBe('나GK');
  });
});

describe('buildRawEventsFromSoccer concede_gk 컬럼', () => {
  it('축구 실점 이벤트는 concede_gk = player 로 채움', () => {
    const events = [{ event: '실점', gameDate: '2026-04-28', matchNum: '1', player: '박GK', opponent: 'B', inputTime: 't' }];
    const rows = buildRawEventsFromSoccer({ team: 'X', events });
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('concede');
    expect(rows[0].player).toBe('박GK');
    expect(rows[0].concede_gk).toBe('박GK');
  });

  it('축구 일반 이벤트는 concede_gk 빈 값', () => {
    const events = [{ event: '골', gameDate: '2026-04-28', matchNum: '1', player: '홍', relatedPlayer: '김', opponent: 'B', inputTime: 't' }];
    const rows = buildRawEventsFromSoccer({ team: 'X', events });
    expect(rows[0].concede_gk).toBe('');
  });
});

describe('buildRawEventsFromSoccer event_type 표준화 + game_id', () => {
  it('자책골 → owngoal, 실점 → concede', () => {
    const rows = buildRawEventsFromSoccer({
      team: 'FC테스트',
      gameId: 's_1713000000000',
      events: [
        { event: '자책골', player: 'A', gameDate: '2026-04-10', matchNum: 1, inputTime: '' },
        { event: '실점', player: 'B', gameDate: '2026-04-10', matchNum: 1, inputTime: '' },
      ],
    });
    expect(rows[0].event_type).toBe('owngoal');
    expect(rows[1].event_type).toBe('concede');
    expect(rows[0].game_id).toBe('s_1713000000000');
    expect(rows[1].game_id).toBe('s_1713000000000');
  });
});

describe('풋살 빌더 컵 태그 (스펙 §4.4)', () => {
  const ev = { gameDate: '2026-09-20', matchId: 'R1_C0', myTeam: '팀A', opponentTeam: '팀B', scorer: '김철수', assist: '', inputTime: 't' };
  const pl = { gameDate: '2026-09-20', name: '김철수', playerTeam: '팀A', goals: 1 };

  it('인자 생략 시 mode=기본, tournament_id 빈 문자열(기존 동작)', () => {
    expect(buildRawEventsFromFutsal({ team: '마스터FC', events: [ev] })[0]).toMatchObject({ mode: '기본', tournament_id: '' });
    expect(buildRawPlayerGamesFromFutsal({ team: '마스터FC', inputTime: 't', players: [pl] })[0]).toMatchObject({ mode: '기본', tournament_id: '' });
  });

  it('mode/tournamentId 를 넘기면 두 행 모두에 반영된다', () => {
    const tags = { mode: '대회', tournamentId: '마스터스컵 2026' };
    expect(buildRawEventsFromFutsal({ team: '마스터FC', events: [ev], ...tags })[0]).toMatchObject({ mode: '대회', tournament_id: '마스터스컵 2026', sport: '풋살' });
    expect(buildRawPlayerGamesFromFutsal({ team: '마스터FC', inputTime: 't', players: [pl], ...tags })[0]).toMatchObject({ mode: '대회', tournament_id: '마스터스컵 2026', sport: '풋살' });
  });
});
