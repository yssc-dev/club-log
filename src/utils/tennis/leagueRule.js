// 리그(대회) 성립 규칙 — 몽피스 회원 규정(2026-08-28 확인, 원 스펙 2026-08-06 §4.4와 동일):
//   단식리그(길로틴): 몽피스 회원끼리만 붙었을 경우 반영            → 2명 중 게스트 0명
//   복식리그(투몽):   몽피스 회원 3명 이상 참여할 경우 성립          → 4명 중 게스트 ≤ 1명
// 기록 시점(determineCompetition → 시트 league 라벨)과 분석 시점(isLeagueRow/buildLeagueCounts)이
// 이 한 곳을 쓴다. 2026-08-14~28 사이 "게스트 1명이라도 끼면 번외"로 잘못 운영된 적이 있어,
// 분석은 시트 라벨이 아니라 참가자 구성(게스트 수)으로 판정한다(라벨이 틀려도 숫자는 맞도록).
import { COMPETITION_SINGLES, COMPETITION_DOUBLES, COMPETITION_NONE } from './tennisSchema';

export const LEAGUE_MAX_GUESTS = { '단식': 0, '복식': 1 };
export const LEAGUE_PLAYERS = { '단식': 2, '복식': 4 };

// 기록 시점: 인원이 정확히 맞고 게스트 허용치 이내일 때만 리그 라벨.
export function leagueForComposition(format, memberCount, total) {
  const need = LEAGUE_PLAYERS[format];
  if (!need || total !== need) return COMPETITION_NONE;
  const guests = total - (Number(memberCount) || 0);
  if (guests > LEAGUE_MAX_GUESTS[format]) return COMPETITION_NONE;
  return format === '단식' ? COMPETITION_SINGLES : COMPETITION_DOUBLES;
}

// 분석 시점: 판에 낀 게스트 수만으로 판정(행 수가 온전치 않은 데이터에도 관대 — 라벨 무관).
export function isLeagueByGuests(format, guestCount) {
  const max = LEAGUE_MAX_GUESTS[format];
  return max !== undefined && (Number(guestCount) || 0) <= max;
}
