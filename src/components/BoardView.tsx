'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { BoardLane } from './BoardLane';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './icons';
import { RowMenu } from './RowMenu';
import { SoloriseLogo } from './SoloriseLogo';
import { TaskCard } from './TaskCard';
import { TaskEditor } from './TaskEditor';
import { Toaster } from './Toaster';
import { useAuth } from './AuthProvider';
import { useBoard } from './BoardProvider';
import { COLUMN_LABEL, COLUMN_ORDER, todayISO, type ColumnId, type Priority, type Task } from '@/lib/types';
import { issuePrefix, nextIssueKey } from '@/lib/taskStore';
import type { NewTicketInput, Project, TicketType, UserProfile } from '@/lib/firebase/models';
import board from './Board.module.css';

type Kind = 'all' | TicketType;

interface MenuState { task: Task; x: number; y: number; }

function initials(member?: UserProfile) {
  if (!member) return '?';
  return member.displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function ProjectSettingsDialog({
  project,
  onClose,
  onSave,
  onManageAccess,
  onDelete,
}: {
  project: Project;
  onClose: () => void;
  onSave: (name: string, description: string, triageInstructions: string) => Promise<void>;
  onManageAccess: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [triageInstructions, setTriageInstructions] = useState(project.triageInstructions || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError('Give the project a name.');
    setBusy(true);
    try {
      await onSave(name, description, triageInstructions);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save project settings.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={board.modalBackdrop} role="presentation">
      <form className={`${board.modal} ${board.projectSettingsModal}`} onSubmit={submit}>
        <span className={board.modalKicker}>Project settings</span>
        <h2>Edit project</h2>
        <p>Rename the project, update its description, and configure the AI ticket-triage boundaries.</p>

        <label>
          Project name
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>

        <label>
          Short description
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="1-line summary shown in header" />
        </label>

        <label>
          AI Scope & Project Harness (Guidelines for AI)
          <div className={board.harnessHelper}>
            <strong>How AI uses this harness:</strong>
            <ul>
              <li><b>In-scope boundaries:</b> Features, components, and services owned by this project.</li>
              <li><b>Out-of-scope boundaries:</b> Work belonging to other projects (helps AI prompt: <i>"Does this belong to Project X instead?"</i>).</li>
              <li><b>Routing rules:</b> Tech stack keywords, priority rules, and component tags.</li>
            </ul>
          </div>
          <textarea
            style={{ minHeight: '120px', marginTop: '6px' }}
            value={triageInstructions}
            onChange={(event) => setTriageInstructions(event.target.value)}
            placeholder="e.g. In-scope: Web storefront, shopping cart, customer checkout, Stripe payment integration.&#10;Out-of-scope: Native iOS & Android mobile apps (belongs to Mobile App project), backend database migrations.&#10;Rules: Payment processing issues are P1. CSS layout issues belong to Design/UI."
          />
        </label>

        {error && <p className={board.modalError}>{error}</p>}

        <section className={board.settingsAction}>
          <div>
            <strong>Project access</strong>
            <p>Choose who can view and edit this project.</p>
          </div>
          <button type="button" disabled={busy} onClick={onManageAccess}>Manage access</button>
        </section>

        <section className={board.dangerZone}>
          <div>
            <strong>Delete project</strong>
            <p>Permanently delete this project and every ticket and comment in it.</p>
          </div>
          <button type="button" disabled={busy} onClick={onDelete}>Delete project</button>
        </section>

        <footer>
          <button type="button" onClick={onClose}>Cancel</button>
          <button className={board.modalPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        </footer>
      </form>
    </div>
  );
}

function ProjectDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, description: string, triageInstructions?: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triageInstructions, setTriageInstructions] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError('Give the project a name.');
    setBusy(true);
    try { await onCreate(name, description, triageInstructions); onClose(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not create project.'); } finally { setBusy(false); }
  };
  return (
    <div className={board.modalBackdrop} role="presentation">
      <form className={`${board.modal} ${board.projectSettingsModal}`} onSubmit={submit}>
        <span className={board.modalKicker}>New project</span>
        <h2>Start with a clean board.</h2>
        <p>Projects keep each client, crew, ticket, and AI harness completely separate.</p>
        <label>
          Project name
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Harbor Studio" required />
        </label>
        <label>
          Short description
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Brand site rebuild (1-line header summary)" />
        </label>
        <label>
          AI Scope & Project Harness (Guidelines for AI)
          <div className={board.harnessHelper}>
            <strong>How AI uses this harness:</strong>
            <ul>
              <li><b>In-scope boundaries:</b> What features and responsibilities belong to this project.</li>
              <li><b>Out-of-scope boundaries:</b> What belongs to other projects (helps AI detect misplaced tickets).</li>
              <li><b>Routing rules:</b> Tech stack keywords, priority rules, and component tags.</li>
            </ul>
          </div>
          <textarea
            style={{ minHeight: '100px', marginTop: '6px' }}
            value={triageInstructions}
            onChange={(event) => setTriageInstructions(event.target.value)}
            placeholder="e.g. In-scope: Web storefront, shopping cart, customer checkout, Stripe payments.&#10;Out-of-scope: Native mobile apps (belongs to Mobile App project).&#10;Rules: Payment processing issues are P1. CSS layout issues belong to Design/UI."
          />
        </label>
        {error && <p className={board.modalError}>{error}</p>}
        <footer>
          <button type="button" onClick={onClose}>Cancel</button>
          <button className={board.modalPrimary} disabled={busy}>{busy ? 'Creating…' : 'Create project'}</button>
        </footer>
      </form>
    </div>
  );
}

function AccessDialog({ members, ownerId, initialEditors, initialClients, onClose, onSave }: { members: UserProfile[]; ownerId: string; initialEditors: string[]; initialClients: string[]; onClose: () => void; onSave: (access: string[], editors: string[], clients: string[]) => Promise<void> }) {
  const [roles, setRoles] = useState<Record<string, 'none' | 'editor' | 'client'>>(() => Object.fromEntries(members.map((member) => [member.uid, initialClients.includes(member.uid) ? 'client' : initialEditors.includes(member.uid) ? 'editor' : 'none'])));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const editors = Array.from(new Set([ownerId, ...Object.keys(roles).filter((id) => roles[id] === 'editor')]));
    const clients = Object.keys(roles).filter((id) => roles[id] === 'client');
    await onSave(Array.from(new Set([...editors, ...clients])), editors, clients);
    setBusy(false);
    onClose();
  };
  return <div className={board.modalBackdrop}><section className={`${board.modal} ${board.accessModal}`}><span className={board.modalKicker}>Project access</span><h2>Choose who can see this board.</h2><p>Editors can manage tickets. Clients get a read-only view of client-visible work.</p><div className={board.accessList}>{members.map((member) => <label key={member.uid}><span className={board.personAvatar}>{initials(member)}</span><span><b>{member.displayName}</b><small>{member.email}</small></span><select value={member.uid === ownerId ? 'editor' : roles[member.uid] ?? 'none'} disabled={member.uid === ownerId} onChange={(event) => setRoles((current) => ({ ...current, [member.uid]: event.target.value as 'none' | 'editor' | 'client' }))}><option value="none">No access</option><option value="editor">Editor</option><option value="client">Client</option></select></label>)}</div><footer><button type="button" onClick={onClose}>Cancel</button><button type="button" className={board.modalPrimary} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save access'}</button></footer></section></div>;
}

interface AiDialogProps {
  activeProject: Project;
  projects: Project[];
  members: UserProfile[];
  getToken: () => Promise<string>;
  onClose: () => void;
  onCreate: (input: NewTicketInput, targetProjectId?: string) => Promise<void>;
  onUpdateTriageInstructions: (projectId: string, instructions: string) => Promise<void>;
}

function AiDialog({ activeProject, projects, members, getToken, onClose, onCreate }: AiDialogProps) {
  const [mode, setMode] = useState<'chat' | 'triage'>('chat');
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [targetProjectId, setTargetProjectId] = useState<string>(activeProject.id);
  const [result, setResult] = useState<(NewTicketInput & { reason?: string; suggestedProject?: { projectId: string; projectName: string; reason: string } | null }) | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const triageContext = activeProject.triageInstructions || '';

  const ask = async (suggestedQuestion?: string) => {
    const question = (suggestedQuestion ?? text).trim();
    if (!question) return;
    const previousMessages = messages;
    setMessages((current) => [...current, { role: 'user', content: question }]);
    setText('');
    setBusy(true);
    setError('');
    try {
      const token = await getToken();
      const response = await fetch('/api/ai/triage', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: 'chat', projectId: activeProject.id, text: question, history: previousMessages }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'The project assistant could not answer.');
      setMessages((current) => [...current, { role: 'assistant', content: payload.answer }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The project assistant could not answer.');
    } finally {
      setBusy(false);
    }
  };

  const triage = async () => {
    if (!text.trim()) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const token = await getToken();
      const response = await fetch('/api/ai/triage', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          projectId: activeProject.id,
          text,
          projectName: activeProject.name,
          triageInstructions: triageContext,
          candidateProjects: projects.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            triageInstructions: p.id === activeProject.id ? triageContext : (p.triageInstructions || ''),
          })),
          members: members.map((member) => ({ uid: member.uid, name: member.displayName, role: member.role })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'AI triage failed.');
      setResult({ ...payload.result, column: 'backlog', dueDate: null });
      setTargetProjectId(activeProject.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'AI triage failed.');
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!result) return;
    setBusy(true);
    try {
      await onCreate(result, targetProjectId);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create ticket.');
      setBusy(false);
    }
  };

  const targetProject = projects.find((p) => p.id === targetProjectId) ?? activeProject;
  const assigneeMember = members.find((member) => member.uid === result?.assigneeId);
  const assigneeName = assigneeMember ? assigneeMember.displayName : result?.assigneeId ? 'Admin' : 'Unassigned';

  return (
    <div className={board.modalBackdrop}>
      <section className={`${board.modal} ${board.aiModal}`}>
        <span className={board.modalKicker}>✦ Project assistant</span>
        <h2>{mode === 'chat' ? `Ask about ${activeProject.name}.` : 'Describe the work in plain language.'}</h2>
        <p>{mode === 'chat'
          ? 'Get a grounded summary of pending tickets, bugs, priorities, and progress from this board.'
          : 'Solorise will classify it, route it, and suggest an assignee. You approve before anything is created.'}</p>

        <div className={board.aiTabs} role="tablist" aria-label="AI assistant mode">
          <button type="button" role="tab" aria-selected={mode === 'chat'} onClick={() => { setMode('chat'); setError(''); }}>
            Ask project
          </button>
          <button type="button" role="tab" aria-selected={mode === 'triage'} onClick={() => { setMode('triage'); setError(''); }}>
            Create ticket
          </button>
        </div>

        {mode === 'chat' ? (
          <div className={board.aiConversation}>
            {messages.length === 0 ? (
              <div className={board.aiWelcome}>
                <strong>I can read the current board.</strong>
                <span>Try a question to get a concise, ticket-linked answer.</span>
                <div className={board.aiSuggestions}>
                  {['What bugs are still pending?', 'Summarize work in progress.', 'What should I prioritize next?'].map((question) => (
                    <button type="button" key={question} disabled={busy} onClick={() => void ask(question)}>{question}</button>
                  ))}
                </div>
              </div>
            ) : (
              <div className={board.aiMessages} aria-live="polite">
                {messages.map((message, index) => (
                  <div className={board.aiMessage} data-role={message.role} key={`${message.role}-${index}`}>
                    <span>{message.role === 'user' ? 'You' : 'Solorise AI'}</span>
                    <p>{message.content}</p>
                  </div>
                ))}
                {busy && <div className={board.aiThinking}>Reading the board…</div>}
              </div>
            )}
            <div className={board.aiComposer}>
              <textarea
                autoFocus
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void ask();
                  }
                }}
                placeholder="Ask about pending bugs, blocked work, priorities, or progress…"
              />
              <button type="button" className={board.modalPrimary} disabled={busy || !text.trim()} onClick={() => void ask()}>
                {busy ? 'Thinking…' : 'Ask'}
              </button>
            </div>
          </div>
        ) : (
          <textarea
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="The checkout button overlaps the footer on iPhone SE and the client cannot pay"
          />
        )}

        {error && <p className={board.modalError}>{error}</p>}

        {mode === 'triage' && result && (
          <>
            {result.suggestedProject && (
              <div className={board.aiProjectClarification}>
                <div className={board.aiProjectClarificationHead}>
                  <span>✦ Cross-project check</span>
                  <strong>Does this ticket belong to {result.suggestedProject.projectName}?</strong>
                </div>
                <p>
                  AI noticed: <em>"{result.suggestedProject.reason}"</em>
                </p>
                <div className={board.aiProjectClarificationActions}>
                  <button
                    type="button"
                    data-selected={targetProjectId === result.suggestedProject.projectId}
                    onClick={() => setTargetProjectId(result.suggestedProject!.projectId)}
                  >
                    Switch to {result.suggestedProject.projectName}
                  </button>
                  <button
                    type="button"
                    data-selected={targetProjectId === activeProject.id}
                    onClick={() => setTargetProjectId(activeProject.id)}
                  >
                    Keep in {activeProject.name}
                  </button>
                </div>
              </div>
            )}

            <div className={board.aiResult}>
              <div><span>Target project</span><b>{targetProject.name}</b></div>
              <div><span>Type</span><b>{result.type}</b></div>
              <div><span>Department</span><b>{result.department}</b></div>
              <div><span>Priority</span><b>P{result.priority}</b></div>
              <div><span>Assignee</span><b>{assigneeName}</b></div>
              <p>{result.reason}</p>
            </div>
          </>
        )}

        <footer>
          <button type="button" onClick={onClose}>{mode === 'chat' ? 'Close' : 'Cancel'}</button>
          {mode === 'triage' && (result ? (
            <button type="button" className={board.modalPrimary} disabled={busy} onClick={create}>
              {busy ? 'Creating…' : `Create ticket in ${targetProject.name}`}
            </button>
          ) : (
            <button type="button" className={board.modalPrimary} disabled={busy || !text.trim()} onClick={triage}>
              {busy ? 'Reading request…' : 'Triage request'}
            </button>
          ))}
        </footer>
      </section>
    </div>
  );
}

export function BoardView() {
  const { profile, isAdmin, logout, getToken } = useAuth();
  const { loaded, projectsLoaded, projects, activeProject, activeProjectId, setActiveProjectId, members, tasks, stats, toasts, dismissToast, pushToast, createProject, updateProjectDetails, deleteProject, updateProjectMembers, updateProjectTriage, moveTask, cycleColumn, toggleChecklistItem, saveTask, createTicketFromAi, removeTask } = useBoard();
  const today = useMemo(() => todayISO(), []);
  const [kind, setKind] = useState<Kind>('all');
  const [search, setSearch] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<ColumnId | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [showProject, setShowProject] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [showAccess, setShowAccess] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const [editor, setEditor] = useState<{ open: boolean; task: Task | null; column: ColumnId }>({ open: false, task: null, column: 'backlog' });
  const [confirm, setConfirm] = useState<{ open: boolean; task: Task | null }>({ open: false, task: null });

  const isClient = profile?.role === 'client';
  const activeMembers = members.filter((member) => activeProject?.accessIds.includes(member.uid));
  const visibleTasks = tasks.filter((task) => {
    if (isClient && !task.clientVisible) return false;
    if (kind !== 'all' && task.type !== kind) return false;
    const query = search.trim().toLowerCase();
    return !query || `${task.issueKey} ${task.title} ${task.description} ${task.department}`.toLowerCase().includes(query);
  });
  const donePct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const canEdit = Boolean(activeProject && (isAdmin || activeProject.editorIds.includes(profile?.uid ?? '')));

  const openMenu = (task: Task, trigger: HTMLElement) => { const rect = trigger.getBoundingClientRect(); setMenu({ task, x: rect.right, y: rect.bottom + 4 }); };
  const drop = (column: ColumnId) => { const task = tasks.find((item) => item.id === dragId); if (task && canEdit) moveTask(task, column); setDragId(null); setOverColumn(null); };

  if (projectsLoaded && projects.length === 0) {
    return <main className={board.emptyProduct}><header><Link href="/"><SoloriseLogo /></Link><button onClick={logout}>Sign out</button></header><section><span className={board.modalKicker}>Your workspace is ready</span><h1>{isAdmin ? 'Create the first project.' : 'No projects have been shared with you yet.'}</h1><p>{isAdmin ? 'Start with a client or product. The board begins completely empty—no sample tickets and no cleanup.' : 'Ask your workspace admin to add you to a project.'}</p>{isAdmin && <button onClick={() => setShowProject(true)}>Create a project →</button>}</section>{showProject && <ProjectDialog onClose={() => setShowProject(false)} onCreate={async (name, description, triageInstructions) => { await createProject({ name, description, triageInstructions }); }} />}</main>;
  }

  return <div className={board.app}>
    <header className={board.topbar}><Link href="/"><SoloriseLogo compact /></Link><nav className={board.crumbs}><span>solorise.app</span><b>/</b><strong>{activeProject?.slug ?? 'workspace'}</strong><b>/</b><span>board</span></nav><label className={board.search}><Icon name="search" size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tickets" /></label><nav className={board.topnav}>{isAdmin && <Link href="/team">Team</Link>}<Link href="/settings">Settings</Link></nav><button className={board.account} onClick={logout}><span>{initials(profile ?? undefined)}</span><em>Sign out</em></button></header>
    <div className={board.productbar}>
      <div><b>{activeProject?.name ?? 'Workspace'}</b><span>{activeProject?.description}</span></div>
      {canEdit && (
        <button className={board.newIssue} onClick={() => setEditor({ open: true, task: null, column: 'backlog' })}>+ New ticket</button>
      )}
      {isAdmin && (
        <button
          className={board.projectSettingsButton}
          type="button"
          title="Project settings"
          aria-label="Project settings"
          onClick={() => setShowProjectSettings(true)}
        >
          <Icon name="settings" size={17} />
        </button>
      )}
    </div>
    <div className={board.workspace}><aside className={board.rail}><p className={board.label}>Projects</p><div className={board.projects}>{projects.map((project) => <button key={project.id} data-active={project.id === activeProjectId} onClick={() => setActiveProjectId(project.id)}><i style={{ background: project.color }} /><span><b>{project.name}</b><small>{project.description || 'No description'}</small><em><i style={{ width: project.id === activeProjectId ? `${donePct}%` : '0%', background: project.color }} /></em></span></button>)}</div>{isAdmin && <button className={board.addProject} onClick={() => setShowProject(true)}>+ New project</button>}<p className={board.label}>On this project</p><ul className={board.people}>{activeMembers.map((member) => <li key={member.uid}><span>{initials(member)}</span><p><b>{member.displayName}</b><small>{member.role}</small></p></li>)}</ul></aside>
      <main className={board.content}><header className={board.boardHead}><div><h1>{activeProject?.name}</h1><p>{activeProject?.description || 'No project description yet.'}</p></div><div className={board.progress}><span><i style={{ width: `${donePct}%` }} /></span><b>{donePct}%</b><em>shipped</em></div></header><div className={board.filters}>{(['all','bug','feature','change'] as Kind[]).map((value) => <button key={value} data-active={kind === value} onClick={() => setKind(value)}>{value === 'all' ? 'All' : value === 'change' ? 'Changes' : `${value[0].toUpperCase()}${value.slice(1)}s`} <span>{value === 'all' ? tasks.length : tasks.filter((task) => task.type === value).length}</span></button>)}<p>{canEdit ? 'Drag cards between columns' : 'Read-only access'}</p></div>{loaded && tasks.length === 0 && <section className={board.emptyBoard}><span>Empty board</span><h2>Turn the first request into work.</h2><p>Create a ticket manually or let AI classify and route a request for you.</p>{canEdit && <div><button onClick={() => setEditor({ open: true, task: null, column: 'backlog' })}>Create ticket</button><button onClick={() => setShowAi(true)}>✦ Triage with AI</button></div>}</section>}{!loaded ? <p className={board.loading}>Loading board…</p> : tasks.length > 0 && <div className={board.board}>{COLUMN_ORDER.map((column) => { const items = visibleTasks.filter((task) => task.column === column).sort((a,b) => a.order-b.order); return <BoardLane key={column} column={column} label={column === 'backlog' ? 'Inbox' : column === 'progress' ? 'In progress' : column === 'qa' ? 'QA / Agent Testing' : column === 'review' ? 'In review' : column === 'done' ? 'Shipped' : COLUMN_LABEL[column]} count={items.length} onAdd={() => canEdit && setEditor({ open: true, task: null, column })} onDragOver={(event) => { if (canEdit) { event.preventDefault(); setOverColumn(column); } }} onDrop={() => drop(column)} activeDrop={overColumn === column}>{items.length === 0 ? <p className={board.laneEmpty}>Nothing here yet.</p> : items.map((task) => <TaskCard key={task.id} task={task} today={today} menuOpen={menu?.task.id === task.id} onOpen={(selected) => canEdit && setEditor({ open: true, task: selected, column: selected.column })} onOpenMenu={openMenu} onCycleColumn={canEdit ? cycleColumn : () => undefined} onToggleChecklistItem={toggleChecklistItem} canEdit={canEdit} kind={task.type} initials={initials(members.find((member) => member.uid === task.assigneeId))} onDragStart={() => setDragId(task.id)} onDragEnd={() => { setDragId(null); setOverColumn(null); }} />)}</BoardLane>; })}</div>}</main></div>
    {canEdit && (
      <button
        className={board.aiFab}
        type="button"
        onClick={() => setShowAi(true)}
        aria-label="Ask AI / AI triage"
        title="Ask AI (Triage work with AI)"
      >
        <span className={board.aiFabSparkle}>✦</span>
        <span className={board.aiFabLabel}>Ask AI</span>
      </button>
    )}
    {showProject && <ProjectDialog onClose={() => setShowProject(false)} onCreate={async (name, description, triageInstructions) => { await createProject({ name, description, triageInstructions }); }} />}
    {showProjectSettings && activeProject && (
      <ProjectSettingsDialog
        project={activeProject}
        onClose={() => setShowProjectSettings(false)}
        onManageAccess={() => {
          setShowProjectSettings(false);
          setShowAccess(true);
        }}
        onDelete={() => {
          setShowProjectSettings(false);
          setProjectToDelete(activeProject);
        }}
        onSave={async (name, description, triageInstructions) => {
          await updateProjectDetails(activeProject.id, { name, description, triageInstructions });
        }}
      />
    )}
    {projectToDelete && (
      <ConfirmDialog
        title={`Delete ${projectToDelete.name}?`}
        body="This permanently deletes the project, including every ticket and comment. This action cannot be undone."
        confirmLabel="Delete project"
        busy={deletingProject}
        onConfirm={() => {
          setDeletingProject(true);
          void deleteProject(projectToDelete.id)
            .then(() => setProjectToDelete(null))
            .catch((error) => pushToast(error instanceof Error ? error.message : 'Could not delete the project.'))
            .finally(() => setDeletingProject(false));
        }}
        onClose={() => setProjectToDelete(null)}
      />
    )}
    {showAccess && activeProject && <AccessDialog members={members} ownerId={activeProject.ownerId} initialEditors={activeProject.editorIds} initialClients={activeProject.clientIds} onClose={() => setShowAccess(false)} onSave={updateProjectMembers} />}
    {showAi && activeProject && (
      <AiDialog
        activeProject={activeProject}
        projects={projects}
        members={activeMembers.filter((member) => member.role !== 'client')}
        getToken={getToken}
        onClose={() => setShowAi(false)}
        onCreate={createTicketFromAi}
        onUpdateTriageInstructions={updateProjectTriage}
      />
    )}
    {editor.open && activeProject && (
      <TaskEditor
        key={editor.task?.id ?? `new-${editor.column}`}
        task={editor.task}
        column={editor.column}
        prefix={issuePrefix(activeProject.name)}
        nextKey={nextIssueKey(tasks, issuePrefix(activeProject.name))}
        projectId={activeProject.id}
        members={activeMembers.filter((member) => member.role !== 'client')}
        projectMembers={activeMembers}
        onSave={(draft) => {
          saveTask(draft, editor.task);
          setEditor({ open: false, task: null, column: 'backlog' });
        }}
        onDelete={editor.task ? () => setConfirm({ open: true, task: editor.task }) : undefined}
        onClose={() => setEditor({ open: false, task: null, column: 'backlog' })}
      />
    )}
    {confirm.open && confirm.task && <ConfirmDialog title="Delete this ticket?" body="This permanently removes the ticket from the project." confirmLabel="Delete" onConfirm={() => { if (confirm.task) removeTask(confirm.task); setConfirm({ open: false, task: null }); setEditor({ open: false, task: null, column: 'backlog' }); }} onClose={() => setConfirm({ open: false, task: null })} />}
    {menu && canEdit && <RowMenu x={menu.x} y={menu.y} column={menu.task.column} onOpen={() => { setEditor({ open: true, task: menu.task, column: menu.task.column }); setMenu(null); }} onMoveTo={(column) => { moveTask(menu.task, column); setMenu(null); }} onDelete={() => { setConfirm({ open: true, task: menu.task }); setMenu(null); }} onClose={() => setMenu(null)} />}
    <Toaster toasts={toasts} onDismiss={dismissToast} />
  </div>;
}
