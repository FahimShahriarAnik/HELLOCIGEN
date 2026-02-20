import * as vscode from "vscode";
import * as vsls from "vsls";
import { serverManager } from "../serverManager";

export class InitialSessionView implements vscode.WebviewViewProvider {
  public static readonly viewId = "helloCigen.initialSession";

  private view?: vscode.WebviewView;

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (!msg?.type) return;
      if (msg.type === "choose") {
        this.view?.webview.postMessage({ type: "selected", choice: msg.choice });
      }
      if (msg.type === "startSession" && typeof msg.participantCount === "number") {
        await this.startSession(msg.participantCount);
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
    }
    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 12px;
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
    .view { display: none; }
    .view.active { display: block; }
    .hint {
      margin-top: 10px;
      font-size: 12px;
      opacity: 0.75;
    }
    .list {
      margin-top: 10px;
      display: grid;
      gap: 8px;
    }
    .session-item {
      padding: 10px;
      border-radius: 8px;
      border: 1px solid var(--vscode-border-color);
      background: var(--vscode-editorWidget-background);
      cursor: pointer;
      font-size: 12px;
      word-break: break-word;
    }
    .session-item:hover {
      border-color: var(--vscode-focusBorder);
    }
    .back {
      margin-top: 14px;
      width: 100%;
    }
    .status {
      margin-top: 8px;
      font-size: 12px;
      opacity: 0.8;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- This block is the simple choice screen that kicks off the flow. -->
    <div id="initialView" class="view active">
      <h2>HELLOCIGEN</h2>
      <div class="card">
        <p>Do you want to continue a previous session?</p>
        <div class="actions">
          <button id="yesBtn">Yes</button>
          <button id="noBtn" class="secondary">No</button>
        </div>
      </div>
    </div>

    <!-- This block lists prior sessions so the user can resume one. -->
    <div id="yesView" class="view">
      <h2>HELLOCIGEN</h2>
      <div class="card">
        <p>Continue previous session</p>
        <div id="sessionsList" class="list"></div>
        <div id="sessionsEmpty" class="hint">Loading sessions...</div>
        <div id="sessionsStatus" class="status"></div>
        <button id="backFromYes" class="secondary back">Back</button>
      </div>
    </div>

    <!-- This block starts a brand-new session with a participant count. -->
    <div id="noView" class="view">
      <h2>HELLOCIGEN</h2>
      <div class="card">
        <p>Start a new session</p>
        <div class="form-row">
          <label for="participantCount">Number of participants</label>
          <input id="participantCount" type="number" min="1" max="100" value="2" />
          <button id="startSessionBtn" class="full">Start Session</button>
          <div id="startStatus" class="status"></div>
        </div>
        <button id="backFromNo" class="secondary back">Back</button>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const initialView = document.getElementById('initialView');
    const yesView = document.getElementById('yesView');
    const noView = document.getElementById('noView');
    const sessionsList = document.getElementById('sessionsList');
    const sessionsEmpty = document.getElementById('sessionsEmpty');
    const sessionsStatus = document.getElementById('sessionsStatus');
    const startStatus = document.getElementById('startStatus');
    const startBtn = document.getElementById('startSessionBtn');
    const participantInput = document.getElementById('participantCount');

    // This block swaps between the three small views without reloading.
    function show(view) {
      initialView.classList.remove('active');
      yesView.classList.remove('active');
      noView.classList.remove('active');
      view.classList.add('active');
    }

    document.getElementById('yesBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'choose', choice: 'yes' });
      show(yesView);
      vscode.postMessage({ type: 'loadSessions' });
    });

    document.getElementById('noBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'choose', choice: 'no' });
      show(noView);
    });

    document.getElementById('backFromYes').addEventListener('click', () => {
      show(initialView);
    });

    document.getElementById('backFromNo').addEventListener('click', () => {
      show(initialView);
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
      vscode.postMessage({ type: 'startSession', participantCount: count });
    });

    // This block renders previous sessions so the user can resume.
    function renderSessions(sessions) {
      sessionsList.innerHTML = '';
      if (!sessions || sessions.length === 0) {
        sessionsEmpty.textContent = 'No previous sessions found.';
        return;
      }
      sessionsEmpty.textContent = '';
      sessions.forEach((sessionId) => {
        const item = document.createElement('button');
        item.className = 'session-item';
        item.textContent = sessionId;
        item.addEventListener('click', () => {
          sessionsStatus.textContent = 'Resuming session...';
          vscode.postMessage({ type: 'resumeSession', sessionId });
        });
        sessionsList.appendChild(item);
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

  private async startSession(participantCount: number): Promise<void> {
    // This block starts a Live Share session when the user clicks "Start Session".
    try {
      const liveShare = await vsls.getApi();
      if (!liveShare) {
        this.postStartStatus(false, "Live Share API not available.");
        return;
      }
      await liveShare.share();
      vscode.window.showInformationMessage(
        `Live Share session started with ${participantCount} expected participants.`
      );
      this.postStartStatus(true, "Session started. You can now invite others.");
    } catch (err) {
      this.postStartStatus(false, `Failed to start Live Share: ${err}`);
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
    // This block hands the chosen session id to Live Share to rejoin it.
    try {
      await vscode.commands.executeCommand("liveshare.join", sessionId);
      this.view?.webview.postMessage({
        type: "resumeStatus",
        message: `Joining session ${sessionId}...`
      });
    } catch (err) {
      this.view?.webview.postMessage({
        type: "resumeStatus",
        message: `Failed to join session: ${err}`
      });
    }
  }

  private postStartStatus(ok: boolean, message: string): void {
    this.view?.webview.postMessage({ type: "startSessionStatus", ok, message });
  }
}
