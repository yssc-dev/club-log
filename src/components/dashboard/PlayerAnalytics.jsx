import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import SheetCache from '../../services/sheetCache';
import { fetchSheetData } from '../../services/sheetService';
import { getEffectiveSettings } from '../../config/settings';

import PersonalAnalysisTab from './analytics/PersonalAnalysisTab';
import ChemistryTab from './analytics/ChemistryTab';
import AwardsTab from './analytics/AwardsTab';
import CrovaGogumaRankTab from './analytics/CrovaGogumaRankTab';
import LegacyDataNotice from './analytics/LegacyDataNotice';
import RoleRecordTab from './analytics/RoleRecordTab';
import { isIntraSquadTeam } from '../../utils/intraSoccer/isIntraSquadTeam';

const LEGACY_TAB_MAP = {
  playercard: 'personal',
  halloffame: 'personal',
  trio: 'chem',
};

export default function PlayerAnalytics({ teamName, teamMode, initialTab, isAdmin, authUserName, skipDashboardSheet = false }) {
  const isSoccer = teamMode === "축구";
  const { C } = useTheme();
  const [loading, setLoading] = useState(true);
  // 현재 state의 로그가 어느 종목 것인지. 겸직 팀이 종목을 토글하면 setLoading(true)는
  // effect(페인트 후)에서 실행되므로, 이 가드가 없으면 새 isSoccer + 옛 종목 데이터로
  // 한 프레임이 그려진다(셰도잉 함수·useMemo 캐시 불일치 창).
  const [loadedSport, setLoadedSport] = useState(null);
  const [members, setMembers] = useState(null);
  const [playerGameLogs, setPlayerGameLogs] = useState([]);
  const [matchLogs, setMatchLogs] = useState([]);
  const [eventLogs, setEventLogs] = useState([]);
  // 로그 조회 실패 문구(시트명 + 서버 메시지). 예전엔 .catch(() => []) 가 삼켜 "0경기"만 남았다.
  const [loadError, setLoadError] = useState(null);

  const initial = initialTab && LEGACY_TAB_MAP[initialTab] ? LEGACY_TAB_MAP[initialTab] : (initialTab || 'personal');
  const [tab, setTab] = useState(initial);

  useEffect(() => {
    const sport = isSoccer ? '축구' : '풋살';
    setLoading(true);
    // 실패한 로그는 [] 로 대체하되 원인은 모아서 화면에 띄운다 — 지표는 불러온 것만으로 그리고,
    // "0경기" 대신 "조회 실패: 원인" 이 보이게 한다.
    const failures = [];
    const logOrEmpty = (dataset) => SheetCache.get(dataset, { sport }).catch(e => {
      failures.push(e?.message || `${dataset} 조회 실패`);
      return [];
    });
    Promise.all([
      // 스펙 §15: 로그 시트만 쓰는 팀은 대시보드 명단을 읽지 않는다 — members=null 은 조회 실패 때와
      // 같은 기존 경로(명단 = 기록에 나온 선수).
      skipDashboardSheet ? Promise.resolve(null) : fetchSheetData().catch(() => null),
      logOrEmpty('matchLog'),
      logOrEmpty('eventLog'),
      logOrEmpty('playerGameLog'),
    ]).then(([sheetData, matchRows, eventRows, pgRows]) => {
      if (sheetData) setMembers(sheetData.players);
      setMatchLogs(matchRows || []);
      setEventLogs(eventRows || []);
      setPlayerGameLogs(pgRows || []);
      setLoadError(failures.length ? failures.join(' · ') : null);
      setLoadedSport(sport);
    }).finally(() => setLoading(false));
  }, [teamName, isSoccer, skipDashboardSheet]);

  const settings = useMemo(() => getEffectiveSettings(teamName, isSoccer ? '축구' : '풋살'), [teamName, isSoccer]);
  const showCrovaGoguma = !isSoccer && settings?.useCrovaGoguma === true && teamName === '마스터FC';
  // 역할(영상촬영·주심·부심)은 축구 전용 — 풋살 로그_매치에는 roles_json 이 항상 빈칸이다.
  // 빅마스터FC(자체전) 는 IntraSoccerMatchView 에 역할 지정 진입점이 없어 영구히 빈 상태만
  // 뜨므로 탭 자체를 숨긴다 — 자체전에 역할을 주려면 그 진입점을 먼저 만드는 별도 작업이 필요하다.
  const showRoles = isSoccer && !isIntraSquadTeam(teamName, '축구');

  const tabs = [
    { key: "personal", label: "개인분석" },
    { key: "chem", label: "케미" },
    { key: "awards", label: "어워드" },
    showRoles && { key: "roles", label: "역할" },
    showCrovaGoguma && { key: "crovaguma", label: "🍀/🍠" },
  ].filter(Boolean);

  // loadedSport 불일치 = 종목 토글 직후 effect가 아직 안 돈 프레임 — 옛 종목 데이터로 그리지 않는다
  if (loading || loadedSport !== (isSoccer ? '축구' : '풋살')) return <div style={{ textAlign: "center", padding: 30, color: C.gray }}>불러오는 중...</div>;

  return (
    <div>
      <div style={{ display: "flex", gap: 6, overflow: "auto", marginBottom: 14, paddingBottom: 4 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: "6px 12px", borderRadius: 50, fontSize: 11, fontWeight: 600,
              background: tab === t.key ? C.accent : "transparent",
              color: tab === t.key ? C.black : C.gray,
              border: `1px solid ${tab === t.key ? C.accent : C.grayDarker}`,
              whiteSpace: "nowrap", cursor: "pointer",
            }}>{t.label}</button>
        ))}
      </div>
      {loadError && (
        <div style={{
          display: 'flex', gap: 6, alignItems: 'flex-start',
          padding: '8px 10px', marginBottom: 10, borderRadius: 8,
          background: C.card, border: `1px solid ${C.red}`,
          fontSize: 10, color: C.gray, lineHeight: 1.5,
        }}>
          <span style={{ flexShrink: 0 }}>⚠️</span>
          <span>
            <b style={{ color: C.red }}>기록 조회 실패</b> — {loadError}
            <br />아래 지표는 불러온 데이터만으로 계산됐습니다. 새로고침해도 같으면 설정의 「구글시트에서 다시 불러오기」를 눌러 주세요.
          </span>
        </div>
      )}
      {/* 모든 분석 지표가 같은 한계를 공유하므로 서브탭 위(상단)에 한 번만 띄운다 */}
      {isSoccer && <LegacyDataNotice matchLogs={matchLogs} C={C} />}

      {tab === "personal" && (
        <PersonalAnalysisTab
          playerGameLogs={playerGameLogs} matchLogs={matchLogs} eventLogs={eventLogs}
          members={members || []} C={C} authUserName={authUserName} isSoccer={isSoccer}
        />
      )}
      {tab === "chem" && <ChemistryTab matchLogs={matchLogs} eventLogs={eventLogs} C={C} isSoccer={isSoccer} />}
      {tab === "awards" && <AwardsTab playerGameLogs={playerGameLogs} matchLogs={matchLogs} eventLogs={eventLogs} C={C} isSoccer={isSoccer} />}
      {tab === "roles" && showRoles && <RoleRecordTab matchLogs={matchLogs} C={C} />}
      {tab === "crovaguma" && showCrovaGoguma && (
        <CrovaGogumaRankTab members={members || []} C={C} />
      )}
    </div>
  );
}
