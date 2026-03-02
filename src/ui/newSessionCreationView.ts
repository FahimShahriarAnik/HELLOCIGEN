import * as vscode from 'vscode';
import { Project } from '../models/projectConfig';
import { ServerManager } from '../serverManager';
import { createSessionLog } from '../utils/session_log_utils';
import { DevelopmentView } from './developmentView';

export class NewSessionCreationView {
  private static panel: vscode.WebviewPanel | undefined;
  private static pollInterval: ReturnType<typeof setInterval> | undefined;

  static createOrShow(
    serverMgr: ServerManager,
    liveShare: any,
    sessionName: string,
    participantCount: number,
    projects: Project[],
    context: vscode.ExtensionContext,
    onSessionStarted?: (projectTitle: string, participantCount: number) => void
  ): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'newSessionCreation',
      'New Session — Select Project',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    this.panel.webview.html = this.getHtml(sessionName, participantCount, projects);

    const pushJoinedCount = () => {
      const joined = (liveShare.peers?.length ?? 0) + 1; // peers + host
      this.panel?.webview.postMessage({ type: 'participantsJoined', count: joined });
    };

    pushJoinedCount();
    this.pollInterval = setInterval(pushJoinedCount, 10_000);

    this.panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type !== 'beginSession') return;

      // Validate that all expected participants have joined before proceeding.
      const joinedCount = (liveShare.peers?.length ?? 0) + 1;
      if (joinedCount !== participantCount) {
        this.panel?.webview.postMessage({
          type: 'beginBlocked',
          message: `Expected ${participantCount} participant(s), but only ${joinedCount} have joined. Please wait for everyone to join.`
        });
        return;
      }

      const selectedProject = projects.find(p => p.project_id === msg.projectId);
      if (!selectedProject) return;

      const sessionId = liveShare.session?.id;
      if (!sessionId) {
        vscode.window.showErrorMessage('No active Live Share session found.');
        return;
      }

      try {
        await createSessionLog({
          sessionId,
          sessionName,
          firstProject: selectedProject,
          liveShare,
          sessionNumber: 1
        }, serverMgr);
        this.panel?.dispose();
        DevelopmentView.createOrShow(sessionId, selectedProject, participantCount, serverMgr, context);
        onSessionStarted?.(selectedProject.title, participantCount);
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to create session log: ${err}`);
      }
    });

    this.panel.onDidDispose(() => {
      if (this.pollInterval) {
        clearInterval(this.pollInterval);
        this.pollInterval = undefined;
      }
      this.panel = undefined;
    });
  }

  private static getHtml(sessionName: string, participantCount: number, projects: Project[]): string {
    const complexityColor: Record<string, string> = {
      low: '#22c55e',
      medium: '#f59e0b',
      high: '#ef4444'
    };

    const cards = projects.map(p => `
      <label class="project-card" data-id="${p.project_id}">
        <input type="radio" name="project" value="${p.project_id}" />
        <div class="card-header">
          <span class="card-title">${p.title}</span>
          <span class="badge" style="background:${complexityColor[p.complexity] ?? '#888'}">${p.complexity}</span>
        </div>
        <p class="card-desc">${p.description}</p>
      </label>
    `).join('');

    const emptyState = projects.length === 0
      ? `<p class="empty">No projects found in database. Add a project config first.</p>`
      : '';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      padding: 28px 32px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      margin: 0;
    }
    .header {
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    h2 { margin: 0 0 6px; font-size: 20px; font-weight: 700; }
    .meta { font-size: 13px; opacity: 0.7; }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 14px;
      margin-bottom: 24px;
    }
    .project-card {
      display: block;
      border: 2px solid var(--vscode-panel-border);
      border-radius: 10px;
      padding: 16px;
      cursor: pointer;
      background: var(--vscode-editorWidget-background);
    }
    .project-card input[type="radio"] { display: none; }
    .project-card.selected {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-list-hoverBackground);
      color: var(--vscode-foreground);
    }
    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .card-title { font-weight: 700; font-size: 14px; }
    .badge {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 20px;
      color: #000;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .card-desc { font-size: 12px; opacity: 0.8; margin: 0; line-height: 1.5; }
    .empty { opacity: 0.6; font-style: italic; }
    #beginBtn {
      padding: 10px 28px;
      border-radius: 6px;
      border: 1px solid var(--vscode-button-border);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font-weight: 700;
      font-size: 13px;
    }
    #beginBtn:disabled { opacity: 0.4; cursor: not-allowed; }
  </style>
</head>
<body>
  <div class="header">
    <h2>Select a Project</h2>
    <p class="meta">
      Session: <strong>${sessionName || '—'}</strong>
      &nbsp;·&nbsp;
      Participants: <strong>${participantCount}</strong>
      &nbsp;·&nbsp;
      Participants Joined: <strong id="joinedCount">—</strong>
    </p>
  </div>

  <div class="cards">${cards}</div>
  ${emptyState}

  <button id="beginBtn" disabled>Begin Session</button>
  <div id="warningMsg" style="margin-top:8px;font-size:12px;color:var(--vscode-errorForeground);display:none;"></div>

  <script>
    const vscode = acquireVsCodeApi();
    let selectedId = null;

    document.querySelectorAll('.project-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.project-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        card.querySelector('input').checked = true;
        selectedId = card.dataset.id;
        document.getElementById('beginBtn').disabled = false;
      });
    });

    document.getElementById('beginBtn').addEventListener('click', () => {
      if (!selectedId) return;
      document.getElementById('warningMsg').style.display = 'none';
      document.getElementById('beginBtn').disabled = true;
      document.getElementById('beginBtn').textContent = 'Creating session...';
      vscode.postMessage({ type: 'beginSession', projectId: selectedId });
    });

    window.addEventListener('message', (event) => {
      if (event.data?.type === 'participantsJoined') {
        document.getElementById('joinedCount').textContent = event.data.count;
      }
      if (event.data?.type === 'beginBlocked') {
        const warning = document.getElementById('warningMsg');
        warning.textContent = event.data.message;
        warning.style.display = '';
        document.getElementById('beginBtn').disabled = false;
        document.getElementById('beginBtn').textContent = 'Begin Session';
      }
    });
  </script>
</body>
</html>`;
  }
}
