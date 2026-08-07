import { useState, useEffect, useRef } from 'react';
import AuthUtil from './services/authUtil';
import AppSync from './services/appSync';
import FirebaseSync from './services/firebaseSync';
import LoginScreen from './components/auth/LoginScreen';
import HomeScreen from './components/home/HomeScreen';
import TeamDashboard from './components/dashboard/TeamDashboard';
import HistoryView from './components/history/HistoryView';
import SettingsScreen from './components/common/SettingsScreen';
import { loadSettingsFromFirebase } from './config/settings';
import App from './App';
import SoccerApp from './SoccerApp';
import TennisApp from './TennisApp';

// 팀 배열 → { teamName: [{mode, role}, ...] } 그룹. 순수 함수라 모듈 스코프(초기 state에서도 사용).
function groupTeams(teams) {
  const groups = {};
  (teams || []).forEach(t => {
    if (!groups[t.team]) groups[t.team] = [];
    groups[t.team].push({ mode: t.mode, role: t.role });
  });
  return groups;
}

export default function Root() {
  // AuthUtil.getStored()를 한 번만 호출하여 초기 상태 설정
  const [initialStored] = useState(() => AuthUtil.getStored());
  const [authed, setAuthed] = useState(() => !!initialStored);
  const [authUser, setAuthUser] = useState(() =>
    initialStored ? { name: initialStored.name, phone4: initialStored.phone4 } : null
  );
  // 세션 복원 시에도 팀 목록을 캐시에서 복구 → 팀전환이 로그아웃되지 않고 즉시 동작.
  const [allTeams, setAllTeams] = useState(() => AuthUtil.getStoredTeams() || []);
  const [teamGroups, setTeamGroups] = useState(() => groupTeams(AuthUtil.getStoredTeams() || []));
  const [selectedTeamName, setSelectedTeamName] = useState(() => initialStored?.team || null);
  const [selectedTeamEntries, setSelectedTeamEntries] = useState(() =>
    initialStored?.team ? [{ mode: initialStored.mode || "풋살", role: initialStored.role || "멤버" }] : []
  );
  const [teamContext, setTeamContext] = useState(() =>
    initialStored?.team ? { team: initialStored.team, mode: initialStored.mode || "풋살", role: initialStored.role || "멤버" } : null
  );
  const [screen, setScreen] = useState(() => initialStored?.team ? "dashboard" : "login");
  // 다중 경기 지원: pendingGames = [{gameId, state, savedAt}, ...]
  const [pendingGames, setPendingGames] = useState([]);
  const [checkingPending, setCheckingPending] = useState(false);
  const [isNewGame, setIsNewGame] = useState(false);
  const [gameMode, setGameMode] = useState(null);
  const [activeGameId, setActiveGameId] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 1회만 실행 (저장된 팀이 있으면 pending 체크)
  useEffect(() => {
    if (screen === "dashboard" && selectedTeamName) {
      checkPendingGames(selectedTeamName, teamContext?.mode);
      loadSettingsFromFirebase(selectedTeamName, selectedTeamEntries);
    }
  }, []);

  // 다른 화면에서 대시보드로 복귀 시 pendingGames 재조회 (경기 확정 후 상태 반영)
  const prevScreenRef = useRef(screen);
  useEffect(() => {
    if (screen === "dashboard" && prevScreenRef.current !== "dashboard" && selectedTeamName) {
      checkPendingGames(selectedTeamName, teamContext?.mode);
    }
    prevScreenRef.current = screen;
  }, [screen, selectedTeamName]);

  const checkPendingGames = (teamName, mode) => {
    setCheckingPending(true);
    setPendingGames([]);

    FirebaseSync.loadAllActiveReconstructed(teamName).then(fbGames => {
      const validGames = fbGames.filter(g => {
        if (!g.state || g.state.phase === "setup") return false;
        // 종목이 다른 경기는 이 화면의 목록에 넣지 않는다.
        const gameSport = g.state.sport || (g.state.matchMode === "soccer" ? "축구" : "풋살");
        return !mode || gameSport === mode;
      });
      setPendingGames(validGames);
    }).catch(() => { }).finally(() => setCheckingPending(false));
  };

  const handleLogin = (user, teams) => {
    setAuthUser(user);
    setAllTeams(teams);
    AuthUtil.saveTeams(teams); // 팀전환/복원용 캐시
    setAuthed(true);
    const groups = groupTeams(teams);
    setTeamGroups(groups);
    const teamNames = Object.keys(groups);
    if (teamNames.length === 1) {
      const tName = teamNames[0];
      const entries = groups[tName];
      selectTeam(tName, entries, user);
      return;
    }
    const fav = AuthUtil.getFavoriteTeam(user);
    if (fav && groups[fav]) {
      selectTeam(fav, groups[fav], user);
      return;
    }
    setScreen("home");
  };

  const selectTeam = (teamName, entries, user) => {
    setSelectedTeamName(teamName);
    setSelectedTeamEntries(entries);
    const first = entries[0] || { mode: "풋살", role: "멤버" };
    const tc = { team: teamName, mode: first.mode, role: first.role };
    setTeamContext(tc);
    const u = user || authUser;
    AuthUtil.save(u.name, u.phone4, teamName, first.mode, first.role);
    setScreen("dashboard");
    checkPendingGames(teamName, first.mode);
    loadSettingsFromFirebase(teamName, entries);
  };

  const handleLogout = () => {
    AuthUtil.clear();
    setAuthed(false);
    setAuthUser(null);
    setAllTeams([]);
    setTeamGroups({});
    setSelectedTeamName(null);
    setSelectedTeamEntries([]);
    setTeamContext(null);
    setScreen("login");
    setPendingGames([]);
    setGameMode(null);
    setActiveGameId(null);
  };

  const handleStartNew = async (mode) => {
    // 진행중 경기가 있으면 알림
    if (pendingGames.length > 0) {
      const creators = pendingGames.map(g => g.state?.gameCreator || g.state?.lastEditor || "알 수 없음");
      const msg = creators.map((c, i) => `${i + 1}. ${c}님의 경기`).join("\n");
      if (!confirm(`이미 진행중인 경기가 있습니다:\n\n${msg}\n\n그래도 새 경기를 추가하시겠습니까?`)) return;
    }

    const newGameId = `g_${Date.now()}`;
    setIsNewGame(true);
    setGameMode(mode);
    setActiveGameId(newGameId);
    setScreen("app");
  };

  const handleContinue = (gameId) => {
    setIsNewGame(false);
    setGameMode(null);
    setActiveGameId(gameId);
    setScreen("app");
  };

  const handleSwitchTeam = async () => {
    // 캐시/로그인으로 팀 목록이 있으면 즉시 홈(팀 선택)으로 — 세션 유지(로그아웃 안 함)
    if (allTeams.length > 0) {
      setTeamGroups(groupTeams(allTeams));
      setScreen("home");
      setPendingGames([]);
      return;
    }
    // 캐시가 없는 구 세션 등: 저장된 자격으로 팀 목록만 재조회 — 로그아웃 대신
    const stored = AuthUtil.getStored();
    if (stored?.name) {
      try {
        const result = await AppSync.verifyAuth(stored.name, stored.phone4);
        if (result?.success && Array.isArray(result.teams) && result.teams.length > 0) {
          setAllTeams(result.teams);
          AuthUtil.saveTeams(result.teams);
          setTeamGroups(groupTeams(result.teams));
          setScreen("home");
          setPendingGames([]);
          return;
        }
      } catch (e) { /* 재조회 실패 시 아래 로그아웃 폴백 */ }
    }
    handleLogout();
  };

  if (screen === "login" || !authed) return <LoginScreen onLogin={handleLogin} />;

  if (screen === "home") {
    return <HomeScreen authUser={authUser} teamGroups={teamGroups} selectedTeamName={selectedTeamName} onSelectTeam={(name, entries) => selectTeam(name, entries)} onLogout={handleLogout} />;
  }

  if (screen === "dashboard") {
    return <TeamDashboard authUser={authUser} teamName={selectedTeamName} teamEntries={selectedTeamEntries}
      pendingGames={pendingGames} checkingPending={checkingPending}
      onStartGame={handleStartNew} onContinueGame={handleContinue}
      onViewHistory={() => setScreen("history")} onSettings={() => setScreen("settings")} onSwitchTeam={handleSwitchTeam} onLogout={handleLogout} />;
  }

  if (screen === "history") {
    return <HistoryView teamContext={teamContext} onBack={() => setScreen("dashboard")} />;
  }

  if (screen === "settings") {
    return <SettingsScreen teamName={selectedTeamName} teamMode={teamContext?.mode} teamEntries={selectedTeamEntries} isAdmin={teamContext?.role === "관리자"} onBack={() => setScreen("dashboard")} />;
  }

  const GameApp = teamContext?.mode === "축구" ? SoccerApp
    : teamContext?.mode === "테니스" ? TennisApp
    : App;
  return <GameApp authUser={authUser} teamContext={teamContext} isNewGame={isNewGame} gameMode={gameMode} gameId={activeGameId}
    onLogout={handleLogout} onBackToMenu={() => { setIsNewGame(false); setGameMode(null); setActiveGameId(null); setScreen("dashboard"); setTimeout(() => { if (selectedTeamName) checkPendingGames(selectedTeamName, teamContext?.mode); else setPendingGames([]); }, 1500); }} />;
}
