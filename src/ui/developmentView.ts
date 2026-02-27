import * as vscode from 'vscode';
import { Project } from '../models/projectConfig';
import { ServerManager } from '../serverManager';
import { patchSessionLog } from '../utils/session_log_utils';
import { generateDivisionOfWork, AiDivision } from '../utils/aiUtils';

export class DevelopmentView {
  private static panel: vscode.WebviewPanel | undefined;

  static createOrShow(
    sessionId: string,
    selectedProject: Project,
    participantCount: number,
    serverMgr: ServerManager,
    context: vscode.ExtensionContext
  ): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'developmentView',
      `Session — ${selectedProject.title}`,
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    this.panel.webview.html = this.getHtml(selectedProject.title);

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    // Kick off AI division immediately
    this.runAiDivision(sessionId, selectedProject, participantCount, serverMgr, context);
  }

  private static async runAiDivision(
    sessionId: string,
    project: Project,
    participantCount: number,
    serverMgr: ServerManager,
    context: vscode.ExtensionContext
  ): Promise<void> {
    this.panel?.webview.postMessage({ type: 'aiProcessing' });

    const apiKey = await context.secrets.get('openai-api-key');
    if (!apiKey) {
      vscode.window.showWarningMessage('No OpenAI API key set — division of work skipped.');
      this.panel?.webview.postMessage({ type: 'aiDone', skipped: true });
      return;
    }

    try {
      const rawDivisions = await generateDivisionOfWork(project, participantCount, apiKey);

      const participantIds = Array.from({ length: participantCount }, (_, i) => `u${i + 1}`);
      const divisions = rawDivisions.map((d: AiDivision, i: number) => ({
        ...d,
        owner_id: participantIds[i] ?? `u${i + 1}`
      }));

      await patchSessionLog(sessionId, { division_of_work: divisions }, serverMgr);
      this.panel?.webview.postMessage({ type: 'aiDone', divisions });
      vscode.window.showInformationMessage('AI task division generated and saved.');
    } catch (err) {
      vscode.window.showWarningMessage(`AI division failed: ${err}`);
      this.panel?.webview.postMessage({ type: 'aiError', message: String(err) });
    }
  }

  private static getHtml(projectTitle: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      padding: 28px 32px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      margin: 0;
    }
    h2 { margin: 0 0 6px; font-size: 20px; font-weight: 700; }
    #statusMsg { margin-top: 16px; font-size: 13px; opacity: 0.8; }
    .division { margin-top: 20px; padding: 14px; border: 1px solid var(--vscode-panel-border); border-radius: 8px; }
    .division h3 { margin: 0 0 8px; font-size: 14px; font-weight: 700; }
    .division ul { margin: 0; padding-left: 18px; }
    .division li { font-size: 12px; margin: 4px 0; }
  </style>
</head>
<body>
  <h2>${projectTitle}</h2>
  <div id="statusMsg">Generating AI task divisions...</div>
  <div id="divisions"></div>

  <script>
    window.addEventListener('message', (event) => {
      const data = event.data;
      const status = document.getElementById('statusMsg');
      const divisionsEl = document.getElementById('divisions');

      if (data?.type === 'aiProcessing') {
        status.textContent = 'Generating AI task divisions...';
      }
      if (data?.type === 'aiDone') {
        if (data.skipped) {
          status.textContent = 'No API key set — division of work skipped.';
          return;
        }
        status.textContent = 'Division of work generated successfully.';
        if (data.divisions) {
          divisionsEl.innerHTML = data.divisions.map(d => \`
            <div class="division">
              <h3>\${d.title} <span style="opacity:0.5;font-weight:400;font-size:12px;">(\${d.owner_id})</span></h3>
              <ul>\${d.tasks.map(t => \`<li>\${t.title}</li>\`).join('')}</ul>
            </div>
          \`).join('');
        }
      }
      if (data?.type === 'aiError') {
        status.textContent = 'AI division failed: ' + data.message;
      }
    });
  </script>
</body>
</html>`;
  }
}
