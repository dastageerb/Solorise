'use client';

import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  title: string;
  body: string;
  /** Quiet by design: the destructive button is not red. See DESIGN.md §Colour. */
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ title, body, confirmLabel, busy = false, onConfirm, onClose }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!el.open) el.showModal();
    return () => {
      if (el.open) el.close();
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener('cancel', onCancel);
    return () => el.removeEventListener('cancel', onCancel);
  }, [onClose]);

  return (
    <dialog ref={ref} style={{ width: 400, maxWidth: 'calc(100vw - var(--sp-8))' }} aria-labelledby="confirm-title">
      <div className="dialog-head">
        <h2 className="dialog-title" id="confirm-title">
          {title}
        </h2>
      </div>

      <div className="dialog-body">
        <p className="u-muted" style={{ fontSize: 'var(--fs-12)' }}>
          {body}
        </p>
      </div>

      <div className="dialog-foot">
        <span className="u-push" />
        <button className="btn" type="button" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button className="btn" type="button" disabled={busy} onClick={onConfirm}>
          {busy ? 'Deleting…' : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

