'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { getFirebaseClient } from '@/lib/firebase/client';
import type { TicketComment, UserProfile } from '@/lib/firebase/models';
import { COLUMN_LABEL, type StatusHistoryEntry } from '@/lib/types';
import { useAuth } from './AuthProvider';
import { Icon } from './icons';
import styles from './TicketComments.module.css';

interface TicketCommentsProps {
  projectId: string;
  ticketId: string;
  projectMembers: UserProfile[];
  statusHistory?: StatusHistoryEntry[];
}

function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return 'Just now';
  const now = Date.now();
  const time = new Date(dateStr).getTime();
  if (Number.isNaN(time)) return 'Just now';

  const diffSeconds = Math.max(0, Math.floor((now - time) / 1000));
  if (diffSeconds < 60) return 'Just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/** Parses text to render @mentions as highlighted pills */
function renderCommentContent(content: string, members: UserProfile[]) {
  // Regex that captures @words
  const parts = content.split(/(@[a-zA-Z0-9_\s]+?(?=[.,!?;:\s]|$))/g);

  return parts.map((part, index) => {
    if (part.startsWith('@')) {
      const mentionTarget = part.slice(1).trim().toLowerCase();
      const isKnownMember = members.some(
        (m) =>
          m.displayName.toLowerCase() === mentionTarget ||
          m.email.toLowerCase() === mentionTarget ||
          m.displayName.toLowerCase().startsWith(mentionTarget)
      );

      if (isKnownMember || mentionTarget.length > 0) {
        return (
          <span key={index} className={styles.mention}>
            {part}
          </span>
        );
      }
    }
    return part;
  });
}

export function TicketComments({
  projectId,
  ticketId,
  projectMembers,
  statusHistory = [],
}: TicketCommentsProps) {
  const { user, profile, isAdmin } = useAuth();
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<'all' | 'comments' | 'trail'>('all');

  type TimelineEntry =
    | { kind: 'comment'; timestamp: number; comment: TicketComment }
    | { kind: 'status'; timestamp: number; history: StatusHistoryEntry };

  const timeline = useMemo<TimelineEntry[]>(() => {
    const list: TimelineEntry[] = [];
    if (filter === 'all' || filter === 'comments') {
      comments.forEach((c) => {
        const ts = new Date(c.createdAt).getTime() || 0;
        list.push({ kind: 'comment', timestamp: ts, comment: c });
      });
    }
    if (filter === 'all' || filter === 'trail') {
      statusHistory.forEach((h) => {
        const ts = new Date(h.timestamp).getTime() || 0;
        list.push({ kind: 'status', timestamp: ts, history: h });
      });
    }
    return list.sort((a, b) => a.timestamp - b.timestamp);
  }, [comments, statusHistory, filter]);

  // Mention State
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionedIds, setMentionedIds] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Edit & Dropdown Menu State
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Close dropdown on outside click
  useEffect(() => {
    if (!activeMenuId) return;
    const handleDocClick = () => setActiveMenuId(null);
    window.addEventListener('click', handleDocClick);
    return () => window.removeEventListener('click', handleDocClick);
  }, [activeMenuId]);

  // Filter members by the typed query after '@'
  const matchingMembers = mentionQuery === null
    ? []
    : projectMembers.filter((m) => {
        const q = mentionQuery.toLowerCase();
        return (
          m.displayName.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q)
        );
      });

  useEffect(() => {
    if (!projectId || !ticketId) return;
    const { db } = getFirebaseClient();
    const commentsRef = collection(
      db,
      'projects',
      projectId,
      'tickets',
      ticketId,
      'comments'
    );
    const q = query(commentsRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            ticketId,
            projectId,
            authorId: String(d.authorId ?? ''),
            authorName: String(d.authorName ?? 'User'),
            authorEmail: String(d.authorEmail ?? ''),
            authorRole: d.authorRole || 'member',
            content: String(d.content ?? ''),
            mentionedUserIds: Array.isArray(d.mentionedUserIds) ? d.mentionedUserIds : [],
            createdAt: d.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          } satisfies TicketComment;
        });

        setComments(list);
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to comments:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [projectId, ticketId]);

  // Handle Textarea Change & Mention Detection
  function handleTextChange(val: string) {
    setText(val);
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursor = textarea.selectionStart;
    const textBeforeCursor = val.slice(0, cursor);

    // Look for an @ trigger immediately before cursor
    const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_\s]{0,25})$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }

  // Insert Chosen Mention
  function selectMention(member: UserProfile) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursor = textarea.selectionStart;
    const textBeforeCursor = text.slice(0, cursor);
    const textAfterCursor = text.slice(cursor);

    const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_\s]{0,25})$/);
    if (!match) return;

    const atIndex = textBeforeCursor.lastIndexOf('@');
    const prefix = textBeforeCursor.slice(0, atIndex);
    const inserted = `@${member.displayName} `;
    const newText = `${prefix}${inserted}${textAfterCursor}`;

    setText(newText);
    setMentionQuery(null);
    if (!mentionedIds.includes(member.uid)) {
      setMentionedIds((prev) => [...prev, member.uid]);
    }

    // Restore focus and place cursor after inserted mention
    setTimeout(() => {
      textarea.focus();
      const newCursor = prefix.length + inserted.length;
      textarea.setSelectionRange(newCursor, newCursor);
    }, 0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // When mention dropdown is active
    if (mentionQuery !== null && matchingMembers.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setMentionIndex((prev) => (prev + 1) % matchingMembers.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setMentionIndex((prev) => (prev - 1 + matchingMembers.length) % matchingMembers.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const selected = matchingMembers[mentionIndex];
        if (selected) selectMention(selected);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    // Submit with Ctrl+Enter or Cmd+Enter
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void handleSubmit();
    }
  }

  async function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed || !user || submitting) return;

    setSubmitting(true);
    try {
      const { db } = getFirebaseClient();

      // Collect any mentioned user IDs based on text
      const finalMentioned = [...mentionedIds];
      projectMembers.forEach((m) => {
        if (trimmed.includes(`@${m.displayName}`) && !finalMentioned.includes(m.uid)) {
          finalMentioned.push(m.uid);
        }
      });

      const commentsRef = collection(
        db,
        'projects',
        projectId,
        'tickets',
        ticketId,
        'comments'
      );

      await addDoc(commentsRef, {
        ticketId,
        projectId,
        authorId: user.uid,
        authorName: profile?.displayName || user.displayName || user.email || 'Team member',
        authorEmail: user.email || '',
        authorRole: profile?.role || 'member',
        content: trimmed,
        mentionedUserIds: finalMentioned,
        createdAt: serverTimestamp(),
      });

      // Update commentCount on parent ticket document
      const ticketRef = doc(db, 'projects', projectId, 'tickets', ticketId);
      await updateDoc(ticketRef, {
        commentCount: increment(1),
        updatedAt: serverTimestamp(),
      });

      setText('');
      setMentionQuery(null);
      setMentionedIds([]);
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setSubmitting(false);
    }
  }

  function handleStartEdit(comment: TicketComment) {
    setEditingId(comment.id);
    setEditText(comment.content);
    setActiveMenuId(null);
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditText('');
  }

  async function handleSaveEdit(commentId: string) {
    const trimmed = editText.trim();
    if (!trimmed || savingEdit) return;

    setSavingEdit(true);
    try {
      const { db } = getFirebaseClient();
      const commentRef = doc(
        db,
        'projects',
        projectId,
        'tickets',
        ticketId,
        'comments',
        commentId
      );
      await updateDoc(commentRef, {
        content: trimmed,
        updatedAt: serverTimestamp(),
      });
      setEditingId(null);
      setEditText('');
    } catch (err) {
      console.error('Failed to update comment:', err);
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(commentId: string) {
    if (!confirm('Are you sure you want to delete this comment?')) return;
    try {
      const { db } = getFirebaseClient();
      await deleteDoc(
        doc(db, 'projects', projectId, 'tickets', ticketId, 'comments', commentId)
      );

      // Decrement ticket commentCount
      const ticketRef = doc(db, 'projects', projectId, 'tickets', ticketId);
      await updateDoc(ticketRef, {
        commentCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  }

  return (
    <section className={styles.container} aria-label="Ticket comments and activity">
      <div className={styles.head}>
        <div className={styles.headTitle}>
          <Icon name="comment" size={15} />
          <span>Activity & Trail</span>
        </div>
        <div className={styles.filterGroup}>
          <button
            type="button"
            className={styles.filterBtn}
            data-active={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            All <span className={styles.filterCount}>{comments.length + statusHistory.length}</span>
          </button>
          <button
            type="button"
            className={styles.filterBtn}
            data-active={filter === 'comments'}
            onClick={() => setFilter('comments')}
          >
            Comments <span className={styles.filterCount}>{comments.length}</span>
          </button>
          <button
            type="button"
            className={styles.filterBtn}
            data-active={filter === 'trail'}
            onClick={() => setFilter('trail')}
          >
            Status trail <span className={styles.filterCount}>{statusHistory.length}</span>
          </button>
        </div>
      </div>

      <div className={styles.list}>
        {loading && <p className={styles.empty}>Loading activity…</p>}
        {!loading && timeline.length === 0 && (
          <p className={styles.empty}>
            {filter === 'comments'
              ? 'No comments yet. Leave an update below or type @ to mention a teammate.'
              : filter === 'trail'
              ? 'No status changes recorded yet.'
              : 'No activity yet. Leave an update below.'}
          </p>
        )}
        {!loading &&
          timeline.map((entry, idx) => {
            if (entry.kind === 'status') {
              const h = entry.history;
              return (
                <div key={`hist-${idx}-${h.timestamp}`} className={styles.trailRow}>
                  <span className={styles.trailDot} data-status={h.to} />
                  <div className={styles.trailDetails}>
                    <span className={styles.trailActor}>{h.actorName}</span>
                    <span className={styles.trailText}>
                      {h.from ? (
                        <>
                          moved from <span className={styles.statusBadge}>{COLUMN_LABEL[h.from] || h.from}</span> to{' '}
                          <span className={styles.statusBadge} data-status={h.to}>{COLUMN_LABEL[h.to] || h.to}</span>
                        </>
                      ) : (
                        <>
                          created ticket in <span className={styles.statusBadge} data-status={h.to}>{COLUMN_LABEL[h.to] || h.to}</span>
                        </>
                      )}
                    </span>
                    <time className={styles.timestamp}>{formatRelativeTime(h.timestamp)}</time>
                  </div>
                </div>
              );
            }

            const comment = entry.comment;
            const isAuthor = comment.authorId === user?.uid;
            const canEdit = isAuthor;
            const canDelete = isAdmin || isAuthor;
            const isEditing = editingId === comment.id;

            return (
              <article key={comment.id} className={styles.comment}>
                <div className={styles.avatar} aria-hidden="true">
                  {getInitials(comment.authorName)}
                </div>
                <div className={styles.commentContent}>
                  <div className={styles.commentMeta}>
                    <span className={styles.authorName}>{comment.authorName}</span>
                    <span className={styles.authorRole}>{comment.authorRole}</span>
                    <time className={styles.timestamp}>
                      {formatRelativeTime(comment.createdAt)}
                    </time>
                    {(canEdit || canDelete) && !isEditing && (
                      <div className={styles.actionWrap}>
                        <button
                          type="button"
                          className={styles.moreButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId(activeMenuId === comment.id ? null : comment.id);
                          }}
                          aria-label="Comment options"
                          title="Options"
                        >
                          ···
                        </button>
                        {activeMenuId === comment.id && (
                          <div
                            className={styles.dropdown}
                            role="menu"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {canEdit && (
                              <button
                                type="button"
                                className={styles.menuItem}
                                onClick={() => handleStartEdit(comment)}
                              >
                                Edit
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                className={styles.menuItemDanger}
                                onClick={() => {
                                  setActiveMenuId(null);
                                  void handleDelete(comment.id);
                                }}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {isEditing ? (
                    <div className={styles.editBox}>
                      <textarea
                        className={styles.editTextarea}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                            e.preventDefault();
                            void handleSaveEdit(comment.id);
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            handleCancelEdit();
                          }
                        }}
                        disabled={savingEdit}
                        autoFocus
                      />
                      <div className={styles.editActions}>
                        <button
                          type="button"
                          className={styles.cancelEditBtn}
                          onClick={handleCancelEdit}
                          disabled={savingEdit}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className={styles.saveEditBtn}
                          onClick={() => void handleSaveEdit(comment.id)}
                          disabled={!editText.trim() || savingEdit}
                        >
                          {savingEdit ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.commentBody}>
                      {renderCommentContent(comment.content, projectMembers)}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
      </div>

      <div className={styles.composer}>
        {/* Floating Mention Suggestions */}
        {mentionQuery !== null && matchingMembers.length > 0 && (
          <div className={styles.mentionDropdown} role="listbox" aria-label="Mention a team member">
            <span className={styles.mentionHeader}>Mention team member</span>
            {matchingMembers.map((member, idx) => (
              <button
                key={member.uid}
                type="button"
                className={styles.mentionOption}
                data-active={idx === mentionIndex}
                onClick={() => selectMention(member)}
                role="option"
                aria-selected={idx === mentionIndex}
              >
                <span className={styles.mentionAvatar}>
                  {getInitials(member.displayName)}
                </span>
                <div className={styles.mentionInfo}>
                  <span className={styles.mentionName}>{member.displayName}</span>
                  <span className={styles.mentionEmail}>
                    {member.email} · {member.role}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Leave a comment or update... Type @ to mention a project member"
          disabled={submitting}
        />

        <div className={styles.composerFooter}>
          <span className={styles.hint}>
            Press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to post
          </span>
          <button
            type="button"
            className={styles.submitButton}
            onClick={() => void handleSubmit()}
            disabled={!text.trim() || submitting}
          >
            {submitting ? 'Posting…' : 'Comment'}
          </button>
        </div>
      </div>
    </section>
  );
}
