import * as vscode from "vscode";
import { ChatManager } from "./chatManager";

const CHOICE_KEY = "helloCigen.userChoice";

export class HelloCigenSidebarViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "helloCigen.sidebar";

  private view?: vscode.WebviewView;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly chatManager: ChatManager
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg?.type === "launch") {
        await this.launch();
      }
      if (msg?.type === "changeMode") {
        await this.openChoiceTilesPanel({ openChatAfter: false });
      }
      if (msg?.type === "toggleChat") {
        this.chatManager.toggleChat();
      }
      if (msg?.type === "closeChat") {
        this.chatManager.closeChat();
      }
    });

    // Render initial sidebar UI
    this.renderSidebar();
  }

  async launch(): Promise<void> {
    const choice = this.context.globalState.get<string>(CHOICE_KEY);
    if (!choice) {
      await this.openChoiceTilesPanel({ openChatAfter: false });
      return;
    }

    // choice exists -> open chat only when user clicks the button
    await this.chatManager.openChat();
    this.renderSidebar();
  }

  private renderSidebar(): void {
    if (!this.view) return;

    const choice = this.context.globalState.get<string>(CHOICE_KEY);

    this.view.webview.html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      padding: 12px;
      color: var(--vscode-foreground);
      margin: 0;
    }
    .card {
      border: 1px solid var(--vscode-border-color);
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 12px;
      background: var(--vscode-editor-background);
    }
    h2 { 
      margin: 0 0 8px 0; 
      font-size: 16px;
      font-weight: 700;
    }
    .info-section {
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-border-color);
      border-radius: 6px;
      padding: 10px;
      margin-bottom: 12px;
      font-size: 12px;
    }
    .info-label {
      opacity: 0.7;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .info-value {
      font-weight: 600;
      color: var(--vscode-editor-foreground);
      word-break: break-word;
    }
    p { margin: 6px 0; opacity: 0.9; font-size: 12px; }
    button {
      width: 100%;
      padding: 9px 12px;
      border: 1px solid var(--vscode-button-border);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      font-size: 12px;
      transition: opacity 0.2s;
    }
    button:hover {
      opacity: 0.9;
    }
    button:active {
      opacity: 0.8;
    }
    button.secondary {
      margin-top: 8px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid var(--vscode-border-color);
    }
    button.danger {
      margin-top: 6px;
      background: var(--vscode-statusBarItem-errorBackground);
      color: white;
      border: none;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      border: 1px solid var(--vscode-badge-background);
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-size: 11px;
      font-weight: 600;
      margin-top: 8px;
    }
    .empty-state {
      opacity: 0.6;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="card">
    <h2>HELLOCIGEN</h2>
    <div class="info-section">
      <div class="info-label">📋 Selected Mode</div>
      <div class="info-value">${choice ? `<span class="badge">${escapeHtml(choice)}</span>` : '<span class="empty-state">No mode selected</span>'}</div>
    </div>
    
    <button id="launchBtn">${choice ? "Open Chat" : "Choose Mode & Open Chat"}</button>
    <button id="toggleChatBtn" class="secondary" ${!choice ? 'style="display:none;"' : ''}>Toggle Chat</button>
    <button id="changeBtn" class="secondary">Change Mode</button>
    <button id="closeChatBtn" class="danger" ${!choice ? 'style="display:none;"' : ''}>Close Chat</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('launchBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'launch' });
    });
    document.getElementById('changeBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'changeMode' });
    });
    document.getElementById('toggleChatBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'toggleChat' });
    });
    document.getElementById('closeChatBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'closeChat' });
    });
  </script>
</body>
</html>`;
  }

  private async openChoiceTilesPanel(opts: { openChatAfter: boolean }): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
      "helloCigen.modePicker",
      "Choose a mode",
      vscode.ViewColumn.Active,
      { enableScripts: true }
    );

    panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg?.type === "pick" && typeof msg.choice === "string") {
        await this.context.globalState.update(CHOICE_KEY, msg.choice);

        // close picker
        panel.dispose();

        // refresh sidebar
        this.renderSidebar();

        if (opts.openChatAfter) {
          await this.chatManager.openChat();
        }
      }
    });

    const existing = this.context.globalState.get<string>(CHOICE_KEY);

    panel.webview.html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body {
      margin: 0;
      padding: 24px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    .wrap {
      max-width: 900px;
      margin: 0 auto;
    }
    h1 {
      font-size: 18px;
      margin: 0 0 8px 0;
    }
    .sub {
      margin: 0 0 18px 0;
      opacity: 0.85;
      font-size: 13px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
    }
    .tile {
      border: 1px solid var(--vscode-border-color);
      border-radius: 14px;
      padding: 16px;
      cursor: pointer;
      background: var(--vscode-editor-background);
      transition: transform 0.08s ease;
      user-select: none;
      min-height: 120px;
    }
    .tile:hover { transform: translateY(-1px); }
    .title {
      font-weight: 700;
      margin-bottom: 8px;
      font-size: 14px;
    }
    .desc {
      font-size: 12px;
      opacity: 0.85;
      line-height: 1.4;
    }
    .current {
      margin-top: 18px;
      font-size: 12px;
      opacity: 0.9;
    }
    @media (max-width: 700px) {
      .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Select a mode</h1>
    <p class="sub">Pick one option. We’ll remember it and open the chat.</p>

    <div class="grid">
      <div class="tile" onclick="pick('Mode A')">
        <div class="title">Mode A</div>
        <div class="desc">Example: general assistant behavior (default).</div>
      </div>

      <div class="tile" onclick="pick('Mode B')">
        <div class="title">Mode B</div>
        <div class="desc">Example: more code-focused, concise answers.</div>
      </div>

      <div class="tile" onclick="pick('Mode C')">
        <div class="title">Mode C</div>
        <div class="desc">Example: more detailed explanations / tutoring.</div>
      </div>
    </div>

    <div class="current">${existing ? `Current saved mode: <b>${escapeHtml(existing)}</b>` : ""}</div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function pick(choice) {
      vscode.postMessage({ type: 'pick', choice });
    }
  </script>
</body>
</html>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
