import * as vscode from 'vscode';
import { TaskTrackerProvider } from './taskTrackerProvider';
import { DevChatPanel } from './devChatPanel';
import { SessionDashboard } from './sessionDashboard';

interface Division {
  id: string;
  title: string;
  owner_id: string;
  tasks: Array<{ id: string; title: string; status: string; subtasks?: Array<{ id: string; title: string; status: string }> }>;
}

interface Participant {
  id: string;
  name: string;
}

// Cast divisions to the shape TaskTrackerProvider expects
function castDivisions(divisions: Division[]): any[] {
  return divisions;
}

export class GuestDevelopmentView {
  private static panel: vscode.WebviewPanel | undefined;

  static createOrShow(
    context: vscode.ExtensionContext,
    guestName: string,
    divisions: Division[],
    participants: Participant[],
    sessionId?: string,
    projectTitle?: string,
    projectDetails?: { title?: string; description?: string; complexity?: string }
  ): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'guestDevelopment',
      'CoGEN — Your Tasks',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    // Populate task tracker sidebar for guest and connect to session for sync
    TaskTrackerProvider.instance?.setParticipants(participants);
    TaskTrackerProvider.instance?.setDivisions(castDivisions(divisions));
    if (sessionId) {
      TaskTrackerProvider.instance?.setSession(sessionId);
      SessionDashboard.instance?.setActiveSession(sessionId, false);
    }

    this.panel.webview.html = this.getHtml(guestName, divisions, participants, projectDetails);

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    // Focus the task tracker sidebar
    vscode.commands.executeCommand('helloCigen.taskTracker.focus').then(
      () => {},
      () => {} // sidebar may not be visible yet
    );

    // Open the shared AI chat panel alongside the development view
    if (sessionId) {
      DevChatPanel.openOrReveal(sessionId, guestName, projectTitle || 'Project');
    }
  }

  private static getHtml(guestName: string, divisions: Division[], participants: Participant[], projectDetails?: { title?: string; description?: string; complexity?: string }): string {
    const escapedName = guestName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Find this guest's division(s) by matching name
    const myDivisions = divisions.filter(d => {
      const owner = participants.find(p => p.id === d.owner_id);
      return owner?.name === guestName;
    });

    const allDivisionsHtml = divisions.map((div, i) => {
      const owner = participants.find(p => p.id === div.owner_id);
      const ownerName = owner?.name ?? div.owner_id;
      const isMine = myDivisions.some(d => d.id === div.id);
      const tasksHtml = div.tasks.map(t => `<li>${t.title}</li>`).join('');
      return `
        <div class="div-card${isMine ? ' mine' : ''}">
          <div class="div-card-header">
            <span class="div-index">${String(i + 1).padStart(2, '0')}</span>
            <div class="div-info">
              <span class="div-title">${div.title}</span>
              <span class="owner-badge">${ownerName}${isMine ? ' (You)' : ''}</span>
            </div>
          </div>
          <ul class="task-list">${tasksHtml}</ul>
        </div>`;
    }).join('');

    const projectBannerHtml = projectDetails?.title ? (() => {
      const title = projectDetails.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const desc = (projectDetails.description ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const complexity = projectDetails.complexity ?? '';
      const complexityBadge = complexity ? `<span class="complexity-badge">${complexity}</span>` : '';
      return `
        <div class="project-banner">
          <div class="project-banner-header">
            <span class="project-label">Project</span>
            ${complexityBadge}
          </div>
          <div class="project-title">${title}</div>
          ${desc ? `<div class="project-description">${desc}</div>` : ''}
        </div>`;
    })() : '';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 32px 40px;
    }
    h2 { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
    .subtitle { font-size: 13px; opacity: 0.7; margin-bottom: 28px; line-height: 1.6; }
    .division-cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
    }
    .div-card {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 10px;
      padding: 16px;
      background: var(--vscode-editorWidget-background);
    }
    .div-card.mine {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-list-hoverBackground);
    }
    .div-card-header {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      margin-bottom: 12px;
    }
    .div-index {
      font-size: 20px;
      font-weight: 700;
      opacity: 0.25;
      line-height: 1;
      flex-shrink: 0;
      padding-top: 2px;
    }
    .div-info { flex: 1; min-width: 0; }
    .div-title { font-size: 14px; font-weight: 700; display: block; margin-bottom: 4px; }
    .owner-badge {
      font-size: 11px;
      opacity: 0.6;
    }
    .task-list {
      list-style: none;
      border-top: 1px solid var(--vscode-panel-border);
      padding-top: 10px;
    }
    .task-list li {
      font-size: 12px;
      opacity: 0.8;
      padding: 3px 0 3px 14px;
      position: relative;
      line-height: 1.5;
    }
    .task-list li::before {
      content: '\\00B7';
      position: absolute;
      left: 4px;
      opacity: 0.5;
    }
    .project-banner {
      background: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 10px;
      padding: 16px 20px;
      margin-bottom: 28px;
    }
    .project-banner-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 6px;
    }
    .project-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      opacity: 0.5;
    }
    .complexity-badge {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 2px 8px;
      border-radius: 20px;
      border: 1px solid var(--vscode-focusBorder);
      color: var(--vscode-focusBorder);
    }
    .project-title {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .project-description {
      font-size: 12px;
      opacity: 0.7;
      line-height: 1.6;
    }
    .hint {
      margin-top: 28px;
      font-size: 12px;
      opacity: 0.5;
      text-align: center;
    }
  </style>
</head>
<body>
  <h2>Session is active!</h2>
  <p class="subtitle">Welcome, <strong>${escapedName}</strong>. The host has divided the work. Your assigned tasks are highlighted below.</p>
  ${projectBannerHtml}
  <div class="division-cards">${allDivisionsHtml}</div>
  <p class="hint">Use the Task Tracker in the sidebar to update your progress.</p>
</body>
</html>`;
  }
}
