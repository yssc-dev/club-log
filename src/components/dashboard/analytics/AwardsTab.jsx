// src/components/dashboard/analytics/AwardsTab.jsx
import { useMemo, useState } from 'react';
import * as futsalCalc from '../../../utils/analyticsV2';
import * as soccerCalc from '../../../utils/soccerAnalytics';

export default function AwardsTab({ playerGameLogs, matchLogs, eventLogs, C, isSoccer = false }) {
  // 축구는 soccerAnalytics(분리 계산층), 풋살은 analyticsV2 — 함수 스코프 셰도잉으로 본문 호출부 무변경
  const { calcAwards, calcDailyMvp, calcRoundSlope, calcSoloGoalRatio, calcMonthlyRanking, calcVolatility, calcPlayerSummary, calcMetricLeaders } = isSoccer ? soccerCalc : futsalCalc;
  // 크로바(MVP)·고구마(꼴지)는 마스터FC 풋살 커스텀이라 축구엔 개념이 없다 —
  // buildRawPlayerGamesFromSoccer가 축구 PG에 crova:0/goguma:0을 박아 합산에도 안 들어간다.
  // 자책골은 축구에도 있지만 용어가 다르다: 축구는 '자책'(SoccerApp 개인기록 헤더), 풋살은 '역주행'.
  const bonusTerms = isSoccer ? "자책" : "크로바+고구마+역주행";
  const awards = useMemo(() => calcAwards({ playerLogs: playerGameLogs || [], eventLogs: eventLogs || [] }), [playerGameLogs, eventLogs]);
  const dailyMvp = useMemo(() => calcDailyMvp({ playerGameLogs: playerGameLogs || [] }), [playerGameLogs]);
  const slope = useMemo(() => calcRoundSlope({ eventLogs: eventLogs || [], matchLogs: matchLogs || [], threshold: 10, minSessions: 3 }), [eventLogs, matchLogs]);
  const solo = useMemo(() => calcSoloGoalRatio({ eventLogs: eventLogs || [], threshold: 10 }), [eventLogs]);
  const volatility = useMemo(() => calcVolatility({ playerLogs: playerGameLogs || [], minGames: 5, topN: 3 }), [playerGameLogs]);
  // 지표 Top5 — 개인분석 레이더와 동일 단일소스(calcPlayerSummary)
  const metricLeaders = useMemo(() => {
    const { perPlayer, totalSessions } = calcPlayerSummary({
      matchLogs: matchLogs || [], eventLogs: eventLogs || [], playerGameLogs: playerGameLogs || [],
    });
    return calcMetricLeaders({ perPlayer, totalSessions: Math.max(totalSessions, 1) });
  }, [matchLogs, eventLogs, playerGameLogs]);

  const months = useMemo(() => {
    const set = new Set();
    (playerGameLogs || []).forEach(p => {
      if (p.date && p.date.length >= 7) set.add(p.date.substring(0, 7));
    });
    return [...set].sort().reverse();
  }, [playerGameLogs]);

  const [selectedMonth, setSelectedMonth] = useState('');
  const effectiveMonth = selectedMonth || months[0] || '';

  const ranking = useMemo(() =>
    effectiveMonth ? calcMonthlyRanking({ yearMonth: effectiveMonth, playerLogs: playerGameLogs || [], matchLogs: matchLogs || [] }) : null
  , [effectiveMonth, playerGameLogs, matchLogs]);

  const Card = ({ title, items, valueKey, valueFmt, valueRender }) => (
    <div style={{ padding: 14, background: C.cardLight, borderRadius: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 8 }}>{title}</div>
      {(!items || items.length === 0) ? (
        <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
      ) : items.map((it, i) => (
        <div key={`${it.player}|${i}`} style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '4px 0', fontSize: 12,
          borderBottom: i < items.length - 1 ? `1px dashed ${C.grayDarker}` : 'none',
        }}>
          <span style={{ color: C.gray }}>#{i + 1} {it.player}</span>
          {valueRender
            ? valueRender(it)
            : <span style={{ color: C.green, fontWeight: 600 }}>{valueFmt(it[valueKey])}</span>
          }
        </div>
      ))}
    </div>
  );

  const SlopeRow = ({ item, maxAbs, isLate }) => {
    const ratio = Math.min(1, Math.abs(item.slope) / maxAbs);
    const barColor = isLate ? '#4ade80' : '#ff8a4c';
    const valueText = `${isLate ? '+' : ''}${item.slope.toFixed(2)}`;
    return (
      <div style={{ display: 'flex', alignItems: 'center', height: 22, marginBottom: 6, fontSize: 11 }}>
        <div style={{ flex: 1, position: 'relative', height: '100%' }}>
          {!isLate && (
            <>
              <div style={{
                position: 'absolute', right: 0, top: 4, height: 14,
                width: `${ratio * 100}%`, background: barColor,
                borderRadius: '7px 0 0 7px',
              }} />
              <div style={{
                position: 'absolute', right: `calc(${ratio * 100}% + 6px)`, top: 2,
                color: C.white, fontWeight: 600, whiteSpace: 'nowrap',
              }}>
                {item.player} <span style={{ color: C.gray, fontSize: 10 }}>{valueText}</span>
              </div>
            </>
          )}
        </div>
        <div style={{ width: 1, height: 18, background: C.grayDark, flexShrink: 0 }} />
        <div style={{ flex: 1, position: 'relative', height: '100%' }}>
          {isLate && (
            <>
              <div style={{
                position: 'absolute', left: 0, top: 4, height: 14,
                width: `${ratio * 100}%`, background: barColor,
                borderRadius: '0 7px 7px 0',
              }} />
              <div style={{
                position: 'absolute', left: `calc(${ratio * 100}% + 6px)`, top: 2,
                color: C.white, fontWeight: 600, whiteSpace: 'nowrap',
              }}>
                <span style={{ color: C.gray, fontSize: 10 }}>{valueText}</span> {item.player}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const SoloDonut = ({ player, ratio, rank }) => {
    const size = 80, stroke = 8;
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ * (1 - Math.min(1, ratio));
    return (
      <div style={{ textAlign: 'center', flex: 1 }}>
        <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
          <svg width={size} height={size}>
            <circle cx={size/2} cy={size/2} r={r}
              fill="none" stroke={C.grayDarker} strokeWidth={stroke} />
            <circle cx={size/2} cy={size/2} r={r}
              fill="none" stroke="#4ade80" strokeWidth={stroke}
              strokeDasharray={circ} strokeDashoffset={offset}
              strokeLinecap="round"
              transform={`rotate(-90 ${size/2} ${size/2})`} />
          </svg>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 700, color: C.white,
          }}>{Math.round(ratio * 100)}%</div>
        </div>
        <div style={{ fontSize: 11, color: C.white, marginTop: 6 }}>
          #{rank} {player}
        </div>
      </div>
    );
  };

  // 지표 Top5 전용 — 막대 길이는 1위 대비 상대값(단일 색, 크기 인코딩).
  // invert(낮을수록 좋음)는 min/value로 환산해 1위가 항상 최장.
  const MetricBarCol = ({ title, rows, fmt, invert = false }) => {
    const best = rows.length ? rows[0].value : 0;
    const ratioOf = (v) => {
      if (invert) return v <= 0 ? 1 : Math.min(1, best / v);
      return best <= 0 ? 0 : Math.max(0, Math.min(1, v / best));
    };
    return (
      <div>
        <div style={{ fontSize: 10, color: C.gray, marginBottom: 6 }}>{title}</div>
        {rows.length === 0 ? (
          <div style={{ fontSize: 10, color: C.gray }}>-</div>
        ) : rows.map((r, i) => (
          <div key={r.player} style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
              <span style={{ color: C.white }}>{i + 1}. {r.player}</span>
              <span style={{ color: C.white, fontWeight: 700 }}>{fmt(r.value)}</span>
            </div>
            {/* 막대는 보조 비교용 — 저채도(투명도↓)로 텍스트보다 뒤에 물러나게 */}
            <div style={{ height: 3, borderRadius: 2, background: C.grayDarker, opacity: 0.6 }}>
              <div style={{ width: `${Math.round(ratioOf(r.value) * 100)}%`, height: '100%', borderRadius: 2, background: C.accent, opacity: 0.35 }} />
            </div>
          </div>
        ))}
      </div>
    );
  };

  const RankingCol = ({ title, rows, suffix }) => (
    <div>
      <div style={{ fontSize: 10, color: C.gray, marginBottom: 6 }}>{title}</div>
      {(!rows || rows.length === 0) ? (
        <div style={{ fontSize: 10, color: C.gray }}>-</div>
      ) : rows.map((r, i) => (
        <div key={r.player} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
          <span style={{ color: C.white }}>{r.rank ?? i + 1}. {r.player}</span>
          <span style={{ color: C.white, fontWeight: 700 }}>{r.value}{suffix}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      {/* 🏆 일일 MVP — 그날 최종포인트(랭크점수+크로바+고구마) 1위 */}
      <div style={{ padding: 14, background: C.cardLight, borderRadius: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 4 }}>🏆 일일 MVP</div>
        <div style={{ fontSize: 10, color: C.gray, marginBottom: 10 }}>
          그날 최종포인트(골+어시+클린시트+{bonusTerms}) 1위 · 동점 시 공동 MVP
        </div>
        {dailyMvp.ranking.length === 0 ? (
          <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <RankingCol title="👑 MVP 횟수" rows={dailyMvp.ranking} suffix="회" />
            <div>
              <div style={{ fontSize: 10, color: C.gray, marginBottom: 6 }}>🗓 최근 세션 MVP</div>
              {dailyMvp.recent.map(r => (
                <div key={r.date} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                  <span style={{ color: C.gray }}>{r.date.slice(5)}</span>
                  <span style={{ color: C.white, fontWeight: 700 }}>{r.mvps.join(', ')} <span style={{ color: C.gray, fontWeight: 400 }}>({r.points}점)</span></span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* 📊 지표 Top5 — 개인분석 레이더 6축(raw값) + 팀득점관여율 */}
      <div style={{ padding: 14, background: C.cardLight, borderRadius: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 4 }}>📊 지표 Top5</div>
        <div style={{ fontSize: 10, color: C.gray, marginBottom: 10 }}>
          개인분석 레이더와 동일 지표 · 10경기 이상 (키퍼는 4경기 이상) · ↓는 낮을수록 상위
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <MetricBarCol title="⚽ 득점력 (경기당 골)" rows={metricLeaders.scoring} fmt={v => v.toFixed(2)} />
          <MetricBarCol title="🎨 창의력 (경기당 어시)" rows={metricLeaders.creativity} fmt={v => v.toFixed(2)} />
          <MetricBarCol title="🛡 수비력 (경기당 팀실점 ↓)" rows={metricLeaders.defense} fmt={v => v.toFixed(2)} invert />
          <MetricBarCol title="🧤 키퍼 (경기당 실점 ↓)" rows={metricLeaders.keeping} fmt={v => v.toFixed(2)} invert />
          <MetricBarCol title="📅 참석률" rows={metricLeaders.attendance} fmt={v => `${Math.round(v * 100)}%`} />
          <MetricBarCol title="🏁 승리기여 (승률)" rows={metricLeaders.winRate} fmt={v => `${Math.round(v * 100)}%`} />
          <MetricBarCol title="🎯 팀득점관여율 (골+어시/팀득점)" rows={metricLeaders.involvement} fmt={v => `${Math.round(v * 100)}%`} />
        </div>
      </div>
      <Card title="🎩 해트트릭 (한 경기 3골 이상)" items={awards.hatTricks} valueKey="count" valueFmt={v => `${v}회`} />
      {/* 클러치(결승골 등)는 2026-07-04 제거 — 입력 시각 기반 순서 복원은 사후 정정 입력을
          오탐하고(합계 검증으로는 순서 오류를 못 잡음), 재구성 불일치 제외로 커버리지도 낮았음 */}
      {/* 🧤 키퍼 — 클린시트 수 · 실점률 (PG 누적) */}
      <div style={{ padding: 14, background: C.cardLight, borderRadius: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 4 }}>
          🧤 키퍼 (수문장)
        </div>
        <div style={{ fontSize: 10, color: C.gray, marginBottom: 10 }}>
          PG 누적 · 실점률 = 경기당 실점(낮을수록 ↑) · 키퍼 4경기 이상
        </div>
        {(awards.keepers.cleanSheetKings.length === 0 && awards.keepers.stingiest.length === 0) ? (
          <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <RankingCol title="🧤 클린시트 수"
              rows={awards.keepers.cleanSheetKings.map(k => ({ player: k.player, value: k.cleanSheets }))}
              suffix="회" />
            <div>
              <div style={{ fontSize: 10, color: C.gray, marginBottom: 6 }}>🧱 실점률 (경기당)</div>
              {awards.keepers.stingiest.length === 0
                ? <div style={{ fontSize: 10, color: C.gray }}>-</div>
                : awards.keepers.stingiest.map((k, i) => (
                  <div key={k.player} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                    <span style={{ color: C.white }}>{i + 1}. {k.player}</span>
                    <span>
                      <b style={{ color: C.white, fontWeight: 700 }}>{k.concededRate.toFixed(1)}</b>
                      <span style={{ color: C.gray, fontSize: 10 }}> ({k.keeperGames}경기)</span>
                    </span>
                  </div>
                ))
              }
            </div>
          </div>
        )}
      </div>
      <Card title="🤦 자책 누적" items={awards.owngoalKings} valueKey="total" valueFmt={v => `${v}회`} />
      {/* 라운드 흐름: 초반강자(-) ← → 후반폭격기(+) — 축구는 라운드 개념 없음 → 숨김 */}
      {!isSoccer && (() => {
        const late = slope.ranking.lateBloomers.slice(0, 3);
        const early = slope.ranking.earlyBirds.slice(0, 3);
        const maxAbs = Math.max(0.01,
          ...late.map(x => Math.abs(x.slope)),
          ...early.map(x => Math.abs(x.slope)),
        );
        return (
          <div style={{ padding: 14, background: C.cardLight, borderRadius: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 6 }}>
              🏁 라운드 흐름 (G+A/라운드 변화)
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.gray, marginBottom: 10 }}>
              <span>← 초반 강자</span>
              <span>후반 폭격기 →</span>
            </div>
            {late.length === 0 && early.length === 0 ? (
              <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
            ) : (
              <>
                {late.map((it, i) => <SlopeRow key={`L${i}`} item={it} maxAbs={maxAbs} isLate={true} />)}
                {early.map((it, i) => <SlopeRow key={`E${i}`} item={it} maxAbs={maxAbs} isLate={false} />)}
              </>
            )}
          </div>
        );
      })()}

      {/* 단독골 도넛 */}
      <div style={{ padding: 14, background: C.cardLight, borderRadius: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 12 }}>
          🎯 단독드리블골 (어시 없는 골 비율)
        </div>
        {solo.ranking.soloHeroes.length === 0 ? (
          <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            {solo.ranking.soloHeroes.slice(0, 3).map((it, i) => (
              <SoloDonut key={it.player} player={it.player} ratio={it.soloRatio} rank={i + 1} />
            ))}
          </div>
        )}
      </div>

      {/* 🎢 변동성 — 몰빵형 vs 꾸준형 */}
      <div style={{ padding: 14, background: C.cardLight, borderRadius: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 4 }}>
          🎢 컨디션 편차 (경기당 G+A 표준편차)
        </div>
        <div style={{ fontSize: 10, color: C.gray, marginBottom: 10 }}>
          5경기 이상 · 꾸준형은 평균 G+A 중앙값 이상에서만 선정
        </div>
        {volatility.streaky.length === 0 && volatility.consistent.length === 0 ? (
          <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: C.gray, marginBottom: 6 }}>💥 몰빵형 (편차 ↑)</div>
              {volatility.streaky.length === 0
                ? <div style={{ fontSize: 10, color: C.gray }}>-</div>
                : volatility.streaky.map((it, i) => (
                  <div key={it.player} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: C.white }}>{i + 1}. {it.player}</span>
                    <span style={{ color: C.white, fontWeight: 700 }}>σ {it.std.toFixed(1)}</span>
                  </div>
                ))
              }
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.gray, marginBottom: 6 }}>🎯 꾸준형 (편차 ↓)</div>
              {volatility.consistent.length === 0
                ? <div style={{ fontSize: 10, color: C.gray }}>-</div>
                : volatility.consistent.map((it, i) => (
                  <div key={it.player} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: C.white }}>{i + 1}. {it.player}</span>
                    <span style={{ color: C.white, fontWeight: 700 }}>σ {it.std.toFixed(1)}</span>
                  </div>
                ))
              }
            </div>
          </div>
        )}
      </div>

      {/* ── 월별 랭킹 ── */}
      <div style={{ padding: 14, background: C.cardLight, borderRadius: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.gray }}>📅 {effectiveMonth === 'ALL' ? '시즌 전체 랭킹' : '월별 랭킹'}</div>
          <select value={effectiveMonth} onChange={e => setSelectedMonth(e.target.value)}
            style={{ padding: "4px 10px", borderRadius: 50, fontSize: 11, fontWeight: 480, background: "transparent", color: C.white, border: `1px dashed ${C.grayDark}`, fontFamily: "inherit", appearance: "none", cursor: "pointer" }}>
            {months.length === 0 ? <option value="">-</option> : (
              <>
                <option value="ALL">전체</option>
                {months.map(m => <option key={m} value={m}>{m}</option>)}
              </>
            )}
          </select>
        </div>
        {ranking ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <RankingCol title={`🏅 종합포인트 (골+어시+클린+${bonusTerms})`} rows={ranking.totalPoints} suffix="점" />
            <RankingCol title="⚡ 공격포인트 (G+A)" rows={ranking.attackPoints} suffix="pt" />
            <RankingCol title="⚽ 득점" rows={ranking.goals} suffix="골" />
            <RankingCol title="🅰 어시" rows={ranking.assists} suffix="어시" />
            <RankingCol title="🏁 승률" rows={ranking.winRate.map(x => ({ player: x.player, rank: x.rank, value: `${Math.round(x.value * 100)}%` }))} suffix="" />
          </div>
        ) : (
          <div style={{ fontSize: 11, color: C.gray }}>월 데이터 없음</div>
        )}
      </div>
    </div>
  );
}
