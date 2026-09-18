import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import "./Toast.css";

const ToastContext = createContext({ showToast: () => {} });

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, tone = "success") => {
    if (!message) return;
    setToast({ message, tone, key: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Polite live region: announced without interrupting the visitor. */}
      <div className="toast-region" role="status" aria-live="polite">
        {toast ? (
          <p key={toast.key} className={`toast toast--${toast.tone}`}>
            {toast.message}
          </p>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
