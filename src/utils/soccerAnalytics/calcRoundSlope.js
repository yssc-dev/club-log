// P3: 선수별 골/어시 이벤트의 라운드 분포 → "초반 강자 vs 후반 폭격기" 성향.
//
// 정의 (이벤트 단위, 출전 baseline 미사용):
//   각 골/어시 이벤트가 자기 세션의 라운드 진행 중 어디쯤 발생했는지를 0~1 percentile로 환산.
//     percentile = (round_idx - 1) / (sessionMaxRound - 1)   ∈ [0, 1]
//     0=세션 첫 라운드, 1=세션 마지막 라운드
//   선수의 tendency = 본인의 모든 이벤트 percentile 평균
//     tendency < 0.5 → 초반 강자
//     tendency > 0.5 → 후반 폭격기
//     tendency = 0.5 → 라운드 진행과 무관
//   slope 필드는 backward-compat 용도로 (tendency - 0.5)를 그대로 노출.
//
// 같은 라운드에서 여러 골/어시를 넣으면 각각 별개 표본 — 자연스럽게 가중치가 더 실림.
//
// round_idx 출처:
//   1순위) matchLogs(date, match_id) join → round_idx 컬럼
//   2순위) match_id 정규식 폴백 — [RPF]{n}_C{m} 표준 포맷 (schedule/push/free)
// 신규/legacy 모두 표준 포맷이라 폴백 regex는 안전망 역할만 함.
// (legacy "N경기" / "N라운드 ..." 데이터는 2026-05-01 migrateMatchIds로 정규화 완료.)
// sessionMaxRound: matchLogs + eventLogs에서 그 date의 최대 round_idx.

const ROUND_RX = /^[RPF](\d+)_C\d+$/;

function parseRoundIdxFromString(matchId) {
  if (typeof matchId !== 'string') return null;
  const m = matchId.match(ROUND_RX);
  return m ? Number(m[1]) : null;
}

function buildRoundIdxLookup(matchLogs) {
  const lookup = new Map();
  for (const m of matchLogs || []) {
    const date = m.date || '';
    const mid = m.match_id || '';
    const raw = m.round_idx;
    if (raw === null || raw === undefined || raw === '') continue;
    const ridx = Number(raw);
    if (!Number.isFinite(ridx)) continue;
    lookup.set(`${date}|${mid}`, ridx);
  }
  return lookup;
}

function resolveRoundIdx(lookup, date, matchId) {
  const v = lookup.get(`${date}|${matchId}`);
  if (v !== undefined) return v;
  return parseRoundIdxFromString(matchId);
}

// threshold: 랭킹 진입 최소 '유효 percentile 표본' 수 (단일 라운드 세션 이벤트는 표본 불가라 제외)
// minSessions: 랭킹 진입 최소 세션 수 — 단일 세션 폭발이 다세션 성향과 동급 노출되는 것 방지
//   (기본 1 = 기존 동작. 분석탭 호출부는 3을 명시)
export function calcRoundSlope({ eventLogs, matchLogs, threshold = 10, minSessions = 1 }) {
  const lookup = buildRoundIdxLookup(matchLogs);

  // 세션(date)별 최대 round_idx — percentile 계산용. matchLogs + eventLogs 둘 다 스캔.
  const sessionMaxRound = {};
  const consider = (date, ridx) => {
    if (ridx == null) return;
    sessionMaxRound[date] = Math.max(sessionMaxRound[date] || 0, ridx);
  };
  for (const m of matchLogs || []) {
    const date = m.date || '';
    consider(date, resolveRoundIdx(lookup, date, m.match_id || ''));
  }
  for (const e of eventLogs || []) {
    if (e.event_type !== 'goal') continue;
    const date = e.date || '';
    consider(date, resolveRoundIdx(lookup, date, e.match_id || ''));
  }

  // 선수별 이벤트 수집 (골 + 어시; owngoal 제외)
  const events = {};
  const pushEvent = (player, date, ridx) => {
    if (!player) return;
    if (!events[player]) events[player] = [];
    events[player].push({ date, round_idx: ridx });
  };
  for (const e of eventLogs || []) {
    if (e.event_type !== 'goal') continue;
    const date = e.date || '';
    const ridx = resolveRoundIdx(lookup, date, e.match_id || '');
    if (ridx == null) continue;
    pushEvent(e.player, date, ridx);
    pushEvent(e.related_player, date, ridx);
  }

  const perPlayer = {};
  for (const player of Object.keys(events)) {
    const evs = events[player];

    // 라운드별 이벤트 카운트 (차트 막대 높이)
    const countByRound = {};
    for (const ev of evs) {
      countByRound[ev.round_idx] = (countByRound[ev.round_idx] || 0) + 1;
    }

    // tendency = mean(percentile)
    const percentiles = [];
    for (const ev of evs) {
      const max = sessionMaxRound[ev.date] || 0;
      if (max < 2) continue; // 1라운드 세션은 percentile 정의 불가
      const pct = (ev.round_idx - 1) / (max - 1);
      percentiles.push(pct);
    }
    const tendency = percentiles.length > 0
      ? percentiles.reduce((a, b) => a + b, 0) / percentiles.length
      : null;

    perPlayer[player] = {
      eventCount: evs.length,
      validSampleCount: percentiles.length, // percentile 정의 가능한 이벤트 수 (신뢰도 판정 기준)
      sessionCount: new Set(evs.map(ev => ev.date)).size,
      activeRoundCount: Object.keys(countByRound).length,
      countByRound,
      tendency,
      slope: tendency == null ? null : (tendency - 0.5),
      // 차트 호환: meanByRound = countByRound (막대 높이는 라운드별 이벤트 수)
      meanByRound: countByRound,
      sampleCount: evs.length,
      points: evs.map(ev => ({ date: ev.date, round_idx: ev.round_idx, ga: 1 })),
    };
  }

  const lateBloomers = [];
  const earlyBirds = [];
  for (const player of Object.keys(perPlayer)) {
    const { tendency, eventCount, validSampleCount, sessionCount } = perPlayer[player];
    if (tendency == null || validSampleCount < threshold || sessionCount < minSessions) continue;
    if (tendency > 0.5) lateBloomers.push({ player, tendency, eventCount, slope: tendency - 0.5 });
    else if (tendency < 0.5) earlyBirds.push({ player, tendency, eventCount, slope: tendency - 0.5 });
  }
  lateBloomers.sort((a, b) => b.tendency - a.tendency || a.player.localeCompare(b.player, 'ko'));
  earlyBirds.sort((a, b) => a.tendency - b.tendency || a.player.localeCompare(b.player, 'ko'));

  return { perPlayer, ranking: { lateBloomers, earlyBirds } };
}
