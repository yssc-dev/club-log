import { getEffectiveSettings, getPresetValue, resolvePreset } from '../../config/settings';

// 빅마스터FC 판별. 저장된 설정(RTDB 로드 결과)에 intraSquad 가 있으면 그것, 없으면 팀 기본 프리셋(PRESET_MAP)으로 폴백 —
// 설정 로드 실패·첫 접속에서 하버FC 모드로 잘못 열리는 것을 막는다. 하버FC 는 두 경로 모두 undefined.
export function isIntraSquadTeam(team, mode) {
  if (mode !== '축구' || !team) return false;
  if (getEffectiveSettings(team, '축구').intraSquad === true) return true;
  return getPresetValue('축구', resolvePreset(team, '축구'), 'intraSquad') === true;
}
