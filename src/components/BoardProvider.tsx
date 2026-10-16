'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getFirebaseClient } from '@/lib/firebase/client';
import type { NewProjectInput, NewTicketInput, Project, ProjectTicket, UserProfile } from '@/lib/firebase/models';
import { COLUMN_LABEL, COLUMN_ORDER, type ColumnId, type StatusHistoryEntry, type Task } from '@/lib/types';
import { deriveStats, issuePrefix, nextIssueKey, type BoardStats } from '@/lib/taskStore';
import { useAuth } from './AuthProvider';
import { useToasts, type Toast } from './Toaster';
import type { TaskDraft } from './TaskEditor';

interface BoardContextValue {
  loaded: boolean;
  projectsLoaded: boolean;
  projects: Project[];
  activeProjectId: string | null;
  activeProject: Project | null;
  setActiveProjectId: (id: string) => void;
  members: UserProfile[];
  tasks: ProjectTicket[];
  stats: BoardStats;
  toasts: Toast[];
  dismissToast: (id: string) => void;
  pushToast: (message: string) => void;
  createProject: (input: NewProjectInput) => Promise<string>;
  updateProjectMembers: (accessIds: string[], editorIds: string[], clientIds: string[]) => Promise<void>;
  updateProjectTriage: (projectId: string, triageInstructions: string) => Promise<void>;
  updateProjectDetails: (projectId: string, updates: { name: string; description: string; triageInstructions?: string }) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  moveTask: (task: Task, column: ColumnId) => void;
  cycleColumn: (task: Task) => void;
  toggleChecklistItem: (task: Task, itemId: string) => void;
  saveTask: (draft: TaskDraft, existing: Task | null) => void;
  createTicketFromAi: (input: NewTicketInput, targetProjectId?: string) => Promise<void>;
  removeTask: (task: Task) => void;
}

const BoardContext = createContext<BoardContextValue | null>(null);

function timestampToIso(value: unknown): string {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return typeof value === 'string' ? value : new Date().toISOString();
}

export function useBoard(): BoardContextValue {
  const value = useContext(BoardContext);
  if (!value) throw new Error('useBoard must be used inside BoardProvider.');
  return value;
}

export function BoardProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, isAdmin, getToken } = useAuth();
  const { db } = getFirebaseClient();
  const { toasts, push, dismiss } = useToasts();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [tasks, setTasks] = useState<ProjectTicket[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    const base = collection(db, 'projects');
    const projectsQuery = isAdmin ? query(base, orderBy('createdAt', 'asc')) : query(base, where('accessIds', 'array-contains', user.uid));
    return onSnapshot(projectsQuery, (snapshot) => {
      const rows = snapshot.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          name: String(data.name ?? 'Untitled project'),
          description: String(data.description ?? ''),
          slug: String(data.slug ?? item.id),
          color: String(data.color ?? '#3d43ff'),
          ownerId: String(data.ownerId ?? ''),
          accessIds: Array.isArray(data.accessIds) ? data.accessIds : [],
          editorIds: Array.isArray(data.editorIds) ? data.editorIds : [],
          clientIds: Array.isArray(data.clientIds) ? data.clientIds : [],
          createdAt: timestampToIso(data.createdAt),
          triageInstructions: String(data.triageInstructions ?? ''),
        } satisfies Project;
      });
      setProjects(rows);
      setActiveProjectIdState((current) => current && rows.some((item) => item.id === current) ? current : rows[0]?.id ?? null);
      setProjectsLoaded(true);
    }, (error) => {
      push(error.message);
      setProjectsLoaded(true);
    });
  }, [db, isAdmin, push, user]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, 'users'), (snapshot) => {
      setMembers(snapshot.docs.map((item) => {
        const data = item.data();
        return {
          uid: item.id,
          email: String(data.email ?? ''),
          displayName: String(data.displayName ?? data.email ?? 'User'),
          role: data.role === 'admin' || data.role === 'client' ? data.role : 'member',
          createdAt: timestampToIso(data.createdAt),
        };
      }));
    });
  }, [db, user]);

  useEffect(() => {
    setTasks([]);
    setLoaded(false);
    if (!activeProjectId) {
      setLoaded(true);
      return;
    }
    const ticketsBase = collection(db, 'projects', activeProjectId, 'tickets');
    const ticketsQuery = profile?.role === 'client'
      ? query(ticketsBase, where('clientVisible', '==', true))
      : query(ticketsBase, orderBy('order', 'asc'));
    return onSnapshot(ticketsQuery, (snapshot) => {
      setTasks(snapshot.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          issueKey: String(data.issueKey ?? ''),
          title: String(data.title ?? 'Untitled ticket'),
          description: String(data.description ?? ''),
          column: COLUMN_ORDER.includes(data.column) ? data.column : 'backlog',
          priority: [1, 2, 3, 4].includes(data.priority) ? data.priority : 4,
          tagIds: Array.isArray(data.tagIds) ? data.tagIds : [],
          assigneeId: typeof data.assigneeId === 'string' ? data.assigneeId : null,
          checklist: Array.isArray(data.checklist) ? data.checklist : [],
          dueDate: typeof data.dueDate === 'string' ? data.dueDate : null,
          order: Number(data.order ?? 0),
          createdAt: timestampToIso(data.createdAt),
          updatedAt: timestampToIso(data.updatedAt),
          completedAt: data.completedAt ? timestampToIso(data.completedAt) : null,
          type: data.type === 'bug' || data.type === 'change' ? data.type : 'feature',
          department: String(data.department ?? 'General'),
          clientVisible: data.clientVisible === true,
          reporterId: String(data.reporterId ?? ''),
          commentCount: Number(data.commentCount ?? 0),
          statusHistory: Array.isArray(data.statusHistory) ? data.statusHistory : [],
        } as ProjectTicket;
      }).sort((a, b) => a.order - b.order));
      setLoaded(true);
    }, (error) => {
      push(error.message);
      setLoaded(true);
    });
  }, [activeProjectId, db, profile?.role, push]);

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;

  const createProject = useCallback(async ({ name, description, triageInstructions }: NewProjectInput) => {
    if (!user || !isAdmin) throw new Error('Only an admin can create projects.');
    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'project';
    const reference = await addDoc(collection(db, 'projects'), {
      name: name.trim(),
      description: description.trim(),
      triageInstructions: triageInstructions?.trim() || '',
      slug,
      color: '#3d43ff',
      ownerId: user.uid,
      accessIds: [user.uid],
      editorIds: [user.uid],
      clientIds: [],
      createdAt: serverTimestamp(),
    });
    setActiveProjectIdState(reference.id);
    push('Project created.');
    return reference.id;
  }, [db, isAdmin, push, user]);

  const updateProjectMembers = useCallback(async (accessIds: string[], editorIds: string[], clientIds: string[]) => {
    if (!activeProjectId || !isAdmin) throw new Error('Only an admin can change project access.');
    await updateDoc(doc(db, 'projects', activeProjectId), { accessIds, editorIds, clientIds });
    push('Project access updated.');
  }, [activeProjectId, db, isAdmin, push]);

  const updateProjectTriage = useCallback(async (projectId: string, triageInstructions: string) => {
    if (!user) throw new Error('Sign in required.');
    await updateDoc(doc(db, 'projects', projectId), {
      triageInstructions: triageInstructions.trim(),
      updatedAt: serverTimestamp(),
    });
    push('Project triage context saved.');
  }, [db, push, user]);

  const updateProjectDetails = useCallback(async (projectId: string, updates: { name: string; description: string; triageInstructions?: string }) => {
    if (!user) throw new Error('Sign in required.');
    const name = updates.name.trim();
    if (!name) throw new Error('Give the project a name.');
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'project';
    await updateDoc(doc(db, 'projects', projectId), {
      name,
      slug,
      description: updates.description.trim(),
      triageInstructions: updates.triageInstructions?.trim() || '',
      updatedAt: serverTimestamp(),
    });
    push('Project settings updated.');
  }, [db, push, user]);

  const deleteProject = useCallback(async (projectId: string) => {
    if (!user || !isAdmin) throw new Error('Only an admin can delete projects.');
    const token = await getToken();
    const response = await fetch(`/api/admin/projects/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not delete the project.');
    setActiveProjectIdState((current) => current === projectId ? null : current);
    push('Project deleted.');
  }, [getToken, isAdmin, push, user]);

  const patchTask = useCallback((task: Task, changes: Partial<ProjectTicket>, message: string) => {
    if (!activeProjectId) return;
    void updateDoc(doc(db, 'projects', activeProjectId, 'tickets', task.id), { ...changes, updatedAt: serverTimestamp() })
      .then(() => push(message))
      .catch((error) => push(error.message));
  }, [activeProjectId, db, push]);

  const moveTask = useCallback((task: Task, column: ColumnId) => {
    if (task.column === column) return;
    const actorName = profile?.displayName || user?.displayName || user?.email || 'User';
    const historyEntry: StatusHistoryEntry = {
      from: task.column,
      to: column,
      timestamp: new Date().toISOString(),
      actorName,
      actorId: user?.uid,
    };
    patchTask(
      task,
      {
        column,
        completedAt: column === 'done' ? new Date().toISOString() : null,
        statusHistory: arrayUnion(historyEntry) as unknown as StatusHistoryEntry[],
      },
      `Moved to ${COLUMN_LABEL[column] || column}.`
    );
  }, [patchTask, profile?.displayName, user]);

  const cycleColumn = useCallback((task: Task) => {
    const index = COLUMN_ORDER.indexOf(task.column);
    moveTask(task, COLUMN_ORDER[(index + 1) % COLUMN_ORDER.length]);
  }, [moveTask]);

  const toggleChecklistItem = useCallback((task: Task, itemId: string) => {
    patchTask(task, { checklist: task.checklist.map((item) => item.id === itemId ? { ...item, done: !item.done } : item) }, 'Checklist updated.');
  }, [patchTask]);

  const saveTask = useCallback((draft: TaskDraft, existing: Task | null) => {
    if (!activeProjectId || !activeProject || !user) return;
    const now = new Date().toISOString();
    const actorName = profile?.displayName || user?.displayName || user?.email || 'User';

    if (existing) {
      const updates: Record<string, any> = {
        ...draft,
        updatedAt: serverTimestamp(),
        completedAt: draft.column === 'done' ? existing.completedAt ?? now : null,
      };

      if (draft.column !== existing.column) {
        const historyEntry: StatusHistoryEntry = {
          from: existing.column,
          to: draft.column,
          timestamp: now,
          actorName,
          actorId: user.uid,
        };
        updates.statusHistory = arrayUnion(historyEntry);
      }

      void updateDoc(doc(db, 'projects', activeProjectId, 'tickets', existing.id), updates)
        .then(() => push('Ticket saved.'))
        .catch((error) => push(error.message));
      return;
    }

    const id = crypto.randomUUID();
    const key = nextIssueKey(tasks, issuePrefix(activeProject.name));
    const order = (tasks.filter((task) => task.column === draft.column).length + 1) * 1024;
    const initialHistory: StatusHistoryEntry[] = [
      {
        from: null,
        to: draft.column,
        timestamp: now,
        actorName,
        actorId: user.uid,
      },
    ];

    void setDoc(doc(db, 'projects', activeProjectId, 'tickets', id), {
      ...draft,
      issueKey: key,
      order,
      reporterId: user.uid,
      statusHistory: initialHistory,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      completedAt: draft.column === 'done' ? now : null,
    }).then(() => push('Ticket created.')).catch((error) => push(error.message));
  }, [activeProject, activeProjectId, db, profile?.displayName, push, tasks, user]);

  const createTicketFromAi = useCallback(async (input: NewTicketInput, targetProjectId?: string) => {
    const destinationId = targetProjectId || activeProjectId;
    if (!destinationId || !user) throw new Error('Choose a project first.');
    const destProject = projects.find((p) => p.id === destinationId) ?? activeProject;
    if (!destProject) throw new Error('Target project not found.');
    const id = crypto.randomUUID();
    const prefix = issuePrefix(destProject.name);

    let issueKey = `${prefix}-1`;
    let order = 1024;
    if (destinationId === activeProjectId) {
      issueKey = nextIssueKey(tasks, prefix);
      order = (tasks.filter((task) => task.column === input.column).length + 1) * 1024;
    } else {
      const snap = await getDocs(collection(db, 'projects', destinationId, 'tickets'));
      const existing = snap.docs.map((item) => item.data() as Task);
      issueKey = nextIssueKey(existing, prefix);
      order = (existing.filter((task) => task.column === input.column).length + 1) * 1024;
    }

    const actorName = profile?.displayName || user?.displayName || user?.email || 'User';
    const initialHistory: StatusHistoryEntry[] = [
      {
        from: null,
        to: input.column,
        timestamp: new Date().toISOString(),
        actorName,
        actorId: user.uid,
      },
    ];

    await setDoc(doc(db, 'projects', destinationId, 'tickets', id), {
      ...input,
      issueKey,
      column: input.column,
      tagIds: [input.type, input.department.toLowerCase()],
      checklist: [],
      dueDate: input.dueDate,
      order,
      reporterId: user.uid,
      statusHistory: initialHistory,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      completedAt: null,
    });

    if (destinationId !== activeProjectId) {
      setActiveProjectIdState(destinationId);
      push(`Ticket created in ${destProject.name}.`);
    } else {
      push('AI ticket created.');
    }
  }, [activeProject, activeProjectId, db, profile?.displayName, projects, push, tasks, user]);

  const removeTask = useCallback((task: Task) => {
    if (!activeProjectId) return;
    void deleteDoc(doc(db, 'projects', activeProjectId, 'tickets', task.id))
      .then(() => push('Ticket deleted.'))
      .catch((error) => push(error.message));
  }, [activeProjectId, db, push]);

  const stats = useMemo(() => deriveStats(tasks), [tasks]);
  const value: BoardContextValue = {
    loaded,
    projectsLoaded,
    projects,
    activeProjectId,
    activeProject,
    setActiveProjectId: setActiveProjectIdState,
    members,
    tasks,
    stats,
    toasts,
    dismissToast: dismiss,
    pushToast: push,
    createProject,
    updateProjectMembers,
    updateProjectTriage,
    updateProjectDetails,
    deleteProject,
    moveTask,
    cycleColumn,
    toggleChecklistItem,
    saveTask,
    createTicketFromAi,
    removeTask,
  };

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}
