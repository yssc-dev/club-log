import { useState, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { BackIcon } from './icons';
import {
  getEffectiveSettings, SPORT_DEFAULTS, PRESETS,
  saveSettings, getSourceOf, loadSettingsFromFirebase,
} from '../../config/settings';
import AppSync from '../../services/appSync';
import FirebaseSync from '../../services/firebaseSync';
import { buildRoundRowsFromFutsal, buildRoundRowsFromSoccer } from '../../utils/matchRowBuilder';
import { recoverFinalizedStateFromSheets } from '../../utils/recoverFinalizedFromSheets';

export default function SettingsScreen({ teamName, teamMode, teamEntries, isAdmin, onBack }) {
  const isSoccer = teamMode === "축구";
  const isTennis = teamMode === "테니스";
  const { C } = useTheme();
  const sport = teamMode;
  const [settings, setSettings] = useState(() => getEffectiveSettings(teamName, sport));
  const [currentPreset, setCurrentPreset] = useState(() => settings._meta?.preset);
  const [saved, setSaved] = useState(false);
  const [sheetList, setSheetList] = useState([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [presetChangeDialog, setPresetChangeDialog] = useState(null);
  const [fbMigrating, setFbMigrating] = useState(false);
  const [fbMigrateResult, setFbMigrateResult] = useState(null);
  const [recovering, setRecovering] = useState(false);
  const [recoverResult, setRecoverResult] = useState(null);
  // null | { newPreset, diffs: [{key, from, to}], overrides: {k:v} }

  useEffect(() => {
    setLoadingSheets(true);
    AppSync.getSheetList().then(list => setSheetList(list)).finally(() => setLoadingSheets(false));
  }, []);

  // Firebase async load가 Root의 fire-and-forget보다 늦으면 초기 state가 fallback(defaults)으로 고정됨.
  // 마운트 시 다시 await해서 cache 확정 후 state 재동기화. 사용자가 편집 시작한 경우(_meta.preset 이미 있음)는 덮지 않음.
  useEffect(() => {
    if (settings._meta?.preset) return;
    let cancelled = false;
    loadSettingsFromFirebase(teamName, teamEntries || [{ mode: sport }]).then(() => {
      if (cancelled) return;
      const fresh = getEffectiveSettings(teamName, sport);
      setSettings(fresh);
      setCurrentPreset(fresh._meta?.preset);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 1회만
  }, []);

  // "기본:" 라벨은 현재 프리셋의 기본값을 반영 (프리셋에 없으면 sport default로 폴백)
  const getDefaultFor = (key) => {
    const presetVal = PRESETS[sport]?.[currentPreset]?.values?.[key];
    return presetVal !== undefined ? presetVal : SPORT_DEFAULTS[sport]?.[key];
  };

  const update = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    await saveSettings(teamName, sport, settings, currentPreset);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = async () => {
    if (!confirm("이 종목 설정을 프리셋 기본값으로 초기화하시겠습니까?")) return;
    const sportDef = SPORT_DEFAULTS[sport] || {};
    const presetValues = PRESETS[sport]?.[currentPreset]?.values || {};
    const resetSettings = {
      ...settings,  // shared 보존
      ...sportDef,
      ...presetValues,
    };
    setSettings(resetSettings);
    await saveSettings(teamName, sport, resetSettings, currentPreset);
    setSaved(true);
  };

  const handlePresetChange = (newPreset) => {
    if (newPreset === currentPreset) return;
    const newPresetValues = PRESETS[sport]?.[newPreset]?.values || {};
    const oldPresetValues = PRESETS[sport]?.[currentPreset]?.values || {};
    const sportDef = SPORT_DEFAULTS[sport] || {};

    const before = { ...sportDef, ...oldPresetValues };
    const after = { ...sportDef, ...newPresetValues };
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const diffs = [];
    for (const k of keys) {
      if (before[k] !== after[k]) diffs.push({ key: k, from: before[k], to: after[k] });
    }

    // 현재 오버라이드 추출 (지금 settings와 preset+defaults 비교)
    const combined = { ...sportDef, ...oldPresetValues };
    const overrides = {};
    for (const k of Object.keys(settings)) {
      if (k === "_meta" || k.startsWith("_")) continue;
      if (SPORT_DEFAULTS[sport] && !(k in SPORT_DEFAULTS[sport]) && !(k in oldPresetValues)) continue;
      if (settings[k] !== combined[k]) overrides[k] = settings[k];
    }

    setPresetChangeDialog({ newPreset, diffs, overrides });
  };

  async function runFirebasePhaseMigration() {
    if (!teamName) return;
    const ok = window.confirm(
      `[관리자] Firebase stateJSON → 로그_매치 정확 덮어쓰기\n\nteam=${teamName} sport=${sport}\n\n최근 확정 세션들의 날짜에 해당하는 로그_매치 rows를 삭제한 뒤 정확한 rows로 재기록합니다. 계속하시겠습니까?`
    );
    if (!ok) return;
    setFbMigrating(true);
    setFbMigrateResult(null);
    try {
      const history = await FirebaseSync.loadFinalizedAll(teamName);
      const buildFn = sport === '축구' ? buildRoundRowsFromSoccer : buildRoundRowsFromFutsal;
      const datesTouched = new Set();
      const allRows = [];
      for (const h of history) {
        if (!h.stateJson) continue;
        let gs;
        try { gs = JSON.parse(h.stateJson); } catch { continue; }
        const rows = buildFn({ team: teamName, mode: '기본', tournamentId: '', date: h.gameDate, stateJSON: gs, inputTime: h.savedAt || '' });
        if (rows.length > 0) { datesTouched.add(h.gameDate); allRows.push(...rows); }
      }
      for (const date of datesTouched) {
        await AppSync.deleteMatchLogByDate({ sport, date });
      }
      const BATCH = 200;
      let total = 0;
      for (let i = 0; i < allRows.length; i += BATCH) {
        const res = await AppSync.writeMatchLog(allRows.slice(i, i + BATCH));
        total += (res && res.count) || 0;
      }
      setFbMigrateResult({ ok: true, dates: datesTouched.size, rows: total });
    } catch (err) {
      setFbMigrateResult({ ok: false, error: String(err?.message || err) });
    } finally {
      setFbMigrating(false);
    }
  }

  async function runRecoverFinalized() {
    if (!teamName) return;
    const date = window.prompt('복구할 경기 날짜 (YYYY-MM-DD)\n로그_매치/로그_이벤트/로그_선수경기 시트 데이터로 finalized state를 재구성합니다.');
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      if (date) alert('YYYY-MM-DD 형식으로 입력하세요');
      return;
    }
    setRecovering(true);
    setRecoverResult(null);
    try {
      const snap = getEffectiveSettings(teamName, sport);
      const { gameId, state, summary } = await recoverFinalizedStateFromSheets({
        team: teamName,
        date,
        settingsSnapshot: snap,
      });
      const ok = window.confirm(
        `${date} 복구 미리보기\n\n` +
        `gameId: ${gameId}\n` +
        `매치: ${summary.matches}경기\n` +
        `이벤트: ${summary.events}건\n` +
        `선수경기 row: ${summary.players}명\n` +
        `참석자: ${summary.attendeesCount}명\n` +
        `팀: ${summary.teamNames.join(', ')}\n\n` +
        `Firebase finalized 에 저장하시겠습니까?\n(이미 동일 gameId가 있으면 덮어씀)`
      );
      if (!ok) { setRecoverResult({ ok: false, error: '취소됨' }); return; }
      await FirebaseSync.saveFinalized(teamName, gameId, state);
      setRecoverResult({ ok: true, gameId, ...summary });
    } catch (err) {
      setRecoverResult({ ok: false, error: String(err?.message || err) });
    } finally {
      setRecovering(false);
    }
  }

  const applyPresetChange = (keepOverrides) => {
    if (!presetChangeDialog) return;
    const { newPreset, overrides } = presetChangeDialog;
    const newPresetValues = PRESETS[sport]?.[newPreset]?.values || {};
    const sportDef = SPORT_DEFAULTS[sport] || {};

    // settings 재구성
    const newSettings = { ...settings, ...sportDef, ...newPresetValues };
    if (keepOverrides) {
      Object.assign(newSettings, overrides);
    }

    setCurrentPreset(newPreset);
    setSettings({ ...newSettings, _meta: { ...settings._meta, preset: newPreset } });
    setPresetChangeDialog(null);
    setSaved(false);
  };

  const ss = {
    container: { background: "var(--app-bg-grouped)", minHeight: "100vh",
                 color: "var(--app-text-primary)",
                 fontFamily: "var(--app-font-sans)", letterSpacing: "-0.014em",
                 maxWidth: 500, margin: "0 auto", padding: "0 0 40px" },
    header: { padding: "24px 20px 12px", background: "var(--app-bg-grouped)",
              position: "sticky", top: 0, zIndex: 100 },
    section: { padding: "0 16px", marginBottom: 20 },
    row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
    label: { fontSize: 15, color: "var(--app-text-primary)", flex: 1, fontWeight: 400 },
    select: {
      maxWidth: 200, padding: "6px 10px", borderRadius: 8,
      border: "0.5px solid var(--app-divider)",
      background: "var(--app-bg-row)", color: "var(--app-text-primary)",
      fontSize: 15, outline: "none", appearance: "auto",
      fontFamily: "inherit",
    },
    input: {
      flex: 1, maxWidth: 200, padding: "6px 10px", borderRadius: 8,
      border: "0.5px solid var(--app-divider)",
      background: "var(--app-bg-row)", color: "var(--app-text-primary)",
      fontSize: 15, outline: "none", boxSizing: "border-box",
      fontFamily: "inherit",
    },
    numInput: {
      width: 72, padding: "6px 8px", borderRadius: 8,
      border: "0.5px solid var(--app-divider)",
      background: "var(--app-bg-row)", color: "var(--app-text-primary)",
      fontSize: 15, textAlign: "center", outline: "none",
      fontFamily: "inherit", fontVariantNumeric: "tabular-nums",
    },
    hint: { fontSize: 12, color: "var(--app-text-tertiary)" },
    btn: (bg, color) => ({
      padding: "12px 16px", borderRadius: 12, border: "none", background: bg, color: color || "#fff",
      fontSize: 16, fontWeight: 600, cursor: "pointer", width: "100%",
      fontFamily: "inherit", letterSpacing: "-0.01em",
    }),
  };

  const iconBtnStyle = {
    background: "var(--app-bg-row)",
    border: "0.5px solid var(--app-divider)",
    borderRadius: 999, width: 36, height: 36,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    color: "var(--app-text-primary)", cursor: "pointer",
    padding: 0,
  };

  const SheetSelect = ({ value, onChange, label }) => (
    <div style={ss.row}>
      <span style={ss.label}>{label}</span>
      {sheetList.length > 0 ? (
        <select style={ss.select} value={value} onChange={e => onChange(e.target.value)}>
          {!sheetList.find(s => s.name === value) && <option value={value}>{value}</option>}
          {sheetList.map(s => <option key={s.gid} value={s.name}>{s.name}</option>)}
        </select>
      ) : (
        <input style={ss.input} value={value} onChange={e => onChange(e.target.value)}
          placeholder={loadingSheets ? "불러오는 중..." : "시트 이름 입력"} />
      )}
    </div>
  );

  const SourceBadge = ({ k }) => {
    const src = getSourceOf(teamName, sport, k);
    const config = {
      preset:   { color: "#5b9bff", label: "프리셋" },
      override: { color: "#ffb84d", label: "오버라이드" },
      shared:   { color: "#9c9c9c", label: "공용" },
      default:  { color: "#9c9c9c", label: "표준" },
    }[src] || { color: "#9c9c9c", label: "표준" };
    return (
      <span style={{ fontSize: 10, color: config.color, marginLeft: 6 }}>
        ●{config.label}
      </span>
    );
  };

  const NumRow = ({ label, value, onChange, defaultVal, suffix, settingKey }) => (
    <div style={ss.row}>
      <span style={{ ...ss.label, minWidth: 0 }}>
        {label}
        {settingKey && <SourceBadge k={settingKey} />}
      </span>
      <input type="number" style={ss.numInput} value={value} onChange={e => onChange(Number(e.target.value))} />
      {/* 프리셋/기본값과 다를 때만 원복 기준 힌트 노출 — width는 고정해 레이아웃 유지 */}
      <span style={{ ...ss.hint, width: 60, textAlign: "right", flexShrink: 0 }}>
        {value !== defaultVal ? `기본: ${defaultVal}${suffix || ""}` : ""}
      </span>
    </div>
  );

  return (
    <div style={ss.container}>
      <div style={ss.header}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.022em",
                       margin: 0, color: "var(--app-text-primary)" }}>설정</h1>
          <button onClick={onBack} style={iconBtnStyle} aria-label="돌아가기">
            <BackIcon width={16} />
          </button>
        </div>
        <div style={{ fontSize: 15, color: "var(--app-text-secondary)", marginTop: 4 }}>{teamName}</div>
      </div>

      {!isTennis && (
      <div style={ss.section}>
        <div className="app-section-label">구글시트 설정</div>
        <div className="app-grouped">
          <div className="app-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6, padding: "12px 16px" }}>
            <div style={{ fontSize: 13, color: "var(--app-text-secondary)" }}>구글시트 ID</div>
            <input className="app-input" style={{ width: "100%" }} value={settings.sheetId}
              onChange={e => update("sheetId", e.target.value)} />
            <div style={ss.hint}>구글시트 URL에서 /d/ 뒤의 값</div>
          </div>
          <div className="app-row"><SheetSelect label="참석명단 시트" value={settings.attendanceSheet} onChange={v => update("attendanceSheet", v)} /></div>
          <div className="app-row"><SheetSelect label="대시보드 시트" value={settings.dashboardSheet} onChange={v => update("dashboardSheet", v)} /></div>
          <div className="app-row"><SheetSelect label="포인트로그 시트" value={settings.pointLogSheet} onChange={v => update("pointLogSheet", v)} /></div>
          <div className="app-row"><SheetSelect label="선수별집계 시트" value={settings.playerLogSheet} onChange={v => update("playerLogSheet", v)} /></div>
        </div>
      </div>
      )}

      <div style={ss.section}>
        <div className="app-section-label">경기규칙 설정</div>
        <div className="app-grouped">
          <div className="app-row">
            <div style={ss.row}>
              <span style={ss.label}>경기규칙 프리셋</span>
              <select
                style={ss.select}
                value={currentPreset || ""}
                onChange={e => handlePresetChange(e.target.value)}
              >
                {Object.keys(PRESETS[sport] || {}).map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
          {PRESETS[sport]?.[currentPreset]?.description && (
            <div className="app-row" style={{ padding: "8px 16px" }}>
              <span style={ss.hint}>{PRESETS[sport][currentPreset].description}</span>
            </div>
          )}
          {isSoccer ? (
            <>
              <div className="app-row"><NumRow label="자책골 포인트" value={settings.ownGoalPoint} onChange={v => update("ownGoalPoint", v)} defaultVal={getDefaultFor("ownGoalPoint")} settingKey="ownGoalPoint" /></div>
              <div className="app-row"><NumRow label="클린시트 포인트" value={settings.cleanSheetPoint} onChange={v => update("cleanSheetPoint", v)} defaultVal={getDefaultFor("cleanSheetPoint")} settingKey="cleanSheetPoint" /></div>
            </>
          ) : isTennis ? (
            <>
              <SegToggle label="타이브레이크 시"
                options={[['7point', '노애드 7점'], ['1point', '단판 1점']]}
                value={settings.scoringRules?.tiebreakMode ?? '7point'}
                onPick={(v) => update('scoringRules', { ...(settings.scoringRules || {}), tiebreakMode: v })} />
              <SegToggle label="에이스·더블폴트"
                options={[[false, '분석 전용'], [true, '점수 반영']]}
                value={settings.scoringRules?.acesDfAffectScore ?? false}
                onPick={(v) => update('scoringRules', { ...(settings.scoringRules || {}), acesDfAffectScore: v })} />
            </>
          ) : (
            <>
              {/* 기존 풋살 블록 그대로 — 크로바/고구마·자책골. 수정 금지 */}
              <div className="app-row">
                <div style={ss.row}>
                  <label style={ss.label}>
                    <input type="checkbox"
                      checked={!!settings.useCrovaGoguma}
                      onChange={e => update("useCrovaGoguma", e.target.checked)}
                      style={{ marginRight: 8, accentColor: "var(--app-blue)" }} />
                    크로바/고구마 사용<SourceBadge k="useCrovaGoguma" />
                  </label>
                  {(!!settings.useCrovaGoguma !== !!getDefaultFor("useCrovaGoguma")) && (
                    <span style={ss.hint}>기본: {getDefaultFor("useCrovaGoguma") ? "켜짐" : "꺼짐"}</span>
                  )}
                </div>
              </div>
              <div className="app-row"><NumRow label="자책골 포인트" value={settings.ownGoalPoint} onChange={v => update("ownGoalPoint", v)} defaultVal={getDefaultFor("ownGoalPoint")} settingKey="ownGoalPoint" /></div>
              {settings.useCrovaGoguma && (
                <>
                  <div className="app-row"><NumRow label="크로바(1위팀)" value={settings.crovaPoint} onChange={v => update("crovaPoint", v)} defaultVal={getDefaultFor("crovaPoint")} settingKey="crovaPoint" /></div>
                  <div className="app-row"><NumRow label="고구마(꼴찌팀)" value={settings.gogumaPoint} onChange={v => update("gogumaPoint", v)} defaultVal={getDefaultFor("gogumaPoint")} settingKey="gogumaPoint" /></div>
                  <div className="app-row"><NumRow label="황금크로바/탄고구마" value={settings.bonusMultiplier} onChange={v => update("bonusMultiplier", v)} defaultVal={getDefaultFor("bonusMultiplier")} suffix="배" settingKey="bonusMultiplier" /></div>
                </>
              )}
            </>
          )}
        </div>
        {!isSoccer && !isTennis && settings.useCrovaGoguma && (
          <>
            <div style={{ fontSize: 12, color: "var(--app-text-tertiary)", padding: "8px 16px 0" }}>
              ※ 크로바/고구마 점수는 2구장 경기에서만 적용됩니다.
            </div>
            <details style={{ fontSize: 13, color: "var(--app-text-secondary)", margin: "8px 0", padding: "0 16px" }}>
              <summary style={{ cursor: "pointer", padding: "6px 0" }}>황금크로바 / 탄고구마 설명</summary>
              <div style={{ background: "var(--app-bg-row)", borderRadius: 10, padding: 12, marginTop: 4, border: "0.5px solid var(--app-divider)" }}>
                시즌 누적 크로바 1위가 꼴등팀 소속 → 고구마 {settings.gogumaPoint} × {settings.bonusMultiplier} = {settings.gogumaPoint * settings.bonusMultiplier}<br/>
                시즌 누적 고구마 1위가 1등팀 소속 → 크로바 {settings.crovaPoint} × {settings.bonusMultiplier} = {settings.crovaPoint * settings.bonusMultiplier}
              </div>
            </details>
          </>
        )}
      </div>

      {isAdmin && !isTennis && (
        <div style={ss.section}>
          <div className="app-section-label">관리자 툴</div>
          <div className="app-grouped">
            <div className="app-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8, padding: "12px 16px" }}>
              <button
                onClick={runFirebasePhaseMigration}
                disabled={fbMigrating}
                style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, borderRadius: 10, border: "none", cursor: fbMigrating ? "not-allowed" : "pointer", background: "var(--app-blue)", color: "#fff", opacity: fbMigrating ? 0.6 : 1 }}
              >
                {fbMigrating ? "실행 중..." : "Firebase → 로그_매치 정확 덮어쓰기"}
              </button>
              {fbMigrateResult && (
                <div style={{ fontSize: 12, color: fbMigrateResult.ok ? "var(--app-green)" : "var(--app-red)" }}>
                  {fbMigrateResult.ok
                    ? `✓ ${fbMigrateResult.dates}개 날짜, ${fbMigrateResult.rows} rows 덮어쓰기 완료`
                    : `✗ 실패: ${fbMigrateResult.error}`}
                </div>
              )}
              <button
                onClick={runRecoverFinalized}
                disabled={recovering}
                style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, borderRadius: 10, border: "none", cursor: recovering ? "not-allowed" : "pointer", background: "var(--app-orange)", color: "#fff", opacity: recovering ? 0.6 : 1 }}
              >
                {recovering ? "복구 중..." : "시트 → Firebase finalized 복구 (날짜 입력)"}
              </button>
              {recoverResult && (
                <div style={{ fontSize: 12, color: recoverResult.ok ? "var(--app-green)" : "var(--app-red)" }}>
                  {recoverResult.ok
                    ? `✓ ${recoverResult.gameId} 복구 완료 (매치 ${recoverResult.matches} · 이벤트 ${recoverResult.events} · 선수 ${recoverResult.players})`
                    : `✗ 실패: ${recoverResult.error}`}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "0 16px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
        <button onClick={handleSave} style={ss.btn(saved ? "var(--app-green)" : "var(--app-blue)", "#fff")}>
          {saved ? "저장 완료" : "설정 저장"}
        </button>
        <button onClick={handleReset} style={{
          ...ss.btn("rgba(0,122,255,0.1)", "var(--app-blue)"),
        }}>기본값으로 초기화</button>
      </div>

      {presetChangeDialog && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.35)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500,
        }}>
          <div style={{
            background: "var(--app-bg-elevated)", borderRadius: 14, padding: 20,
            maxWidth: 360, width: "90%", boxShadow: "var(--app-shadow-lg)",
            border: "0.5px solid var(--app-divider)",
          }}>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 12,
                          color: "var(--app-text-primary)", letterSpacing: "-0.022em" }}>
              "{currentPreset}" → "{presetChangeDialog.newPreset}"
            </div>
            {presetChangeDialog.diffs.length > 0 && (
              <>
                <div style={{ fontSize: 13, color: "var(--app-text-secondary)", marginBottom: 6 }}>다음 값이 바뀝니다:</div>
                <ul style={{ fontSize: 13, color: "var(--app-text-primary)", paddingLeft: 20, marginBottom: 12 }}>
                  {presetChangeDialog.diffs.map(d => (
                    <li key={d.key}>{d.key}: {String(d.from)} → {String(d.to)}</li>
                  ))}
                </ul>
              </>
            )}
            {Object.keys(presetChangeDialog.overrides).length > 0 && (
              <>
                <div style={{ fontSize: 13, color: "var(--app-text-secondary)", marginBottom: 6 }}>
                  이 팀이 덮어쓴 값({Object.keys(presetChangeDialog.overrides).length}개):
                </div>
                <ul style={{ fontSize: 12, color: "var(--app-text-tertiary)", paddingLeft: 20, marginBottom: 12 }}>
                  {Object.entries(presetChangeDialog.overrides).map(([k, v]) => (
                    <li key={k}>{k} = {String(v)}</li>
                  ))}
                </ul>
              </>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.keys(presetChangeDialog.overrides).length > 0 && (
                <button onClick={() => applyPresetChange(true)} style={ss.btn("rgba(0,122,255,0.1)", "var(--app-blue)")}>
                  오버라이드 유지
                </button>
              )}
              <button onClick={() => applyPresetChange(false)} style={ss.btn("var(--app-blue)", "#fff")}>
                전부 초기화
              </button>
              <button onClick={() => setPresetChangeDialog(null)} style={ss.btn("transparent", "var(--app-text-secondary)")}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SegToggle({ label, options, value, onPick }) {
  return (
    <div className="app-row">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%" }}>
        <span style={{ fontSize: 15, color: "var(--app-text-primary)", flex: 1 }}>{label}</span>
        <div style={{ display: "flex", gap: 4 }}>
          {options.map(([v, lbl]) => (
            <button key={String(v)} type="button" onClick={() => onPick(v)}
              style={{
                padding: "5px 10px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                fontFamily: "inherit", border: "0.5px solid var(--app-divider)",
                background: v === value ? "var(--app-blue)" : "var(--app-bg-row)",
                color: v === value ? "#fff" : "var(--app-text-secondary)",
              }}>
              {lbl}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
