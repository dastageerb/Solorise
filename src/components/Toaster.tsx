'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface Toast {
  id: string;
  message: string;
  /** Every mutation toast can be reversed. Omit for informational toasts. */
  undo?: () => void;
}

interface ToasterProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

/** Bottom-right, max 3, 4s auto-dismiss, `aria-live="polite"`. No accent bar. */
export function Toaster({ toasts, onDismiss }: ToasterProps) {
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    toasts.forEach((toast) => {
      if (timers.current.has(toast.id)) return;
      timers.current.set(
        toast.id,
        setTimeout(() => {
          timers.current.delete(toast.id);
          onDismiss(toast.id);
        }, 4000),
      );
    });
  }, [toasts, onDismiss]);

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.slice(0, 3).map((toast) => (
        <div className="toast" key={toast.id}>
          <span>{toast.message}</span>
          {toast.undo && (
            <>
              <span className="u-push" />
              <button
                className="btn-text"
                type="button"
                onClick={() => {
                  toast.undo?.();
                  onDismiss(toast.id);
                }}
              >
                Undo
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/** Small helper so callers do not hand-roll ids. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, undo?: () => void) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, undo }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, push, dismiss };
}

