'use client';

import { useEffect, useRef, useState } from 'react';
import { COLUMN_LABEL, COLUMN_ORDER, TAGS, type ColumnId, type Priority, type Task } from '@/lib/types';
import type { ProjectTicket, TicketType, UserProfile } from '@/lib/firebase/models';
import { Icon } from './icons';
import { TicketComments } from './TicketComments';
import styles from './TaskEditor.module.css';

export interface TaskDraft {
  title: string;
  description: string;
  column: ColumnId;
  priority: Priority;
  tagIds: string[];
  assigneeId: string | null;
  dueDate: string | null;
  checklist: { id: string; label: string; done: boolean }[];
  type: TicketType;
  department: string;
  clientVisible: boolean;
}

interface TaskEditorProps {
  task: Task | null;
  column: ColumnId;
  prefix: string;
  nextKey: string;
  projectId?: string;
  members?: UserProfile[];
  projectMembers?: UserProfile[];
  onSave: (draft: TaskDraft) => void;
  onDelete?: () => void;
  onClose: () => void;
}

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 1, label: 'Urgent' },
  { value: 2, label: 'High' },
  { value: 3, label: 'Normal' },
  { value: 4, label: 'No priority' },
];

const TYPE_OPTIONS: { value: TicketType; label: string; icon: string }[] = [
  { value: 'bug', label: 'Bug', icon: '✣' },
  { value: 'feature', label: 'Feature', icon: '✦' },
  { value: 'change', label: 'Change', icon: '⇄' },
];

type PropertyValue = string | number;

interface PropertyOption<T extends PropertyValue> {
  value: T;
  label: string;
  meta?: string;
  status?: ColumnId;
}

function PropertySelect<T extends PropertyValue>({
  id,
  value,
  options,
  open,
  onToggle,
  onChange,
}: {
  id: string;
  value: T;
  options: PropertyOption<T>[];
  open: boolean;
  onToggle: () => void;
  onChange: (value: T) => void;
}) {
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div className={styles.selectWrap} data-property-select>
      <button
        id={id}
        type="button"
        className={styles.selectTrigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className={styles.selectValue}>
          {selected.status && <span className={styles.selectDot} data-status={selected.status} />}
          {selected.meta && <span className={styles.optionMeta}>{selected.meta}</span>}
          <span>{selected.label}</span>
        </span>
        <Icon name="chevron" size={14} />
      </button>

      {open && (
        <div className={styles.selectMenu} role="listbox" aria-labelledby={id}>
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={String(option.value)}
                type="button"
                className={styles.selectOption}
                data-selected={isSelected}
                role="option"
                aria-selected={isSelected}
                onClick={() => onChange(option.value)}
              >
                <span className={styles.selectValue}>
                  {option.status && <span className={styles.selectDot} data-status={option.status} />}
                  {option.meta && <span className={styles.optionMeta}>{option.meta}</span>}
                  <span>{option.label}</span>
                </span>
                {isSelected && <Icon name="check" size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TaskEditor({
  task,
  column,
  prefix,
  nextKey,
  projectId,
  members = [],
  projectMembers,
  onSave,
  onDelete,
  onClose,
}: TaskEditorProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const projectTask = task as ProjectTicket | null;
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [col, setCol] = useState<ColumnId>(task?.column ?? column);
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 3);
  const [tagIds, setTagIds] = useState<string[]>(task?.tagIds ?? []);
  const [assigneeId, setAssigneeId] = useState<string | null>(task?.assigneeId ?? null);
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '');
  const [checklist, setChecklist] = useState(task?.checklist ?? []);
  const [type, setType] = useState<TicketType>(projectTask?.type ?? 'bug');
  const [department, setDepartment] = useState(projectTask?.department ?? 'Development');
  const [clientVisible, setClientVisible] = useState(projectTask?.clientVisible ?? false);
  const [newItem, setNewItem] = useState('');
  const [showChecklist, setShowChecklist] = useState((task?.checklist?.length ?? 0) > 0);
  const [error, setError] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [openProperty, setOpenProperty] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const cancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', cancel);
    return () => dialog.removeEventListener('cancel', cancel);
  }, [onClose]);

  useEffect(() => {
    if (!openProperty) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && !target.closest('[data-property-select]')) setOpenProperty(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpenProperty(null);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [openProperty]);

  function submit() {
    const value = title.trim();
    if (!value) {
      setError('Title is required.');
      return;
    }
    onSave({
      title: value,
      description: description.trim(),
      column: col,
      priority,
      tagIds,
      assigneeId,
      dueDate: dueDate || null,
      checklist,
      type,
      department: department.trim() || 'General',
      clientVisible,
    });
  }

  function toggleTag(id: string) {
    setTagIds((current) => (current.includes(id) ? current.filter((tag) => tag !== id) : [...current, id]));
  }

  function addChecklistItem() {
    const label = newItem.trim();
    if (!label) return;
    setChecklist((current) => [...current, { id: `c_${Math.random().toString(36).slice(2, 8)}`, label, done: false }]);
    setNewItem('');
  }

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby="ticket-key">
      <div
        className={styles.shell}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            submit();
          }
        }}
      >
        {/* Minimal Modern Header */}
        <header className={styles.head}>
          <div className={styles.headKey}>
            <span id="ticket-key" className={styles.key}>
              {task ? task.issueKey : nextKey}
            </span>
            <span className={styles.crumb} aria-hidden="true">/</span>
            <span className={styles.projectSlug}>{task ? 'Ticket details' : `New ${prefix} ticket`}</span>
          </div>

          <div className={styles.headActions}>
            {task && onDelete && (
              <div className={styles.moreWrap}>
                <button
                  type="button"
                  className={styles.moreButton}
                  onClick={() => setShowMenu((prev) => !prev)}
                  aria-label="More options"
                  title="More options"
                >
                  ···
                </button>
                {showMenu && (
                  <div className={styles.dropdownMenu} onMouseLeave={() => setShowMenu(false)}>
                    <button
                      type="button"
                      className={styles.menuItemDanger}
                      onClick={() => {
                        setShowMenu(false);
                        onDelete();
                      }}
                    >
                      <Icon name="trash" size={14} /> Delete ticket
                    </button>
                  </div>
                )}
              </div>
            )}
            <button className={styles.closeButton} type="button" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </header>

        {/* Content Body */}
        <div className={styles.body}>
          {/* Main Left Canvas */}
          <main className={styles.main}>
            <section className={styles.workflowPanel} aria-labelledby="workflow-title">
              <div className={styles.workflowHead}>
                <span id="workflow-title" className={styles.eyebrow}>Workflow</span>
                <span className={styles.currentStatus}>{COLUMN_LABEL[col]}</span>
              </div>
              <nav className={styles.statusStepper} aria-label="Ticket status workflow">
              {COLUMN_ORDER.map((columnId, idx) => {
                const isCurrent = col === columnId;
                const isPast = task?.statusHistory?.some((h) => h.to === columnId);
                return (
                  <button
                    key={columnId}
                    type="button"
                    className={styles.stepButton}
                    data-current={isCurrent}
                    data-past={isPast && !isCurrent}
                    onClick={() => setCol(columnId)}
                    title={`Move to ${COLUMN_LABEL[columnId]}`}
                  >
                    <span className={styles.stepDot} data-status={columnId} />
                    <span className={styles.stepLabel}>{COLUMN_LABEL[columnId]}</span>
                    {idx < COLUMN_ORDER.length - 1 && <span className={styles.stepArrow}>›</span>}
                  </button>
                );
              })}
              </nav>
            </section>

            <section className={styles.contentFields} aria-label="Ticket content">
              <label className={styles.fieldBlock} htmlFor="f-title">
                <span className={styles.eyebrow}>Ticket title</span>
                <input
              id="f-title"
              className={styles.titleInput}
              type="text"
              maxLength={160}
              placeholder="What needs to happen?"
              autoComplete="off"
              autoFocus
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (error) setError('');
              }}
                  aria-invalid={Boolean(error)}
                />
              </label>
              {error && <p className={styles.error}>{error}</p>}

              <label className={styles.fieldBlock} htmlFor="f-desc">
                <span className={styles.eyebrow}>Description</span>
                <textarea
                  id="f-desc"
                  className={styles.descriptionInput}
                  placeholder="Add context, acceptance notes, or a resolution summary…"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
            </section>

            {/* Clean Optional Checklist (hidden by default unless items exist or user adds) */}
            {!showChecklist && checklist.length === 0 ? (
              <div className={styles.addChecklistTrigger}>
                <button
                  type="button"
                  className={styles.addChecklistBtn}
                  onClick={() => setShowChecklist(true)}
                >
                  <Icon name="plus" size={13} /> Add checklist or subtasks
                </button>
              </div>
            ) : (
              <section className={styles.checklistSection} aria-label="Checklist">
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionTitle}>
                    <Icon name="checklist" size={14} /> Checklist
                  </span>
                  {checklist.length > 0 ? (
                    <span className={styles.badge}>
                      {checklist.filter((item) => item.done).length}/{checklist.length}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={styles.dismissChecklist}
                      onClick={() => setShowChecklist(false)}
                    >
                      Hide
                    </button>
                  )}
                </div>

                {checklist.length > 0 && (
                  <ul className={styles.items}>
                    {checklist.map((item) => (
                      <li key={item.id} className={styles.item}>
                        <label className={styles.itemLabel}>
                          <input
                            type="checkbox"
                            checked={item.done}
                            onChange={() =>
                              setChecklist((current) =>
                                current.map((entry) => (entry.id === item.id ? { ...entry, done: !entry.done } : entry))
                              )
                            }
                          />
                          <span data-done={item.done}>{item.label}</span>
                        </label>
                        <button
                          className={styles.removeItem}
                          type="button"
                          aria-label={`Remove ${item.label}`}
                          onClick={() => setChecklist((current) => current.filter((entry) => entry.id !== item.id))}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className={styles.addItemRow}>
                  <input
                    className={styles.addItemInput}
                    type="text"
                    placeholder="Add a step..."
                    value={newItem}
                    onChange={(event) => setNewItem(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addChecklistItem();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className={styles.addItemButton}
                    onClick={addChecklistItem}
                    disabled={!newItem.trim()}
                  >
                    <Icon name="plus" size={13} /> Add
                  </button>
                </div>
              </section>
            )}

            {/* Comments Thread & Activity Trail */}
            {task && projectId && (
              <TicketComments
                projectId={projectId}
                ticketId={task.id}
                projectMembers={projectMembers || members}
                statusHistory={task.statusHistory ?? []}
              />
            )}
          </main>

          {/* Clean Property Sidebar (Linear-style) */}
          <aside className={styles.meta} aria-label="Ticket properties">
            <div className={styles.metaHead}>
              <span className={styles.eyebrow}>Properties</span>
              <p>Routing and ownership</p>
            </div>
            <div className={styles.propGroup}>
              {/* Status */}
              <div className={styles.propRow}>
                <label htmlFor="f-status" className={styles.propLabel}>
                  Status
                </label>
                <PropertySelect
                  id="f-status"
                  value={col}
                  options={COLUMN_ORDER.map((id) => ({ value: id, label: COLUMN_LABEL[id], status: id }))}
                  open={openProperty === 'status'}
                  onToggle={() => setOpenProperty((current) => current === 'status' ? null : 'status')}
                  onChange={(value) => { setCol(value); setOpenProperty(null); }}
                />
              </div>

              {/* Priority */}
              <div className={styles.propRow}>
                <label htmlFor="f-priority" className={styles.propLabel}>
                  Priority
                </label>
                <PropertySelect
                  id="f-priority"
                  value={priority}
                  options={PRIORITIES.map((option) => ({
                    ...option,
                    meta: option.value === 4 ? '—' : `P${option.value}`,
                  }))}
                  open={openProperty === 'priority'}
                  onToggle={() => setOpenProperty((current) => current === 'priority' ? null : 'priority')}
                  onChange={(value) => { setPriority(value); setOpenProperty(null); }}
                />
              </div>

              {/* Type */}
              <div className={styles.propRow}>
                <label htmlFor="f-type" className={styles.propLabel}>
                  Type
                </label>
                <PropertySelect
                  id="f-type"
                  value={type}
                  options={TYPE_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                    meta: option.icon,
                  }))}
                  open={openProperty === 'type'}
                  onToggle={() => setOpenProperty((current) => current === 'type' ? null : 'type')}
                  onChange={(value) => { setType(value); setOpenProperty(null); }}
                />
              </div>

              {/* Assignee */}
              <div className={styles.propRow}>
                <label htmlFor="f-assignee" className={styles.propLabel}>
                  Assignee
                </label>
                <PropertySelect
                  id="f-assignee"
                  value={assigneeId ?? ''}
                  options={[
                    { value: '', label: 'Unassigned' },
                    ...members.map((member) => ({ value: member.uid, label: member.displayName })),
                  ]}
                  open={openProperty === 'assignee'}
                  onToggle={() => setOpenProperty((current) => current === 'assignee' ? null : 'assignee')}
                  onChange={(value) => { setAssigneeId(value || null); setOpenProperty(null); }}
                />
              </div>

              {/* Due Date */}
              <div className={styles.propRow}>
                <label htmlFor="f-due" className={styles.propLabel}>
                  Due date
                </label>
                <input
                  id="f-due"
                  type="date"
                  className={styles.propInput}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>

              {/* Area / Department */}
              <div className={styles.propRow}>
                <label htmlFor="f-dept" className={styles.propLabel}>
                  Area
                </label>
                <input
                  id="f-dept"
                  type="text"
                  className={styles.propInput}
                  placeholder="e.g. Frontend"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.divider} />

            {/* Labels */}
            <div className={styles.tagsRow}>
              <span className={styles.propLabel}>Labels</span>
              <div className={styles.tagsList}>
                {TAGS.map((tag) => {
                  const selected = tagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      className={styles.tagChip}
                      data-selected={selected}
                      data-tone={tag.tone}
                      onClick={() => toggleTag(tag.id)}
                    >
                      <span className={styles.tagDot} />
                      {tag.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.divider} />

            {/* Client Visibility Toggle */}
            <label className={styles.visibilityRow}>
              <span className={styles.visibilityCopy}>
                <b>Client access</b>
                <small>Visible in the client view</small>
              </span>
              <div className={styles.switch}>
                <input
                  type="checkbox"
                  checked={clientVisible}
                  onChange={(e) => setClientVisible(e.target.checked)}
                />
                <span className={styles.slider} />
              </div>
            </label>
          </aside>
        </div>

        {/* Minimal Footer */}
        <footer className={styles.foot}>
          <span className={styles.shortcut}>
            Press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to save
          </span>
          <div className={styles.footActions}>
            <button className={styles.cancelButton} type="button" onClick={onClose}>
              Cancel
            </button>
            <button className={styles.saveButton} type="button" onClick={submit}>
              {task ? 'Save changes' : 'Create ticket'}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
