#!/usr/bin/env node

/**
 * End-to-end verification script for Solorise MCP Server.
 * Sends JSON-RPC messages via stdin/stdout exactly as Claude Desktop / Cursor does.
 */

import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');
const serverScript = resolve(rootDir, 'scripts', 'mcp-server.mjs');

console.log('🧪 Starting Solorise MCP Server test harness...\n');

const proc = spawn('node', ['--env-file=.env.local', serverScript], {
  cwd: rootDir,
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buffer = '';
const pending = new Map();
let nextId = 1;

proc.stderr.on('data', (d) => {
  // Server logs to stderr
  const msg = d.toString().trim();
  if (msg) console.log('  [Server Log]:', msg);
});

proc.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop(); // keep remainder

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const response = JSON.parse(line);
      const resolveFn = pending.get(response.id);
      if (resolveFn) {
        pending.delete(response.id);
        resolveFn(response);
      }
    } catch {
      // Not complete JSON yet
    }
  }
});

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    proc.stdin.write(msg);
  });
}

async function run() {
  try {
    // 1. Initialize
    console.log('1️⃣ Sending initialize...');
    const initRes = await send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-harness', version: '1.0.0' },
    });
    console.log('   Initialized successfully:', initRes.result?.serverInfo?.name);

    // 2. Initialized notification
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');

    // 3. List Tools
    console.log('\n2️⃣ Requesting tools/list...');
    const toolsRes = await send('tools/list');
    const tools = toolsRes.result?.tools || [];
    console.log(`   Found ${tools.length} available tools:`);
    for (const t of tools) {
      console.log(`   - ${t.name}: ${t.description.slice(0, 65)}...`);
    }

    // 4. Call solorise_list_projects
    console.log('\n3️⃣ Calling tool: solorise_list_projects...');
    const listProjectsRes = await send('tools/call', {
      name: 'solorise_list_projects',
      arguments: {},
    });
    const projectsData = JSON.parse(listProjectsRes.result.content[0].text);
    console.log(`   Returned ${projectsData.count} projects from Firestore:`);
    for (const p of projectsData.projects) {
      console.log(`   - [${p.id}] ${p.name} (slug: ${p.slug})`);
    }

    if (projectsData.projects.length > 0) {
      const targetProject = projectsData.projects[0];
      // 5. Call solorise_list_tickets for first project
      console.log(`\n4️⃣ Calling tool: solorise_list_tickets for "${targetProject.name}"...`);
      const listTicketsRes = await send('tools/call', {
        name: 'solorise_list_tickets',
        arguments: { projectId: targetProject.id },
      });
      const ticketsData = JSON.parse(listTicketsRes.result.content[0].text);
      console.log(`   Found ${ticketsData.count} tickets:`);
      for (const t of ticketsData.tickets) {
        console.log(`   - ${t.issueKey || t.id}: "${t.title}" in lane [${t.column}]`);
      }

      if (ticketsData.tickets.length > 0) {
        const ticket = ticketsData.tickets[0];
        // 6. Call solorise_get_ticket
        console.log(`\n5️⃣ Calling tool: solorise_get_ticket for "${ticket.issueKey}"...`);
        const getTicketRes = await send('tools/call', {
          name: 'solorise_get_ticket',
          arguments: { projectId: targetProject.id, ticketId: ticket.id },
        });
        const ticketDetails = JSON.parse(getTicketRes.result.content[0].text);
        console.log('   Retrieved full ticket details successfully:');
        console.log(`   - Title: ${ticketDetails.title}`);
        console.log(`   - Lane: ${ticketDetails.column}`);
        console.log(`   - Department: ${ticketDetails.department}`);
        console.log(`   - Description: ${ticketDetails.description || '(none)'}`);
      }
    }

    // 6. Test solorise_create_project
    console.log('\n6️⃣ Calling tool: solorise_create_project...');
    const createProjectRes = await send('tools/call', {
      name: 'solorise_create_project',
      arguments: {
        name: 'MCP Automation Test Workspace',
        description: 'Temporary test project created by MCP harness',
        triageInstructions: 'Only accept automated verification tickets.',
      },
    });
    const createdProjectData = JSON.parse(createProjectRes.result.content[0].text);
    console.log(`   Project created successfully: [${createdProjectData.projectId}] "${createdProjectData.name}"`);

    // 7. Test creating a ticket in the new project
    console.log(`\n7️⃣ Calling tool: solorise_create_ticket in the new project...`);
    const createTicketRes = await send('tools/call', {
      name: 'solorise_create_ticket',
      arguments: {
        projectId: createdProjectData.projectId,
        title: 'Initial setup checklist',
        description: 'Automated ticket created during MCP test run',
        priority: 2,
        column: 'backlog',
      },
    });
    const createdTicketData = JSON.parse(createTicketRes.result.content[0].text);
    console.log(`   Ticket created: ${createdTicketData.issueKey} ("${createdTicketData.title}") in [${createdTicketData.column}]`);

    // 7b. Test moving ticket to QA / Agent Testing
    console.log(`\n7️⃣b Calling tool: solorise_update_ticket_status to "qa" (QA / Agent Testing)...`);
    const updateStatusRes = await send('tools/call', {
      name: 'solorise_update_ticket_status',
      arguments: {
        projectId: createdProjectData.projectId,
        ticketId: createdTicketData.ticketId,
        column: 'qa',
        note: 'Ready for automated test verification.',
      },
    });
    const updateStatusData = JSON.parse(updateStatusRes.result.content[0].text);
    console.log(`   Ticket moved to [${updateStatusData.newColumn}] successfully.`);

    // Verify statusHistory trail
    const getTicketRes = await send('tools/call', {
      name: 'solorise_get_ticket',
      arguments: {
        projectId: createdProjectData.projectId,
        ticketId: createdTicketData.ticketId,
      },
    });
    const ticketDetails = JSON.parse(getTicketRes.result.content[0].text);
    console.log(`   Verified ticket status trail: ${ticketDetails.statusHistory?.length || 0} transitions recorded.`);

    // 8. Test solorise_add_comment
    console.log(`\n8️⃣ Calling tool: solorise_add_comment...`);
    const addCommentRes = await send('tools/call', {
      name: 'solorise_add_comment',
      arguments: {
        projectId: createdProjectData.projectId,
        ticketId: createdTicketData.ticketId,
        content: '@Workspace owner I have created the setup checklist and verified initial dependencies.',
        authorName: 'AI Engineer Agent',
      },
    });
    const addCommentData = JSON.parse(addCommentRes.result.content[0].text);
    console.log(`   Comment added: [${addCommentData.commentId}] by "${addCommentData.authorName}"`);

    // 9. Test solorise_list_comments
    console.log(`\n9️⃣ Calling tool: solorise_list_comments...`);
    const listCommentsRes = await send('tools/call', {
      name: 'solorise_list_comments',
      arguments: {
        projectId: createdProjectData.projectId,
        ticketId: createdTicketData.ticketId,
      },
    });
    const listCommentsData = JSON.parse(listCommentsRes.result.content[0].text);
    console.log(`   Found ${listCommentsData.count} comment(s):`);
    for (const c of listCommentsData.comments) {
      console.log(`   - "${c.content}" by ${c.authorName}`);
    }

    // 10. Test solorise_delete_project to cleanly remove the test project and its tickets
    console.log(`\n🔟 Calling tool: solorise_delete_project for [${createdProjectData.projectId}]...`);
    const deleteProjectRes = await send('tools/call', {
      name: 'solorise_delete_project',
      arguments: {
        projectId: createdProjectData.projectId,
      },
    });
    const deletedData = JSON.parse(deleteProjectRes.result.content[0].text);
    console.log(`   Project deleted successfully (tickets removed: ${deletedData.ticketsDeleted}).`);

    // Also clean up any earlier test project if present
    await send('tools/call', {
      name: 'solorise_delete_project',
      arguments: { projectId: 'KBxwYhFVxmnbA7wip6tm' },
    }).catch(() => {});

    console.log('\n🎉 ALL MCP TOOLS (PROJECT & TICKET LIFECYCLE) VERIFIED SUCCESSFULLY!\n');
    proc.kill();
    process.exit(0);
  } catch (err) {
    console.error('❌ MCP test failed:', err);
    proc.kill();
    process.exit(1);
  }
}

run();
