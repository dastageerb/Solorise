import type { ColumnId, Priority, Task } from '@/lib/types';

export type WorkspaceRole = 'admin' | 'member' | 'client';
export type TicketType = 'bug' | 'feature' | 'change';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: WorkspaceRole;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  slug: string;
  color: string;
  ownerId: string;
  accessIds: string[];
  editorIds: string[];
  clientIds: string[];
  createdAt: string;
  triageInstructions?: string;
}

export interface ProjectTicket extends Task {
  type: TicketType;
  department: string;
  clientVisible: boolean;
  reporterId: string;
}

export interface NewProjectInput {
  name: string;
  description: string;
  triageInstructions?: string;
}

export interface NewTicketInput {
  title: string;
  description: string;
  column: ColumnId;
  priority: Priority;
  type: TicketType;
  department: string;
  assigneeId: string | null;
  clientVisible: boolean;
  dueDate: string | null;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  projectId: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  authorRole: WorkspaceRole;
  content: string;
  mentionedUserIds: string[];
  createdAt: string;
}

export interface NewCommentInput {
  content: string;
  mentionedUserIds: string[];
}
