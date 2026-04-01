import * as vscode from 'vscode';

const CHAT_SERVER_URL = 'http://localhost:4000';
const POLL_INTERVAL_MS = 3000;

export class DevChatPanel {
  private static panel: vscode.WebviewPanel | undefined;
  private static pollTimer: ReturnType<typeof setInterval> | undefined;
  private static lastIndex = 0;
  private static sessionId = '';
  private static participantName = '';
  private static sending = false;

  static openOrReveal(sessionId: string, participantName: string, projectTitle: string): void {
    this.sessionId = sessionId;
    this.participantName = participantName;

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'devChat',
      `CoGEN Chat — ${projectTitle}`,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel.webview.html = this.getHtml(projectTitle, participantName);
    this.panel.onDidDispose(() => {
      this.stopPolling();
      this.panel = undefined;
    });

    this.panel.webview.onDidReceiveMessage(async msg => {
      if (msg.type === 'send' && msg.text?.trim()) {
        await this.sendMessage(msg.text.trim());
      }
    });

    // Load existing messages and start polling
    this.lastIndex = 0;
    this.loadMessages();
    this.startPolling();
  }

  private static async sendMessage(text: string): Promise<void> {
    this.sending = true;
    try {
      const resp = await fetch(`${CHAT_SERVER_URL}/sessions/${this.sessionId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'user',
          content: text,
          participant_name: this.participantName
        })
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const data = await resp.json() as any;
      if (data.messages?.length > 0) {
        this.panel?.webview.postMessage({ type: 'newMessages', messages: data.messages });
        this.lastIndex = data.total ?? (this.lastIndex + data.messages.length);
      }
    } catch (err) {
      this.panel?.webview.postMessage({ type: 'error', text: String(err) });
    } finally {
      this.sending = false;
    }
  }

  private static async loadMessages(): Promise<void> {
    try {
      const resp = await fetch(`${CHAT_SERVER_URL}/sessions/${this.sessionId}/chat?after=0`);
      if (!resp.ok) return;

      const data = await resp.json() as any;
      if (data.messages?.length > 0) {
        this.panel?.webview.postMessage({ type: 'newMessages', messages: data.messages });
        this.lastIndex = data.total ?? data.messages.length;
      }
    } catch {
      // Server not ready yet
    }
  }

  private static startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(async () => {
      if (this.sending) return;
      try {
        const resp = await fetch(`${CHAT_SERVER_URL}/sessions/${this.sessionId}/chat?after=${this.lastIndex}`);
        if (!resp.ok) return;

        const data = await resp.json() as any;
        if (data.messages?.length > 0) {
          this.panel?.webview.postMessage({ type: 'newMessages', messages: data.messages });
          this.lastIndex += data.messages.length;
        }
      } catch {
        // Server may not be reachable; keep polling
      }
    }, POLL_INTERVAL_MS);
  }

  private static stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private static getHtml(projectTitle: string, participantName: string): string {
    const escapedTitle = projectTitle.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escapedName = participantName.replace(/'/g, "\\'").replace(/\\/g, '\\\\');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    .header {
      padding: 10px 14px;
      font-weight: 600;
      font-size: 13px;
      border-bottom: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
      opacity: 0.85;
    }
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .msg {
      max-width: 85%;
      padding: 8px 12px;
      border-radius: 10px;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .msg .sender {
      font-size: 10px;
      font-weight: 700;
      opacity: 0.7;
      margin-bottom: 3px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .msg.user {
      align-self: flex-end;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .msg.user .sender {
      text-align: right;
      opacity: 0.8;
    }
    .msg.assistant {
      align-self: flex-start;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-panel-border);
    }
    .msg.error {
      align-self: center;
      color: var(--vscode-errorForeground);
      font-size: 11px;
      background: none;
      opacity: 0.8;
    }
    .input-row {
      display: flex;
      gap: 8px;
      padding: 10px 14px;
      border-top: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
    }
    textarea {
      flex: 1;
      resize: none;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 6px;
      padding: 8px 10px;
      font-family: var(--vscode-font-family);
      font-size: 12px;
      line-height: 1.4;
      min-height: 36px;
      max-height: 120px;
      outline: none;
    }
    textarea:focus { border-color: var(--vscode-focusBorder); }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 6px;
      padding: 0 16px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      flex-shrink: 0;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button:disabled { opacity: 0.4; cursor: default; }
  </style>
</head>
<body>
  <div class="header">CoGEN Chat &middot; ${escapedTitle}</div>
  <div class="messages" id="msgs"></div>
  <div class="input-row">
    <textarea id="input" placeholder="Type a message... Use @AI to ask the AI" rows="1"></textarea>
    <button id="sendBtn">Send</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const msgs = document.getElementById('msgs');
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('sendBtn');
    const myName = '${escapedName}';

    function addMsg(msg) {
      const el = document.createElement('div');
      el.className = 'msg ' + msg.role;

      const senderDiv = document.createElement('div');
      senderDiv.className = 'sender';
      senderDiv.textContent = msg.role === 'assistant' ? 'CoGEN' : (msg.participant_name || 'Unknown');

      const contentDiv = document.createElement('div');
      contentDiv.textContent = msg.content;

      el.appendChild(senderDiv);
      el.appendChild(contentDiv);
      msgs.appendChild(el);
      msgs.scrollTop = msgs.scrollHeight;
    }

    function send() {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      input.style.height = 'auto';
      sendBtn.disabled = true;
      vscode.postMessage({ type: 'send', text });
    }

    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    window.addEventListener('message', e => {
      const d = e.data;
      if (d.type === 'newMessages' && d.messages) {
        d.messages.forEach(m => addMsg(m));
        sendBtn.disabled = false;
      }
      if (d.type === 'error') {
        const el = document.createElement('div');
        el.className = 'msg error';
        el.textContent = 'Error: ' + d.text;
        msgs.appendChild(el);
        sendBtn.disabled = false;
      }
    });
  </script>
</body>
</html>`;
  }
}
