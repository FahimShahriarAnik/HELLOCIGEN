import * as vscode from 'vscode';
import { OpenAI } from 'openai';

export class ChatManager {
  private panel: vscode.WebviewPanel | undefined;
  private openai: OpenAI | undefined;
  private apiKey: string | undefined;

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
      }
    });
  }

  private async handleChatMessage(userMessage: string) {
    if (!this.panel || !this.openai) return;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: userMessage }],
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
    body { font-family: var(--vscode-font-family); margin: 0; padding: 10px; }
    #chat { height: 400px; overflow-y: auto; border: 1px solid var(--vscode-border-color); padding: 10px; margin-bottom: 10px; }
    .message { margin: 5px 0; padding: 8px; border-radius: 4px; }
    .user { background: var(--vscode-editor-selectionBackground); text-align: right; }
    .assistant { background: var(--vscode-button-secondaryBackground); }
    input { width: 80%; padding: 8px; }
    button { padding: 8px 15px; }
  </style>
</head>
<body>
  <h2>AI Chat</h2>
  <div id="chat"></div>
  <input type="text" id="input" placeholder="Type a message..." />
  <button onclick="sendMessage()">Send</button>
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
      }
    });

    document.getElementById('input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  </script>
</body>
</html>`;
  }
}