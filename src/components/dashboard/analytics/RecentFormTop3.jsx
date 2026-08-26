// src/components/dashboard/analytics/RecentFormTop3.jsx
// 대시보드(풋살·축구) 최상단 "최근 한 달 기세 TOP3" 카드.
//
// 누적 랭킹은 얼굴이 잘 안 바뀌어 지루하다는 요구에서 나온 카드다. 통화는 대시보드 POINT와
// 같게 두고 기간만 최근 30일로 자른 뒤, 총합이 아니라 **경기당 포인트**로 세운다
// (30일 창에서 총합으로 세우면 사실상 출석 랭킹이 된다).
//
// 대시보드는 로그_선수경기를 읽지 않으므로 이 컴포넌트가 자기 fetch를 소유한다(지연 로드) —
// DefenseTopCards와 같은 규약. 로그_매치는 필요 없어 네트워크는 1회만 는다.
import { useEffect, useMemo, useState } from 'react';
import AppSync from '../../../services/appSync';
import { calcRecentHotStreak as calcFutsal } from '../../../utils/analyticsV2';
import { calcRecentHotStreak as calcSoccer } from '../../../utils/soccerAnalytics';

// 평소 대비 변화가 이 비율 미만이면 방향을 단정하지 않는다.
// 절대 pt로 자르면 안 되는 이유: 분모 단위가 종목마다 달라 척도가 5배 벌어진다
// (실측 — 풋살 상위 5.2~6.5pt/경기, 축구 0.78~1.00pt/경기. 풋살의 '경기'는 세션 1회다). 절대 0.5pt 컷은 풋살엔
// 맞지만 축구에선 TOP3 전원이 "비슷"으로 뭉개졌다. 비율이면 두 종목에 같이 성립한다.
// 평소가 0점이던 선수는 비율이 무한대라 별도 분기 — 0에서 벗어난 것 자체가 방향이다.
const DELTA_RATIO = 0.2;

const md = (d) => (typeof d === 'string' && d.length >= 10 ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '');

function Row({ i, last, row, rank, C }) {
  const isFirst = i === 0;

  const stats = [
    row.goals > 0 && `골${row.goals}`,
    row.assists > 0 && `어시${row.assists}`,
    row.cleansheets > 0 && `CS${row.cleansheets}`,
    row.crova > 0 && `크로바${row.crova}`,
    row.goguma < 0 && `고구마${row.goguma}`,
    row.owngoalPts < 0 && `역주행${row.owngoalPts}`,
  ].filter(Boolean).join(' ');

  const sample = [
    rank ? `랭킹 ${rank}위` : null,
    `${row.games}경기`,
    `${row.points}pt`,
  ].filter(Boolean).join(' · ');

  const meaningful = row.hasBaseline && (
    row.basePpg > 0 ? Math.abs(row.delta) / row.basePpg >= DELTA_RATIO : row.delta !== 0
  );

  let form;
  if (!row.hasBaseline) {
    form = { color: C.gray, text: '평소 표본이 없어 최근 기록만' };
  } else if (!meaningful) {
    form = { color: C.gray, text: `─ 평소와 비슷 (평소 ${row.basePpg.toFixed(2)})` };
  } else if (row.delta > 0) {
    form = { color: C.green, text: `▲ 평소 ${row.basePpg.toFixed(2)} → +${row.delta.toFixed(2)}` };
  } else {
    form = { color: C.orange, text: `▼ 평소 ${row.basePpg.toFixed(2)} → ${row.delta.toFixed(2)}` };
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '28px 1fr auto',
      alignItems: 'center', gap: 12, padding: '12px 16px',
      borderBottom: last ? 'none' : `0.5px solid ${C.borderColor}`,
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: 999,
        background: isFirst ? C.accent : C.cardLight,
        color: isFirst ? '#fff' : C.gray,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
      }}>{i + 1}</div>

      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 15, fontWeight: 500, color: C.white,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{row.player}</div>
        <div style={{ fontSize: 11, color: C.gray, marginTop: 3 }}>
          {sample}{stats && ` · ${stats}`}
        </div>
        <div style={{ fontSize: 11, color: form.color, marginTop: 2 }}>{form.text}</div>
      </div>

      <div style={{ textAlign: 'right' }}>
        <div style={{
          fontSize: 20, fontWeight: 600, color: C.white,
          letterSpacing: '-0.022em', fontVariantNumeric: 'tabular-nums',
        }}>{row.ppg.toFixed(2)}</div>
        <div style={{ fontSize: 9, color: C.gray, marginTop: 1 }}>pt/경기</div>
      </div>
    </div>
  );
}

export function RecentFormTop3View({ playerGameLogs, activeSport, members = [], C, ds }) {
  const isSoccer = activeSport === '축구';
  const data = useMemo(
    () => (isSoccer ? calcSoccer : calcFutsal)({ playerLogs: playerGameLogs || [] }),
    [playerGameLogs, isSoccer]
  );

  // 랭킹은 대시보드가 이미 들고 있는 명부에서 만든다 — 추가 fetch 없음.
  // 정렬 축은 대시보드 카드들과 같은 POINT 내림차순.
  const rankMap = useMemo(() => {
    const m = {};
    [...members].sort((a, b) => (b.point || 0) - (a.point || 0))
      .forEach((p, i) => { if (p.name && !(p.name in m)) m[p.name] = i + 1; });
    return m;
  }, [members]);

  if (!data) return null;

  const range = `${md(data.cutoff)}~${md(data.anchor)}`;

  return (
    <div style={ds.section}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div style={ds.sectionTitle}>🔥 최근 한 달 기세 TOP3</div>
        <div style={{ fontSize: 10, color: C.gray, flexShrink: 0 }}>
          {range} · {data.sessions}일
        </div>
      </div>
      <div style={{
        background: C.card, border: `0.5px solid ${C.borderColor}`,
        borderRadius: 14, overflow: 'hidden',
      }}>
        {data.rows.map((row, i) => (
          <Row key={row.player} i={i} last={i === data.rows.length - 1}
            row={row} rank={rankMap[row.player]} C={C} />
        ))}
      </div>
      <div style={{ fontSize: 10, color: C.gray, marginTop: 6, lineHeight: 1.5 }}>
        대시보드 포인트를 최근 {data.windowDays}일치만 모아 경기당으로 환산 (최근 경기일 {data.anchor} 기준,
        {' '}{data.minGames}경기 이상). 평소 = 그 이전 전체
      </div>
    </div>
  );
}

export default function RecentFormTop3({ activeSport, members, C, ds }) {
  // 로드된 종목을 데이터와 한 덩어리로 들고 있는다 — 종목 전환 직후 이전 종목 카드가
  // 남는 걸 막는 loadedSport 가드(DefenseTopCards/PlayerAnalytics와 같은 규약).
  const [loaded, setLoaded] = useState({ sport: null, rows: [] });

  useEffect(() => {
    let alive = true;
    AppSync.getPlayerGameLog({ sport: activeSport })
      .then(res => { if (alive) setLoaded({ sport: activeSport, rows: res?.rows || [] }); })
      .catch(() => { if (alive) setLoaded({ sport: activeSport, rows: [] }); });
    return () => { alive = false; };
  }, [activeSport]);

  // 최상단이라 도착 시점에 아래 전체가 밀린다 — 카드 3행 높이만큼 자리를 잡아둔다.
  if (loaded.sport !== activeSport) {
    return (
      <div style={ds.section}>
        <div style={ds.sectionTitle}>🔥 최근 한 달 기세 TOP3</div>
        <div style={{
          background: C.card, border: `0.5px solid ${C.borderColor}`, borderRadius: 14,
          height: 216, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, color: C.gray,
        }}>불러오는 중...</div>
      </div>
    );
  }
  return <RecentFormTop3View playerGameLogs={loaded.rows} activeSport={activeSport} members={members} C={C} ds={ds} />;
}
