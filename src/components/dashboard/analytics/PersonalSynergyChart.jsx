// src/components/dashboard/analytics/PersonalSynergyChart.jsx
// 개인 시너지 차트 (축구·풋살 공용) — 선택한 선수 기준 '잘 맞는 동료 / 안 맞는 동료'를 좌우로.
//
// N×N 시너지매트릭스를 대체한다. 43×43 격자는 모바일에서 읽을 수 있는 물건이 아니었고,
// 실제로 보는 질문은 "나는 누구와 뛸 때 잘 되나" 하나였다.
//
// 축은 승률(= 이 동료와 같은 팀으로 뛴 매치의 승률). 케미(lift, 개인 평균 대비 추가 효과)는
// 개인분석 탭의 '나의 짝꿍' 표에 그대로 남아 있다.
// 표본 부족(minRounds 미만) 동료는 양쪽에서 제외한다 — 1~2경기짜리가 상하위를 차지하면
// 순위가 무작위가 된다.
import { useMemo, useState } from 'react';
import * as futsalCalc from '../../../utils/analyticsV2';
import * as soccerCalc from '../../../utils/soccerAnalytics';

const MIN_ROUNDS = 5;
const TOP_N = 5;

// 상하위를 가르되 같은 사람이 양쪽에 겹치지 않게 한다(자격 인원이 topN*2 미만일 때).
export function splitSynergy(partners, { topN = TOP_N } = {}) {
  const eligible = (partners || []).filter(p => !p.isLowSample);
  if (eligible.length === 0) return { best: [], worst: [], eligible: 0 };
  const byWin = [...eligible].sort((a, b) => b.winRate - a.winRate || b.games - a.games);
  const best = byWin.slice(0, topN);
  const worst = byWin.slice(Math.max(best.length, byWin.length - topN)).reverse();
  return { best, worst, eligible: eligible.length };
}

function Row({ p, color, C }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0', fontSize: 10 }}>
      <span style={{ width: 40, flexShrink: 0, color: C.white, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {p.partner}
      </span>
      <div style={{ flex: 1, minWidth: 8, height: 6 }}>
        <div style={{ width: `${Math.round(p.winRate * 100)}%`, height: '100%', borderRadius: 3, background: color, opacity: 0.75 }} />
      </div>
      <span style={{ width: 30, flexShrink: 0, textAlign: 'right', color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {Math.round(p.winRate * 100)}%
      </span>
      <span style={{ width: 56, flexShrink: 0, textAlign: 'right', fontSize: 9, color: C.grayDark, whiteSpace: 'nowrap' }}>
        {p.comboGoals}골/{p.games}경기
      </span>
    </div>
  );
}

function Column({ label, rows, color, C }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, marginBottom: 3 }}>{label}</div>
      {rows.length === 0
        ? <div style={{ fontSize: 10, color: C.grayDark }}>표본 부족</div>
        : rows.map(p => <Row key={p.partner} p={p} color={color} C={C} />)}
    </div>
  );
}

export default function PersonalSynergyChart({ matchLogs, eventLogs, C, isSoccer = false, authUserName }) {
  const { calcSynergyMatrix, calcPersonalSynergy, calcAssistLinkMatrix, personalLink } = isSoccer ? soccerCalc : futsalCalc;
  const matrix = useMemo(
    () => calcSynergyMatrix({ matchLogs: matchLogs || [], minRounds: MIN_ROUNDS }),
    [matchLogs, calcSynergyMatrix],
  );
  // 합작 골 = 내 어시로 그가 넣은 골 + 내 골에 그가 어시한 골 (골-어시로 연결된 횟수).
  // 골 하나당 두 사람이 1P씩 가져가므로 '공격포인트'가 아니라 '합작 N골'로 부른다.
  const linkMatrix = useMemo(
    () => calcAssistLinkMatrix({ eventLogs: eventLogs || [] }),
    [eventLogs, calcAssistLinkMatrix],
  );
  const players = matrix.players || [];
  const [picked, setPicked] = useState(null);
  const player = (picked && players.includes(picked)) ? picked
    : (players.includes(authUserName) ? authUserName : players[0] ?? null);

  const personal = useMemo(() => {
    if (!player) return { partners: [] };
    const base = calcPersonalSynergy({ matrix, player });
    return {
      ...base,
      partners: base.partners.map(p => ({
        ...p,
        comboGoals: personalLink({ linkMatrix, player, partner: p.partner }).total,
      })),
    };
  }, [matrix, player, linkMatrix, calcPersonalSynergy, personalLink]);
  const { best, worst, eligible } = splitSynergy(personal.partners);

  // 기준선 — 이 선수가 뛴 모든 매치의 승률. "이 동료와 뛰면 평소보다 나은가"를 재는 축.
  const myWinRate = useMemo(() => {
    const rows = personal.partners || [];
    const games = rows.reduce((s, p) => s + p.games, 0);
    const wins = rows.reduce((s, p) => s + p.wins, 0);
    return games > 0 ? wins / games : null;
  }, [personal]);

  if (!player || (personal.partners || []).length === 0) {
    return (
      <div>
        <div style={{ textAlign: 'center', padding: 30, color: C.gray, fontSize: 12 }}>
          함께 뛴 기록이 없습니다
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <select
          value={player}
          onChange={(e) => setPicked(e.target.value)}
          style={{
            padding: '5px 8px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
            background: C.cardLight, color: C.white, border: `1px solid ${C.grayDarker}`, fontFamily: 'inherit',
          }}
        >
          {players.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <span style={{ fontSize: 10, color: C.gray }}>
          함께 뛴 동료 {personal.partners.length}명 · 표본 {MIN_ROUNDS}경기 이상 {eligible}명
        </span>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <Column label="잘 맞는 동료" rows={best} color={C.green} C={C} />
        <Column label="안 맞는 동료" rows={worst} color={C.red} C={C} />
      </div>

      <div style={{ marginTop: 8, fontSize: 9.5, color: C.gray, lineHeight: 1.5 }}>
        {myWinRate != null && <>내 전체 승률 <b style={{ color: C.white }}>{Math.round(myWinRate * 100)}%</b> · </>}
        같은 팀으로 뛴 매치의 승률 기준 · 합작 = 서로 골–어시로 연결된 골 수. {MIN_ROUNDS}경기 미만 동료는 제외.
      </div>
    </div>
  );
}
