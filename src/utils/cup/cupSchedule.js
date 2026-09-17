// src/utils/cup/cupSchedule.js
// 컵 대진(풀리그 1회전) — 스펙 §6.3. 3단계에서 collectPlayedPairs / calcRemainingRounds 가 이 파일에 추가된다.
import { generateRoundRobin, generate5Team2Court, generate7Team2Court } from '../brackets';
import { MAX_TEAMS } from './cupEntity';

export function courtCountFor(teamCount) {
  return teamCount <= 3 ? 1 : 2;
}

// 반환 형식은 기존 schedule 과 같다: [{ matches: [[homeIdx, awayIdx], ...] }, ...]
// N=5·7 은 손수 짠 표가 더 좋다(5: 앞 5라운드가 정확히 10쌍, 7: 11라운드·연속 휴식 최소). 나머지는 circle method 를 구장 수로 잘라 쓴다.
export function generateCupRounds(teamCount, courtCount = courtCountFor(teamCount)) {
  const N = Number(teamCount);
  // 하한은 이 함수에서만 2(cupEntity.MIN_TEAMS=3 은 엔티티 검증 규칙이라 그대로 둔다).
  if (!Number.isInteger(N) || N < 2 || N > MAX_TEAMS) throw new Error('팀은 2~8개여야 합니다');
  const c = Math.max(1, Number(courtCount) || 1);
  if (N === 5 && c === 2) return clone(generate5Team2Court().slice(0, 5));
  if (N === 7 && c === 2) return clone(generate7Team2Court());
  const rr = generateRoundRobin(Array.from({ length: N }, (_, i) => i));
  const out = [];
  for (const round of rr) {
    for (let i = 0; i < round.length; i += c) out.push({ matches: round.slice(i, i + c).map(([h, a]) => [h, a]) });
  }
  return out;
}

function clone(rounds) {
  return rounds.map(r => ({ matches: r.matches.map(([h, a]) => [h, a]) }));
}

// 경기일 대진(스펙 §6.3 v2.1): 참석 팀 M 의 canonical 을 회전 수만큼 이어붙인다. 각 회전은 순서·홈/원정 그대로.
// 반환은 매 호출 새 객체(표 오염 금지). rotations 는 1~3 으로 클램프.
export function buildCupDaySchedule(M, courtCount, rotations = 1) {
  const n = Number(rotations);
  const rot = Number.isFinite(n) && n >= 1 ? Math.min(3, Math.floor(n)) : 1;
  const base = generateCupRounds(M, courtCount);
  const out = [];
  for (let r = 0; r < rot; r++) {
    for (const round of base) out.push({ matches: round.matches.map(m => [...m]) });
  }
  return out;
}
