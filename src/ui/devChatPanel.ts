import * as vscode from 'vscode';
import * as http from 'http';

const CHAT_SERVER_URL = 'http://localhost:4000';
const FALLBACK_POLL_INTERVAL_MS = 10000;

export class DevChatPanel {
  private static panel: vscode.WebviewPanel | undefined;
  private static pollTimer: ReturnType<typeof setInterval> | undefined;
  private static sseRequest: http.ClientRequest | undefined;
  private static sessionId = '';
  private static participantName = '';
  private static lastSeenId = '0';
  private static seenIds = new Set<string>();

  static dispose(): void {
    this.stopPolling();
    if (this.panel) {
      this.panel.dispose();
      this.panel = undefined;
    }
  }

  static openOrReveal(sessionId: string, participantName: string, projectTitle: string): void {
    this.sessionId = sessionId;
    this.participantName = participantName;

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    this.lastSeenId = '0';
    this.seenIds.clear();

    this.panel = vscode.window.createWebviewPanel(
      'devChat',
      `CoGEN Chat — ${projectTitle}`,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel.webview.html = this.getHtml(projectTitle, participantName);
    this.panel.onDidDispose(() => {
      this.stopPolling();
      this.disconnectSSE();
      this.panel = undefined;
    });

    this.panel.webview.onDidReceiveMessage(async msg => {
      if (msg.type === 'send' && msg.text?.trim()) {
        await this.sendMessage(msg.text.trim(), msg.recipient || 'broadcast');
      }
    });

    this.loadMessages().then(() => {
      this.connectSSE();
      this.startFallbackPoll();
      this.fetchParticipants();
    });
  }

  // ─── Send ────────────────────────────────────────────────────────────────────

  private static async sendMessage(text: string, recipient: string): Promise<void> {
    const isAiRequest = recipient === 'ai' || /@ai\b/i.test(text);
    try {
      const resp = await fetch(`${CHAT_SERVER_URL}/sessions/${this.sessionId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'user',
          content: text,
          participant_name: this.participantName,
          recipient
        })
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      if (isAiRequest) {
        this.panel?.webview.postMessage({ type: 'showThinking' });
      }
      this.panel?.webview.postMessage({ type: 'enableSend' });
    } catch (err) {
      this.panel?.webview.postMessage({ type: 'error', text: String(err) });
      this.panel?.webview.postMessage({ type: 'enableSend' });
    }
  }

  // ─── Participants ─────────────────────────────────────────────────────────────

  private static async fetchParticipants(): Promise<void> {
    try {
      const resp = await fetch(`${CHAT_SERVER_URL}/sessions/${this.sessionId}/state`);
      if (!resp.ok) return;
      const state = await resp.json() as any;
      const names: string[] = (state.participants || [])
        .map((p: any) => p.name as string)
        .filter((n: string) => n && n !== this.participantName);
      this.panel?.webview.postMessage({ type: 'setParticipants', participants: names });
    } catch { /* server not ready */ }
  }

  // ─── History load ────────────────────────────────────────────────────────────

  private static async loadMessages(): Promise<void> {
    try {
      const viewer = encodeURIComponent(this.participantName);
      const resp = await fetch(`${CHAT_SERVER_URL}/sessions/${this.sessionId}/chat?after=0&participant=${viewer}`);
      if (!resp.ok) return;
      const data = await resp.json() as any;
      this.deliverMessages(data.messages ?? []);
      if (data.nextCursor && data.nextCursor !== '0') this.lastSeenId = data.nextCursor;
    } catch { /* server not ready yet */ }
  }

  // ─── SSE connection ──────────────────────────────────────────────────────────

  private static connectSSE(): void {
    this.disconnectSSE();

    const viewer = encodeURIComponent(this.participantName);
    const path = `/sessions/${this.sessionId}/chat/stream?participant=${viewer}`;
    let buffer = '';

    const req = http.get(
      { hostname: 'localhost', port: 4000, path, headers: { Accept: 'text/event-stream' } },
      (res) => {
        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';
          for (const frame of frames) {
            for (const line of frame.split('\n')) {
              if (line.startsWith('data: ')) {
                try {
                  const messages = JSON.parse(line.slice(6));
                  this.deliverMessages(messages);
                } catch { /* malformed frame */ }
              }
            }
          }
        });

        res.on('end', () => {
          if (this.panel) setTimeout(() => this.connectSSE(), 3000);
        });
        res.on('error', () => {
          if (this.panel) setTimeout(() => this.connectSSE(), 3000);
        });
      }
    );

    req.on('error', () => {
      if (this.panel) setTimeout(() => this.connectSSE(), 3000);
    });

    this.sseRequest = req;
  }

  private static disconnectSSE(): void {
    if (this.sseRequest) {
      this.sseRequest.destroy();
      this.sseRequest = undefined;
    }
  }

  // ─── Fallback poll ───────────────────────────────────────────────────────────

  private static startFallbackPoll(): void {
    this.stopPolling();
    this.pollTimer = setInterval(async () => {
      try {
        const viewer = encodeURIComponent(this.participantName);
        const resp = await fetch(
          `${CHAT_SERVER_URL}/sessions/${this.sessionId}/chat?after=${this.lastSeenId}&participant=${viewer}`
        );
        if (!resp.ok) return;
        const data = await resp.json() as any;
        this.deliverMessages(data.messages ?? []);
        if (data.nextCursor && data.nextCursor !== '0') this.lastSeenId = data.nextCursor;
      } catch { /* server unreachable */ }
    }, FALLBACK_POLL_INTERVAL_MS);
  }

  private static stopPolling(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = undefined; }
  }

  // ─── Dedup + deliver ─────────────────────────────────────────────────────────

  private static deliverMessages(messages: any[]): void {
    const fresh = messages.filter(m => {
      const id = m._id?.toString?.() ?? String(m._id);
      if (!id || id === 'undefined' || this.seenIds.has(id)) return false;
      this.seenIds.add(id);
      return true;
    });
    if (fresh.length === 0) return;

    const lastId = fresh[fresh.length - 1]._id?.toString?.();
    if (lastId && lastId !== 'undefined') this.lastSeenId = lastId;

    this.panel?.webview.postMessage({ type: 'newMessages', messages: fresh });

    // Only hide thinking if the AI response is actually directed at this viewer
    if (fresh.some((m: any) =>
      m.role === 'assistant' &&
      (!m.recipient || m.recipient === 'broadcast' || m.recipient === this.participantName)
    )) {
      this.panel?.webview.postMessage({ type: 'hideThinking' });
    }
  }

  // ─── HTML ─────────────────────────────────────────────────────────────────────

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
      gap: 8px;
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
      opacity: 0.65;
      margin-bottom: 3px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    /* Own broadcast */
    .msg.mine {
      align-self: flex-end;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .msg.mine .sender { text-align: right; }
    /* Others' broadcast */
    .msg.theirs {
      align-self: flex-start;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-panel-border);
    }
    /* AI response (broadcast or private) */
    .msg.assistant {
      align-self: flex-start;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-panel-border);
      border-left: 3px solid var(--vscode-focusBorder, #007acc);
    }
    /* DM sent */
    .msg.dm-sent {
      align-self: flex-end;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-panel-border);
      border-right: 3px solid var(--vscode-charts-yellow, #e5c07b);
    }
    .msg.dm-sent .sender { text-align: right; }
    /* DM received */
    .msg.dm-received {
      align-self: flex-start;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-panel-border);
      border-left: 3px solid var(--vscode-charts-yellow, #e5c07b);
    }
    .msg.error {
      align-self: center;
      color: var(--vscode-errorForeground);
      font-size: 11px;
      background: none;
      opacity: 0.8;
    }
    .thinking {
      align-self: flex-start;
      font-size: 11px;
      opacity: 0.5;
      font-style: italic;
      display: none;
      padding: 4px 8px;
    }
    .input-area {
      border-top: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
    }
    .recipient-row {
      padding: 6px 14px 2px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .recipient-label {
      font-size: 10px;
      opacity: 0.55;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      flex-shrink: 0;
    }
    select {
      background: var(--vscode-dropdown-background, var(--vscode-input-background));
      color: var(--vscode-dropdown-foreground, var(--vscode-foreground));
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border));
      border-radius: 4px;
      padding: 3px 6px;
      font-size: 11px;
      font-family: var(--vscode-font-family);
      cursor: pointer;
      outline: none;
    }
    select:focus { border-color: var(--vscode-focusBorder); }
    .input-row {
      display: flex;
      gap: 8px;
      padding: 6px 14px 10px;
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
  <div class="messages" id="msgs">
    <div class="thinking" id="thinking">CoGEN is thinking...</div>
  </div>
  <div class="input-area">
    <div class="recipient-row">
      <span class="recipient-label">To</span>
      <select id="recipientSelect">
        <option value="broadcast">Team</option>
        <option value="ai">AI · Private</option>
      </select>
    </div>
    <div class="input-row">
      <textarea id="input" placeholder="Message the team… @AI to ask CoGEN" rows="1"></textarea>
      <button id="sendBtn">Send</button>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const msgsEl = document.getElementById('msgs');
    const thinkingEl = document.getElementById('thinking');
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('sendBtn');
    const recipientSelect = document.getElementById('recipientSelect');
    const myName = '${escapedName}';

    function addMsg(msg) {
      msgsEl.removeChild(thinkingEl);

      const rec = msg.recipient || 'broadcast';
      let cssClass, senderText;

      if (msg.role === 'assistant') {
        cssClass = 'assistant';
        const tag = rec !== 'broadcast' ? ' · private' : '';
        senderText = 'CoGEN' + tag;
      } else if (rec === 'broadcast') {
        cssClass = msg.participant_name === myName ? 'mine' : 'theirs';
        senderText = msg.participant_name === myName ? 'You' : (msg.participant_name || 'Unknown');
      } else if (rec === 'ai') {
        cssClass = 'dm-sent';
        senderText = 'You · private AI';
      } else if (msg.participant_name === myName) {
        cssClass = 'dm-sent';
        senderText = 'You → ' + rec;
      } else {
        cssClass = 'dm-received';
        senderText = msg.participant_name + ' → you';
      }

      const el = document.createElement('div');
      el.className = 'msg ' + cssClass;

      const senderDiv = document.createElement('div');
      senderDiv.className = 'sender';
      senderDiv.textContent = senderText;

      const contentDiv = document.createElement('div');
      contentDiv.textContent = msg.content;

      el.appendChild(senderDiv);
      el.appendChild(contentDiv);
      msgsEl.appendChild(el);
      msgsEl.appendChild(thinkingEl);
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    function updatePlaceholder() {
      const rec = recipientSelect.value;
      if (rec === 'broadcast') {
        input.placeholder = 'Message the team… @AI to ask CoGEN';
      } else if (rec === 'ai') {
        input.placeholder = 'Ask CoGEN privately…';
      } else {
        input.placeholder = 'Direct message to ' + rec + '…';
      }
    }

    recipientSelect.addEventListener('change', updatePlaceholder);

    function send() {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      input.style.height = 'auto';
      sendBtn.disabled = true;
      vscode.postMessage({ type: 'send', text, recipient: recipientSelect.value });
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
      }
      if (d.type === 'setParticipants' && d.participants) {
        // Remove any existing DM options (keep Team + AI · Private)
        while (recipientSelect.options.length > 2) recipientSelect.remove(2);
        d.participants.forEach(name => {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          recipientSelect.appendChild(opt);
        });
      }
      if (d.type === 'enableSend') {
        sendBtn.disabled = false;
      }
      if (d.type === 'showThinking') {
        thinkingEl.style.display = 'block';
        msgsEl.scrollTop = msgsEl.scrollHeight;
      }
      if (d.type === 'hideThinking') {
        thinkingEl.style.display = 'none';
      }
      if (d.type === 'error') {
        const el = document.createElement('div');
        el.className = 'msg error';
        el.textContent = 'Error: ' + d.text;
        msgsEl.insertBefore(el, thinkingEl);
        msgsEl.scrollTop = msgsEl.scrollHeight;
      }
    });
  </script>
</body>
</html>`;
  }
}
