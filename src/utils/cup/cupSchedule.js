// src/utils/cup/cupSchedule.js
// 컵 대진(풀리그 1회전) — 스펙 §6.3. 3단계에서 collectPlayedPairs / calcRemainingRounds 가 이 파일에 추가된다.
import { generateRoundRobin, generate5Team2Court, generate7Team2Court } from '../brackets';
import { MIN_TEAMS, MAX_TEAMS } from './cupEntity';

export function courtCountFor(teamCount) {
  return teamCount <= 3 ? 1 : 2;
}

// 반환 형식은 기존 schedule 과 같다: [{ matches: [[homeIdx, awayIdx], ...] }, ...]
// N=5·7 은 손수 짠 표가 더 좋다(5: 앞 5라운드가 정확히 10쌍, 7: 11라운드·연속 휴식 최소). 나머지는 circle method 를 구장 수로 잘라 쓴다.
export function generateCupRounds(teamCount, courtCount = courtCountFor(teamCount)) {
  const N = Number(teamCount);
  if (!Number.isInteger(N) || N < MIN_TEAMS || N > MAX_TEAMS) throw new Error('팀은 3~8개여야 합니다');
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
