// 폼 비교 카드 — "평소(과거 전체) vs 최근 1달"의 경기당 골/어시/팀 승률 (풋살 전용).
// 데이터는 calcRecentForm(마지막 세션 날짜 기준 30일 창) — 개인분석 탭이 넘긴다.
// 시각 문법은 GkFieldSplitCard와 동일: 조건별 쌍 막대 + 잉크 텍스트 + 색상 점 결론.
import { BarRow } from './GkFieldSplitCard';

const BASE_COLOR = '#3b82f6';   // 파랑 — 평소
const RECENT_COLOR = '#d97706'; // 앰버 — 최근 1달 (검증된 CVD 페어, GkFieldSplitCard와 동일)

const signed = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
const pct = (v) => `${Math.round(v * 100)}%`;

export default function FormCompareCard({ form, C }) {
  // 비교가 성립하려면 양쪽 다 출전이 있어야 한다 (신규 선수/최근 미출전은 숨김)
  if (!form || form.baseline.rounds === 0 || form.recent.rounds === 0) return null;
  const { baseline, recent, windowDays } = form;
  const gpg = { base: baseline.goals / baseline.rounds, recent: recent.goals / recent.rounds };
  const apg = { base: baseline.assists / baseline.rounds, recent: recent.assists / recent.rounds };
  // 골/어시는 같은 척도(경기당 개수), 승률은 0~1 고정 척도
  const maxGA = Math.max(gpg.base, gpg.recent, apg.base, apg.recent, 0.1);
  const gaDelta = recent.gaPerGame - baseline.gaPerGame;
  const wrDelta = recent.winRate - baseline.winRate;
  // 0.1골/경기 미만 차이는 세션 편차 수준이라 방향을 단정하지 않는다.
  // 점 색은 방향 의미색(상승=초록/주춤=주황, 앱 관례) — 시리즈 색(앰버)과 겹치지 않게.
  const verdict = Math.abs(gaDelta) < 0.1
    ? { dot: null, text: '평소와 비슷한 폼이에요' }
    : gaDelta > 0
      ? { dot: C.green, text: `상승세 — 경기당 G+A ${signed(gaDelta)}` }
      : { dot: C.orange, text: `주춤 — 경기당 G+A ${signed(gaDelta)}` };
  const smallSample = recent.rounds < 10;

  const groupTitle = { fontSize: 10, fontWeight: 700, color: C.gray, margin: '8px 0 2px' };
  return (
    <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: C.cardLight, textAlign: 'left' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.white }}>📊 폼 비교 — 평소 vs 최근 1달</div>
      <div style={{ fontSize: 9.5, color: C.gray, marginTop: 2 }}>
        마지막 세션({form.anchorDate}) 기준 최근 {windowDays}일({recent.sessions}세션)과 그 이전 전체({baseline.sessions}세션) 비교
      </div>
      <div style={groupTitle}>경기당 골</div>
      <BarRow label="평소" games={baseline.rounds} value={gpg.base} max={maxGA} color={BASE_COLOR} C={C} />
      <BarRow label="최근 1달" games={recent.rounds} value={gpg.recent} max={maxGA} color={RECENT_COLOR} C={C} />
      <div style={groupTitle}>경기당 어시</div>
      <BarRow label="평소" games={baseline.rounds} value={apg.base} max={maxGA} color={BASE_COLOR} C={C} />
      <BarRow label="최근 1달" games={recent.rounds} value={apg.recent} max={maxGA} color={RECENT_COLOR} C={C} />
      <div style={groupTitle}>팀 승률</div>
      <BarRow label="평소" games={baseline.rounds} value={baseline.winRate} max={1} color={BASE_COLOR} C={C} fmt={pct} />
      <BarRow label="최근 1달" games={recent.rounds} value={recent.winRate} max={1} color={RECENT_COLOR} C={C} fmt={pct} />
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${C.grayDarker}`, fontSize: 10.5 }}>
        <div style={{ color: C.white, fontWeight: 700 }}>
          {verdict.dot && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: verdict.dot, marginRight: 5 }} />}
          {verdict.text}
        </div>
        <div style={{ marginTop: 2, color: C.gray }}>
          팀 승률 {wrDelta >= 0 ? '+' : ''}{Math.round(wrDelta * 100)}%p ({pct(baseline.winRate)} → {pct(recent.winRate)})
        </div>
      </div>
      <div style={{ marginTop: 6, fontSize: 9, color: C.gray, lineHeight: 1.5 }}>
        골·어시는 PG 누적, 경기수·승률은 로그_매치 명단(휴식 제외) 기준
        {smallSample && ' · 최근 표본이 적어 우연 편차가 클 수 있음'}
      </div>
    </div>
  );
}
