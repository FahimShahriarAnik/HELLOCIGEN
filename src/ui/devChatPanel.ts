import * as vscode from 'vscode';
import { OpenAI } from 'openai';
import { Project } from '../models/projectConfig';

export class DevChatPanel {
  private static panel: vscode.WebviewPanel | undefined;
  private static openai: OpenAI | undefined;
  private static history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  private static systemPrompt = '';

  static openOrReveal(project: Project, divisions: any[], apiKey: string): void {
    this.openai = new OpenAI({ apiKey });
    this.history = [];

    const divisionSummary = divisions.map((d, i) =>
      `Teammate ${i + 1} (${d.owner_id}): ${d.title}\n` +
      d.tasks.map((t: any) => `  - ${t.title}`).join('\n')
    ).join('\n\n');

    this.systemPrompt =
      `You are CoGEN, an AI project manager assistant for a collaborative coding session.\n` +
      `Project: ${project.title}\n` +
      `Description: ${project.description}\n\n` +
      `Task breakdown:\n${divisionSummary}\n\n` +
      `Help teammates with questions about their tasks, code, or the project. Be concise.`;

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'devChat',
      `CoGEN — ${project.title}`,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel.webview.html = this.getHtml(project.title);
    this.panel.onDidDispose(() => { this.panel = undefined; });

    this.panel.webview.onDidReceiveMessage(async msg => {
      if (msg.type === 'send' && msg.text?.trim()) {
        await this.handleMessage(msg.text.trim());
      }
    });
  }

  private static async handleMessage(userText: string): Promise<void> {
    if (!this.openai || !this.panel) return;

    this.history.push({ role: 'user', content: userText });
    this.panel.webview.postMessage({ type: 'userMsg', text: userText });
    this.panel.webview.postMessage({ type: 'thinking' });

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: this.systemPrompt },
          ...this.history
        ]
      });

      const reply = response.choices[0].message.content ?? '';
      this.history.push({ role: 'assistant', content: reply });
      this.panel.webview.postMessage({ type: 'assistantMsg', text: reply });
    } catch (err) {
      this.panel.webview.postMessage({ type: 'error', text: String(err) });
    }
  }

  private static getHtml(projectTitle: string): string {
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
      max-width: 88%;
      padding: 8px 11px;
      border-radius: 8px;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .msg.user {
      align-self: flex-end;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .msg.assistant {
      align-self: flex-start;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-panel-border);
    }
    .msg.thinking {
      align-self: flex-start;
      opacity: 0.5;
      font-style: italic;
      font-size: 11px;
      background: none;
      padding: 2px 4px;
    }
    .msg.error {
      align-self: flex-start;
      color: var(--vscode-errorForeground);
      font-size: 11px;
      background: none;
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
      border-radius: 4px;
      padding: 6px 8px;
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
      border-radius: 4px;
      padding: 0 14px;
      cursor: pointer;
      font-size: 12px;
      flex-shrink: 0;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button:disabled { opacity: 0.4; cursor: default; }
  </style>
</head>
<body>
  <div class="header">CoGEN · ${projectTitle}</div>
  <div class="messages" id="msgs"></div>
  <div class="input-row">
    <textarea id="input" placeholder="Ask about tasks, code, or the project…" rows="1"></textarea>
    <button id="sendBtn">Send</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const msgs = document.getElementById('msgs');
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('sendBtn');
    let thinkingEl = null;

    function addMsg(text, cls) {
      const el = document.createElement('div');
      el.className = 'msg ' + cls;
      el.textContent = text;
      msgs.appendChild(el);
      msgs.scrollTop = msgs.scrollHeight;
      return el;
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
      if (d.type === 'userMsg') {
        // already shown via optimistic send, skip duplicate
      }
      if (d.type === 'thinking') {
        thinkingEl = addMsg('CoGEN is thinking…', 'thinking');
      }
      if (d.type === 'assistantMsg') {
        if (thinkingEl) { thinkingEl.remove(); thinkingEl = null; }
        addMsg(d.text, 'assistant');
        sendBtn.disabled = false;
        input.focus();
      }
      if (d.type === 'error') {
        if (thinkingEl) { thinkingEl.remove(); thinkingEl = null; }
        addMsg('Error: ' + d.text, 'error');
        sendBtn.disabled = false;
      }
    });
  </script>
</body>
</html>`;
  }
}
