import * as vscode from "vscode";
import * as vsls from "vsls";
import { serverManager } from "../serverManager";
import { createDraftSession } from "../utils/session_log_utils";
import { NewSessionCreationView } from "./newSessionCreationView";
import { TaskTrackerProvider } from "./taskTrackerProvider";
import { DevChatPanel } from "./devChatPanel";

const SERVER_URL = 'http://localhost:4000';
const POLL_INTERVAL_MS = 5000;

export class SessionDashboard implements vscode.WebviewViewProvider {
  public static readonly viewId = "helloCigen.initialSession";
  public static instance: SessionDashboard | undefined;

  private view?: vscode.WebviewView;
  private output = vscode.window.createOutputChannel("HelloCigen");

  private sidebarState: 'welcome' | 'dashboard' | 'completed' = 'welcome';
  public activeSessionId: string | undefined;
  private sessionData: any | null = null;
  private summaryText: string | undefined;
  public isHost: boolean = true;
  private pollTimer?: ReturnType<typeof setInterval>;

  constructor(private context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (!msg?.type) return;
      if (msg.type === "startSession" && typeof msg.participantCount === "number") {
        await this.startSession(msg.participantCount, msg.sessionName ?? "");
      }
      if (msg.type === "loadSessions") {
        await this.loadSessions();
      }
      if (msg.type === "resumeSession" && typeof msg.sessionId === "string") {
        await this.resumeSession(msg.sessionId);
      }
      if (msg.type === "endSession") {
        await this.endSession();
      }
      if (msg.type === "newSession") {
        this.resetState();
        this.render();
      }
      if (msg.type === "retrySummary") {
        await this.generateOrFetchSummary();
      }
    });

    this.render();
  }

  // --- Public API ---

  setActiveSession(sessionId: string, isHost: boolean): void {
    this.activeSessionId = sessionId;
    this.isHost = isHost;
    this.startSessionPolling(sessionId);
  }

  async endSession(): Promise<void> {
    if (this.sidebarState === 'completed') return;
    if (!this.activeSessionId) return;

    const sessionId = this.activeSessionId;

    // Transition to completed UI with loading spinner
    this.sidebarState = 'completed';
    this.summaryText = undefined;
    this.render();

    // Stop all polling loops and close chat panel
    TaskTrackerProvider.instance?.dispose();
    DevChatPanel.dispose();

    // Generate summary first (host), then mark completed
    await this.generateOrFetchSummary();

    // PATCH session as completed
    try {
      await fetch(`${SERVER_URL}/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'completed',
          end_time: new Date().toISOString()
        })
      });
    } catch {
      // Best-effort — session may still be marked locally
    }

    this.stopPolling();
  }

  // --- Polling ---

  private startSessionPolling(sessionId: string): void {
    this.stopPolling();
    this.pollTimer = setInterval(async () => {
      try {
        const resp = await fetch(`${SERVER_URL}/sessions/${sessionId}/state`);
        if (!resp.ok) return;
        const state = await resp.json() as any;

        if (state.status === 'active' && this.sidebarState === 'welcome') {
          this.sessionData = state;
          this.sidebarState = 'dashboard';
          this.render();
        }

        if (state.status === 'completed' && this.sidebarState !== 'completed') {
          this.stopPolling();
          TaskTrackerProvider.instance?.dispose();
          DevChatPanel.dispose();
          this.sidebarState = 'completed';
          this.summaryText = undefined;
          this.render();
          await this.fetchSummary(sessionId);
        }
      } catch {
        // Server not reachable, keep polling
      }
    }, POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  // --- Summary ---

  private async generateOrFetchSummary(): Promise<void> {
    if (!this.activeSessionId) return;

    if (this.isHost) {
      // Host generates summary via POST
      try {
        const resp = await fetch(`${SERVER_URL}/sessions/${this.activeSessionId}/summary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const data = await resp.json() as any;
        if (data.ok && data.summary) {
          this.summaryText = data.summary;
        } else {
          this.summaryText = '__error__';
        }
      } catch {
        this.summaryText = '__error__';
      }
    } else {
      // Guest fetches summary via GET
      await this.fetchSummary(this.activeSessionId);
    }

    this.render();
  }

  private async fetchSummary(sessionId: string): Promise<void> {
    try {
      const resp = await fetch(`${SERVER_URL}/sessions/${sessionId}/summary`);
      const data = await resp.json() as any;
      if (data.ok && data.summary) {
        this.summaryText = data.summary;
      } else {
        this.summaryText = '__error__';
      }
    } catch {
      this.summaryText = '__error__';
    }
    this.render();
  }

  // --- State Reset ---

  private resetState(): void {
    this.sidebarState = 'welcome';
    this.activeSessionId = undefined;
    this.sessionData = null;
    this.summaryText = undefined;
    this.isHost = true;
    this.stopPolling();
  }

  // --- Render Dispatch ---

  private render(): void {
    if (!this.view) return;

    switch (this.sidebarState) {
      case 'welcome':
        this.renderWelcome();
        break;
      case 'dashboard':
        this.renderDashboard();
        break;
      case 'completed':
        this.renderCompleted();
        break;
    }
  }

  // --- Welcome (exact existing HTML) ---

  private renderWelcome(): void {
    if (!this.view) return;

    this.view.webview.html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      padding: 16px;
      color: var(--vscode-foreground);
      margin: 0;
      background: var(--vscode-editor-background);
    }
    .container {
      max-width: 520px;
      margin: 0 auto;
    }
    h2 {
      margin: 0 0 10px 0;
      font-size: 18px;
      font-weight: 700;
    }
    p {
      margin: 0 0 16px 0;
      opacity: 0.85;
      font-size: 13px;
    }
    .card {
      border: 1px solid var(--vscode-border-color);
      border-radius: 10px;
      padding: 16px;
      background: var(--vscode-editorWidget-background);
      margin-bottom: 12px;
    }
    .section-title {
      margin: 0 0 8px 0;
      font-size: 14px;
      font-weight: 700;
    }
    .form-row {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      margin-top: 10px;
    }
    label {
      font-size: 12px;
      font-weight: 600;
    }
    input[type="number"] {
      width: 100%;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid var(--vscode-border-color);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
    }
    button {
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid var(--vscode-button-border);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font-weight: 600;
      font-size: 12px;
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button.full {
      width: 100%;
      margin-top: 10px;
    }
    .hint {
      margin-top: 10px;
      font-size: 12px;
      opacity: 0.75;
    }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
    th {
      text-align: left; padding: 6px 8px; font-size: 11px; font-weight: 600;
      color: var(--vscode-descriptionForeground);
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    td {
      padding: 6px 8px; color: var(--vscode-foreground);
      border-bottom: 1px solid var(--vscode-panel-border); vertical-align: middle;
    }
    tr:hover td { background: var(--vscode-list-hoverBackground); }
    td input[type="checkbox"] { cursor: pointer; }
    .status {
      margin-top: 8px;
      font-size: 12px;
      opacity: 0.8;
    }
  </style>
</head>
<body>
  <div class="container">
    <h2>HELLOCIGEN</h2>
    <p>Resume an existing session or start a new one.</p>

    <div class="card">
      <h3 class="section-title">Resume Existing Sessions</h3>
      <div id="sessionsEmpty" class="hint">Loading sessions...</div>
      <table id="sessionsTable" style="display:none">
        <thead>
          <tr>
            <th>Project</th><th>Session Name</th><th>#</th><th>Last Updated</th><th></th>
          </tr>
        </thead>
        <tbody id="sessionsList"></tbody>
      </table>
      <button id="resumeBtn" class="full" style="display:none">Resume Selected</button>
      <div id="sessionsStatus" class="status"></div>
    </div>

    <div class="card">
      <h3 class="section-title">Start New Session</h3>
      <div class="form-row">
        <label for="sessionName">Session name</label>
        <input id="sessionName" type="text" placeholder="e.g. Sprint 3 – Day 1" />
        <label for="participantCount">Number of participants</label>
        <input id="participantCount" type="number" min="1" max="100" value="2" />
        <button id="startSessionBtn" class="full">Start Session</button>
        <div id="startStatus" class="status"></div>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const sessionsList = document.getElementById('sessionsList');
    const sessionsTable = document.getElementById('sessionsTable');
    const sessionsEmpty = document.getElementById('sessionsEmpty');
    const sessionsStatus = document.getElementById('sessionsStatus');
    const resumeBtn = document.getElementById('resumeBtn');
    const startStatus = document.getElementById('startStatus');
    const startBtn = document.getElementById('startSessionBtn');
    const participantInput = document.getElementById('participantCount');
    const sessionNameInput = document.getElementById('sessionName');

    // Load previous sessions when the view opens.
    vscode.postMessage({ type: 'loadSessions' });

    resumeBtn.addEventListener('click', () => {
      const checked = document.querySelector('.session-check:checked');
      if (!checked) { sessionsStatus.textContent = 'Select a session first.'; return; }
      sessionsStatus.textContent = 'Fetching session...';
      vscode.postMessage({ type: 'resumeSession', sessionId: checked.dataset.sessionId });
    });

    // This block wires the "start session" button to the extension host.
    startBtn.addEventListener('click', () => {
      const count = parseInt(participantInput.value, 10);
      if (isNaN(count) || count < 1) {
        startStatus.textContent = 'Please enter a valid participant count.';
        return;
      }
      startStatus.textContent = 'Starting Live Share...';
      startBtn.disabled = true;
      participantInput.disabled = true;
      sessionNameInput.disabled = true;
      vscode.postMessage({ type: 'startSession', participantCount: count, sessionName: sessionNameInput.value.trim() });
    });

    // This block renders previous sessions as a table so the user can resume.
    function renderSessions(sessions) {
      sessionsList.innerHTML = '';
      if (!sessions || sessions.length === 0) {
        sessionsEmpty.textContent = 'No previous sessions found.';
        sessionsTable.style.display = 'none';
        resumeBtn.style.display = 'none';
        return;
      }
      sessionsEmpty.textContent = '';
      sessionsTable.style.display = '';
      resumeBtn.style.display = '';
      sessions.forEach((s) => {
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + (s.project_title  || '\u2014') + '</td>' +
          '<td>' + (s.session_name   || '\u2014') + '</td>' +
          '<td>' + (s.session_number != null ? s.session_number : '\u2014') + '</td>' +
          '<td>' + (s.last_updated   ? new Date(s.last_updated).toLocaleString() : '\u2014') + '</td>' +
          '<td><input type="checkbox" class="session-check" data-session-id="' + s.session_id + '"></td>';
        sessionsList.appendChild(tr);
      });
    }

    window.addEventListener('message', (event) => {
      if (event.data?.type === 'sessions') {
        renderSessions(event.data.sessions || []);
      }
      if (event.data?.type === 'startSessionStatus') {
        startStatus.textContent = event.data.message || '';
        if (!event.data.ok) {
          startBtn.disabled = false;
          participantInput.disabled = false;
        }
      }
      if (event.data?.type === 'resumeStatus') {
        sessionsStatus.textContent = event.data.message || '';
      }
    });
  </script>
</body>
</html>`;
  }

  // --- Dashboard (active session) ---

  private renderDashboard(): void {
    if (!this.view) return;
    const data = this.sessionData;
    const sessionName = data?.session_name || 'Session';
    const projectTitle = data?.project_title || 'Project';
    const participants: Array<{ id: string; name: string }> = data?.participants || [];
    const divisions: any[] = data?.division_of_work || [];

    const escapedSessionName = this.escapeHtml(sessionName);
    const escapedProjectTitle = this.escapeHtml(projectTitle);

    const participantListHtml = participants.map(p =>
      `<span class="participant-chip">${this.escapeHtml(p.name)}</span>`
    ).join('');

    const divisionCardsHtml = divisions.map((div: any, i: number) => {
      const owner = participants.find(p => p.id === div.owner_id);
      const ownerName = owner?.name ?? div.owner_id;
      const tasksHtml = (div.tasks || []).map((t: any) =>
        `<li>${this.escapeHtml(t.title)}</li>`
      ).join('');
      const filesHtml = ((div.files as string[]) || []).map((f: string) =>
        `<li class="file-item">${this.escapeHtml(f)}</li>`
      ).join('');
      const rationaleHtml = div.rationale
        ? `<p class="rationale">${this.escapeHtml(div.rationale)}</p>`
        : '';
      const filesBlock = filesHtml
        ? `<div class="section-label">Files</div><ul class="file-list">${filesHtml}</ul>`
        : '';
      return `
        <div class="div-card">
          <div class="div-card-header">
            <span class="div-index">${String(i + 1).padStart(2, '0')}</span>
            <div class="div-info">
              <span class="div-title">${this.escapeHtml(div.title)}</span>
              <span class="owner-badge">${this.escapeHtml(ownerName)}</span>
            </div>
          </div>
          ${rationaleHtml}
          <div class="section-label">Tasks</div>
          <ul class="task-list">${tasksHtml}</ul>
          ${filesBlock}
        </div>`;
    }).join('');

    const endButtonHtml = this.isHost
      ? `<button id="endSessionBtn" class="full end-btn">End Session</button>`
      : '';

    this.view.webview.html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      padding: 16px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    h2 { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
    .subtitle { font-size: 12px; opacity: 0.7; margin-bottom: 16px; }
    .status-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 2px 8px;
      border-radius: 10px;
      background: #4caf50;
      color: #fff;
      margin-left: 8px;
      vertical-align: middle;
    }
    .info-row {
      font-size: 12px;
      margin-bottom: 6px;
      opacity: 0.85;
    }
    .info-row strong { font-weight: 600; }
    .participants-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 10px 0 16px 0;
    }
    .participant-chip {
      font-size: 11px;
      padding: 3px 10px;
      border-radius: 12px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    .division-cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 10px;
      margin-bottom: 16px;
    }
    .div-card {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 12px;
      background: var(--vscode-editorWidget-background);
    }
    .div-card-header {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      margin-bottom: 8px;
    }
    .div-index {
      font-size: 16px;
      font-weight: 700;
      opacity: 0.2;
      line-height: 1;
      flex-shrink: 0;
    }
    .div-info { flex: 1; min-width: 0; }
    .div-title { font-size: 12px; font-weight: 700; display: block; margin-bottom: 2px; }
    .owner-badge { font-size: 10px; opacity: 0.6; }
    .rationale {
      font-size: 11px;
      opacity: 0.75;
      line-height: 1.5;
      padding: 8px 0 6px 0;
      margin-top: 8px;
      border-top: 1px solid var(--vscode-panel-border);
      font-style: italic;
    }
    .section-label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      opacity: 0.55;
      margin: 8px 0 3px 0;
    }
    .task-list {
      list-style: none;
      padding: 0;
    }
    .task-list li {
      font-size: 11px;
      opacity: 0.8;
      padding: 2px 0 2px 12px;
      position: relative;
      line-height: 1.5;
    }
    .task-list li::before {
      content: '\\00B7';
      position: absolute;
      left: 3px;
      opacity: 0.5;
    }
    .file-list {
      list-style: none;
      padding: 0;
    }
    .file-list .file-item {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 10px;
      opacity: 0.85;
      padding: 2px 0 2px 12px;
      position: relative;
      line-height: 1.4;
    }
    .file-list .file-item::before {
      content: '\\203A';
      position: absolute;
      left: 3px;
      opacity: 0.5;
    }
    button.full {
      width: 100%;
      margin-top: 10px;
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid var(--vscode-button-border);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font-weight: 600;
      font-size: 12px;
    }
    .end-btn {
      background: var(--vscode-inputValidation-errorBackground, #c0392b);
      border-color: var(--vscode-inputValidation-errorBorder, #e74c3c);
    }
  </style>
</head>
<body>
  <h2>${escapedSessionName} <span class="status-badge">Active</span></h2>
  <p class="subtitle">${escapedProjectTitle}</p>

  <div class="info-row"><strong>Participants:</strong></div>
  <div class="participants-row">${participantListHtml || '<span style="opacity:0.5;font-size:11px">None</span>'}</div>

  <div class="division-cards">${divisionCardsHtml}</div>

  ${endButtonHtml}

  <script>
    const vscode = acquireVsCodeApi();
    const endBtn = document.getElementById('endSessionBtn');
    if (endBtn) {
      endBtn.addEventListener('click', () => {
        endBtn.disabled = true;
        endBtn.textContent = 'Ending session...';
        vscode.postMessage({ type: 'endSession' });
      });
    }
  </script>
</body>
</html>`;
  }

  // --- Completed (summary) ---

  private renderCompleted(): void {
    if (!this.view) return;

    let bodyContent: string;

    if (this.summaryText === undefined) {
      // Loading state
      bodyContent = `
        <div class="loading">
          <div class="spinner"></div>
          <p>Generating session summary...</p>
        </div>`;
    } else if (this.summaryText === '__error__') {
      // Error state
      bodyContent = `
        <div class="error-box">
          <p>Failed to generate summary.</p>
          <button id="retryBtn" class="full">Retry</button>
        </div>`;
    } else {
      // Summary ready
      bodyContent = `
        <div class="summary-content">${this.markdownToHtml(this.summaryText)}</div>`;
    }

    this.view.webview.html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      padding: 16px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    h2 { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
    .completed-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 2px 8px;
      border-radius: 10px;
      background: var(--vscode-descriptionForeground);
      color: var(--vscode-editor-background);
      margin-left: 8px;
      vertical-align: middle;
    }
    .subtitle { font-size: 12px; opacity: 0.7; margin-bottom: 16px; }
    .loading {
      text-align: center;
      padding: 32px 0;
    }
    .loading p {
      font-size: 12px;
      opacity: 0.7;
      margin-top: 12px;
    }
    .spinner {
      width: 24px;
      height: 24px;
      border: 3px solid var(--vscode-panel-border);
      border-top-color: var(--vscode-focusBorder);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error-box {
      text-align: center;
      padding: 24px 0;
    }
    .error-box p {
      font-size: 12px;
      color: var(--vscode-errorForeground);
      margin-bottom: 12px;
    }
    .summary-content {
      font-size: 12px;
      line-height: 1.7;
      word-break: break-word;
    }
    .summary-content h1, .summary-content h2, .summary-content h3 {
      font-size: 13px;
      font-weight: 700;
      margin: 14px 0 6px 0;
    }
    .summary-content ul, .summary-content ol {
      padding-left: 18px;
      margin: 4px 0;
    }
    .summary-content strong { font-weight: 700; }
    .summary-content table {
      border-collapse: collapse;
      width: 100%;
      margin: 8px 0;
      font-size: 11px;
    }
    .summary-content th, .summary-content td {
      border: 1px solid var(--vscode-panel-border, #444);
      padding: 4px 8px;
      text-align: left;
    }
    .summary-content th {
      background: var(--vscode-editor-lineHighlightBackground, #2a2a2a);
      font-weight: 700;
    }
    button.full {
      width: 100%;
      margin-top: 10px;
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid var(--vscode-button-border);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font-weight: 600;
      font-size: 12px;
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
  </style>
</head>
<body>
  <h2>Session Completed <span class="completed-badge">Done</span></h2>
  <p class="subtitle">AI-generated session summary</p>

  ${bodyContent}

  <button id="newSessionBtn" class="full secondary" style="margin-top: 20px">Start New Session</button>

  <script>
    const vscode = acquireVsCodeApi();
    const retryBtn = document.getElementById('retryBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        retryBtn.disabled = true;
        retryBtn.textContent = 'Retrying...';
        vscode.postMessage({ type: 'retrySummary' });
      });
    }
    const newBtn = document.getElementById('newSessionBtn');
    if (newBtn) {
      newBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'newSession' });
      });
    }
  </script>
</body>
</html>`;
  }

  // --- Helpers ---

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private markdownToHtml(md: string): string {
    // Escape HTML first
    let escaped = md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Convert markdown tables (must run before line-by-line replacements)
    escaped = escaped.replace(
      /((?:^[^\n]*\|[^\n]*\n)+)/gm,
      (block) => {
        const lines = block.trimEnd().split('\n').filter(l => l.trim());
        // Filter out separator lines (e.g. |---|---|)
        const dataLines = lines.filter(l => !/^\s*\|?[-| :]+\|?\s*$/.test(l));
        if (dataLines.length < 1) return block;
        let html = '<table>';
        dataLines.forEach((line, i) => {
          const cells = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1 || arr.length === 1);
          const tag = i === 0 ? 'th' : 'td';
          html += '<tr>' + cells.map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
        });
        html += '</table>';
        return html;
      }
    );

    return escaped
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
      .replace(/\n{2,}/g, '<br/><br/>')
      .replace(/\n/g, '<br/>');
  }

  // --- Existing methods (preserved) ---

  private async startSession(participantCount: number, sessionName: string): Promise<void> {
    try {
      if (!vscode.workspace.workspaceFolders?.length) {
        this.postStartStatus(false, "Please open a folder before creating a session.");
        return;
      }

      let apiKey = await this.context.secrets.get('openai-api-key');
      if (!apiKey && process.env.OPENAI_API_KEY) {
        await this.context.secrets.store('openai-api-key', process.env.OPENAI_API_KEY);
        apiKey = process.env.OPENAI_API_KEY;
      }
      if (!apiKey) {
        const action = await vscode.window.showWarningMessage(
          "No OpenAI API key set. AI features won't work.",
          "Set API Key"
        );
        if (action === "Set API Key") {
          await vscode.commands.executeCommand("helloCigen.setApiKey");
        }
      }

      const liveShare = await vsls.getApi();
      if (!liveShare) {
        this.postStartStatus(false, "Live Share API not available.");
        return;
      }
      await liveShare.share();
      this.postStartStatus(true, "Session started. Loading projects...");

      await serverManager.startServer();

      if (apiKey) {
        try {
          await serverManager.httpFetch('/api-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey })
          });
        } catch {
          // Non-critical
        }
      }

      try {
        await liveShare.shareServer({ port: 4000, displayName: 'CoGEN Server' });
      } catch {
        vscode.window.showWarningMessage("Failed to share server port. Guests may not be able to connect.");
      }
      const projectConfig = await serverManager.httpFetch("/project_details");
      const projects = projectConfig?.projects ?? [];

      const sessionId = liveShare.session?.id;
      if (sessionId) {
        await createDraftSession(sessionId, sessionName, serverManager);
        this.activeSessionId = sessionId;
        this.isHost = true;
        this.startSessionPolling(sessionId);
      }

      NewSessionCreationView.createOrShow(serverManager, liveShare, sessionName, participantCount, projects, this.context);
    } catch (err) {
      this.postStartStatus(false, `Failed to start session: ${err}`);
    }
  }

  private async loadSessions(): Promise<void> {
    try {
      await serverManager.startServer();
      const sessions = await serverManager.httpFetch("/sessions");
      this.view?.webview.postMessage({ type: "sessions", sessions });
    } catch (err) {
      this.view?.webview.postMessage({ type: "sessions", sessions: [] });
      this.view?.webview.postMessage({
        type: "resumeStatus",
        message: `Failed to load sessions: ${err}`
      });
    }
  }

  private async resumeSession(sessionId: string): Promise<void> {
    try {
      const docs = await serverManager.httpFetch(`/sessions/${sessionId}`);
      const latest = Array.isArray(docs) ? docs[docs.length - 1] : docs;
      this.output.clear();
      this.output.appendLine(JSON.stringify(latest, null, 2));
      this.output.show();
      this.view?.webview.postMessage({
        type: "resumeStatus",
        message: "Document loaded in Output panel."
      });
    } catch (err) {
      this.view?.webview.postMessage({
        type: "resumeStatus",
        message: `Failed to fetch session: ${err}`
      });
    }
  }

  private postStartStatus(ok: boolean, message: string): void {
    this.view?.webview.postMessage({ type: "startSessionStatus", ok, message });
  }
}
