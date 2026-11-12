// 하버FC 축구: 「경기마감」까지 누르고 기록확정(시트 전송)을 안 한 경기를 다음날 오전 10시(KST)에
// 시트 5종 전송 + 아카이브까지 자동 처리한다. (테니스판: scripts/tennisAutoUpload.mjs)
//
// 실행: npx vite-node scripts/soccerAutoUpload.mjs
// 환경변수: FIREBASE_DATABASE_URL, APPS_SCRIPT_URL, SOCCER_BOT_TOKEN("팀:이름:뒷4자리"), DRY_RUN
//
// ★ 안전 불변식: 시트 5종 전송 성공 → active meta gameFinalized → finalized 쓰기 성공,
//   이 셋을 모두 확인한 뒤에만 active 노드를 지운다.
// ★ 중복 방지(축구 시트 5종은 game_id 기반 멱등화가 없다 — 재전송 = 중복 행):
//   1) 시트를 하나 보낼 때마다 games/{팀}/autoUpload/{gameId}/{시트키} 에 진행 기록을 남긴다.
//      중간 실패 후 다음 실행은 안 보낸 시트만 이어서 보낸다.
//   2) 안 보낸 시트에 그 경기일 행이 이미 있으면(사람의 부분 실패 기록확정, "실패 응답인데 실제로는
//      써진" 요청 — 2026-09-11 테니스 사고) 그 경기는 손대지 않고 MANUAL_CHECK 로 넘긴다.
// ★ 격리: settings/{팀}/축구/overrides/autoUpload 가 true 이고 봇 토큰의 팀과 같은 팀만 읽는다.
// ★ 행 생성은 앱과 같은 순수 함수(buildSoccerFinalizeRows)를 import 한다 — 스키마를 두 벌 두지 않는다.

import { reconstructState } from '../src/services/firebaseSyncDiff.js';
import { buildFinalizedSummary } from '../src/services/finalizedSummary.js';
import { stripNameDecorations } from '../src/services/appSync.js';
import { safeTeam, cachePath } from '../src/services/rtdbPath.js';
import { buildSoccerFinalizeRows } from '../src/utils/soccerFinalizeRows.js';
import {
  selectSoccerAutoTargets, kstDateFromGameId, findSheetConflicts, SOCCER_SHEET_KEYS,
  ACTION_UPLOAD_ARCHIVE,
} from '../src/utils/soccerAutoUploadTargets.js';

const DB = (process.env.FIREBASE_DATABASE_URL || '').replace(/\/$/, '');
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || '';
const BOT_TOKEN = process.env.SOCCER_BOT_TOKEN || '';
const DRY_RUN = ['1', 'true', 'yes'].includes(String(process.env.DRY_RUN || '').toLowerCase());
const SPORT_KEY = '축구';

let manualCheck = false;

// 앱(브라우저 KST)의 new Date().toLocaleString("ko-KR") 과 같은 "2026. 11. 12. 오전 9:05:03" 형식.
// GitHub 러너 Node 는 한국어 로캘 데이터가 없어 toLocaleString('ko-KR') 이 "AM" 을 내므로 직접 만든다.
const nowKstLocale = () => {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const h = d.getUTCHours(), h12 = h % 12 === 0 ? 12 : h % 12;
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}. ${d.getUTCMonth() + 1}. ${d.getUTCDate()}. ${h < 12 ? '오전' : '오후'} ${h12}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
};
const todayKst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

async function rtdb(method, path, body) {
  const resp = await fetch(`${DB}/${path}.json`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`RTDB ${method} /${path} 실패: HTTP ${resp.status}`);
  return resp.json();
}

// AppSync._postWrite 와 같은 계약: 서버측 실패도 HTTP 200 + {success:false} 로 온다.
async function appsScript(payload, label) {
  const resp = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(stripNameDecorations({ ...payload, authToken: BOT_TOKEN })),
  });
  if (!resp.ok) throw new Error(`${label} 실패: HTTP ${resp.status}`);
  const result = await resp.json();
  if (!result || result.success === false) throw new Error(`${label} 실패: ${result?.error || '서버 응답 오류'}`);
  return result;
}

// 앱 SoccerApp.gameState 와 같은 모양 — 아카이브(finalized/_states) 상세 화면이 읽는 형태를 맞춘다.
function appShapedState(gameId, s, gameFinalized) {
  return {
    gameId,
    gameCreator: s.gameCreator || '알 수 없음',
    phase: s.phase, attendees: s.attendees || [], matchMode: 'soccer', courtCount: 1,
    soccerMatches: s.soccerMatches || [], currentMatchIdx: s.currentMatchIdx ?? -1,
    opponents: s.opponents || [], soccerFormation: s.soccerFormation ?? null,
    settingsSnapshot: s.settingsSnapshot ?? null, gameFinalized,
    lastEditor: s.lastEditor || '',
  };
}

// 그 경기일로 시트 5종에 이미 있는 행 수. 조회 실패는 throw — "모름"을 0으로 삼키면 중복 위험.
async function countExisting(team, sheets, date) {
  const base = { team };
  const [pl, pr, ev, pg, mt] = await Promise.all([
    appsScript({ ...base, action: 'getPointLog', pointLogSheet: sheets.pointLogSheet }, '포인트 로그 조회'),
    appsScript({ ...base, action: 'getPlayerLog', playerLogSheet: sheets.playerLogSheet }, '선수기록 조회'),
    appsScript({ ...base, action: 'getRawEvents', sport: SPORT_KEY, dateFrom: date, dateTo: date }, '로그_이벤트 조회'),
    appsScript({ ...base, action: 'getRawPlayerGames', sport: SPORT_KEY }, '로그_선수경기 조회'),
    appsScript({ ...base, action: 'getRawMatches', sport: SPORT_KEY, dateFrom: date, dateTo: date }, '로그_매치 조회'),
  ]);
  const onDate = (arr) => (arr || []).filter(r => r && r.date === date).length;
  return {
    pointLog: onDate(pl.events),
    playerLog: onDate(pr.players),
    rawEvents: onDate(ev.rows),
    rawPlayerGames: onDate(pg.rows),
    rawMatches: onDate(mt.rows),
  };
}

function writerFor(key, team, sheets, rows) {
  switch (key) {
    case 'pointLog': return () => appsScript({ action: 'writeSoccerPointLog', data: { events: rows.pointLogRows, team }, pointLogSheet: sheets.pointLogSheet }, '포인트 로그 저장');
    case 'playerLog': return () => appsScript({ action: 'writeSoccerPlayerLog', data: { players: rows.playerLogRows, team }, playerLogSheet: sheets.playerLogSheet }, '선수기록 저장');
    case 'rawEvents': return () => appsScript({ action: 'writeRawEvents', data: { rows: rows.rawEvents, team } }, '로그_이벤트 저장');
    case 'rawPlayerGames': return () => appsScript({ action: 'writeRawPlayerGames', data: { rows: rows.rawPlayerGames, team } }, '로그_선수경기 저장');
    case 'rawMatches': return () => appsScript({ action: 'writeRawMatches', data: { rows: rows.matchRows, team } }, '로그_매치 저장');
    default: throw new Error(`알 수 없는 시트 키: ${key}`);
  }
}

async function uploadSheets(teamKey, team, sheets, gameId, state) {
  const date = kstDateFromGameId(gameId);
  const rows = buildSoccerFinalizeRows({ state, team, dateStr: date, inputTime: nowKstLocale() });
  const progressPath = `games/${encodeURIComponent(teamKey)}/autoUpload/${encodeURIComponent(gameId)}`;
  const progress = (await rtdb('GET', progressPath)) || {};

  const existing = await countExisting(team, sheets, date);
  const conflicts = findSheetConflicts(progress, existing);
  if (conflicts.length > 0) {
    manualCheck = true;
    console.log(`  [MANUAL_CHECK] ${gameId} (${date}) — 아직 안 보낸 시트에 그 날짜 행이 이미 있음: ${conflicts.map(k => `${k} ${existing[k]}행`).join(', ')}. 중복 방지를 위해 업로드하지 않음`);
    return false;
  }

  for (const key of SOCCER_SHEET_KEYS) {
    if (progress[key]) { console.log(`  ${key} — 이전 실행에서 전송됨, 건너뜀`); continue; }
    const res = await writerFor(key, team, sheets, rows)();   // 실패하면 throw → 이 경기 중단(다음 실행에서 이어서)
    try {
      await rtdb('PATCH', progressPath, { [key]: { '.sv': 'timestamp' } });
    } catch (e) {
      manualCheck = true;
      throw new Error(`[MANUAL_CHECK] ${key} 전송 후 진행 기록 실패 — 다음 실행 시 ${key} 중복 위험: ${e.message}`);
    }
    console.log(`  ${key} 전송 완료 — ${res?.count ?? 0}건${res?.skipped ? ` (skip ${res.skipped})` : ''}`);
  }

  // 대시보드 '전송완료' 근거. 아카이브가 실패해도 다음 실행이 '아카이브만'으로 분류하게 한다.
  try {
    await rtdb('PATCH', `games/${encodeURIComponent(teamKey)}/active/${encodeURIComponent(gameId)}/meta`, {
      gameFinalized: true, autoUploadedAt: { '.sv': 'timestamp' },
    });
  } catch (e) {
    // 진행 기록이 5종 모두 찍혀 있으므로 다음 실행은 시트를 다시 보내지 않는다 — 중복 위험 없음.
    throw new Error(`시트 전송 후 meta 갱신 실패(다음 실행에서 아카이브 재시도): ${e.message}`);
  }
  return true;
}

async function archiveGame(teamKey, gameId, state) {
  const finalState = appShapedState(gameId, state, true);
  await rtdb('PATCH', `games/${encodeURIComponent(teamKey)}/finalized`, {
    [`_meta/${gameId}`]: {
      summary: buildFinalizedSummary(gameId, finalState),
      gameDate: kstDateFromGameId(gameId),
      updatedAt: { '.sv': 'timestamp' },
    },
    [`_states/${gameId}`]: { state: JSON.stringify(finalState) },
  });
  // finalized 쓰기가 성공한 뒤에만 지운다.
  await rtdb('DELETE', `games/${encodeURIComponent(teamKey)}/active/${encodeURIComponent(gameId)}`);
  try { await rtdb('DELETE', `games/${encodeURIComponent(teamKey)}/autoUpload/${encodeURIComponent(gameId)}`); } catch { /* best-effort */ }
  console.log('  아카이브 완료');
}

// 마감이 건드리는 축구 캐시 6종을 지워 다음 읽기를 시트로 강등한다(앱 refreshAfterFinalize 대응).
// 안 하면 앱이 L2 TTL(12h) 동안 어제 데이터를 보여준다. 캐시는 파생 데이터라 실패해도 무시.
async function dropSoccerCaches(team) {
  const paths = [
    ...['matchLog', 'eventLog', 'playerGameLog'].map(d => cachePath(team, SPORT_KEY, d)),
    ...['pointLog', 'playerLog', 'latestDeltas'].map(d => cachePath(team, '공용', d)),
  ];
  for (const p of paths) {
    try { await rtdb('DELETE', p); } catch (e) { console.log(`  캐시 삭제 실패(무시): ${p} — ${e.message}`); }
  }
  console.log('  캐시 6종 강등 완료');
}

async function processTeam(teamKey, team, teamSettings) {
  const shared = teamSettings.shared || {};
  const sheets = { pointLogSheet: shared.pointLogSheet, playerLogSheet: shared.playerLogSheet };
  if (!sheets.pointLogSheet || !sheets.playerLogSheet) {
    // 앱은 기본 시트명으로 폴백하지만, 무인 실행이 엉뚱한 시트에 쓰는 것보다 멈추는 게 낫다.
    manualCheck = true;
    console.log(`[MANUAL_CHECK] ${team} — 설정에 포인트 로그/선수기록 시트 이름이 없음. 처리하지 않음`);
    return;
  }

  const raw = (await rtdb('GET', `games/${encodeURIComponent(teamKey)}/active`)) || {};
  const games = Object.keys(raw).map(gameId => ({ gameId, state: reconstructState(gameId, raw[gameId]) }));
  const today = todayKst();
  const targets = selectSoccerAutoTargets(games, today);
  console.log(`[${team}] 오늘(KST) ${today} · 활성 ${games.length}건 · 처리 대상 ${targets.length}건`);

  let uploaded = false;
  for (const t of targets) {
    const finishedCount = (t.state.soccerMatches || []).filter(m => m.status === 'finished').length;
    const label = `${t.gameId} (${kstDateFromGameId(t.gameId)}, 종료 ${finishedCount}경기, 만든 사람 ${t.state.gameCreator || '?'}) ${t.action}`;
    if (DRY_RUN) { console.log(`  [DRY_RUN] ${label}`); continue; }
    try {
      console.log(`  처리 시작: ${label}`);
      // 이미 아카이브된 경기가 active 에 다시 있다 = 열려 있던 탭이 되살린 노드.
      // 아카이브본이 '확정'이면 시트에 이미 들어갔으므로 active 만 지운다.
      const archivedMeta = await rtdb('GET', `games/${encodeURIComponent(teamKey)}/finalized/_meta/${encodeURIComponent(t.gameId)}`);
      if (archivedMeta) {
        const st = await rtdb('GET', `games/${encodeURIComponent(teamKey)}/finalized/_states/${encodeURIComponent(t.gameId)}`);
        let archivedFinalized = false;
        try { archivedFinalized = JSON.parse(st?.state || '{}').gameFinalized === true; } catch { /* 파싱 실패 = 모름 */ }
        if (archivedFinalized) {
          console.log(t.action === ACTION_UPLOAD_ARCHIVE
            ? `  [부활 감지] ${t.gameId} — 이미 확정·아카이브된 경기가 active 에 다시 있음. 시트 재전송 없이 active 만 정리`
            : `  ${t.gameId} — 사람이 기록확정까지 마친 경기. active 만 정리`);
          await rtdb('DELETE', `games/${encodeURIComponent(teamKey)}/active/${encodeURIComponent(t.gameId)}`);
          continue;
        }
      }
      if (t.action === ACTION_UPLOAD_ARCHIVE) {
        const ok = await uploadSheets(teamKey, team, sheets, t.gameId, t.state);
        if (!ok) continue;   // 중복 의심 — 아무것도 쓰지 않았다
        uploaded = true;
      }
      await archiveGame(teamKey, t.gameId, t.state);
    } catch (e) {
      // 한 경기의 실패가 나머지를 막지 않는다. 실패한 경기는 active 에 남아 다음날 이어서 처리된다.
      console.error(`  실패: ${t.gameId} — ${e.message}`);
      uploaded = true;
      process.exitCode = 1;
    }
  }

  if (uploaded && !DRY_RUN) await dropSoccerCaches(team);
}

async function main() {
  if (!DB || !APPS_SCRIPT_URL || !BOT_TOKEN) {
    throw new Error('환경변수 누락: FIREBASE_DATABASE_URL / APPS_SCRIPT_URL / SOCCER_BOT_TOKEN');
  }
  const botTeam = BOT_TOKEN.split(':')[0];
  if (!botTeam || BOT_TOKEN.split(':').length !== 3) throw new Error('SOCCER_BOT_TOKEN 형식 오류 — "팀:이름:뒷4자리"여야 한다');
  console.log(`시작 ${nowKstLocale()} · DRY_RUN=${DRY_RUN} · 봇 팀=${botTeam}`);

  const teamKey = safeTeam(botTeam);
  const teamSettings = (await rtdb('GET', `settings/${encodeURIComponent(teamKey)}`)) || {};
  if (teamSettings?.[SPORT_KEY]?.overrides?.autoUpload !== true) {
    console.log(`${botTeam} — 설정에서 자동 업로드가 꺼져 있음. 종료`);
    return;
  }
  await processTeam(teamKey, botTeam, teamSettings);

  if (manualCheck) {
    console.error('MANUAL_CHECK 항목이 있습니다 — 로그를 확인하세요.');
    process.exitCode = 1;
  }
  console.log(`종료 ${nowKstLocale()}`);
}

main().catch(e => {
  console.error(`치명적 실패 — 아무것도 변경하지 않았을 수 있습니다: ${e.message}`);
  process.exit(1);
});
