// src/hooks/useBackNavigation.js
// 브라우저 뒤로가기를 앱의 "← 뒤로" 와 잇는다. 앱은 화면 전환을 React 상태로만 하고 URL 을 바꾸지 않아,
// 뒤로가기를 누르면 사이트 밖으로 나가 버렸다(2026-09-29 사용자 불편). 서브 화면이 열리는 순간(active true)
// history 항목을 하나 쌓고, popstate(뒤로가기)가 오면 그 화면의 onBack 을 부른다. 앱 버튼으로 닫히면
// 쌓아둔 항목을 history.back() 으로 걷어내되, 그 메아리 popstate 는 무시한다. URL 은 바꾸지 않는다.
//
// 중첩(예: Root 의 기록 보관소 화면 안에서 상세): 항목을 쌓은 순서를 모듈 스택으로 들고 있다가
// popstate 는 맨 위 항목의 onBack 만 부른다.
import { useEffect, useRef } from 'react';

const stack = [];   // { onBack } — 쌓은 순서
let suppress = 0;   // 우리가 부른 history.back() 의 메아리 popstate 를 이 횟수만큼 무시
let listening = false;

function handlePop() {
  if (suppress > 0) { suppress--; return; }
  const top = stack.pop();
  if (top) top.onBack();
}

function ensureListener() {
  if (listening || typeof window === 'undefined') return;
  window.addEventListener('popstate', handlePop);
  listening = true;
}

/**
 * @param {boolean} active 이 서브 화면이 열려 있는가
 * @param {() => void} onBack 뒤로가기(popstate)가 왔을 때 화면을 닫는 함수(앱 "← 뒤로" 와 같은 것)
 */
export function useBackNavigation(active, onBack) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active) return undefined;
    ensureListener();
    const entry = { onBack: () => onBackRef.current?.() };
    stack.push(entry);
    try { window.history.pushState({ appBack: stack.length }, ''); } catch { /* ignore */ }
    return () => {
      // popstate 로 닫혔으면 handlePop 이 이미 스택에서 뺐다 — 브라우저도 항목을 걷어냈으므로 할 일 없음.
      const idx = stack.indexOf(entry);
      if (idx === -1) return;
      // 앱 버튼·언마운트로 닫힘 — 우리가 쌓은 항목을 걷어낸다. 그 메아리 popstate 는 무시.
      stack.splice(idx, 1);
      suppress++;
      try { window.history.back(); } catch { suppress--; }
    };
  }, [active]);
}

// 테스트 전용 — 모듈 스택·억제 카운터 초기화(리스너는 유지).
export function _resetBackNavigationForTest() {
  stack.length = 0;
  suppress = 0;
}
