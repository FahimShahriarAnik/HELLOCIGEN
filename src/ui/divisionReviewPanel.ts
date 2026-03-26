import * as vscode from 'vscode';
import { Project } from '../models/projectConfig';
import { ServerManager } from '../serverManager';
import { patchSessionLog } from '../utils/session_log_utils';
import { generateDivisionOfWork, AiDivision, ParticipantProfile } from '../utils/aiUtils';
import { TaskTrackerProvider } from './taskTrackerProvider';
import { DevelopmentView } from './developmentView';

type DivisionWithOwner = AiDivision & { owner_id: string };
type Participant = { id: string; name: string };

export class DivisionReviewPanel {
  private static panel: vscode.WebviewPanel | undefined;

  static createOrShow(
    sessionId: string,
    project: Project,
    participantCount: number,
    serverMgr: ServerManager,
    context: vscode.ExtensionContext
  ): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'divisionReview',
      'CoGEN — Dividing Work',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );
    this.panel = panel;

    panel.webview.html = this.getHtml(project.title, participantCount);

    panel.onDidDispose(() => {
      this.panel = undefined;
    });

    // Fire-and-forget: panel renders loading phase immediately, runFlow drives transitions
    this.runFlow(sessionId, project, participantCount, serverMgr, context, panel);
  }

  private static async runFlow(
    sessionId: string,
    project: Project,
    participantCount: number,
    serverMgr: ServerManager,
    context: vscode.ExtensionContext,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    const apiKey = await context.secrets.get('openai-api-key');
    if (!apiKey) {
      panel.webview.postMessage({ type: 'noApiKey' });
      setTimeout(() => {
        vscode.window.showWarningMessage(
          'No OpenAI API key set. Use "HelloCigen: Set API Key" first.',
          'Set API Key'
        ).then(choice => {
          if (choice === 'Set API Key') {
            vscode.commands.executeCommand('helloCigen.setApiKey');
          }
        });
        panel.dispose();
      }, 1200);
      return;
    }

    // Fetch participant profiles (with S&W) from the session log for AI context.
    let participantProfiles: ParticipantProfile[] = [];
    try {
      const logs: any[] = await serverMgr.httpFetch(`/sessions/${sessionId}`);
      const latest = logs[logs.length - 1];
      if (latest?.participants) {
        participantProfiles = (latest.participants as any[]).map((p: any) => ({
          id: p.id,
          name: p.name,
          strengths: p.strengths,
          weaknesses: p.weaknesses
        }));
      }
    } catch {
      // Non-critical — proceed without profiles
    }

    let rawDivisions: AiDivision[];
    try {
      rawDivisions = await generateDivisionOfWork(project, participantCount, apiKey, participantProfiles);
    } catch (err) {
      vscode.window.showWarningMessage(`AI division failed: ${err}`);
      panel.dispose();
      return;
    }

    // Use real names from session log; fall back to generic names if unavailable
    const participants: Participant[] = participantProfiles.length > 0
      ? participantProfiles.map(p => ({ id: p.id, name: p.name }))
      : this.buildParticipants(participantCount);
    const divisions: DivisionWithOwner[] = rawDivisions.map((d, i) => ({
      ...d,
      owner_id: participants[i]?.id ?? `u${i + 1}`
    }));

    panel.webview.postMessage({ type: 'divisionsReady', divisions, participants });

    panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'confirmSession') {
        const finalDivisions: DivisionWithOwner[] = msg.divisions;
        try {
          await patchSessionLog(sessionId, { division_of_work: finalDivisions }, serverMgr);
          TaskTrackerProvider.instance?.setParticipants(participants);
          DevelopmentView.createOrShow(
            sessionId, project, participantCount, serverMgr, context, finalDivisions
          );
          panel.dispose();
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to save divisions: ${err}`);
        }
      }
      if (msg.type === 'cancelSession') {
        panel.dispose();
      }
    });
  }

  private static buildParticipants(count: number): Participant[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `u${i + 1}`,
      name: i === 0 ? 'Host' : `Peer ${i}`
    }));
  }

  private static getHtml(projectTitle: string, participantCount: number): string {
    const escaped = projectTitle.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    }

    /* ── Phase management ── */
    .phase { display: none; }
    .phase.active { display: flex; }

    /* ── Phase 1: Loading ── */
    #phase-loading {
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      text-align: center;
      padding: 40px;
    }
    .ai-icon-wrapper {
      position: relative;
      width: 100px;
      height: 100px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 36px;
    }
    .pulse-ring {
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      border: 2px solid var(--vscode-focusBorder);
      animation: pulse 2s ease-out infinite;
      opacity: 0;
    }
    .pulse-ring.delay1 { animation-delay: 0.66s; }
    .pulse-ring.delay2 { animation-delay: 1.33s; }
    @keyframes pulse {
      0%   { transform: scale(0.8); opacity: 0.8; }
      100% { transform: scale(2.5); opacity: 0; }
    }
    .core-badge {
      position: relative;
      z-index: 1;
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
    }
    .loading-title {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 12px;
    }
    .loading-sub {
      font-size: 14px;
      opacity: 0.7;
      margin-bottom: 28px;
      line-height: 1.7;
    }
    .dots-row {
      display: flex;
      gap: 8px;
      justify-content: center;
      margin-bottom: 20px;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--vscode-button-background);
      animation: bounce 1.2s ease-in-out infinite;
    }
    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce {
      0%, 80%, 100% { transform: translateY(0); }
      40%           { transform: translateY(-10px); }
    }
    .loading-hint {
      font-size: 12px;
      opacity: 0.45;
    }
    .error-inline {
      color: var(--vscode-errorForeground);
      font-size: 13px;
      margin-top: 20px;
    }

    /* ── Phase 2: Review ── */
    #phase-review {
      flex-direction: column;
      min-height: 100vh;
      padding: 32px 40px;
      animation: fadeIn 0.4s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .review-header {
      margin-bottom: 28px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .review-header h2 {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .review-subtitle {
      font-size: 13px;
      opacity: 0.7;
      line-height: 1.6;
    }
    .division-cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .div-card {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 10px;
      padding: 16px;
      background: var(--vscode-editorWidget-background);
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
    .div-title {
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 8px;
      display: block;
    }
    .owner-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .owner-label {
      font-size: 11px;
      opacity: 0.6;
      white-space: nowrap;
    }
    .owner-select {
      font-size: 12px;
      font-family: var(--vscode-font-family);
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 4px;
      padding: 3px 8px;
      cursor: pointer;
    }
    .owner-select:focus { outline: 1px solid var(--vscode-focusBorder); }
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
      content: '·';
      position: absolute;
      left: 4px;
      opacity: 0.5;
    }
    .confirm-bar {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      padding-top: 16px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    .btn-secondary {
      padding: 8px 20px;
      border-radius: 6px;
      border: 1px solid var(--vscode-panel-border);
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      font-size: 13px;
      font-family: var(--vscode-font-family);
    }
    .btn-primary {
      padding: 8px 24px;
      border-radius: 6px;
      border: 1px solid transparent;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font-size: 13px;
      font-weight: 700;
      font-family: var(--vscode-font-family);
    }
    .btn-secondary:hover { background: var(--vscode-list-hoverBackground); }
    .btn-primary:hover   { filter: brightness(1.1); }
  </style>
</head>
<body>

  <!-- Phase 1: Loading -->
  <div id="phase-loading" class="phase active">
    <div class="ai-icon-wrapper">
      <div class="pulse-ring"></div>
      <div class="pulse-ring delay1"></div>
      <div class="pulse-ring delay2"></div>
      <div class="core-badge">CoGEN</div>
    </div>
    <h2 class="loading-title">Analyzing your project...</h2>
    <p class="loading-sub">
      Creating <strong>${participantCount}</strong> workstream${participantCount !== 1 ? 's' : ''} for<br/>
      <strong>${escaped}</strong>
    </p>
    <div class="dots-row">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>
    <p class="loading-hint">CoGEN is reading your project scope and dividing work...</p>
    <div id="errorInline" class="error-inline" style="display:none;"></div>
  </div>

  <!-- Phase 2: Review (hidden until divisionsReady) -->
  <div id="phase-review" class="phase">
    <div class="review-header">
      <h2>Review Task Divisions</h2>
      <p class="review-subtitle">
        CoGEN has divided <strong>${escaped}</strong> into
        <strong id="divCount"></strong> workstreams.
        Reassign owners as needed before starting.
      </p>
    </div>
    <div id="divisionCards" class="division-cards"></div>
    <div class="confirm-bar">
      <button id="cancelBtn" class="btn-secondary">Cancel</button>
      <button id="confirmBtn" class="btn-primary">Confirm &amp; Start Session &#x2192;</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let currentDivisions = [];
    let currentParticipants = [];

    window.addEventListener('message', (event) => {
      const msg = event.data;

      if (msg.type === 'divisionsReady') {
        currentDivisions = msg.divisions;
        currentParticipants = msg.participants;
        renderReview();
        document.getElementById('phase-loading').classList.remove('active');
        document.getElementById('phase-review').classList.add('active');
      }

      if (msg.type === 'noApiKey') {
        const err = document.getElementById('errorInline');
        err.textContent = 'No OpenAI API key set. Use "HelloCigen: Set API Key" command.';
        err.style.display = '';
      }
    });

    function renderReview() {
      document.getElementById('divCount').textContent = currentDivisions.length;
      const container = document.getElementById('divisionCards');
      container.innerHTML = currentDivisions.map((div, i) => {
        const options = currentParticipants.map(p =>
          '<option value="' + p.id + '"' + (p.id === div.owner_id ? ' selected' : '') + '>' + p.name + '</option>'
        ).join('');
        const tasks = div.tasks.map(t => '<li>' + t.title + '</li>').join('');
        return '<div class="div-card">'
          + '<div class="div-card-header">'
          + '<span class="div-index">' + String(i + 1).padStart(2, '0') + '</span>'
          + '<div class="div-info">'
          + '<span class="div-title">' + div.title + '</span>'
          + '<div class="owner-row">'
          + '<span class="owner-label">Assigned to:</span>'
          + '<select class="owner-select" data-division-id="' + div.id + '">' + options + '</select>'
          + '</div>'
          + '</div>'
          + '</div>'
          + '<ul class="task-list">' + tasks + '</ul>'
          + '</div>';
      }).join('');
    }

    document.getElementById('confirmBtn').addEventListener('click', () => {
      const updated = currentDivisions.map(d => {
        const sel = document.querySelector('[data-division-id="' + d.id + '"]');
        return Object.assign({}, d, { owner_id: sel ? sel.value : d.owner_id });
      });
      vscode.postMessage({ type: 'confirmSession', divisions: updated });
    });

    document.getElementById('cancelBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'cancelSession' });
    });
  </script>
</body>
</html>`;
  }
}
