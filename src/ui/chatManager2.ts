// chatmanager2.ts
import * as vscode from 'vscode';
import { OpenAI } from 'openai';
import { ServerManager } from '../serverManager';

export class ChatManager2 {
  private panel: vscode.WebviewPanel | undefined;
  private openai: OpenAI | undefined;
  private apiKey: string | undefined;
  private fileContexts: { filename: string; content: string }[] = [];
  private chatHistory: Array<{role: 'user' | 'assistant' | 'system'; content: string}> = [];
  private projectDetails: any = null;
  private selectedProject: string | null = null;
  private options: Record<string, boolean> = {};

  constructor(private context: vscode.ExtensionContext, private serverManager: ServerManager) {}

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

    // Fetch project details from Mongo server
    try {
      await this.serverManager.startServer();
      this.projectDetails = await this.serverManager.httpFetch("/project_details");
      vscode.window.showInformationMessage(`Loaded ${Object.keys(this.projectDetails || {}).length} projects.`);
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to load projects: ${err}`);
      this.projectDetails = {};
    }

    this.panel = vscode.window.createWebviewPanel(
      'aiChat2',
      'CIGEN AI Chat - Projects',
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    this.panel.webview.html = this.getWebviewContent();
    
    // Send initial data
    if (this.panel && this.projectDetails) {
      this.panel.webview.postMessage({
        command: 'initProjects',
        projects: this.projectDetails
      });
    }

    this.setupMessageListeners();

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  toggleChat() {
    if (this.panel) {
      this.closeChat();
    } else {
      this.openChat();
    }
  }

  closeChat() {
    if (this.panel) {
      this.panel.dispose();
      this.panel = undefined;
    }
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
      } else if (message.command === 'selectProject') {
        this.selectedProject = message.projectId;
        await this.generateTaskChunks();
      } else if (message.command === 'setOption') {
        this.options[message.key] = !!message.value;
      }
    });
  }

  async sendActiveFile(): Promise<string | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found to send.');
      return;
    }

    const doc = editor.document;
    const name = doc.fileName.split('/').pop() || doc.fileName;
    let content = doc.getText();

    const maxLen = 20000;
    if (content.length > maxLen) {
      content = content.slice(0, maxLen) + '\n\n...[truncated]';
    }

    this.fileContexts.push({ filename: name, content });
    vscode.window.showInformationMessage(`Added ${name} to model context.`);
    return name;
  }

  private async generateTaskChunks() {
    if (!this.selectedProject || !this.panel || !this.openai) return;

    const systemPrompt = `You are CoGEN, a collaborative Generative AI agent for software engineering teams. You are acting as a Project Manager.
    You are tasked with managing the whole Software development life cycle, Including planning, division of labor, overview of project completion, and keeping track of progress as well as each member's contribution.
    Be concise, actionable, and engineer-focused. Analyze projects holistically considering architecture, dependencies, testing, and deployment.`;

    const taskPrompt = `Project selected: ${this.selectedProject}. Full details: ${JSON.stringify(this.projectDetails[this.selectedProject], null, 2)}.

Divide this project into EXACTLY 3 independent, parallel-developable chunks suitable for 3 developers. Each chunk must:
- Be self-contained with minimal cross-dependencies
- Include specific files/modules to own
- Define clear interfaces/APIs for integration
- Cover frontend/backend/testing/deployment aspects balanced
- Estimate effort (low/medium/high) and prerequisites

Output ONLY a JSON array of 3 chunks:
[
  {"chunk": 1, "description": "...", "files": ["..."], "interfaces": ["..."], "effort": "medium", "prereqs": "..."},
  ...
]

Then suggest next steps for team kickoff.`;

    const messages: any[] = [{ role: 'system', content: systemPrompt }];
    
    for (const f of this.fileContexts) {
      messages.push({ role: 'system', content: `Workspace file: ${f.filename}\n${f.content}` });
    }
    
    for (const msg of this.chatHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
    
    messages.push({ role: 'user', content: taskPrompt });

    try {
      this.addToHistory('user', taskPrompt);
      this.panel.webview.postMessage({ command: 'receiveMessage', text: '🔄 Analyzing project and dividing into 3 chunks...', isUser: false });

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages,
        max_tokens: 1500
      });

      const assistantMessage = response.choices[0].message.content || '';
      this.addToHistory('assistant', assistantMessage);
      this.panel.webview.postMessage({
        command: 'receiveMessage',
        text: assistantMessage,
        isUser: false
      });
    } catch (error) {
      const errMsg = `Error dividing project: ${error}`;
      this.addToHistory('assistant', errMsg);
      this.panel.webview.postMessage({ command: 'receiveMessage', text: errMsg, isUser: false });
    }
  }

  private async handleChatMessage(userMessage: string) {
    if (!this.panel || !this.openai) return;

    this.addToHistory('user', userMessage);
    this.panel.webview.postMessage({
      command: 'receiveMessage',
      text: userMessage,
      isUser: true
    });

    const messages: any[] = [{ role: 'system', content: `You are CIGEN assistant. Use workspace files, selected project ${this.selectedProject}, and full chat history. Be concise and actionable for collaborative code generation/refactoring.` }];
    
    for (const f of this.fileContexts) {
      messages.push({ role: 'system', content: `File: ${f.filename}\n${f.content}` });
    }
    
    // Include project details if selected
    if (this.selectedProject && this.projectDetails) {
      messages.push({ 
        role: 'system', 
        content: `Selected project: ${this.selectedProject}\n${JSON.stringify(this.projectDetails[this.selectedProject], null, 2)}` 
      });
    }
    
    for (const msg of this.chatHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages,
        max_tokens: 1000
      });

      const assistantMessage = response.choices[0].message.content || '';
      this.addToHistory('assistant', assistantMessage);
      this.panel.webview.postMessage({
        command: 'receiveMessage',
        text: assistantMessage,
        isUser: false
      });
    } catch (error) {
      const errMsg = `Chat error: ${error}`;
      this.addToHistory('assistant', errMsg);
      this.panel.webview.postMessage({ command: 'receiveMessage', text: errMsg, isUser: false });
    }
  }

  private addToHistory(role: 'user' | 'assistant' | 'system', content: string) {
    this.chatHistory.push({ role, content });
    if (this.chatHistory.length > 40) {
      this.chatHistory.splice(0, 10);
    }
  }

  private getWebviewContent(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: var(--vscode-font-family); margin: 0; padding: 10px; display:flex; flex-direction:column; height:100vh; }
    #projectSelector { padding: 20px; border-bottom:1px solid var(--vscode-border-color); background: var(--vscode-panel-background); }
    #projectSelector label { font-weight: bold; font-size: 14px; }
    #projectSelector select, #projectSelector button { margin-left: 10px; padding: 8px; }
    #controls { display:none; flex; gap:12px; align-items:center; padding:8px 0; border-bottom:1px solid var(--vscode-border-color); }
    #controls label { display:flex; align-items:center; gap:6px; font-size:13px; }
    #chat { flex:1 1 auto; overflow-y: auto; border: 1px solid var(--vscode-border-color); padding: 10px; margin: 10px 0; }
    .message { margin: 5px 0; padding: 8px; border-radius: 4px; word-wrap: break-word; }
    .user { background: var(--vscode-editor-selectionBackground); text-align: right; }
    .assistant { background: var(--vscode-button-secondaryBackground); }
    #composer { display:none; flex; gap:8px; padding-top: 10px; }
    input[type="text"] { flex:1 1 auto; padding:8px; }
    button { padding: 8px 15px; }
  </style>
</head>
<body>
  <div id="projectSelector">
    <label>Select Project:</label>
    <select id="projectSelect">
      <option value="">Loading projects...</option>
    </select>
    <button id="divideBtn" disabled>Divide into 3 Chunks</button>
  </div>
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
    const projectSelect = document.getElementById('projectSelect');
    const divideBtn = document.getElementById('divideBtn');
    const controls = document.getElementById('controls');
    const composer = document.getElementById('composer');
    let projects = {};

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
      const data = e.data;
      if (data.command === 'initProjects') {
        projects = data.projects;
        projectSelect.innerHTML = '<option value="">Select a project</option>';
        Object.keys(projects).forEach(id => {
          const opt = document.createElement('option');
          opt.value = id;
          opt.textContent = (projects[id].name || projects[id].title || id) + ' (' + (projects[id].description?.slice(0,50) || '') + '...)';
          projectSelect.appendChild(opt);
        });
        projectSelect.disabled = false;
        divideBtn.disabled = true;
      } else if (data.command === 'receiveMessage') {
        addMessage(data.text, data.isUser);
        if (document.getElementById('projectSelector')) {
          document.getElementById('projectSelector').style.display = 'none';
        }
        controls.style.display = 'flex';
        composer.style.display = 'flex';
      } else if (data.command === 'fileAdded') {
        addMessage('📁 Added file to context: ' + data.filename, false);
      }
    });

    projectSelect.addEventListener('change', (e) => {
      divideBtn.disabled = !e.target.value;
    });

    divideBtn.addEventListener('click', () => {
      if (projectSelect.value) {
        vscode.postMessage({ command: 'selectProject', projectId: projectSelect.value });
      }
    });

    document.getElementById('input')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
    
    document.getElementById('sendFileBtn')?.addEventListener('click', sendActiveFile);
    
    const chkFile = document.getElementById('optIncludeFile');
    if (chkFile) chkFile.addEventListener('change', (e) => setOption('includeActiveFile', e.target.checked));
    
    const chkTrunc = document.getElementById('optAutoTruncate');
    if (chkTrunc) chkTrunc.addEventListener('change', (e) => setOption('autoTruncate', e.target.checked));
    
    document.getElementById('sendBtn')?.addEventListener('click', sendMessage);
  </script>
</body>
</html>`;
  }
}
