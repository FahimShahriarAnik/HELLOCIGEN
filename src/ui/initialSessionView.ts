import * as vscode from "vscode";
import * as vsls from "vsls";
import { serverManager } from "../serverManager";
import { NewSessionCreationView } from "./newSessionCreationView";

export class InitialSessionView implements vscode.WebviewViewProvider {
  public static readonly viewId = "helloCigen.initialSession";

  private view?: vscode.WebviewView;
  private output = vscode.window.createOutputChannel("HelloCigen");

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
    });

    this.render();
  }

  private render(): void {
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
          '<td>' + (s.project_title  || '—') + '</td>' +
          '<td>' + (s.session_name   || '—') + '</td>' +
          '<td>' + (s.session_number != null ? s.session_number : '—') + '</td>' +
          '<td>' + (s.last_updated   ? new Date(s.last_updated).toLocaleString() : '—') + '</td>' +
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

  private async startSession(participantCount: number, sessionName: string): Promise<void> {
    // This block starts a Live Share session when the user clicks "Start Session".
    try {
      const liveShare = await vsls.getApi();
      if (!liveShare) {
        this.postStartStatus(false, "Live Share API not available.");
        return;
      }
      await liveShare.share();
      this.postStartStatus(true, "Session started. Loading projects...");

      await serverManager.startServer();
      const projectConfig = await serverManager.httpFetch("/project_details");
      const projects = projectConfig?.projects ?? [];

      NewSessionCreationView.createOrShow(serverManager, liveShare, sessionName, participantCount, projects);
    } catch (err) {
      this.postStartStatus(false, `Failed to start session: ${err}`);
    }
  }

  private async loadSessions(): Promise<void> {
    // This block fetches previous session ids from the server so we can list them.
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
    // Fetches the full session document and shows it in the output channel for inspection.
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
