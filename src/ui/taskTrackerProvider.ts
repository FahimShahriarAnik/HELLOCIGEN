import * as vscode from 'vscode';
import { AiDivision } from '../utils/aiUtils';

type Status = 'todo' | 'in progress' | 'done';

const POLL_INTERVAL_MS = 4000;
const SERVER_URL = 'http://localhost:4000';

interface TrackedTask {
  id: string;
  title: string;
  status: Status;
  files?: string[];
  subtasks?: TrackedTask[];
}

interface TrackedDivision {
  id: string;
  title: string;
  owner_id: string;
  tasks: TrackedTask[];
}

function nextStatus(s: Status): Status {
  if (s === 'todo') return 'in progress';
  if (s === 'in progress') return 'done';
  return 'todo';
}

function divisionStatus(tasks: TrackedTask[]): Status {
  if (tasks.length === 0) return 'todo';
  if (tasks.every(t => t.status === 'done')) return 'done';
  if (tasks.some(t => t.status === 'in progress' || t.status === 'done')) return 'in progress';
  return 'todo';
}

/** Serialize divisions to a comparable string for diff detection */
function divisionsFingerprint(divisions: TrackedDivision[]): string {
  return JSON.stringify(divisions.map(d => ({
    id: d.id,
    owner_id: d.owner_id,
    tasks: d.tasks.map(t => ({
      id: t.id, status: t.status,
      subtasks: t.subtasks?.map(s => ({ id: s.id, status: s.status }))
    }))
  })));
}

export class TaskTrackerProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'helloCigen.taskTracker';
  static instance: TaskTrackerProvider | undefined;

  private _view: vscode.WebviewView | undefined;
  private _divisions: TrackedDivision[] = [];
  private _participants: Array<{ id: string; name: string }> = [];
  private _sessionId: string | undefined;
  private _pollTimer: ReturnType<typeof setInterval> | undefined;
  private _lastFingerprint: string = '';
  private _skipNextPoll = false; // debounce after local change

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._getHtml();

    webviewView.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'toggleTask') {
        this._toggleTask(msg.divisionId, msg.taskId, msg.subtaskId);
      }
      if (msg.type === 'toggleDivision') {
        this._toggleDivision(msg.divisionId);
      }
      if (msg.type === 'reassignDivision') {
        const div = this._divisions.find(d => d.id === msg.divisionId);
        if (div) {
          div.owner_id = msg.newOwnerId;
          this._persistDivisions();
        }
      }
    });
  }

  setParticipants(participants: Array<{ id: string; name: string }>): void {
    this._participants = participants;
  }

  setDivisions(divisions: AiDivision[]): void {
    this._divisions = divisions.map(d => ({
      id: d.id,
      title: d.title,
      owner_id: (d as any).owner_id ?? '',
      tasks: d.tasks.map(t => ({
        id: t.id,
        title: t.title,
        status: (t.status as Status) ?? 'todo',
        files: t.files,
        subtasks: t.subtasks?.map(s => ({
          id: s.id,
          title: s.title,
          status: (s.status as Status) ?? 'todo'
        }))
      }))
    }));
    this._lastFingerprint = divisionsFingerprint(this._divisions);
    this._refresh();
  }

  /** Connect the tracker to a session for server sync */
  setSession(sessionId: string): void {
    this._sessionId = sessionId;
    this._startPolling();
  }

  dispose(): void {
    this._stopPolling();
  }

  private _startPolling(): void {
    this._stopPolling();
    if (!this._sessionId) return;

    this._pollTimer = setInterval(async () => {
      if (this._skipNextPoll) {
        this._skipNextPoll = false;
        return;
      }
      await this._fetchDivisions();
    }, POLL_INTERVAL_MS);
  }

  private _stopPolling(): void {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = undefined;
    }
  }

  private async _fetchDivisions(): Promise<void> {
    if (!this._sessionId) return;
    try {
      const resp = await fetch(`${SERVER_URL}/sessions/${this._sessionId}/divisions`);
      if (!resp.ok) return;
      const data = await resp.json() as any;
      if (!data.division_of_work?.length) return;

      const incoming = data.division_of_work as TrackedDivision[];
      const incomingFp = divisionsFingerprint(incoming);

      if (incomingFp !== this._lastFingerprint) {
        this._divisions = incoming;
        this._lastFingerprint = incomingFp;
        this._refresh();
      }
    } catch {
      // Server may not be reachable; keep polling
    }
  }

  private async _getChangedFiles(): Promise<string[]> {
    const gitExt = vscode.extensions.getExtension('vscode.git');
    if (!gitExt?.isActive) return [];
    const api = gitExt.exports.getAPI(1);
    const repo = api?.repositories?.[0];
    if (!repo) return [];
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    const changes = [...(repo.state.workingTreeChanges ?? []), ...(repo.state.indexChanges ?? [])];
    return [...new Set(changes.map((c: any) => {
      const full: string = c.uri.fsPath;
      return workspace ? full.replace(workspace + '/', '') : (full.split('/').pop() ?? full);
    }))];
  }

  private async _notifyTaskComplete(taskTitle: string, ownerId: string): Promise<void> {
    if (!this._sessionId) return;
    const idx = this._participants.findIndex(p => p.id === ownerId);
    const participantName = idx >= 0 ? this._participants[idx].name : ownerId;
    const participantLabel = idx >= 0 ? `P${idx + 1}` : participantName;
    try {
      await fetch(`${SERVER_URL}/sessions/${this._sessionId}/task-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskTitle, participantName, participantLabel })
      });
    } catch {
      // Non-critical
    }
  }

  private async _triggerCodeReview(taskTitle: string, divisionTitle: string): Promise<void> {
    if (!this._sessionId) return;
    const changedFiles = await this._getChangedFiles();
    try {
      const resp = await fetch(`${SERVER_URL}/sessions/${this._sessionId}/code-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_title: taskTitle, division_title: divisionTitle, changed_files: changedFiles })
      });
      if (!resp.ok) return;
      const data = await resp.json() as { assessment: string };
      vscode.window.showInformationMessage(`Code Review: ${data.assessment}`);
    } catch (err) {
      console.error('[taskTrackerProvider] code review trigger failed (non-critical):', err);
    }
  }

  private async _persistDivisions(): Promise<void> {
    if (!this._sessionId) return;
    this._skipNextPoll = true;
    this._lastFingerprint = divisionsFingerprint(this._divisions);
    try {
      const resp = await fetch(`${SERVER_URL}/sessions/${this._sessionId}/divisions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ division_of_work: this._divisions })
      });
      if (!resp.ok) {
        const body = await resp.text();
        vscode.window.showWarningMessage(`Task tracker failed to sync to server: HTTP ${resp.status} ${body}`);
      }
    } catch (err) {
      vscode.window.showWarningMessage(`Task tracker failed to sync to server: ${err}`);
    }
  }

  private _toggleTask(divisionId: string, taskId: string, subtaskId?: string): void {
    const div = this._divisions.find(d => d.id === divisionId);
    if (!div) return;
    if (subtaskId) {
      const task = div.tasks.find(t => t.id === taskId);
      const sub = task?.subtasks?.find(s => s.id === subtaskId);
      if (sub) sub.status = nextStatus(sub.status);
      if (task?.subtasks) {
        const prevStatus = task.status;
        task.status = divisionStatus(task.subtasks) as Status;
        if (task.status === 'done' && prevStatus !== 'done') {
          this._triggerCodeReview(task.title, div.title);
          this._notifyTaskComplete(task.title, div.owner_id);
        }
      }
    } else {
      const task = div.tasks.find(t => t.id === taskId);
      if (task) {
        task.status = nextStatus(task.status);
        task.subtasks?.forEach(s => { s.status = task.status; });
        if (task.status === 'done') {
          this._triggerCodeReview(task.title, div.title);
          this._notifyTaskComplete(task.title, div.owner_id);
        }
      }
    }
    this._refresh();
    this._persistDivisions();
  }

  private _toggleDivision(divisionId: string): void {
    const div = this._divisions.find(d => d.id === divisionId);
    if (!div) return;
    const current = divisionStatus(div.tasks);
    const next = nextStatus(current);
    div.tasks.forEach(t => {
      t.status = next;
      t.subtasks?.forEach(s => { s.status = next; });
    });
    if (next === 'done') {
      this._triggerCodeReview(div.title, div.title);
      this._notifyTaskComplete(div.title, div.owner_id);
    }
    this._refresh();
    this._persistDivisions();
  }

  private _refresh(): void {
    if (this._view) {
      this._view.webview.html = this._getHtml();
    }
  }

  private _statusIcon(s: Status): string {
    if (s === 'done') return '<span class="cb done">■</span>';
    if (s === 'in progress') return '<span class="cb inprogress">◐</span>';
    return '<span class="cb todo">□</span>';
  }

  private _getHtml(): string {
    const divisionsHtml = this._divisions.length === 0
      ? '<p class="empty">No tasks yet. Start a session to generate task divisions.</p>'
      : this._divisions.map(div => {
          const dStatus = divisionStatus(div.tasks);
          const tasksHtml = div.tasks.map(task => {
            const subsHtml = (task.subtasks && task.subtasks.length > 0)
              ? task.subtasks.map(sub => `
                  <div class="row subtask" data-div="${div.id}" data-task="${task.id}" data-sub="${sub.id}">
                    ${this._statusIcon(sub.status)}
                    <span class="label">${sub.title}</span>
                  </div>`).join('')
              : '';
            const taskFilesHtml = (task.files && task.files.length > 0)
              ? `<div class="task-files">${task.files.map(f => `<span class="task-file">${f}</span>`).join('')}</div>`
              : '';
            return `
              <div class="row task" data-div="${div.id}" data-task="${task.id}">
                ${this._statusIcon(task.status)}
                <span class="label">${task.title}</span>
              </div>${taskFilesHtml}${subsHtml}`;
          }).join('');

          const ownerName = this._participants.find(p => p.id === div.owner_id)?.name ?? div.owner_id;
          const assigneeHtml = this._participants.length > 0
            ? `<select class="owner-select" data-div-id="${div.id}">
                 ${this._participants.map(p =>
                   `<option value="${p.id}"${p.id === div.owner_id ? ' selected' : ''}>${p.name}</option>`
                 ).join('')}
               </select>`
            : `<span class="owner-badge">${ownerName}</span>`;

          return `
            <div class="division">
              <div class="div-header-row">
                <div class="row division-header" data-div="${div.id}">
                  ${this._statusIcon(dStatus)}
                  <span class="label div-title">${div.title}</span>
                </div>
                <div class="owner-area">${assigneeHtml}</div>
              </div>
              <div class="tasks">${tasksHtml}</div>
            </div>`;
        }).join('');

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
      background: var(--vscode-sideBar-background);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    .legend {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 6px 10px;
      background: var(--vscode-sideBarSectionHeader-background);
      border-bottom: 1px solid var(--vscode-panel-border);
      font-size: 11px;
      flex-shrink: 0;
    }
    .legend-title { opacity: 0.7; font-weight: 600; margin-right: 4px; }
    .legend-item { display: flex; align-items: center; gap: 4px; }
    .scroll-area {
      flex: 1;
      overflow-y: auto;
      padding: 6px 0;
    }
    .division { margin-bottom: 4px; }
    .row {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      padding: 3px 10px;
      cursor: pointer;
      border-radius: 3px;
      line-height: 1.4;
      user-select: none;
    }
    .row:hover { background: var(--vscode-list-hoverBackground); }
    .division-header { padding-left: 10px; }
    .task { padding-left: 24px; }
    .subtask { padding-left: 40px; }
    .cb {
      font-size: 13px;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .cb.todo { color: var(--vscode-foreground); opacity: 0.5; }
    .cb.inprogress { color: #f0a500; }
    .cb.done { color: #4caf50; }
    .label { font-size: 12px; }
    .div-title { font-weight: 600; font-size: 12px; }
    .empty { padding: 16px 10px; font-size: 12px; opacity: 0.6; }
    .div-header-row { display: flex; align-items: center; justify-content: space-between; padding-right: 6px; }
    .owner-area { flex-shrink: 0; }
    .owner-select {
      font-size: 10px;
      font-family: var(--vscode-font-family);
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 3px;
      padding: 1px 4px;
      max-width: 80px;
      cursor: pointer;
    }
    .owner-select:focus { outline: 1px solid var(--vscode-focusBorder); }
    .owner-badge { font-size: 10px; opacity: 0.6; padding: 1px 4px; }
    .task-files { padding: 1px 10px 3px 40px; display: flex; flex-wrap: wrap; gap: 4px; }
    .task-file { font-size: 10px; font-family: var(--vscode-editor-font-family, monospace); background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 3px; padding: 1px 5px; opacity: 0.85; }
  </style>
</head>
<body>
  <div class="legend">
    <span class="legend-title">Legend:</span>
    <span class="legend-item"><span class="cb todo">□</span> To-do</span>
    <span class="legend-item"><span class="cb inprogress">◐</span> In Progress</span>
    <span class="legend-item"><span class="cb done">■</span> Done</span>
  </div>
  <div class="scroll-area">
    ${divisionsHtml}
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('.division-header').forEach(el => {
      el.addEventListener('click', () => {
        vscode.postMessage({ type: 'toggleDivision', divisionId: el.dataset.div });
      });
    });
    document.querySelectorAll('.task').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        vscode.postMessage({ type: 'toggleTask', divisionId: el.dataset.div, taskId: el.dataset.task });
      });
    });
    document.querySelectorAll('.subtask').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        vscode.postMessage({ type: 'toggleTask', divisionId: el.dataset.div, taskId: el.dataset.task, subtaskId: el.dataset.sub });
      });
    });
    document.querySelectorAll('.owner-select').forEach(sel => {
      sel.addEventListener('change', e => {
        e.stopPropagation();
        vscode.postMessage({ type: 'reassignDivision', divisionId: sel.dataset.divId, newOwnerId: sel.value });
      });
    });
  </script>
</body>
</html>`;
  }
}
