import * as vscode from 'vscode';
import { OpenAI } from 'openai';

export class ChatManager {
  private panel: vscode.WebviewPanel | undefined;
  private openai: OpenAI | undefined;
  private apiKey: string | undefined;
  private fileContexts: { filename: string; content: string }[] = [];
  private options: Record<string, boolean> = {};

  constructor(private context: vscode.ExtensionContext) {}

  async openChat() {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      vscode.window.showErrorMessage('OpenAI API key not set. Please run "HELLOCIGEN: Set OpenAI API Key" command first.');
      return;
    }

    this.openai = new OpenAI({ apiKey });

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'aiChat',
      'AI Chat',
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    this.panel.webview.html = this.getWebviewContent();
    this.setupMessageListeners();

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  private async getApiKey(): Promise<string | undefined> {
    const stored = await this.context.secrets.get('openai-api-key');
    if (stored) {
      this.apiKey = stored;
      return stored;
    }
    return undefined;
  }

  private setupMessageListeners() {
    if (!this.panel) return;

    this.panel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === 'sendMessage') {
        await this.handleChatMessage(message.text);
      } else if (message.command === 'sendActiveFile') {
        await this.sendActiveFile();
        const last = this.fileContexts[this.fileContexts.length - 1];
        if (last && this.panel) {
          this.panel.webview.postMessage({ command: 'fileAdded', filename: last.filename });
        }
      } else if (message.command === 'setOption') {
        this.options[message.key] = !!message.value;
        // optional: show a quick hint
        // vscode.window.showInformationMessage(`Option ${message.key} set to ${message.value}`);
      }
    });
  }

  // Add the currently active editor's content to the model context
  async sendActiveFile(): Promise<string | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found to send.');
      return;
    }

    const doc = editor.document;
    const name = doc.fileName.split('/').pop() || doc.fileName;
    let content = doc.getText();

    // Truncate very large files to avoid hitting token limits
    const maxLen = 20000;
    if (content.length > maxLen) {
      content = content.slice(0, maxLen) + '\n\n...[truncated]';
    }

    this.fileContexts.push({ filename: name, content });
    vscode.window.showInformationMessage(`Added ${name} to model context.`);
    return name;
  }

  private async handleChatMessage(userMessage: string) {
    if (!this.panel || !this.openai) return;

    try {
      // If configured, include active file automatically
      if (this.options.includeActiveFile && this.fileContexts.length === 0) {
        await this.sendActiveFile();
      }
      const messages: any[] = [];
      // Inject file contexts as system messages so the model can reference them
      for (const f of this.fileContexts) {
        messages.push({ role: 'system', content: `File: ${f.filename}\n${f.content}` });
      }

      messages.push({ role: 'user', content: userMessage });

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages,
        max_tokens: 1000
      });

      const assistantMessage = response.choices[0].message.content || '';
      this.panel.webview.postMessage({
        command: 'receiveMessage',
        text: assistantMessage,
        isUser: false
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Chat error: ${error}`);
    }
  }

  private getWebviewContent(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: var(--vscode-font-family); margin: 0; padding: 10px; display:flex; flex-direction:column; height:100vh; }
    #controls { display:flex; gap:12px; align-items:center; padding:8px 0; border-bottom:1px solid var(--vscode-border-color); }
    #controls label { display:flex; align-items:center; gap:6px; font-size:13px; }
    #chat { flex:1 1 auto; overflow-y: auto; border: 1px solid var(--vscode-border-color); padding: 10px; margin: 10px 0; }
    .message { margin: 5px 0; padding: 8px; border-radius: 4px; }
    .user { background: var(--vscode-editor-selectionBackground); text-align: right; }
    .assistant { background: var(--vscode-button-secondaryBackground); }
    #composer { display:flex; gap:8px; }
    input[type="text"] { flex:1 1 auto; padding:8px; }
    button { padding: 8px 15px; }
  </style>
</head>
<body>
  <div id="controls">
    <label><input type="checkbox" id="optIncludeFile" /> Include active file</label>
    <label><input type="checkbox" id="optAutoTruncate" /> Auto-truncate large files</label>
    <button id="sendFileBtn">Send Active File</button>
  </div>
  <div id="chat"></div>
  <div id="composer">
    <input type="text" id="input" placeholder="Type a message..." />
    <button id="sendBtn">Send</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const chatDiv = document.getElementById('chat');

    function sendMessage() {
      const input = document.getElementById('input');
      const text = input.value.trim();
      if (!text) return;

      addMessage(text, true);
      vscode.postMessage({ command: 'sendMessage', text });
      input.value = '';
    }

    function sendActiveFile() {
      vscode.postMessage({ command: 'sendActiveFile' });
    }

    function setOption(key, value) {
      vscode.postMessage({ command: 'setOption', key, value });
    }

    function addMessage(text, isUser) {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'message ' + (isUser ? 'user' : 'assistant');
      msgDiv.textContent = text;
      chatDiv.appendChild(msgDiv);
      chatDiv.scrollTop = chatDiv.scrollHeight;
    }

    window.addEventListener('message', (e) => {
      if (e.data.command === 'receiveMessage') {
        addMessage(e.data.text, false);
      } else if (e.data.command === 'fileAdded') {
        addMessage('Added file to context: ' + e.data.filename, false);
      }
    });

    document.getElementById('input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
    const btn = document.getElementById('sendFileBtn');
    if (btn) btn.addEventListener('click', sendActiveFile);

    const chkFile = document.getElementById('optIncludeFile');
    if (chkFile) chkFile.addEventListener('change', (e) => setOption('includeActiveFile', e.target.checked));
    const chkTrunc = document.getElementById('optAutoTruncate');
    if (chkTrunc) chkTrunc.addEventListener('change', (e) => setOption('autoTruncate', e.target.checked));

    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
  </script>
</body>
</html>`;
  }
}