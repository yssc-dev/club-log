// src/components/dashboard/analytics/LegacyDataNotice.jsx
// 분석 화면 상단 제한사항 배너 (축구 전용).
//
// 앱 전환 이전 경기는 출전 명단 원본이 없어, 로그_매치의 our_members_json이 골 이벤트에서
// 역산한 부분 명단이다(실측 평균 3.2명). 골·어시는 이벤트 원본이라 정확하지만
// **출전 경기수는 실제보다 적게 잡힌다** — 그 구간에 골·어시가 없던 경기는 아예 안 남는다.
// 지표는 분자·분모를 같은 범위(전 기간)로 두고, 이 한계를 여기서 밝힌다.
import { useMemo } from 'react';
import { isLegacyMatch, appEraStart } from '../../../utils/soccerAnalytics';

export default function LegacyDataNotice({ matchLogs, C }) {
  const info = useMemo(() => {
    const rows = matchLogs || [];
    const legacyCount = rows.filter(isLegacyMatch).length;
    return { legacyCount, start: appEraStart(rows) };
  }, [matchLogs]);

  if (info.legacyCount === 0) return null;

  return (
    <div style={{
      display: 'flex', gap: 6, alignItems: 'flex-start',
      padding: '8px 10px', marginBottom: 10, borderRadius: 8,
      background: C.orange + '18', border: `1px solid ${C.orange}55`,
      fontSize: 10, color: C.gray, lineHeight: 1.5,
    }}>
      <span style={{ flexShrink: 0 }}>⚠️</span>
      <span>
        <b style={{ color: C.orange }}>앱 전환 이전 {info.legacyCount}경기</b>는 출전 명단 기록이 없어,
        골·어시를 낸 경기만 출전으로 잡힙니다
        {info.start ? <> (앱 기록은 <b>{info.start}</b>부터).</> : '.'}
        <br />골·어시는 전 기간 정확하지만 <b>출전 경기수는 실제보다 적게</b> 집계되며,
        경기당 포인트·승률·참석률이 그만큼 높게 나옵니다.
      </span>
    </div>
  );
}
