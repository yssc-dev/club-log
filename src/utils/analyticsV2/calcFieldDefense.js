// 개인 축 필드 수비 지표 (풋살 전용) — 어워드 탭 "수비 (필드)" 카드.
// 풋살엔 수비 포지션·수비 이벤트가 없어 팀 실점 기반 개인 지표만 성립한다(2026-08-21 유저 방향).
// 조합(케미) 축은 매주 로테이션으로 귀속이 약해 배제 — 개인 축 2종만:
//   ① cleanRate  = 필드로 뛴 매치 중 팀 무실점 비율 (multiConceded = 2실점+ 비율의 분자)
//   ② suppression = 세션(그날) 전체 사이드 평균 실점 − 본인 사이드 평균 실점 (양수=억제)
//      베이스라인이 "같은 날 전체 매치"라 매주 바뀌는 인원 구성·컨디션 변수를 분모에 흡수한다.
// 표본 단위는 "경기"가 아니라 "경기일"이다(2026-11-11 실측 재검토): 풋살은 그날 팀이 고정이라 같은 날
// 5~7경기는 같은 팀원과 뛴 한 묶음 — 경기 수만 보면 경기일 10일짜리가 1위에 오른다. 그래서
//   - 진입선 = 필드 경기 수 30% **그리고** 필드 경기일 수 30% (둘 다 최다치 기준 동적)
//   - 랭킹 값 = 경기일 수로 평균 쪽 보정: w = 경기일/(경기일+K), K = 경기일 진입선
//       cleanRateAdj = 리그 무실점률 + (본인 − 리그) × w  /  suppressionAdj = 억제 × w (평균 0)
//     경기일이 진입선과 같으면 절반만, 쌓일수록 본인 값이 그대로 반영된다.
//   perPlayer 의 cleanRate/suppression 은 원값 그대로(개인분석 요약 라인이 쓴다).
// GK가 기록된 사이드만 필드 귀속(GK 미기록이면 필드 확정 불가 — calcGkFieldSplit과 동일 정책),
// 단 세션 베이스라인에는 GK 미기록 매치의 실점도 포함(골 수 자체는 유효).
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
  let leagueSides = 0, leagueClean = 0; // 보정 기준점(리그 무실점률) — 필드 귀속 가능한 사이드만
  for (const s of sides) {
    if (!s.gk) continue; // GK 미기록 → 필드 귀속 불가
    leagueSides++;
    if (s.conceded === 0) leagueClean++;
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
    p.suppression = p._baseSum / p.fieldRounds - p.concededPerGame;
    p.fieldDates = dateSets[name].size;
    maxFieldRounds = Math.max(maxFieldRounds, p.fieldRounds);
    maxFieldDates = Math.max(maxFieldDates, p.fieldDates);
    delete p._baseSum;
  }

  const resolvedMin = minFieldRounds ?? dynamicMin(maxFieldRounds);
  const resolvedMinDates = minFieldDates ?? dynamicMin(maxFieldDates);
  const leagueCleanRate = leagueSides > 0 ? leagueClean / leagueSides : 0;
  for (const p of Object.values(perPlayer)) {
    const w = p.fieldDates / (p.fieldDates + resolvedMinDates); // fieldDates >= 1 이라 분모 > 0
    p.cleanRateAdj = leagueCleanRate + (p.cleanRate - leagueCleanRate) * w;
    p.suppressionAdj = p.suppression * w;
  }

  const rated = Object.entries(perPlayer)
    .filter(([, p]) => p.fieldRounds >= resolvedMin && p.fieldDates >= resolvedMinDates);
  const rank = (key) => rated
    .map(([player, p]) => ({
      player, value: p[`${key}Adj`], raw: p[key],
      fieldRounds: p.fieldRounds, fieldDates: p.fieldDates, cleanSheets: p.cleanSheets,
    }))
    .sort((a, b) => b.value - a.value || b.fieldRounds - a.fieldRounds || a.player.localeCompare(b.player, 'ko'))
    .slice(0, topN);

  return {
    perPlayer,
    ranking: { cleanRate: rank('cleanRate'), suppression: rank('suppression') },
    thresholds: { minFieldRounds: resolvedMin, maxFieldRounds, minFieldDates: resolvedMinDates, maxFieldDates },
    leagueCleanRate,
  };
}
