#!/usr/bin/env node

/**
 * Solorise MCP Server
 * 
 * Model Context Protocol (MCP) server that connects AI agents (Claude Desktop,
 * Cursor, Windsurf, Claude Code, etc.) to Solorise project boards and tickets.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// Automatically load .env.local if environment variables are not already set
function loadEnvIfNeeded() {
  if (process.env.FIREBASE_ADMIN_PROJECT_ID) return;

  const envPath = resolve(rootDir, '.env.local');
  if (existsSync(envPath)) {
    try {
      if (typeof process.loadEnvFile === 'function') {
        process.loadEnvFile(envPath);
      } else {
        const content = readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eq = trimmed.indexOf('=');
          if (eq > 0) {
            const key = trimmed.slice(0, eq).trim();
            const val = trimmed.slice(eq + 1).trim().replace(/(^["']|["']$)/g, '');
            if (!process.env[key]) process.env[key] = val;
          }
        }
      }
    } catch {
      // Continue with current environment
    }
  }
}

loadEnvIfNeeded();

// Initialize Firebase Admin
let db = null;
function getDb() {
  if (db) return db;

  const key = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;

  let credential;
  if (projectId && clientEmail && key) {
    credential = cert({ projectId, clientEmail, privateKey: key });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    credential = applicationDefault();
  } else {
    throw new Error(
      'Firebase Admin credentials not found. Please ensure FIREBASE_ADMIN_PROJECT_ID, ' +
      'FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY are set in .env.local or your environment.'
    );
  }

  if (!getApps().length) {
    initializeApp({ credential });
  }

  db = getFirestore();
  return db;
}

function issuePrefix(projectName) {
  const words = projectName.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const letters = projectName.replace(/[^a-zA-Z]/g, '');
  return (letters.slice(0, 2) || 'TK').toUpperCase();
}

function nextIssueKey(tickets, prefix) {
  const highest = tickets.reduce((max, t) => {
    const key = t.issueKey || '';
    if (!key.startsWith(`${prefix}-`)) return max;
    const num = Number(key.slice(prefix.length + 1));
    return Number.isFinite(num) ? Math.max(max, num) : max;
  }, 0);
  return `${prefix}-${highest + 1}`;
}

const server = new Server(
  {
    name: 'solorise-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register Available Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'solorise_list_projects',
        description: 'List all available projects in the Solorise workspace, including their IDs, names, descriptions, and AI triage/scoping instructions.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'solorise_create_project',
        description: 'Create a new project board in the Solorise workspace with an optional description, AI triage instructions / scoping guidelines, and color.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'The display name of the project (e.g. "Mobile App v2", "Client Redesign")',
            },
            description: {
              type: 'string',
              description: 'Optional summary of what this project covers',
            },
            triageInstructions: {
              type: 'string',
              description: 'Optional AI guidelines defining what is in-scope and out-of-scope for this project',
            },
            color: {
              type: 'string',
              description: 'Optional hex color for the project badge (defaults to #3d43ff)',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'solorise_delete_project',
        description: 'Delete a project board and its tickets from the Solorise workspace.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The unique ID of the project to delete',
            },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'solorise_list_tickets',
        description: 'List tickets in a given Solorise project. Supports filtering by lane (backlog, progress, review, done) and priority.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The unique ID of the project in Solorise',
            },
            column: {
              type: 'string',
              enum: ['backlog', 'progress', 'qa', 'review', 'done'],
              description: 'Optional filter by board column/lane',
            },
            priority: {
              type: 'number',
              enum: [1, 2, 3, 4],
              description: 'Optional filter by priority (1=Urgent, 2=High, 3=Normal, 4=Low)',
            },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'solorise_get_ticket',
        description: 'Retrieve full details for a specific ticket, including description, checklist, current column, and project context.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The unique ID of the project',
            },
            ticketId: {
              type: 'string',
              description: 'The Firestore ID of the ticket (or leave empty if using issueKey)',
            },
            issueKey: {
              type: 'string',
              description: 'The human-readable issue key, e.g. "ON-1" (optional if ticketId is provided)',
            },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'solorise_update_ticket_status',
        description: 'Move a ticket to a new column/lane (e.g. "progress" when starting work, "qa" for agent testing, or "review" / "done" when completed), with an optional note.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The unique ID of the project',
            },
            ticketId: {
              type: 'string',
              description: 'The ID of the ticket to update',
            },
            column: {
              type: 'string',
              enum: ['backlog', 'progress', 'qa', 'review', 'done'],
              description: 'The new column to move the ticket into',
            },
            note: {
              type: 'string',
              description: 'Optional update note or summary of work done',
            },
          },
          required: ['projectId', 'ticketId', 'column'],
        },
      },
      {
        name: 'solorise_update_ticket',
        description: 'Update ticket details such as title, description, priority, or attach an agent implementation plan / resolution notes.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The unique ID of the project',
            },
            ticketId: {
              type: 'string',
              description: 'The ID of the ticket to update',
            },
            title: {
              type: 'string',
              description: 'Updated ticket title',
            },
            description: {
              type: 'string',
              description: 'Updated ticket description',
            },
            priority: {
              type: 'number',
              enum: [1, 2, 3, 4],
              description: 'Updated priority (1=Urgent, 2=High, 3=Normal, 4=Low)',
            },
            executionPlan: {
              type: 'string',
              description: 'Markdown formatted implementation plan or resolution notes',
            },
          },
          required: ['projectId', 'ticketId'],
        },
      },
      {
        name: 'solorise_create_ticket',
        description: 'Create a new ticket in a Solorise project. Automatically derives the next sequential issue key (e.g. "ON-2").',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The unique ID of the project',
            },
            title: {
              type: 'string',
              description: 'Clear, concise ticket title',
            },
            description: {
              type: 'string',
              description: 'Full description of the bug, feature, or task',
            },
            column: {
              type: 'string',
              enum: ['backlog', 'progress', 'qa', 'review', 'done'],
              description: 'Initial column (default: "backlog")',
            },
            priority: {
              type: 'number',
              enum: [1, 2, 3, 4],
              description: 'Priority: 1=Urgent, 2=High, 3=Normal, 4=Low (default: 3)',
            },
            type: {
              type: 'string',
              enum: ['bug', 'feature', 'change'],
              description: 'Ticket type (default: "bug")',
            },
            department: {
              type: 'string',
              description: 'Department tag (e.g. "Engineering", "Design", "Product")',
            },
            clientVisible: {
              type: 'boolean',
              description: 'Whether this ticket is visible to clients (default: false)',
            },
          },
          required: ['projectId', 'title', 'description'],
        },
      },
      {
        name: 'solorise_add_checklist_item',
        description: 'Add an action item / subtask to a ticket checklist.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The unique ID of the project',
            },
            ticketId: {
              type: 'string',
              description: 'The ticket ID',
            },
            label: {
              type: 'string',
              description: 'The checklist item text / step to perform',
            },
            done: {
              type: 'boolean',
              description: 'Whether the item is initially completed (default: false)',
            },
          },
          required: ['projectId', 'ticketId', 'label'],
        },
      },
      {
        name: 'solorise_list_comments',
        description: 'List all comments and activity updates on a specific ticket.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The unique ID of the project',
            },
            ticketId: {
              type: 'string',
              description: 'The ticket ID',
            },
          },
          required: ['projectId', 'ticketId'],
        },
      },
      {
        name: 'solorise_add_comment',
        description: 'Post a comment or progress update on a ticket, with optional @mentions of project members.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The unique ID of the project',
            },
            ticketId: {
              type: 'string',
              description: 'The ticket ID',
            },
            content: {
              type: 'string',
              description: 'The comment text (can include @DisplayName mentions)',
            },
            authorName: {
              type: 'string',
              description: 'Optional display name of the author (defaults to "Agent")',
            },
            mentionedUserIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional array of user IDs mentioned in the comment',
            },
          },
          required: ['projectId', 'ticketId', 'content'],
        },
      },
    ],
  };
});

// Handle Tool Execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const firestore = getDb();

  try {
    switch (name) {
      case 'solorise_list_projects': {
        const snap = await firestore.collection('projects').orderBy('createdAt', 'asc').get();
        const projects = snap.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            name: d.name || 'Untitled project',
            description: d.description || '',
            slug: d.slug || doc.id,
            color: d.color || '#3d43ff',
            triageInstructions: d.triageInstructions || '',
          };
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: projects.length, projects }, null, 2),
            },
          ],
        };
      }

      case 'solorise_create_project': {
        const { name: projName, description = '', triageInstructions = '', color = '#3d43ff' } = args;
        if (!projName || !projName.trim()) {
          throw new Error('Project name is required.');
        }

        const trimmedName = projName.trim();
        const slug = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'project';

        // Find primary admin user to grant project ownership, or fallback to 'admin'
        let ownerId = 'admin';
        try {
          const usersSnap = await firestore.collection('users').where('role', '==', 'admin').limit(1).get();
          if (!usersSnap.empty) {
            ownerId = usersSnap.docs[0].id;
          }
        } catch {
          // If query fails or no users, ownerId remains 'admin'
        }

        const projectData = {
          name: trimmedName,
          description: String(description || '').trim(),
          triageInstructions: String(triageInstructions || '').trim(),
          slug,
          color: String(color || '#3d43ff'),
          ownerId,
          accessIds: [ownerId],
          editorIds: [ownerId],
          clientIds: [],
          createdAt: FieldValue.serverTimestamp(),
        };

        const docRef = await firestore.collection('projects').add(projectData);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                projectId: docRef.id,
                name: projectData.name,
                slug: projectData.slug,
                description: projectData.description,
                triageInstructions: projectData.triageInstructions,
                color: projectData.color,
              }, null, 2),
            },
          ],
        };
      }

      case 'solorise_delete_project': {
        const { projectId } = args;
        const projectRef = firestore.doc(`projects/${projectId}`);
        const snap = await projectRef.get();
        if (!snap.exists) {
          throw new Error(`Project ${projectId} not found.`);
        }

        const ticketsSnap = await firestore.collection(`projects/${projectId}/tickets`).get();
        const batch = firestore.batch();
        for (const tDoc of ticketsSnap.docs) {
          batch.delete(tDoc.ref);
        }
        batch.delete(projectRef);
        await batch.commit();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                deletedProjectId: projectId,
                ticketsDeleted: ticketsSnap.size,
              }, null, 2),
            },
          ],
        };
      }

      case 'solorise_list_tickets': {
        const { projectId, column, priority } = args;
        const ref = firestore.collection(`projects/${projectId}/tickets`);
        let q = ref;
        if (column) q = q.where('column', '==', column);
        if (priority) q = q.where('priority', '==', Number(priority));

        const snap = await q.get();
        const tickets = snap.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            issueKey: d.issueKey || '',
            title: d.title || 'Untitled ticket',
            description: d.description || '',
            column: d.column || 'backlog',
            priority: d.priority || 3,
            type: d.type || 'bug',
            department: d.department || 'General',
            checklistCount: Array.isArray(d.checklist) ? d.checklist.length : 0,
            checklistCompleted: Array.isArray(d.checklist) ? d.checklist.filter((i) => i.done).length : 0,
            updatedAt: d.updatedAt?.toDate?.()?.toISOString() || null,
          };
        }).sort((a, b) => (a.issueKey > b.issueKey ? 1 : -1));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ projectId, count: tickets.length, tickets }, null, 2),
            },
          ],
        };
      }

      case 'solorise_get_ticket': {
        const { projectId, ticketId, issueKey: searchKey } = args;
        const ticketsRef = firestore.collection(`projects/${projectId}/tickets`);

        let targetDoc = null;
        if (ticketId) {
          const docSnap = await ticketsRef.doc(ticketId).get();
          if (docSnap.exists) targetDoc = docSnap;
        }

        if (!targetDoc && searchKey) {
          const keySnap = await ticketsRef.where('issueKey', '==', searchKey).limit(1).get();
          if (!keySnap.empty) targetDoc = keySnap.docs[0];
        }

        if (!targetDoc) {
          throw new Error(`Ticket not found in project ${projectId} (ticketId: ${ticketId || 'none'}, issueKey: ${searchKey || 'none'})`);
        }

        const data = targetDoc.data();
        const projectSnap = await firestore.doc(`projects/${projectId}`).get();
        const projectData = projectSnap.exists ? projectSnap.data() : {};

        const ticket = {
          id: targetDoc.id,
          issueKey: data.issueKey || '',
          title: data.title || '',
          description: data.description || '',
          column: data.column || 'backlog',
          priority: data.priority || 3,
          type: data.type || 'bug',
          department: data.department || 'General',
          checklist: Array.isArray(data.checklist) ? data.checklist : [],
          clientVisible: Boolean(data.clientVisible),
          dueDate: data.dueDate || null,
          executionPlan: data.executionPlan || null,
          statusHistory: Array.isArray(data.statusHistory) ? data.statusHistory : [],
          projectContext: {
            name: projectData.name || '',
            triageInstructions: projectData.triageInstructions || '',
          },
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(ticket, null, 2),
            },
          ],
        };
      }

      case 'solorise_update_ticket_status': {
        const { projectId, ticketId, column, note } = args;
        const ticketRef = firestore.doc(`projects/${projectId}/tickets/${ticketId}`);
        const snap = await ticketRef.get();

        if (!snap.exists) {
          throw new Error(`Ticket ${ticketId} not found in project ${projectId}`);
        }

        const prevColumn = snap.data()?.column || 'backlog';
        const historyEntry = {
          from: prevColumn,
          to: column,
          timestamp: new Date().toISOString(),
          actorName: 'Agent',
        };

        const updates = {
          column,
          statusHistory: FieldValue.arrayUnion(historyEntry),
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (column === 'done') {
          updates.completedAt = FieldValue.serverTimestamp();
        }

        if (note) {
          const existing = snap.data()?.description || '';
          updates.description = `${existing}\n\n**Status Update (${column}):** ${note}`.trim();
        }

        await ticketRef.update(updates);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, ticketId, newColumn: column, note: note || null }, null, 2),
            },
          ],
        };
      }

      case 'solorise_update_ticket': {
        const { projectId, ticketId, title, description, priority, executionPlan } = args;
        const ticketRef = firestore.doc(`projects/${projectId}/tickets/${ticketId}`);
        const snap = await ticketRef.get();

        if (!snap.exists) {
          throw new Error(`Ticket ${ticketId} not found in project ${projectId}`);
        }

        const updates = {
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (title !== undefined) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (priority !== undefined) updates.priority = Number(priority);
        if (executionPlan !== undefined) updates.executionPlan = executionPlan;

        await ticketRef.update(updates);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, ticketId, updatedFields: Object.keys(updates) }, null, 2),
            },
          ],
        };
      }

      case 'solorise_create_ticket': {
        const {
          projectId,
          title,
          description,
          column = 'backlog',
          priority = 3,
          type = 'bug',
          department = 'Engineering',
          clientVisible = false,
        } = args;

        const projectSnap = await firestore.doc(`projects/${projectId}`).get();
        if (!projectSnap.exists) {
          throw new Error(`Project ${projectId} does not exist`);
        }
        const projectName = projectSnap.data()?.name || 'Project';
        const prefix = issuePrefix(projectName);

        // Fetch existing tickets to calculate next issue key and order
        const existingSnap = await firestore.collection(`projects/${projectId}/tickets`).get();
        const existingTickets = existingSnap.docs.map((d) => d.data());
        const key = nextIssueKey(existingTickets, prefix);
        const order = (existingTickets.filter((t) => t.column === column).length + 1) * 1024;

        const ticketData = {
          issueKey: key,
          title: title.trim(),
          description: description.trim(),
          column,
          priority: Number(priority),
          type,
          department,
          clientVisible: Boolean(clientVisible),
          checklist: [],
          tagIds: [type === 'bug' ? 'bug' : 'engineering'],
          assigneeId: null,
          dueDate: null,
          order,
          reporterId: 'agent-mcp',
          statusHistory: [
            {
              from: null,
              to: column,
              timestamp: new Date().toISOString(),
              actorName: 'Agent',
            },
          ],
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          completedAt: column === 'done' ? FieldValue.serverTimestamp() : null,
        };

        const newDocRef = await firestore.collection(`projects/${projectId}/tickets`).add(ticketData);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                ticketId: newDocRef.id,
                issueKey: key,
                title,
                column,
                priority,
              }, null, 2),
            },
          ],
        };
      }

      case 'solorise_add_checklist_item': {
        const { projectId, ticketId, label, done = false } = args;
        const ticketRef = firestore.doc(`projects/${projectId}/tickets/${ticketId}`);
        const snap = await ticketRef.get();

        if (!snap.exists) {
          throw new Error(`Ticket ${ticketId} not found in project ${projectId}`);
        }

        const checklist = Array.isArray(snap.data()?.checklist) ? snap.data().checklist : [];
        const newItem = {
          id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          label: label.trim(),
          done: Boolean(done),
        };

        await ticketRef.update({
          checklist: [...checklist, newItem],
          updatedAt: FieldValue.serverTimestamp(),
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, ticketId, newItem }, null, 2),
            },
          ],
        };
      }

      case 'solorise_list_comments': {
        const { projectId, ticketId } = args;
        const commentsRef = firestore.collection(`projects/${projectId}/tickets/${ticketId}/comments`);
        const snap = await commentsRef.orderBy('createdAt', 'asc').get();

        const comments = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            authorName: d.authorName || 'User',
            authorEmail: d.authorEmail || '',
            authorRole: d.authorRole || 'member',
            content: d.content || '',
            mentionedUserIds: Array.isArray(d.mentionedUserIds) ? d.mentionedUserIds : [],
            createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
          };
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ projectId, ticketId, count: comments.length, comments }, null, 2),
            },
          ],
        };
      }

      case 'solorise_add_comment': {
        const { projectId, ticketId, content, authorName = 'Agent', mentionedUserIds = [] } = args;
        const ticketRef = firestore.doc(`projects/${projectId}/tickets/${ticketId}`);
        const snap = await ticketRef.get();
        if (!snap.exists) {
          throw new Error(`Ticket ${ticketId} not found in project ${projectId}`);
        }

        const commentsRef = firestore.collection(`projects/${projectId}/tickets/${ticketId}/comments`);
        const newComment = {
          ticketId,
          projectId,
          authorId: 'agent',
          authorName: String(authorName).trim(),
          authorEmail: 'agent@solorise.local',
          authorRole: 'member',
          content: String(content).trim(),
          mentionedUserIds: Array.isArray(mentionedUserIds) ? mentionedUserIds : [],
          createdAt: FieldValue.serverTimestamp(),
        };

        const docRef = await commentsRef.add(newComment);

        const existingCount = Number(snap.data()?.commentCount || 0);
        await ticketRef.update({
          commentCount: existingCount + 1,
          updatedAt: FieldValue.serverTimestamp(),
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                commentId: docRef.id,
                ticketId,
                authorName: newComment.authorName,
                content: newComment.content,
              }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error executing ${name}: ${err.message}`,
        },
      ],
    };
  }
});

async function main() {
  const args = process.argv.slice(2);
  const portIdx = args.findIndex((a) => a === '--port' || a === '-p');
  const hostIdx = args.findIndex((a) => a === '--host');
  const isHttp = args.includes('--http');

  if (isHttp) {
    const port = Number(portIdx !== -1 ? args[portIdx + 1] : process.env.MCP_PORT) || 3333;
    const host = (hostIdx !== -1 ? args[hostIdx + 1] : process.env.MCP_HOST) || '127.0.0.1';
    const authToken = process.env.MCP_AUTH_TOKEN?.trim() || '';
    const loopbackHosts = new Set(['127.0.0.1', '::1', 'localhost']);
    if (!loopbackHosts.has(host) && !authToken) {
      throw new Error('Remote MCP HTTP mode requires MCP_AUTH_TOKEN. Use the default 127.0.0.1 host for local-only access.');
    }
    const allowedOrigins = new Set(
      (process.env.MCP_ALLOWED_ORIGINS || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    );
    let sseTransport = null;

    const httpServer = createServer(async (req, res) => {
      const origin = req.headers.origin;
      if (origin) {
        if (!allowedOrigins.has(origin)) {
          res.writeHead(403, { 'Content-Type': 'application/json' })
            .end(JSON.stringify({ error: 'Origin is not allowed.' }));
          return;
        }
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      }

      if (req.method === 'OPTIONS') {
        res.writeHead(204).end();
        return;
      }

      const isHealthCheck = req.url === '/health' || req.url === '/';
      if (authToken && !isHealthCheck && req.headers.authorization !== `Bearer ${authToken}`) {
        res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' })
          .end(JSON.stringify({ error: 'Authentication required.' }));
        return;
      }

      if (req.url === '/sse' && req.method === 'GET') {
        console.error('Client connected via SSE');
        sseTransport = new SSEServerTransport('/messages', res);
        await server.connect(sseTransport);
      } else if (req.url?.startsWith('/messages') && req.method === 'POST') {
        if (!sseTransport) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
            .end(JSON.stringify({ error: 'SSE connection not established. Connect to /sse first.' }));
          return;
        }
        await sseTransport.handlePostMessage(req, res);
      } else if (isHealthCheck) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({
            status: 'ok',
            server: 'solorise-mcp',
            version: '1.0.0',
            endpoints: {
              sse: `http://${host}:${port}/sse`,
              messages: `http://${host}:${port}/messages`,
            },
          }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ error: 'Not Found' }));
      }
    });

    httpServer.listen(port, host, () => {
      console.error(`Solorise MCP Server running on HTTP/SSE: http://${host}:${port}/sse`);
      console.error(authToken ? 'Bearer authentication enabled.' : 'Local loopback access only.');
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Solorise MCP Server running on stdio');
  }
}

main().catch((err) => {
  console.error('Fatal error starting Solorise MCP Server:', err);
  process.exit(1);
});
