// PersonalAnalysisTab의 6개 카드 숫자(rounds/keeperRounds/fieldRounds/matches/conceded/winRate)를
// 단일 소스(matchLogs + eventLogs + playerGameLogs)에서 일관되게 계산.
//
// 데이터 소스 정책:
// - rounds/matches/wins/draws/losses: matchLogs (members_json + score)
// - goals/assists/ownGoals: eventLogs
// - keeperRounds/conceded: PG(로그_선수경기) 세션 날짜 keeper_games>0 행 합 (수문장 카드·개인기록과 동일)
// - fieldRounds/fieldConceded: GK가 기록된 로그_매치 사이드만 (calcGkFieldSplit — 수비력·키퍼 vs 필드 카드와 동일)
//   * 둘의 소스가 달라 keeperRounds + fieldRounds ≠ rounds 일 수 있다(2026-11-13 유저 결정).
// - is_extra=true 매치는 모든 카운트에서 제외

// ★ 휴식 매치는 본인이 안 뛴 매치이므로 모든 카운트(rounds/matches/wins...)에서 제외
//   our_members_json이 배열/객체 두 형식 모두 수용, actual(출전자)만 반영
import { calcGkFieldSplit } from './calcGkFieldSplit';
import { parseActualPlayers } from './parseMembers';

function safeParseArray(s) {
  return parseActualPlayers(s);
}

export function calcPlayerSummary({ matchLogs = [], eventLogs = [], playerGameLogs = [] } = {}) {
  // 1) matchLogs 패스: rounds/wins/날짜별 출전 카운트
  const perPlayer = {};
  const sessionDates = new Set();
  const ensure = (name) => {
    if (!perPlayer[name]) {
      perPlayer[name] = {
        rounds: 0, keeperRounds: 0, fieldRounds: 0,
        games: 0,
        goals: 0, assists: 0, ownGoals: 0, fouls: 0,
        conceded: 0, fieldConceded: 0, avgConceded: 0,
        matches: 0, wins: 0, draws: 0, losses: 0, winRate: 0,
        teamGoals: 0,            // 출전 매치의 자기팀 총 득점 (득점 관여율 분모)
        goalInvolvement: 0,      // (goals+assists) / teamGoals — '팀 승리 견인' 근사
        _attendedDates: new Set(), // PG 합산 시 출전 날짜만 인정
      };
    }
    return perPlayer[name];
  };

  for (const m of matchLogs) {
    if (m.is_extra) continue;
    sessionDates.add(m.date || '');
    const home = safeParseArray(m.our_members_json);
    const away = safeParseArray(m.opponent_members_json);
    const ourScore = Number(m.our_score) || 0;
    const oppScore = Number(m.opponent_score) || 0;
    const ourWin = ourScore > oppScore;
    const draw = ourScore === oppScore;
    const date = m.date || '';

    const seen = new Set();
    const credit = (name, side) => {
      if (!name || seen.has(name)) return;
      seen.add(name);
      const s = ensure(name);
      s.rounds++;
      s.matches++;
      s._attendedDates.add(date);
      s.teamGoals += side === 'our' ? ourScore : oppScore;
      const won = side === 'our' ? ourWin : (!ourWin && !draw);
      if (draw) s.draws++;
      else if (won) s.wins++;
      else s.losses++;
    };
    home.forEach(n => credit(n, 'our'));
    away.forEach(n => credit(n, 'opp'));
  }

  // 2) eventLogs 패스: goals/assists/ownGoals/fouls
  for (const e of eventLogs) {
    if (e.event_type === 'goal') {
      if (e.player) ensure(e.player).goals++;
      if (e.related_player) ensure(e.related_player).assists++;
    } else if (e.event_type === 'owngoal') {
      if (e.player) ensure(e.player).ownGoals++;
    } else if (e.event_type === 'foul') {
      if (e.player) ensure(e.player).fouls++;
    }
  }

  // 3) 키퍼·필드 (2026-11-13 유저 결정)
  //    - 키퍼(keeperRounds/conceded) = PG(로그_선수경기) 날짜별 keeper_games·conceded 합 — 수문장 카드·개인기록과 같은 값.
  //      레거시(~04-22) 로그_매치는 경기가 절반가량 빠지고 GK도 비어 실제 키퍼 횟수를 못 센다(차동헌 54 vs 49).
  //      세션 날짜(기간·is_extra 반영) 행만, keeper_games>0 행만. PG 행이 아예 없으면 로그_매치 GK로 폴백.
  //    - 필드(fieldRounds/fieldConceded) = GK가 기록된 로그_매치 사이드(calcGkFieldSplit) — 수비력·키퍼 vs 필드 카드와 같은 값.
  //      경기 단위로 GK를 알아야 필드를 확정할 수 있어서 PG로는 못 만든다.
  const pgByPlayer = {};
  for (const p of playerGameLogs) {
    const name = p.player;
    if (!name) continue;
    if (!pgByPlayer[name]) pgByPlayer[name] = [];
    pgByPlayer[name].push(p);
  }
  const split = calcGkFieldSplit({ matchLogs }).perPlayer;

  for (const name of Object.keys(perPlayer)) {
    const s = perPlayer[name];
    const pgRows = pgByPlayer[name];
    const sp = split[name];
    if (pgRows && pgRows.length > 0) {
      let kr = 0, kc = 0;
      for (const p of pgRows) {
        if (!sessionDates.has(p.date)) continue;
        const kg = Number(p.keeper_games || p.keeperGames) || 0;
        if (kg <= 0) continue; // 키퍼로 안 뛴 행의 conceded는 무시 — calcAwards와 동일 규칙
        kr += kg;
        kc += Number(p.conceded) || 0;
      }
      s.keeperRounds = kr;
      s.conceded = kc;
    } else {
      s.keeperRounds = sp ? sp.gk.games : 0;
      s.conceded = sp ? sp.gk.goalsAgainst : 0;
    }
    s.fieldRounds = sp ? sp.field.games : 0;
    s.fieldConceded = sp ? sp.field.goalsAgainst : 0;
    s.avgConceded = s.fieldRounds > 0 ? s.fieldConceded / s.fieldRounds : 0;
    s.winRate = s.matches > 0 ? (s.wins + s.draws * 0.5) / s.matches : 0;
    s.goalInvolvement = s.teamGoals > 0 ? (s.goals + s.assists) / s.teamGoals : 0;
    // 참석일(games): 로그_매치 명단 ∪ PG 날짜 — 대시보드 출석률과 동일 기준.
    // 레거시 세션(~2026-04-23)의 로그_매치 명단은 이벤트에서 역산된 부분 명단이라
    // 그날 기록 없는 참석자가 빠짐 → 참석 권위 소스인 PG로 보강.
    // 세션 날짜 밖 PG 행은 무시(참석률 >100% 방지). rounds/승패 등은 명단 기준 유지.
    const attended = new Set(s._attendedDates);
    if (pgRows) {
      for (const p of pgRows) { if (sessionDates.has(p.date)) attended.add(p.date); }
    }
    s.games = attended.size;
    // 내부 필드 정리
    delete s._attendedDates;
  }

  let maxRounds = 0;
  for (const name of Object.keys(perPlayer)) {
    if (perPlayer[name].rounds > maxRounds) maxRounds = perPlayer[name].rounds;
  }

  return {
    perPlayer,
    maxRounds,
    totalSessions: sessionDates.size,
    // 스트릭 결석 절단용 — 클럽 전체 세션 날짜 (is_extra 제외, 정렬)
    sessionDates: [...sessionDates].filter(Boolean).sort((a, b) => a.localeCompare(b)),
  };
}
