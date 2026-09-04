// src/components/dashboard/analytics/AwardsTab.jsx
import { useMemo, useState } from 'react';
import RankBarList from './RankBarList';
import { filterLogsByPeriod, recentCutoff, latestLogDate } from '../../../utils/analyticsPeriod';
import * as futsalCalc from '../../../utils/analyticsV2';
import * as soccerCalc from '../../../utils/soccerAnalytics';

export default function AwardsTab({ playerGameLogs, matchLogs, eventLogs, C, isSoccer = false }) {
  // 축구는 soccerAnalytics(분리 계산층), 풋살은 analyticsV2 — 함수 스코프 셰도잉으로 본문 호출부 무변경
  const { calcAwards, calcDailyMvp, calcRoundSlope, calcSoloGoalRatio, calcMonthlyRanking, calcVolatility, calcPlayerSummary, calcMetricLeaders } = isSoccer ? soccerCalc : futsalCalc;
  // 크로바(MVP)·고구마(꼴지)는 마스터FC 풋살 커스텀이라 축구엔 개념이 없다 —
  // buildRawPlayerGamesFromSoccer가 축구 PG에 crova:0/goguma:0을 박아 합산에도 안 들어간다.
  // 자책골은 축구에도 있지만 용어가 다르다: 축구는 '자책'(SoccerApp 개인기록 헤더), 풋살은 '역주행'.
  const bonusTerms = isSoccer ? "자책" : "크로바+고구마+역주행";

  // 기간 토글 (2026-09-04). 'all' = 누적(기본), 'recent' = 최근 한 달.
  //
  // ★ 비율형 카드만 기간을 따른다. 카운트형(일일 MVP 횟수·해트트릭·키퍼·자책)은
  //   유저 결정으로 항상 누적이다 — 30일 창이면 값이 0~2로 뭉쳐 Top5가 동점으로만
  //   채워져 순위가 의미를 잃기 때문(실측: 해트트릭 22명이 1~2회, 자책 4명이 1~2회).
  //   덕분에 "PG 누적"·"자책 누적" 캡션도 계속 사실이다.
  // ★ 월별 랭킹(ranking)과 그 선택기를 채우는 months도 원본 로그를 쓴다.
  //   필터된 배열로 months를 만들면 최근 모드에서 드롭다운이 한 달로 쪼그라들어
  //   과거 월 랭킹에 접근할 수 없게 된다.
  const [period, setPeriod] = useState('all');
  const isRecent = period === 'recent';
  // 진입선이 동적으로 잡히는 조건 — 풋살은 항상, 축구는 최근 모드에서만.
  const dynamicGate = !isSoccer || isRecent;

  const periodLogs = useMemo(() => filterLogsByPeriod(
    { matchLogs: matchLogs || [], eventLogs: eventLogs || [], playerGameLogs: playerGameLogs || [] },
    period,
  ), [matchLogs, eventLogs, playerGameLogs, period]);
  // 창의 실제 범위 — 30일이 어디서 어디까지인지 안 보이면 숫자를 믿기 어렵다.
  const windowRange = useMemo(() => {
    if (!isRecent) return null;
    const from = recentCutoff(periodLogs);
    const to = latestLogDate(periodLogs.matchLogs, periodLogs.eventLogs, periodLogs.playerGameLogs);
    return from && to ? { from, to } : null;
  }, [isRecent, periodLogs]);

  // ── 누적 고정 (원본 로그) ──
  const awards = useMemo(() => calcAwards({ playerLogs: playerGameLogs || [], eventLogs: eventLogs || [] }), [playerGameLogs, eventLogs]);
  const dailyMvp = useMemo(() => calcDailyMvp({ playerGameLogs: playerGameLogs || [] }), [playerGameLogs]);

  // ── 기간 적용 (periodLogs) ──
  // 임계값: 풋살은 생략 → 계산층이 축별 최대치의 30% 동적 적용.
  // 축구는 누적이면 기존 고정값, 최근 모드면 null을 넘겨 같은 동적 규칙으로 완화한다
  // (30일 창에 고정 10경기/5경기를 그대로 걸면 표본 대비 진입선이 과하다).
  const soccerGate = (fixed) => (isSoccer ? (isRecent ? null : fixed) : undefined);
  const slope = useMemo(() => calcRoundSlope({
    eventLogs: periodLogs.eventLogs, matchLogs: periodLogs.matchLogs,
    ...(isSoccer ? { threshold: soccerGate(10), minSessions: soccerGate(3) } : {}),
  }), [periodLogs, isSoccer, isRecent]);
  const solo = useMemo(() => calcSoloGoalRatio({
    eventLogs: periodLogs.eventLogs,
    ...(isSoccer ? { threshold: soccerGate(10) } : {}),
  }), [periodLogs, isSoccer, isRecent]);
  const volatility = useMemo(() => calcVolatility({
    playerLogs: periodLogs.playerGameLogs,
    ...(isSoccer ? { minGames: soccerGate(5) } : {}), topN: 3,
  }), [periodLogs, isSoccer, isRecent]);
  // 개인 축 필드 수비 (풋살 전용) — 세션 평균 베이스라인이 로테이션 전제라 축구 미적용
  const fieldDefense = useMemo(
    () => (isSoccer ? null : futsalCalc.calcFieldDefense({ matchLogs: periodLogs.matchLogs })),
    [isSoccer, periodLogs]
  );
  // 지표 Top5 — 개인분석 레이더와 동일 단일소스(calcPlayerSummary)
  const metricLeaders = useMemo(() => {
    const { perPlayer, totalSessions } = calcPlayerSummary(periodLogs);
    return calcMetricLeaders({
      perPlayer, totalSessions: Math.max(totalSessions, 1),
      ...(isSoccer && isRecent ? { minRounds: null, minKeeperRounds: null } : {}),
    });
  }, [periodLogs, isSoccer, isRecent]);

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

  const Card = ({ title, items, valueKey, valueFmt }) => (
    <div style={{ padding: 14, background: C.cardLight, borderRadius: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 8 }}>{title}</div>
      <RankBarList
        rows={(items || []).map(it => ({ player: it.player, value: it[valueKey], rank: it.rank }))}
        formatValue={valueFmt} color={C.green} C={C}
      />
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

  // 지표 Top5 / 랭킹 공통 열 — 막대 표현은 RankBarList가 맡는다(앱 전체 순위 목록과 같은 형태).
  // invert=낮을수록 좋음(실점률·편차) → 1위가 항상 최장.
  const MetricBarCol = ({ title, rows, fmt, invert = false, color }) => (
    <div>
      <div style={{ fontSize: 10, color: C.gray, marginBottom: 6 }}>{title}</div>
      <RankBarList rows={rows} formatValue={fmt} lowerIsBetter={invert} color={color || C.accent} C={C} emptyText="-" />
    </div>
  );

  const RankingCol = ({ title, rows, suffix = '', fmt }) => (
    <MetricBarCol title={title} rows={rows} fmt={fmt || (v => `${v}${suffix}`)} />
  );

  // 일일 MVP는 막대 전환 대상이 아니다(합의). RankingCol이 RankBarList로 바뀌면서
  // 이 열까지 딸려가는 걸 막으려고 텍스트 렌더를 별도로 남긴다.
  const PlainRankingCol = ({ title, rows, suffix }) => (
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

  const PeriodTab = ({ value, label }) => (
    <button onClick={() => setPeriod(value)}
      style={{
        padding: '6px 14px', borderRadius: 999, fontSize: 12,
        fontWeight: period === value ? 700 : 500,
        border: `1px solid ${period === value ? 'transparent' : C.grayDarker}`,
        background: period === value ? C.white : 'transparent',
        color: period === value ? C.cardLight : C.gray,
        cursor: 'pointer',
      }}>{label}</button>
  );

  return (
    <div>
      {/* 기간 토글 — 비율형 카드만 따른다. 카운트형·월별 랭킹은 항상 누적(위 주석 참조) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <PeriodTab value="all" label="누적" />
        <PeriodTab value="recent" label="최근 한 달" />
        {windowRange && (
          <span style={{ fontSize: 10, color: C.gray }}>
            {windowRange.from.slice(5)} ~ {windowRange.to.slice(5)} · 횟수형 카드(MVP·해트트릭·키퍼·자책)와 월별 랭킹은 누적 유지
          </span>
        )}
      </div>
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
            <PlainRankingCol title="👑 MVP 횟수" rows={dailyMvp.ranking} suffix="회" />
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
          {/* 풋살은 축별 최대치의 30% 동적 진입선(calcMetricLeaders.thresholds), 축구는 고정 10경기 */}
          개인분석 레이더와 동일 지표 · {dynamicGate
            ? `최다 경기수의 30% 이상 (현재 출전 ${metricLeaders.thresholds?.minRounds ?? 0}·수비 ${metricLeaders.thresholds?.minFieldRounds ?? 0}·키퍼 ${metricLeaders.thresholds?.minKeeperRounds ?? 0}경기)`
            : '10경기 이상 (키퍼는 4경기 이상)'} · ↓는 낮을수록 상위
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
          PG 누적 · 실점률 = 경기당 실점(낮을수록 ↑) · {isSoccer
            ? '키퍼 4경기 이상'
            : `실점률은 최다 키퍼경기의 30%(현재 ${awards.thresholds?.minKeeperGames ?? 0}경기) 이상`}
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
              <RankBarList
                rows={awards.keepers.stingiest.map(k => ({
                  player: k.player, value: k.concededRate, sub: `${k.keeperGames}경기`,
                }))}
                formatValue={v => v.toFixed(1)} lowerIsBetter color={C.accent} C={C} emptyText="-"
              />
            </div>
          </div>
        )}
      </div>
      <Card title="🤦 자책 누적" items={awards.owngoalKings} valueKey="total" valueFmt={v => `${v}회`} />
      {/* 🛡 수비 (필드) — 개인 축 2종: 무실점률 · 세션평균 대비 실점 억제. 풋살 전용 */}
      {!isSoccer && fieldDefense && (
        <div style={{ padding: 14, background: C.cardLight, borderRadius: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: 4 }}>
            🛡 수비 (필드)
          </div>
          <div style={{ fontSize: 10, color: C.gray, marginBottom: 10 }}>
            필드로 뛴 매치 기준(GK 제외) · 억제 = 그날 세션 평균 실점 − 본인 평균(+ = 덜 먹힘) · 필드 최다치의 30%(현재 {fieldDefense.thresholds?.minFieldRounds ?? 0}경기) 이상
          </div>
          {(fieldDefense.ranking.cleanRate.length === 0 && fieldDefense.ranking.suppression.length === 0) ? (
            <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <MetricBarCol title="🧱 무실점률" rows={fieldDefense.ranking.cleanRate} fmt={v => `${Math.round(v * 100)}%`} />
              <MetricBarCol title="🛡 실점 억제 (경기당)" rows={fieldDefense.ranking.suppression} fmt={v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`} />
            </div>
          )}
        </div>
      )}
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
            <div style={{ fontSize: 10, color: C.gray, marginBottom: 6 }}>
              {dynamicGate
                ? `G+A 표본 최다치의 30%(현재 ${slope.thresholds?.threshold ?? 0}개)·세션 최다치의 30%(현재 ${slope.thresholds?.minSessions ?? 0}회) 이상`
                : `G+A 표본 ${slope.thresholds?.threshold ?? 0}개·세션 ${slope.thresholds?.minSessions ?? 0}회 이상`}
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
        <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, marginBottom: isSoccer ? 12 : 4 }}>
          🎯 단독드리블골 (어시 없는 골 비율)
        </div>
        {dynamicGate && (
          <div style={{ fontSize: 10, color: C.gray, marginBottom: 10 }}>
            골 최다치의 30%(현재 {solo.thresholds?.threshold ?? 0}골) 이상
          </div>
        )}
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
          {dynamicGate
            ? `경기수 최다치의 30%(현재 ${volatility.thresholds?.minGames ?? 0}경기) 이상`
            : '5경기 이상'} · 꾸준형은 평균 G+A 중앙값 이상에서만 선정
        </div>
        {volatility.streaky.length === 0 && volatility.consistent.length === 0 ? (
          <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <MetricBarCol
              title="💥 몰빵형 (편차 ↑)" color={C.orange}
              rows={volatility.streaky.map(it => ({ player: it.player, value: it.std }))}
              fmt={v => `σ ${v.toFixed(1)}`}
            />
            <MetricBarCol
              title="🎯 꾸준형 (편차 ↓)" color={C.green} invert
              rows={volatility.consistent.map(it => ({ player: it.player, value: it.std }))}
              fmt={v => `σ ${v.toFixed(1)}`}
            />
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
            {/* value를 문자열로 미리 바꾸면 막대 비율을 못 낸다 — 숫자를 넘기고 포맷만 지정 */}
            <RankingCol title="🏁 승률" rows={ranking.winRate} fmt={v => `${Math.round(v * 100)}%`} />
          </div>
        ) : (
          <div style={{ fontSize: 11, color: C.gray }}>월 데이터 없음</div>
        )}
      </div>
    </div>
  );
}
