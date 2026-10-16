'use client';

import { useEffect, useRef } from 'react';
import { COLUMN_LABEL, COLUMN_ORDER, type ColumnId } from '@/lib/types';
import { Icon } from './icons';

interface RowMenuProps {
  x: number;
  y: number;
  column: ColumnId;
  onOpen: () => void;
  onMoveTo: (column: ColumnId) => void;
  onDelete: () => void;
  onClose: () => void;
}

/** Card overflow menu: open, move between lanes, delete. */
export function RowMenu({ x, y, column, onOpen, onMoveTo, onDelete, onClose }: RowMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const width = 196;
  const height = 264;
  const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - height - 8));

  return (
    <div ref={ref} className="menu" role="menu" style={{ left, top, width }} aria-label="Issue actions">
      <button className="menu-item" type="button" role="menuitem" onClick={onOpen}>
        Open issue
      </button>
      <div className="menu-rule" />
      <p className="menu-label">Move to</p>
      {COLUMN_ORDER.map((id) => (
        <button
          key={id}
          className="menu-item"
          type="button"
          role="menuitemradio"
          aria-checked={id === column}
          onClick={() => onMoveTo(id)}
        >
          <span className="status-dot" data-status={id} aria-hidden="true" />
          {COLUMN_LABEL[id]}
          {id === column && (
            <span className="u-push" aria-hidden="true">
              <Icon name="check" size={14} />
            </span>
          )}
        </button>
      ))}
      <div className="menu-rule" />
      <button className="menu-item" type="button" role="menuitem" onClick={onDelete}>
        <span aria-hidden="true"><Icon name="trash" size={14} /></span>
        Delete
      </button>
    </div>
  );
}


