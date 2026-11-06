// 베스트 듀오 카드 3장 — 풋살 전용(축구는 calcGoldenTrio 케미 랭킹 유지).
//
// 2026-11-06 유저 요청: 케미(상대값) 대신 ① 가장 많은 골을 합작한 조합 ② 가장 많은 승리를
// 함께한 조합 ③ 실점이 가장 적은 조합. 케미 순위는 진입선 통과 242조합의 분포가 이항 노이즈
// 폭과 같아(관측 SD 8.6pp vs 기대 8.8pp) 폐기.
//
// 데이터 모델(2026-04-23 이후 로그_매치): 한 행 = 한 라운드, our/opponent_members_json =
// 그 라운드 실제 출전 "필드 5인 + GK"이고 GK는 our_gk/opponent_gk로 명단 안에 있다.
// → 승리·실점은 "둘 다 필드로 뛴 라운드"만 집계한다. 한쪽이 그 라운드 GK면 그 라운드는
//   둘의 기록에서 뺀다(필드 듀오와 필드+GK 조합을 섞지 않기 위해).
// → GK가 비어 있는 레거시 행(04-16 이전)은 뺄 근거가 없어 전원 필드로 본다.
// → 합작 골은 로그_이벤트의 (득점자, 어시) 쌍이라 명단과 무관하게 실제 동반이 보장된다.
//
// 진입선: 같은 날 필드 5인이 거의 고정이라 라운드가 경기일 단위로 뭉친다(24R가 3일인 조합도
// 있음). 그래서 비율 지표(실점)의 진입선은 라운드 수가 아니라 "함께 뛴 경기일 수"로 두고,
// 축 최대치 × 30% 올림(dynamicMin, 풋살 규약). 절대수 카드(합작 골·승수)는 진입선 없음.
import { parseActualPlayers } from './parseMembers';
import { dynamicMin } from './dynamicMin';

const pairKey = (x, y) => [x, y].sort((a, b) => a.localeCompare(b, 'ko')).join('|');
const byName = (a, b) => a.members[0].localeCompare(b.members[0], 'ko') || a.members[1].localeCompare(b.members[1], 'ko');

// 페어별 라운드 집계. field = 둘 다 필드였던 라운드만, all = GK 라운드 포함 전체(합작 골 카드의 경기일 수용).
function aggregatePairs(matchLogs) {
  const pairs = {};
  const touch = (key) => (pairs[key] ||= {
    seenRounds: new Set(), fieldRounds: new Set(), fieldDates: new Set(),
    wins: 0, draws: 0, losses: 0, conceded: 0, cleanSheets: 0,
    allDates: new Set(),
  });

  let rowSeq = 0;
  for (const m of matchLogs || []) {
    rowSeq++;
    if (m.is_extra) continue; // 연습/이벤트성 매치 제외 — calcGoldenTrio·calcPlayerSummary와 동일
    // match_id 없는 레거시 행은 행 단위 고유 키로 폴백 (같은 날짜 매치끼리 합쳐지는 것 방지)
    const roundKey = m.match_id ? `${m.date}|${m.match_id}` : `${m.date}|__row${rowSeq}`;
    const our = Number(m.our_score) || 0;
    const opp = Number(m.opponent_score) || 0;
    const sides = [
      { members: parseActualPlayers(m.our_members_json), gk: m.our_gk || '', gf: our, ga: opp },
      { members: parseActualPlayers(m.opponent_members_json), gk: m.opponent_gk || '', gf: opp, ga: our },
    ];
    for (const { members, gk, gf, ga } of sides) {
      if (members.length < 2) continue;
      const sorted = [...members].sort((a, b) => a.localeCompare(b, 'ko'));
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const a = sorted[i], b = sorted[j];
          const p = touch(`${a}|${b}`);
          // 같은 (날짜, match_id) 중복 행 방어 — 첫 행 우선(pairBaseline.recordRoundOutcome과 같은 규칙).
          // GK 판정보다 앞에 둔다: 첫 행이 GK 라운드였으면 둘째 행이 필드 라운드로 되살아나면 안 된다.
          if (p.seenRounds.has(roundKey)) continue;
          p.seenRounds.add(roundKey);
          p.allDates.add(m.date);
          if (gk && (gk === a || gk === b)) continue; // 한쪽이 그 라운드 GK → 필드 듀오 라운드가 아님
          p.fieldRounds.add(roundKey);
          p.fieldDates.add(m.date);
          if (gf > ga) p.wins++; else if (gf === ga) p.draws++; else p.losses++;
          p.conceded += ga;
          if (ga === 0) p.cleanSheets++;
        }
      }
    }
  }
  return pairs;
}

// (득점자, 어시) 쌍 → 조합별 합산. aToB = a 득점(b 어시), bToA = b 득점(a 어시) — calcAssistLinkMatrix와 같은 규약.
function aggregateLinkGoals(eventLogs) {
  const cells = {};
  for (const e of eventLogs || []) {
    if (e.event_type !== 'goal') continue;
    const scorer = e.player, assister = e.related_player;
    if (!scorer || !assister || scorer === assister) continue;
    const key = pairKey(scorer, assister);
    const c = (cells[key] ||= { count: 0, aToB: 0, bToA: 0 });
    c.count++;
    if (scorer === key.split('|')[0]) c.aToB++; else c.bToA++;
  }
  return cells;
}

export function calcDuoCards({ matchLogs, eventLogs, topN = 5 }) {
  const pairs = aggregatePairs(matchLogs);
  const links = aggregateLinkGoals(eventLogs);

  const linkGoals = Object.entries(links)
    .map(([key, c]) => ({
      members: key.split('|'),
      count: c.count, aToB: c.aToB, bToA: c.bToA,
      sessions: pairs[key]?.allDates.size ?? 0,
    }))
    .sort((a, b) => b.count - a.count || byName(a, b))
    .slice(0, topN);

  const fieldPairs = Object.entries(pairs)
    .filter(([, p]) => p.fieldRounds.size > 0)
    .map(([key, p]) => ({
      members: key.split('|'),
      rounds: p.fieldRounds.size,
      sessions: p.fieldDates.size,
      wins: p.wins, draws: p.draws, losses: p.losses,
      winRate: (p.wins + 0.5 * p.draws) / p.fieldRounds.size,
      conceded: p.conceded,
      concededPerRound: p.conceded / p.fieldRounds.size,
      cleanSheets: p.cleanSheets,
    }));

  const wins = [...fieldPairs]
    .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || byName(a, b))
    .slice(0, topN);

  const maxSessions = fieldPairs.reduce((m, p) => Math.max(m, p.sessions), 0);
  const minSessions = dynamicMin(maxSessions);
  const conceded = fieldPairs
    .filter(p => p.sessions >= minSessions)
    .sort((a, b) => a.concededPerRound - b.concededPerRound || b.rounds - a.rounds || byName(a, b))
    .slice(0, topN);

  return { linkGoals, wins, conceded, minSessions, maxSessions };
}
