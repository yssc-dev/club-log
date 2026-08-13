import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import AppSync from '../../services/appSync';
import { fetchSheetData } from '../../services/sheetService';
import { getEffectiveSettings } from '../../config/settings';

import PersonalAnalysisTab from './analytics/PersonalAnalysisTab';
import SynergyMatrixTab from './analytics/SynergyMatrixTab';
import ChemistryTab from './analytics/ChemistryTab';
import AwardsTab from './analytics/AwardsTab';
import CrovaGogumaRankTab from './analytics/CrovaGogumaRankTab';

const LEGACY_TAB_MAP = {
  playercard: 'personal',
  halloffame: 'personal',
  trio: 'chem',
};

export default function PlayerAnalytics({ teamName, teamMode, initialTab, isAdmin, authUserName }) {
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

  const initial = initialTab && LEGACY_TAB_MAP[initialTab] ? LEGACY_TAB_MAP[initialTab] : (initialTab || 'personal');
  const [tab, setTab] = useState(initial);

  useEffect(() => {
    const sport = isSoccer ? '축구' : '풋살';
    setLoading(true);
    Promise.all([
      fetchSheetData().catch(() => null),
      AppSync.getMatchLog({ sport }).catch(() => ({ rows: [] })),
      AppSync.getEventLog({ sport }).catch(() => ({ rows: [] })),
      AppSync.getPlayerGameLog({ sport }).catch(() => ({ rows: [] })),
    ]).then(([sheetData, matchRes, eventRes, pgRes]) => {
      if (sheetData) setMembers(sheetData.players);
      setMatchLogs(matchRes?.rows || []);
      setEventLogs(eventRes?.rows || []);
      setPlayerGameLogs(pgRes?.rows || []);
      setLoadedSport(sport);
    }).finally(() => setLoading(false));
  }, [teamName, isSoccer]);

  const settings = useMemo(() => getEffectiveSettings(teamName, isSoccer ? '축구' : '풋살'), [teamName, isSoccer]);
  const showCrovaGoguma = !isSoccer && settings?.useCrovaGoguma === true && teamName === '마스터FC';

  const tabs = [
    { key: "personal", label: "개인분석" },
    { key: "synergy", label: "시너지매트릭스" },
    { key: "chem", label: "케미" },
    { key: "awards", label: "어워드" },
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

      {tab === "personal" && (
        <PersonalAnalysisTab
          playerGameLogs={playerGameLogs} matchLogs={matchLogs} eventLogs={eventLogs}
          members={members || []} C={C} authUserName={authUserName} isSoccer={isSoccer}
        />
      )}
      {tab === "synergy" && <SynergyMatrixTab matchLogs={matchLogs} C={C} isSoccer={isSoccer} />}
      {tab === "chem" && <ChemistryTab matchLogs={matchLogs} eventLogs={eventLogs} C={C} isSoccer={isSoccer} />}
      {tab === "awards" && <AwardsTab playerGameLogs={playerGameLogs} matchLogs={matchLogs} eventLogs={eventLogs} C={C} isSoccer={isSoccer} />}
      {tab === "crovaguma" && showCrovaGoguma && (
        <CrovaGogumaRankTab members={members || []} C={C} />
      )}
    </div>
  );
}
