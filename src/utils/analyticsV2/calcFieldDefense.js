// 풋살 「수비력」 단일 소스 (2026-11-11 통일) — 지표 Top5 수비력 열·개인분석 레이더 수비력 축이 함께 쓴다.
// 풋살엔 수비 포지션·수비 이벤트가 없어 팀 실점 기반 개인 지표만 성립한다(2026-08-21 유저 방향).
//   수비력(suppression) = 그날 전체 사이드 평균 실점(baselinePerGame) − 내가 필드로 뛴 경기 평균 실점(concededPerGame)
//   양수 = 그날 평균보다 덜 먹힘. 기준이 "같은 날 전체 경기"라 골이 적게/많이 난 날의 덕·손해를 걸러낸다.
// 예전엔 같은 신호가 3개(경기당 팀실점·무실점률·실점 억제, 상관 0.76~0.95)로 흩어져 순위가 서로 어긋났다 →
// 유저 결정으로 이 값 하나로 통일. 무실점률 랭킹·평균 쪽 보정(*Adj)은 폐기 — "일정 경기 이상 + 원값" 이 규칙이다.
// 표본 단위는 "경기"가 아니라 "경기일"이다(풋살은 그날 팀이 고정이라 같은 날 5~7경기는 한 묶음). 그래서
//   진입선 = 필드 경기 수 30% **그리고** 필드 경기일 수 30% (둘 다 최다치 기준 동적)
// 화면은 값만 보여주지 않고 근거(필드 N경기 M실점 · 경기당 · 그날 평균)를 함께 표시한다 — ranking 행에 실려 있다.
// GK가 기록된 사이드만 필드 귀속(GK 미기록이면 필드 확정 불가 — calcGkFieldSplit과 동일 정책),
// 단 그날 평균에는 GK 미기록 매치의 실점도 포함(골 수 자체는 유효).
import { parseActualPlayers } from './parseMembers';
import { dynamicMin } from './dynamicMin';

export function calcFieldDefense({ matchLogs = [], topN = 5, minFieldRounds = null, minFieldDates = null } = {}) {
  const sessionTally = {}; // date -> { sum, n } — 사이드 단위 실점 합/수
  const sides = [];
  for (const m of matchLogs) {
    if (m.is_extra) continue;
    const date = m.date || '';
    const our = Number(m.our_score) || 0;
    const opp = Number(m.opponent_score) || 0;
    if (!sessionTally[date]) sessionTally[date] = { sum: 0, n: 0 };
    sessionTally[date].sum += our + opp;
    sessionTally[date].n += 2;
    sides.push({ date, gk: m.our_gk, members: parseActualPlayers(m.our_members_json), conceded: opp });
    sides.push({ date, gk: m.opponent_gk, members: parseActualPlayers(m.opponent_members_json), conceded: our });
  }

  const perPlayer = {};
  const dateSets = {}; // name -> Set(date) — 필드로 뛴 경기일
  for (const s of sides) {
    if (!s.gk) continue; // GK 미기록 → 필드 귀속 불가
    const base = sessionTally[s.date].sum / sessionTally[s.date].n;
    for (const name of s.members) {
      if (name === s.gk) continue; // 필드만 — GK 본인의 수비는 키퍼 지표가 맡는다
      const p = perPlayer[name] || (perPlayer[name] = {
        fieldRounds: 0, cleanSheets: 0, multiConceded: 0, conceded: 0, _baseSum: 0,
      });
      p.fieldRounds++;
      (dateSets[name] || (dateSets[name] = new Set())).add(s.date);
      p.conceded += s.conceded;
      p._baseSum += base;
      if (s.conceded === 0) p.cleanSheets++;
      if (s.conceded >= 2) p.multiConceded++;
    }
  }

  let maxFieldRounds = 0, maxFieldDates = 0;
  for (const name of Object.keys(perPlayer)) {
    const p = perPlayer[name];
    p.cleanRate = p.cleanSheets / p.fieldRounds;
    p.multiRate = p.multiConceded / p.fieldRounds;
    p.concededPerGame = p.conceded / p.fieldRounds;
    p.baselinePerGame = p._baseSum / p.fieldRounds;
    p.suppression = p.baselinePerGame - p.concededPerGame;
    p.fieldDates = dateSets[name].size;
    maxFieldRounds = Math.max(maxFieldRounds, p.fieldRounds);
    maxFieldDates = Math.max(maxFieldDates, p.fieldDates);
    delete p._baseSum;
  }

  const resolvedMin = minFieldRounds ?? dynamicMin(maxFieldRounds);
  const resolvedMinDates = minFieldDates ?? dynamicMin(maxFieldDates);
  const rated = Object.entries(perPlayer)
    .filter(([, p]) => p.fieldRounds >= resolvedMin && p.fieldDates >= resolvedMinDates);
  const ranking = rated
    .map(([player, p]) => ({
      player, value: p.suppression,
      fieldRounds: p.fieldRounds, fieldDates: p.fieldDates, conceded: p.conceded,
      concededPerGame: p.concededPerGame, baselinePerGame: p.baselinePerGame,
    }))
    .sort((a, b) => b.value - a.value || b.fieldRounds - a.fieldRounds || a.player.localeCompare(b.player, 'ko'))
    .slice(0, topN);

  return {
    perPlayer,
    ranking,
    thresholds: { minFieldRounds: resolvedMin, maxFieldRounds, minFieldDates: resolvedMinDates, maxFieldDates },
  };
}
