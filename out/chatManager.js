"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatManager = void 0;
const vscode = __importStar(require("vscode"));
const openai_1 = require("openai");
class ChatManager {
    context;
    panel;
    openai;
    apiKey;
    constructor(context) {
        this.context = context;
    }
    async openChat() {
        const apiKey = await this.getApiKey();
        if (!apiKey) {
            vscode.window.showErrorMessage('OpenAI API key not set. Please run "Set OpenAI API Key" command first.');
            return;
        }
        this.openai = new openai_1.OpenAI({ apiKey });
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
            return;
        }
        this.panel = vscode.window.createWebviewPanel('aiChat', 'AI Chat', vscode.ViewColumn.Beside, { enableScripts: true });
        this.panel.webview.html = this.getWebviewContent();
        this.setupMessageListeners();
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
    }
    async getApiKey() {
        const stored = await this.context.secrets.get('openai-api-key');
        if (!stored) {
            const input = await vscode.window.showInputBox({
                prompt: 'Enter your OpenAI API key',
                password: true,
                ignoreFocusOut: true
            });
            if (input) {
                await this.context.secrets.store('openai-api-key', input);
                this.apiKey = input;
            }
            return input;
        }
        this.apiKey = stored;
        return stored;
    }
    setupMessageListeners() {
        if (!this.panel)
            return;
        this.panel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'sendMessage') {
                await this.handleChatMessage(message.text);
            }
        });
    }
    async handleChatMessage(userMessage) {
        if (!this.panel || !this.openai)
            return;
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
        }
        catch (error) {
            vscode.window.showErrorMessage(`Chat error: ${error}`);
        }
    }
    getWebviewContent() {
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
exports.ChatManager = ChatManager;
//# sourceMappingURL=chatManager.js.map