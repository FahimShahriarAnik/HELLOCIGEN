import * as vscode from "vscode";
import * as vsls from "vsls";

export class SessionSetupView {
  private view?: vscode.WebviewView;

  constructor(
    private readonly context: vscode.ExtensionContext,
    // onSessionStart can return an array of projects to render in the webview
    private readonly onSessionStart?: (participantCount: number) => Promise<any[] | undefined>,
    // onProjectSelect is called when a project is selected from the webview
    private readonly onProjectSelect?: (project: any) => Promise<void>
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg?.type === "startSession" && typeof msg.participantCount === "number") {
        try {
          const liveShare = await vsls.getApi();
          if (!liveShare) {
            vscode.window.showErrorMessage("Live Share API not available.");
            return;
          }

          // Start or attach to Live Share session
          await liveShare.share();

          // Call the callback if provided and expect projects back
          let projects: any[] | undefined;
          if (this.onSessionStart) {
            projects = await this.onSessionStart(msg.participantCount);
          }

          vscode.window.showInformationMessage(
            `Live Share session started with ${msg.participantCount} expected participants!`
          );

          // Send projects (if any) to the webview to render clickable cards
          if (projects && this.view) {
            this.view.webview.postMessage({ type: "projects", projects });
          }
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to start session: ${error}`);
          // Re-enable controls on error
          if (this.view) {
            this.view.webview.postMessage({ type: "enableControls" });
          }
        }
      }

      // Handle selection from the webview
      if (msg?.type === "projectSelected" && msg.project) {
        const project = msg.project;
        vscode.window.showInformationMessage(`Selected project: ${project.title || project.project_id}`);
        // Call the callback if provided
        if (this.onProjectSelect) {
          await this.onProjectSelect(project);
        }
        // Confirm selection back to webview to disable cards
        if (this.view) {
          this.view.webview.postMessage({ type: "projectSelectedConfirm" });
        }
      }
    });

    this.renderSetupView();
  }

  private renderSetupView(): void {
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
      max-width: 680px;
      margin: 0 auto;
    }
    h2 {
      margin: 0 0 8px 0;
      font-size: 18px;
      font-weight: 700;
    }
    .subtitle {
      margin: 0 0 16px 0;
      opacity: 0.85;
      font-size: 13px;
    }
    .form-group {
      margin-bottom: 12px;
    }
    label { display:block; margin-bottom:6px; font-size:13px; font-weight:600; }
    input[type="number"] { width:120px; padding:8px; border-radius:6px; border:1px solid var(--vscode-border-color); }
    #controls { display:flex; gap:12px; align-items:center; margin-bottom:16px; }
    button { padding:8px 12px; border-radius:6px; border:none; background:var(--vscode-button-background); color:var(--vscode-button-foreground); cursor:pointer; font-weight:600; }
    #projects { display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:12px; margin-top:8px; }
    .card { padding:12px; border-radius:8px; background:var(--vscode-editorWidget-background); border:1px solid var(--vscode-border-color); cursor:pointer; transition:transform .08s, box-shadow .08s; }
    .card:hover { transform: translateY(-3px); box-shadow: 0 6px 20px rgba(0,0,0,0.08); }
    .card h3 { margin:0 0 6px 0; font-size:14px; }
    .card p { margin:0; font-size:12px; opacity:0.9; }
    .empty { margin-top:12px; font-size:13px; opacity:0.8; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Start Live Share Session</h2>
    <p class="subtitle">Start a session and choose a project to log activity.</p>

    <div id="controls">
      <div class="form-group">
        <label for="participantCount">Participants</label>
        <input id="participantCount" type="number" min="1" max="100" value="2" />
      </div>
      <div>
        <button id="startBtn">Start Session</button>
      </div>
    </div>

    <div id="projects" aria-live="polite"></div>
    <div id="empty" class="empty">No projects loaded. Start session to fetch projects from the server.</div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const startBtn = document.getElementById('startBtn');
    const projectsNode = document.getElementById('projects');
    const emptyNode = document.getElementById('empty');
    let selectedProjectId = null;

    function renderProjects(projects) {
      projectsNode.innerHTML = '';
      if (!projects || projects.length === 0) {
        emptyNode.textContent = 'No projects found in the database.';
        return;
      }
      emptyNode.textContent = '';
      projects.forEach((p) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.projectId = p.project_id || p.title;
        const title = document.createElement('h3');
        title.textContent = p.title || p.project_id || 'Untitled Project';
        const desc = document.createElement('p');
        desc.textContent = p.description || '';
        card.appendChild(title);
        card.appendChild(desc);
        card.addEventListener('click', () => {
          if (selectedProjectId) return; // Prevent multiple selections
          selectedProjectId = p.project_id || p.title;
          // Notify extension host that a project was selected
          vscode.postMessage({ type: 'projectSelected', project: p });
          // Disable all cards immediately
          document.querySelectorAll('.card').forEach(c => {
            c.style.opacity = '0.5';
            c.style.cursor = 'not-allowed';
            c.style.pointerEvents = 'none';
          });
          // Highlight selected card
          card.style.opacity = '1';
          card.style.borderColor = 'var(--vscode-focusBorder)';
          card.style.borderWidth = '2px';
        });
        projectsNode.appendChild(card);
      });
    }

    startBtn.addEventListener('click', () => {
      const input = document.getElementById('participantCount');
      const count = parseInt(input.value, 10);
      if (isNaN(count) || count < 1) {
        alert('Please enter a valid participant count');
        return;
      }
      // Disable both input and button when starting session
      startBtn.disabled = true;
      input.disabled = true;
      startBtn.textContent = 'Starting...';
      // Ask extension host to start session and return projects
      vscode.postMessage({ type: 'startSession', participantCount: count });
    });

    // Receive messages from extension host
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg?.type === 'projects') {
        renderProjects(msg.projects || []);
      }
      if (msg?.type === 'enableControls') {
        // Re-enable controls on error
        startBtn.disabled = false;
        startBtn.textContent = 'Start Session';
        document.getElementById('participantCount').disabled = false;
      }
      if (msg?.type === 'projectSelectedConfirm') {
        // Project selection confirmed, cards already disabled
        emptyNode.textContent = 'Project selected! Chat is now open.';
        emptyNode.style.color = 'var(--vscode-textLink-foreground)';
      }
    });

    // Enter key support
    document.getElementById('participantCount').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') startBtn.click();
    });
  </script>
</body>
</html>`;
  }
}
