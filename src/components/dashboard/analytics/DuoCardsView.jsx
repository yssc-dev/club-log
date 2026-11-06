// 베스트 듀오 카드 3장 — 풋살 전용. 축구는 GoldenTrioView(케미 랭킹)를 그대로 쓴다.
// ① 합작 골(절대수) ② 동반 승리(절대 승수, 승률 병기) ③ 실점 억제(경기당 실점, 경기일 진입선)
// 계산 규약·배경은 analyticsV2/calcDuoCards.js 상단 참조.
import { useMemo } from 'react';
import * as futsalCalc from '../../../utils/analyticsV2';
import RankBarList from './RankBarList';

const pairName = (p) => `${p.members[0]} + ${p.members[1]}`;

function Card({ title, caption, children, C }) {
  return (
    <div style={{ background: C.cardLight, borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.white, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 10, color: C.gray, marginBottom: 8, lineHeight: 1.5 }}>{caption}</div>
      {children}
    </div>
  );
}

export default function DuoCardsView({ matchLogs, eventLogs, C }) {
  const cards = useMemo(
    () => futsalCalc.calcDuoCards({ matchLogs: matchLogs || [], eventLogs: eventLogs || [], topN: 5 }),
    [matchLogs, eventLogs]
  );

  return (
    <div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 10, lineHeight: 1.5 }}>
        로그_매치 한 라운드 명단은 필드 5인 + 그 라운드 GK. 승리·실점은 둘 다 필드로 뛴 라운드만 세고,
        한쪽이 GK로 뛴 라운드는 제외합니다. GK 기록이 없는 2026-04 이전 행은 전원 필드로 봅니다.
      </div>

      <Card C={C} title="합작 골 TOP 5"
        caption="어시 → 골로 이어진 골을 두 방향 합산한 절대수(로그_이벤트 기준, 진입선 없음). 보조 숫자는 「앞 이름 득점(뒤 이름 어시) · 뒤 이름 득점(앞 이름 어시) / 함께 뛴 경기일」.">
        <RankBarList
          rows={cards.linkGoals.map(p => ({ name: pairName(p), value: p.count, sub: `${p.aToB}·${p.bToA} / ${p.sessions}일` }))}
          formatValue={v => `${v}골`} color={C.green} C={C} limit={5} nameWidth={92} subWidth={66}
        />
      </Card>

      <Card C={C} title="동반 승리 TOP 5"
        caption="둘 다 필드로 뛴 라운드에서 함께 이긴 횟수(절대수, 진입선 없음). 보조 숫자는 그 라운드들의 승률 · 함께 필드로 뛴 경기일.">
        <RankBarList
          rows={cards.wins.map(p => ({ name: pairName(p), value: p.wins, sub: `${Math.round(p.winRate * 100)}%·${p.sessions}일` }))}
          formatValue={v => `${v}승`} color={C.accent} C={C} limit={5} nameWidth={92} subWidth={56}
        />
      </Card>

      <Card C={C} title="실점 억제 TOP 5"
        caption={`둘 다 필드로 뛴 라운드의 경기당 실점(낮을수록 좋음). 함께 뛴 경기일 ${cards.minSessions}일 이상만(최다 ${cards.maxSessions}일의 30%). 보조 숫자는 무실점 라운드 수 · 경기일.`}>
        <RankBarList
          rows={cards.conceded.map(p => ({ name: pairName(p), value: p.concededPerRound, sub: `무실점 ${p.cleanSheets}·${p.sessions}일` }))}
          formatValue={v => v.toFixed(2)} lowerIsBetter color="#60a5fa" C={C} limit={5} nameWidth={92} subWidth={72}
        />
      </Card>
    </div>
  );
}
