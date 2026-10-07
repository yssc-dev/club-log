import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import Modal from '../common/Modal';
import { readRoles, MAX_ASSISTANTS } from '../../utils/soccerRoles';
import { getNonPlayers } from '../../utils/soccerScoring';

// 경기별 역할 지정 — 영상촬영(복수) · 주심(1) · 부심(2). 전부 공석 가능.
//
// 후보는 참석자 전원이다. getNonPlayers 는 '경기 전체 기준' 미출전자라서, 전반에 심판 보다가
// 후반 교체 투입된 사람이 후보에서 사라진다. 그래서 미출전자를 앞에 두고 출전자는 「출전」
// 라벨만 달아 뒤에 두되, 선택은 막지 않는다(사용자 결정).
//
// 겸임 규칙: 주심 ↔ 부심만 상호 배타(한쪽을 누르면 다른 쪽에서 빠진다).
// 영상촬영은 심판과 겸임 허용 — 한 명이 찍으면서 주심 보는 경우가 실제로 있다.
//
// 설계: docs/superpowers/specs/2026-10-07-soccer-match-roles-design.md
export default function MatchRolesModal({ match, attendees, onSave, onClose }) {
  const { C } = useTheme();
  const initial = readRoles(match);
  const [camera, setCamera] = useState(initial.camera);
  const [referee, setReferee] = useState(initial.referee);
  const [assistants, setAssistants] = useState(initial.assistants);
  const [notice, setNotice] = useState('');

  // 후보 정렬: 미출전자 먼저, 각 그룹은 참석자 순서 유지.
  const nonPlayers = new Set(getNonPlayers(match, attendees || []));
  const candidates = [
    ...(attendees || []).filter(n => nonPlayers.has(n)),
    ...(attendees || []).filter(n => !nonPlayers.has(n)),
  ];

  const toggleCamera = (name) => {
    setNotice('');
    setCamera(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  const toggleReferee = (name) => {
    setNotice('');
    setReferee(prev => (prev === name ? '' : name));
    // 주심으로 올리면 부심에서 빼준다(상호 배타)
    setAssistants(prev => (referee === name ? prev : prev.filter(n => n !== name)));
  };

  const toggleAssistant = (name) => {
    setNotice('');
    if (assistants.includes(name)) {
      setAssistants(assistants.filter(n => n !== name));
      return;
    }
    if (assistants.length >= MAX_ASSISTANTS) {
      setNotice(`부심은 ${MAX_ASSISTANTS}명까지입니다. 먼저 한 명을 해제하세요.`);
      return;
    }
    setAssistants([...assistants, name]);
    if (referee === name) setReferee(''); // 부심으로 내리면 주심에서 뺀다(상호 배타)
  };

  // 아무것도 안 건드리고 저장만 눌렀을 때는 쓰지 않는다 — 모달이 열린 채 다른 기기가
  // roles 를 바꾼 경우, no-op 저장이 그 변경을 조용히 덮어쓰는 것을 막는다(LWW 는 유지:
  // 실제로 뭔가 바꿨으면 그대로 onSave 가 호출돼 마지막 쓰기가 이긴다).
  // `initial` 은 매 렌더마다 readRoles(match) 로 다시 계산되므로 여기서 항상 최신 권위 값이다.
  const isUnchanged = (a, b) =>
    a.referee === b.referee &&
    a.camera.length === b.camera.length && a.camera.every((n, i) => n === b.camera[i]) &&
    a.assistants.length === b.assistants.length && a.assistants.every((n, i) => n === b.assistants[i]);

  const handleSave = () => {
    const current = { camera, referee, assistants };
    if (!isUnchanged(current, initial)) onSave?.(current);
    onClose?.();
  };

  const isOn = (role, name) =>
    role === 'camera' ? camera.includes(name)
    : role === 'referee' ? referee === name
    : assistants.includes(name);

  const onTap = (role, name) =>
    role === 'camera' ? toggleCamera(name)
    : role === 'referee' ? toggleReferee(name)
    : toggleAssistant(name);

  const section = (role, label, hint) => (
    <div data-role={role} style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.white, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 10, color: C.gray, marginBottom: 6 }}>{hint}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {candidates.map(name => {
          const on = isOn(role, name);
          const played = !nonPlayers.has(name);
          return (
            <button key={name} data-name={name} onClick={() => onTap(role, name)}
              style={{
                padding: '6px 10px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
                background: on ? C.accent : 'transparent',
                color: on ? C.bg : (played ? C.gray : C.white),
                border: `1px solid ${on ? C.accent : C.grayDarker}`,
                opacity: played && !on ? 0.55 : 1,
              }}>
              {name}{played ? ' · 출전' : ''}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <Modal onClose={onClose} title={`제${(match?.matchIdx ?? 0) + 1}경기 역할 지정`}>
      {section('camera', '🎥 영상촬영', '여러 명 지정 가능 · 공석 가능')}
      {section('referee', '🧑‍⚖️ 주심', '1명 · 공석 가능 · 부심과 겸임 불가')}
      {section('assistants', '🚩 부심', `${MAX_ASSISTANTS}명까지 · 공석 가능 · 주심과 겸임 불가`)}

      {notice && (
        <div style={{ fontSize: 11, color: C.orange, marginBottom: 10 }}>{notice}</div>
      )}

      <button onClick={handleSave}
        style={{
          width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
          background: C.accent, color: C.bg, fontSize: 14, fontWeight: 700, cursor: 'pointer',
        }}>
        저장
      </button>
    </Modal>
  );
}
