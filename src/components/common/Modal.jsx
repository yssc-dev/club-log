import { useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { useBackNavigation } from '../../hooks/useBackNavigation';
import { XIcon } from './icons';

export default function Modal({ onClose, children, title, maxWidth = 460 }) {
  const { C } = useTheme();
  // 열려 있는 동안 브라우저 뒤로가기가 이 모달을 닫는다(ESC 와 같은 동작). 모든 Modal 사용처에 한 번에 적용.
  useBackNavigation(true, onClose);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isDesktop = typeof window !== "undefined"
    && window.matchMedia("(min-width: 768px)").matches;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.35)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: isDesktop ? "center" : "flex-end",
        justifyContent: "center",
        animation: "modalFade 180ms ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="app-modal-sheet"
        style={{
          background: "var(--app-bg-elevated)",
          color: C.white,
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          borderBottomLeftRadius: isDesktop ? 14 : 0,
          borderBottomRightRadius: isDesktop ? 14 : 0,
          width: "100%", maxWidth,
          maxHeight: isDesktop ? "80vh" : "90vh",
          display: "flex", flexDirection: "column",
          boxShadow: "var(--app-shadow-lg)",
          animation: "sheetSlideUp 240ms cubic-bezier(.2,.7,.2,1)",
          overflow: "hidden",
        }}
      >
        {!isDesktop && (
          <div style={{ display: "flex", justifyContent: "center", padding: "6px 0 0" }}>
            <div style={{ width: 36, height: 5, borderRadius: 3, background: "var(--app-gray-4)" }} />
          </div>
        )}

        {title && (
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 16px 8px",
            borderBottom: "0.5px solid var(--app-divider)",
          }}>
            <span style={{ fontSize: 17, fontWeight: 600, color: C.white, letterSpacing: "-0.022em" }}>
              {title}
            </span>
            <button
              onClick={onClose}
              aria-label="닫기"
              style={{
                background: "var(--app-bg-row-hover)",
                border: 0, borderRadius: 999,
                width: 28, height: 28,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                color: "var(--app-text-secondary)",
                cursor: "pointer",
              }}
            >
              <XIcon width={14} />
            </button>
          </div>
        )}
        <div style={{ padding: 16, overflow: "auto", WebkitOverflowScrolling: "touch" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
