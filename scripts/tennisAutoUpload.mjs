// 마감된 테니스 경기를 시트 업로드 + 아카이브까지 자동 처리한다. (매일 KST 10시 GitHub Actions)
//
// 실행: npx vite-node scripts/tennisAutoUpload.mjs
// 환경변수: FIREBASE_DATABASE_URL, APPS_SCRIPT_URL, TENNIS_BOT_TOKEN, DRY_RUN
//
// ★ 안전 불변식: 시트 전송 성공 → meta 갱신 성공 → finalized 쓰기 성공,
//   이 셋을 모두 확인한 뒤에만 active 노드를 지운다.
// ★ 격리: autoUpload=true 이고 봇 토큰의 팀과 일치하는 팀의 노드만 URL로 구성한다.
//   다른 팀 노드는 읽지도 않는다.
// ★ 행 생성 로직은 앱(tennisRowBuilders)을 그대로 import한다 — 시트 스키마를 두 벌 두지 않는다.

import { reconstructState } from '../src/services/firebaseSyncDiff.js';
import { normalizeTennisMatch } from '../src/utils/tennis/normalizeTennisMatch.js';
import {
  buildTennisMatchRows, buildTennisPlayerGameRows, resolveGradeSource,
} from '../src/utils/tennis/tennisRowBuilders.js';
import { nowKST } from '../src/utils/tennis/tennisTime.js';
import { stripNameDecorations } from '../src/services/tennisSync.js';
import {
  selectAutoTargets, ACTION_UPLOAD_ARCHIVE, ACTION_ARCHIVE_ONLY, resolveWithArchiveState,
} from '../src/utils/tennis/autoUploadTargets.js';

const DB = (process.env.FIREBASE_DATABASE_URL || '').replace(/\/$/, '');
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || '';
const BOT_TOKEN = process.env.TENNIS_BOT_TOKEN || '';
const DRY_RUN = ['1', 'true', 'yes'].includes(String(process.env.DRY_RUN || '').toLowerCase());
const SPORT_KEY = '테니스';
const INPUT_BY = '자동업로드';

// 사람이 반드시 확인해야 하는 상태가 생기면 켜진다 → 종료 코드 1
let manualCheck = false;

// firebaseSync._safeTeam 의 복사본. 한쪽을 고치면 다른 쪽도 고칠 것.
function safeTeam(team) {
  return (team || '기본팀').replace(/[.#$/[\]]/g, '_');
}

// firebaseSync._kstDateFromGameId 의 복사본 (gameDate가 빈 레거시 경기 폴백).
function kstDateFromGameId(gameId) {
  if (gameId && gameId.indexOf('g_') === 0) {
    const ts = parseInt(gameId.substring(2), 10);
    if (ts > 0) return new Date(ts + 9 * 3600 * 1000).toISOString().substring(0, 10);
  }
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().substring(0, 10);
}

// firebaseSync._buildSummary 의 테니스 분기 복사본. 아카이브 목록 표기가 앱과 같아야 한다.
function buildSummary(gameId, state) {
  const creator = state.gameCreator || state.lastEditor || '?';
  const rounds = state.rounds || [];
  const done = rounds.reduce((s, r) => s + (r.courts || []).filter(c => c.status === 'done').length, 0);
  return `${gameId} | ${creator} | ${state.phase || '?'} | ${rounds.length}라운드 | 완료 ${done}경기`;
}

async function rtdb(method, path, body) {
  const resp = await fetch(`${DB}/${path}.json`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`RTDB ${method} /${path} 실패: HTTP ${resp.status}`);
  return resp.json();
}

// tennisSync._post 와 같은 계약: Apps Script는 서버측 실패도 HTTP 200 + {success:false}로 답한다.
async function appsScript(action, team, data) {
  const body = stripNameDecorations({ action, data, team, authToken: BOT_TOKEN });
  const resp = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`${action} 실패: HTTP ${resp.status}`);
  const result = await resp.json();
  if (!result || result.success === false) {
    throw new Error(`${action} 실패: ${result?.error || '서버 응답 오류'}`);
  }
  return result;
}

// 앱의 getRoster는 _safeRead라 실패를 []로 삼킨다. 자동 실행에는 사람이 없으므로
// "조회 실패"와 "진짜 빈 명부"를 구분해야 한다 — 여기서는 throw 방식 + 1회 재시도.
async function fetchRoster(team) {
  try {
    return (await appsScript('getTennisRoster', team)).players || [];
  } catch (e) {
    console.log(`  명부 조회 실패, 1회 재시도: ${e.message}`);
    return (await appsScript('getTennisRoster', team)).players || [];
  }
}

async function uploadRows(teamKey, teamName, gameId, state) {
  let { gradeByPlayer, memberSet, fromSnapshot } = resolveGradeSource(state, []);
  if (!fromSnapshot) {
    const roster = await fetchRoster(teamName);   // 실패하면 throw → 호출부가 이 경기만 스킵
    if (roster.length === 0) {
      manualCheck = true;
      console.log(`  [MANUAL_CHECK] ${gameId} — 등급 출처 없음(스냅샷 없음 + 명부 0명). 업로드하지 않음`);
      return false;
    }
    ({ gradeByPlayer, memberSet } = resolveGradeSource(state, roster));
  }

  const inputTime = nowKST();
  const matchRows = buildTennisMatchRows({ team: teamName, state, inputTime, inputBy: INPUT_BY, memberSet });
  const pgRows = buildTennisPlayerGameRows({ team: teamName, state, inputTime, inputBy: INPUT_BY, memberSet, gradeByPlayer });

  // 앱의 Promise.allSettled 병렬과 달리 순차 — 앞이 실패하면 뒤를 보내지 않아 반쪽 업로드를 줄인다.
  await appsScript('writeTennisMatches', teamName, { rows: matchRows });
  await appsScript('writeTennisPlayerGames', teamName, { rows: pgRows });
  console.log(`  시트 전송 완료 — 매치 ${matchRows.length}행 / 선수경기 ${pgRows.length}행`);

  // 시트에 들어간 뒤 meta를 못 찍으면 다음 실행에서 중복 업로드가 된다. 유일한 중복 위험 지점.
  try {
    await rtdb('PATCH', `games/${encodeURIComponent(teamKey)}/active/${encodeURIComponent(gameId)}/meta`, {
      gameFinalized: true, phase: 'done', autoUploadedAt: { '.sv': 'timestamp' },
    });
  } catch (e) {
    manualCheck = true;
    throw new Error(`[MANUAL_CHECK] 시트 전송 후 meta 갱신 실패 — 다음 실행 시 중복 업로드 위험: ${e.message}`);
  }
  return true;
}

async function archiveGame(teamKey, gameId, state) {
  const finalState = { ...state, gameFinalized: true, phase: 'done' };
  await rtdb('PATCH', `games/${encodeURIComponent(teamKey)}/finalized`, {
    [`_meta/${gameId}`]: {
      summary: buildSummary(gameId, finalState),
      gameDate: finalState.gameDate || kstDateFromGameId(gameId),
      updatedAt: { '.sv': 'timestamp' },
    },
    [`_states/${gameId}`]: { state: JSON.stringify(finalState) },
  });
  // finalized 쓰기가 성공한 뒤에만 지운다.
  await rtdb('DELETE', `games/${encodeURIComponent(teamKey)}/active/${encodeURIComponent(gameId)}`);
  console.log('  아카이브 완료');
}

async function processTeam(teamKey, teamName) {
  const raw = (await rtdb('GET', `games/${encodeURIComponent(teamKey)}/active`)) || {};
  const games = Object.keys(raw).map(gameId => ({
    gameId,
    state: normalizeTennisMatch(reconstructState(gameId, raw[gameId])),
  }));
  // 신선도 가드(마지막 수정 후 10분) 없음 — 실행 시점에 마감(summary/done) 상태이기만 하면 처리한다.
  // (유저 결정 2026-08-31. 편집 중 레이스로 부활한 노드의 중복 업로드는 resolveWithArchiveState가 차단.)
  const targets = selectAutoTargets(games);
  console.log(`[${teamName}] 활성 ${games.length}건 · 처리 대상 ${targets.length}건`);

  for (const t of targets) {
    const label = `${t.gameId} (${t.state.gameDate || '?'}) ${t.action}`;
    if (DRY_RUN) {
      console.log(`  [DRY_RUN] ${label} — ${buildSummary(t.gameId, t.state)}`);
      continue;
    }
    try {
      console.log(`  처리 시작: ${label}`);
      // 이미 아카이브된 경기가 active에 다시 있다면 클라이언트가 되살린 것이다.
      // 시트에는 이미 들어갔으므로 재전송하지 않는다(중복 행 방지).
      const archived = await rtdb('GET', `games/${encodeURIComponent(teamKey)}/finalized/_meta/${encodeURIComponent(t.gameId)}`);
      const action = resolveWithArchiveState(t.action, archived !== null && archived !== undefined);
      if (action !== t.action) {
        console.log(`  [부활 감지] ${t.gameId} — 이미 아카이브된 경기다. 시트 재전송 없이 정리만 한다`);
      }
      if (action === ACTION_UPLOAD_ARCHIVE) {
        const ok = await uploadRows(teamKey, teamName, t.gameId, t.state);
        if (!ok) continue;   // 등급 출처 없음 — 아카이브도 하지 않는다
      }
      await archiveGame(teamKey, t.gameId, t.state);
    } catch (e) {
      // 한 경기의 실패가 나머지를 막지 않는다. 실패한 경기는 active에 남아 다음날 재시도된다.
      console.error(`  실패: ${t.gameId} — ${e.message}`);
      process.exitCode = 1;
    }
  }
}

async function main() {
  if (!DB || !APPS_SCRIPT_URL || !BOT_TOKEN) {
    throw new Error('환경변수 누락: FIREBASE_DATABASE_URL / APPS_SCRIPT_URL / TENNIS_BOT_TOKEN');
  }
  const botTeam = BOT_TOKEN.split(':')[0];
  if (!botTeam) throw new Error('TENNIS_BOT_TOKEN 형식 오류 — "팀:이름:뒷4자리"여야 한다');
  console.log(`시작 ${nowKST()} · DRY_RUN=${DRY_RUN} · 봇 팀=${botTeam}`);

  const settings = (await rtdb('GET', 'settings')) || {};
  const enabled = Object.keys(settings)
    .filter(k => settings[k]?.[SPORT_KEY]?.overrides?.autoUpload === true);
  console.log(`autoUpload 켠 팀: ${enabled.join(', ') || '(없음)'}`);

  for (const teamKey of enabled) {
    // 봇 토큰의 팀이 아니면 Apps Script의 _checkTeamAccess가 어차피 막는다. 아예 접근하지 않는다.
    if (teamKey !== safeTeam(botTeam)) {
      console.log(`[skip] ${teamKey} — 봇 토큰 팀(${botTeam})과 달라 접근하지 않음`);
      continue;
    }
    await processTeam(teamKey, botTeam);
  }

  if (manualCheck) {
    console.error('MANUAL_CHECK 항목이 있습니다 — 로그를 확인하세요.');
    process.exitCode = 1;
  }
  console.log(`종료 ${nowKST()}`);
}

main().catch(e => {
  console.error(`치명적 실패 — 아무것도 변경하지 않았을 수 있습니다: ${e.message}`);
  process.exit(1);
});
