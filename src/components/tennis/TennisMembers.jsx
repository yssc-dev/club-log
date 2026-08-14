// 회원관리 탭 (관리자 전용). 테니스_회원명부 추가·수정·소프트삭제 + 정회원/게스트 구분.
// 진실 소스 쓰기라 모든 저장은 window.confirm 확인 후. 순수 로직은 memberForm.js.
import { useEffect, useMemo, useState } from 'react';
import TennisSync from '../../services/tennisSync';
import { makeStyles } from '../../styles/theme';
import { useTheme } from '../../hooks/useTheme';
import {
  blankMember, validateMember, toWritePayload, partitionMembers, memberToForm, GRADES, MEMBER_TYPES,
} from '../../utils/tennis/memberForm';

// ── 회원 폼 (추가/수정 공용) ────────────────────────────────
function MemberForm({ initial, isNew, members, saving, onSave, onCancel, ds, C }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const v = validateMember(form, members);

  const inputStyle = {
    ...ds.input, fontSize: 13, padding: '6px 10px', borderRadius: 8,
    border: `1px solid ${C.borderColor}`, boxSizing: 'border-box',
  };
  const label = { fontSize: 11, color: C.gray, margin: '8px 0 3px' };

  return (
    <div style={{ ...ds.card, marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 4 }}>
        {isNew ? '회원 추가' : '회원 수정'}
      </div>

      <div style={label}>이름 *</div>
      <input style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} placeholder="이름" />
      {!isNew && (
        <div style={{ fontSize: 10, color: C.orange, marginTop: 3 }}>
          ⚠ 이름을 바꾸면 과거 경기기록(이름 기준)이 분리될 수 있습니다.
        </div>
      )}

      <div style={label}>닉네임</div>
      <input style={inputStyle} value={form.nickname} onChange={e => set('nickname', e.target.value)} />

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={label}>등급</div>
          <select style={inputStyle} value={form.grade} onChange={e => set('grade', e.target.value)}>
            <option value="">-</option>
            {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <div style={label}>시즌시작순위</div>
          <input style={inputStyle} value={form.seasonStartRank} onChange={e => set('seasonStartRank', e.target.value)} placeholder="빈값=미지정" />
        </div>
      </div>

      <div style={label}>구분</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {MEMBER_TYPES.map(t => (
          <button key={t} onClick={() => set('memberType', t)} style={ds.chip(form.memberType === t)}>{t}</button>
        ))}
      </div>
      {form.memberType === '게스트' && (
        <div style={{ fontSize: 10, color: C.gray, marginTop: 3 }}>
          게스트는 순위·모집단 등 정회원 지표와 참석 명단에서 제외됩니다.
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={label}>가입일</div>
          <input style={inputStyle} type="date" value={form.joinDate || ''} onChange={e => set('joinDate', e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={label}>비고</div>
          <input style={inputStyle} value={form.note} onChange={e => set('note', e.target.value)} />
        </div>
      </div>

      {!v.ok && <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>{Object.values(v.errors)[0]}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={() => onSave(form, isNew)} disabled={!v.ok || saving}
          style={{ ...ds.btnFull(C.accent), opacity: (!v.ok || saving) ? 0.5 : 1, cursor: (!v.ok || saving) ? 'default' : 'pointer' }}>
          {saving ? '저장 중…' : '저장'}
        </button>
        <button onClick={onCancel} disabled={saving}
          style={{ ...ds.btnFull(C.grayDarker), cursor: saving ? 'default' : 'pointer' }}>취소</button>
      </div>
    </div>
  );
}

// ── 회원 카드 한 줄 ─────────────────────────────────────────
function MemberRow({ m, deleted, onEdit, onDelete, onRestore, saving, ds, C }) {
  const badgeBg = m.memberType === '게스트' ? C.grayDarker : C.accent;
  return (
    <div style={{ ...ds.card, display: 'flex', alignItems: 'center', gap: 8, opacity: deleted ? 0.55 : 1, marginBottom: 8 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: C.white, fontSize: 14, fontWeight: 600 }}>{m.name}</span>
          <span style={{ fontSize: 10, color: C.white, background: badgeBg, borderRadius: 4, padding: '1px 6px' }}>{m.memberType}</span>
          {m.grade && <span style={{ fontSize: 10, color: C.gray }}>{m.grade}</span>}
        </div>
        {m.nickname && <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>{m.nickname}</div>}
      </div>
      {deleted ? (
        <button onClick={() => onRestore(m)} disabled={saving} style={{ ...ds.chip(false), cursor: saving ? 'default' : 'pointer' }}>복원</button>
      ) : (
        <>
          <button onClick={() => onEdit(m)} disabled={saving} style={{ ...ds.chip(false), cursor: saving ? 'default' : 'pointer' }}>편집</button>
          <button onClick={() => onDelete(m)} disabled={saving} style={{ ...ds.chip(false), color: C.red, cursor: saving ? 'default' : 'pointer' }}>탈퇴</button>
        </>
      )}
    </div>
  );
}

// ── 메인 ────────────────────────────────────────────────────
export default function TennisMembers({ C: propC }) {
  const { C: themeC } = useTheme();
  const C = propC ?? themeC;
  const ds = makeStyles(C);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);      // 조회 실패(권한/네트워크) — 빈 목록과 구분
  const [showDeleted, setShowDeleted] = useState(false);
  const [editing, setEditing] = useState(null); // null | {form draft} (row null=신규)
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);    // { type:'ok'|'err', msg }

  const reload = () => TennisSync.getRosterAdmin()
    .then(ms => { setError(false); setMembers(Array.isArray(ms) ? ms : []); })
    .catch(() => setError(true))
    .finally(() => setLoading(false));

  useEffect(() => {
    let alive = true;
    TennisSync.getRosterAdmin()
      .then(ms => { if (alive) { setError(false); setMembers(Array.isArray(ms) ? ms : []); } })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const { active, deleted } = useMemo(() => partitionMembers(members), [members]);

  // 저장/삭제/복원 공용 실행기 (확인창은 호출부에서)
  const runWrite = (payload, okMsg) => {
    setSaving(true); setStatus(null);
    return TennisSync.writeRosterMember(payload)
      .then(() => { setStatus({ type: 'ok', msg: okMsg }); setEditing(null); return reload(); })
      .catch(e => setStatus({ type: 'err', msg: e?.message || '저장에 실패했습니다' }))
      .finally(() => setSaving(false));
  };

  const onSave = (form, isNew) => {
    const v = validateMember(form, members);
    if (!v.ok) { setStatus({ type: 'err', msg: Object.values(v.errors)[0] }); return; }
    const name = (form.name || '').trim();
    const msg = isNew ? `${form.memberType} '${name}' 추가할까요?` : `'${name}' 변경사항을 저장할까요?`;
    if (!window.confirm(msg)) return;
    runWrite(toWritePayload(form, { row: form.row }), isNew ? '추가되었습니다' : '저장되었습니다');
  };

  const onDelete = (m) => {
    if (!window.confirm(`'${m.name}'을(를) 탈퇴 처리할까요? (기록은 보존, 명부에서 숨김)`)) return;
    const payload = toWritePayload(memberToForm(m), { row: m.row });
    payload.status = '탈퇴';
    runWrite(payload, '탈퇴 처리했습니다');
  };

  const onRestore = (m) => {
    if (!window.confirm(`'${m.name}'을(를) 복원(활동)할까요?`)) return;
    const payload = toWritePayload(memberToForm(m), { row: m.row });
    payload.status = '활동';
    runWrite(payload, '복원했습니다');
  };

  if (loading) {
    return <div style={ds.section}><div style={{ ...ds.card, color: C.gray, fontSize: 13, textAlign: 'center', padding: 24 }}>데이터 로딩중…</div></div>;
  }

  if (error) {
    return (
      <div style={ds.section}>
        <div style={{ ...ds.card, color: C.red, fontSize: 13, textAlign: 'center', padding: 24 }}>
          불러오지 못했습니다
          <div style={{ marginTop: 10 }}>
            <button onClick={() => { setLoading(true); reload(); }} style={ds.chip(false)}>다시 시도</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={ds.section}>
      {!editing && (
        <button onClick={() => setEditing(blankMember())} style={ds.btnFull(C.accent)}>+ 회원 추가</button>
      )}

      {status && (
        <div style={{ fontSize: 12, textAlign: 'center', margin: '10px 0', color: status.type === 'ok' ? C.green : C.red }}>
          {status.msg}
        </div>
      )}

      {editing && (
        <MemberForm
          key={editing.row ?? 'new'}
          initial={editing}
          isNew={editing.row == null}
          members={members}
          saving={saving}
          onSave={onSave}
          onCancel={() => setEditing(null)}
          ds={ds} C={C}
        />
      )}

      <div style={{ marginTop: 12 }}>
        <div style={ds.sectionTitle}>정회원 · 게스트 ({active.length})</div>
        {active.length === 0
          ? <div style={{ ...ds.card, color: C.gray, fontSize: 12, textAlign: 'center' }}>회원이 없습니다</div>
          : active.map(m => (
            <MemberRow key={m.row} m={m} onEdit={mm => setEditing(memberToForm(mm))} onDelete={onDelete} saving={saving} ds={ds} C={C} />
          ))}
      </div>

      {deleted.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button onClick={() => setShowDeleted(s => !s)} style={{ background: 'none', border: 'none', color: C.accent, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', padding: '2px 2px' }}>
            {showDeleted ? '▾ 탈퇴 회원 숨기기' : `▸ 탈퇴 회원 보기 (${deleted.length})`}
          </button>
          {showDeleted && deleted.map(m => (
            <MemberRow key={m.row} m={m} deleted onRestore={onRestore} saving={saving} ds={ds} C={C} />
          ))}
        </div>
      )}
    </div>
  );
}
