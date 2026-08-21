// 키퍼 vs 필드 카드 — "내가 GK일 때 vs 필드일 때 팀 득점/실점" 비교 (풋살 전용).
// 데이터는 calcGkFieldSplit: 매치 단위, GK가 기록된 사이드만 집계 (레거시 GK 미기록 제외).
// 값·라벨은 흰색/회색 잉크로 직접 표기 — 막대색은 시리즈 식별만 맡는다
// (다크 서피스에서 파랑의 대비가 3:1에 못 미쳐, 직접 라벨이 필수 릴리프).

const GK_COLOR = '#d97706';    // 앰버 — GK 시리즈
const FIELD_COLOR = '#3b82f6'; // 파랑 — 필드 시리즈 (CVD ΔE 30+ 검증 페어)

const per = (n, games) => (games > 0 ? n / games : 0);
const signed = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;

function BarRow({ label, games, value, max, color, C }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', fontSize: 10 }}>
      <span style={{ width: 92, flexShrink: 0, color: C.gray }}>
        {label} ({games}경기)
      </span>
      <div style={{ flex: 1, minWidth: 8, height: 8 }}>
        <div style={{ width: `${Math.min(100, (value / max) * 100)}%`, height: '100%', borderRadius: 4, background: color, opacity: 0.85 }} />
      </div>
      <span style={{ width: 34, flexShrink: 0, textAlign: 'right', color: C.white, fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>
        {value.toFixed(2)}
      </span>
    </div>
  );
}

// keeperRounds: PG 권위 키퍼 경기수(레이더·요약 라인에 표시되는 수). 레거시 GK 미기록
// 매치 탓에 카드 집계(gk.games)가 이보다 적을 수 있어(실측 76명 중 45명), 주석으로 잇는다.
export default function GkFieldSplitCard({ data, keeperRounds = 0, C }) {
  // 비교 카드라 한쪽 표본이 0이면 의미가 없다 → 카드 자체를 숨김
  if (!data || data.gk.games === 0 || data.field.games === 0) return null;
  const { gk, field } = data;
  const gkFor = per(gk.goalsFor, gk.games);
  const gkAgainst = per(gk.goalsAgainst, gk.games);
  const fieldFor = per(field.goalsFor, field.games);
  const fieldAgainst = per(field.goalsAgainst, field.games);
  // 네 막대가 같은 척도를 써야 그룹 간 비교가 성립한다
  const max = Math.max(gkFor, gkAgainst, fieldFor, fieldAgainst, 0.1);
  const gkDiff = gkFor - gkAgainst;
  const fieldDiff = fieldFor - fieldAgainst;
  const delta = fieldDiff - gkDiff;
  // 0.3골/경기 미만 차이는 로테이션 팀 편차에 묻히는 수준이라 우위로 단정하지 않는다
  const verdict = Math.abs(delta) < 0.3
    ? { dot: null, text: '두 역할의 팀 득실 차이가 크지 않아요' }
    : delta > 0
      ? { dot: FIELD_COLOR, text: `필드일 때 팀 득실이 경기당 ${signed(delta)} 우위` }
      : { dot: GK_COLOR, text: `GK일 때 팀 득실이 경기당 ${signed(-delta)} 우위` };
  const smallSample = Math.min(gk.games, field.games) < 10;

  const groupTitle = { fontSize: 10, fontWeight: 700, color: C.gray, margin: '8px 0 2px' };
  return (
    <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: C.cardLight, textAlign: 'left' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.white }}>🧤 키퍼 vs 필드 — 팀 득점·실점 비교</div>
      <div style={{ fontSize: 9.5, color: C.gray, marginTop: 2 }}>
        내가 GK일 때와 필드로 뛸 때(휴식 제외) 팀의 경기당 득점/실점
      </div>
      <div style={groupTitle}>경기당 팀득점</div>
      <BarRow label="GK일 때" games={gk.games} value={gkFor} max={max} color={GK_COLOR} C={C} />
      <BarRow label="필드일 때" games={field.games} value={fieldFor} max={max} color={FIELD_COLOR} C={C} />
      <div style={groupTitle}>경기당 팀실점 ↓</div>
      <BarRow label="GK일 때" games={gk.games} value={gkAgainst} max={max} color={GK_COLOR} C={C} />
      <BarRow label="필드일 때" games={field.games} value={fieldAgainst} max={max} color={FIELD_COLOR} C={C} />
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${C.grayDarker}`, fontSize: 10.5 }}>
        <span style={{ color: C.gray }}>경기당 득실차: </span>
        <span style={{ color: C.white, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          GK {signed(gkDiff)} · 필드 {signed(fieldDiff)}
        </span>
        {/* 결론은 흰색 잉크(시리즈 색 텍스트는 다크 서피스에서 대비 미달) — 색은 점이 맡는다 */}
        <div style={{ marginTop: 2, color: C.white, fontWeight: 700 }}>
          {verdict.dot && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: verdict.dot, marginRight: 5 }} />}
          {verdict.text}
        </div>
      </div>
      <div style={{ marginTop: 6, fontSize: 9, color: C.gray, lineHeight: 1.5 }}>
        {keeperRounds > gk.games
          ? `키퍼 ${keeperRounds}경기 중 GK가 매치에 기록된 ${gk.games}경기만 집계`
          : 'GK가 기록된 매치만 집계'}
        {' · 매주 팀이 섞여 팀 전력 차이가 섞인 참고용 지표'}
        {smallSample && ' · 표본이 적어 우연 편차가 클 수 있음'}
      </div>
    </div>
  );
}
