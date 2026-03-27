import * as vscode from 'vscode';
import { GuestDevelopmentView } from './guestDevelopmentView';
import { TaskTrackerProvider } from './taskTrackerProvider';

export class GuestOnboardingView {
  private static panel: vscode.WebviewPanel | undefined;
  private static pollTimer: ReturnType<typeof setInterval> | undefined;

  static createOrShow(context: vscode.ExtensionContext, liveShare: any): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'guestOnboarding',
      'CoGEN — Welcome, Teammate!',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    this.panel.webview.html = this.getHtml(liveShare);

    const userId = liveShare.session?.user?.id ?? '';
    const displayName = liveShare.session?.user?.displayName ?? '';
    const peerNumber = liveShare.session?.peerNumber ?? 0;

    this.panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type !== 'confirmGuest') return;

      const sessionId = liveShare.session?.id;
      if (!sessionId) {
        vscode.window.showErrorMessage('No active Live Share session found.');
        return;
      }

      const submittedName = msg.displayName || displayName;

      try {
        const response = await fetch(
          `http://localhost:4000/sessions/${sessionId}/pending-participants`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              displayName: submittedName,
              peerNumber,
              strengths: msg.strengths,
              weaknesses: msg.weaknesses
            })
          }
        );

        if (!response.ok) {
          throw new Error(`Server responded with ${response.status}`);
        }

        this.panel?.webview.postMessage({ type: 'confirmed' });

        // Start polling for session state transitions
        this.startPolling(sessionId, submittedName, context);
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to submit profile: ${err}`);
        this.panel?.webview.postMessage({ type: 'submitError', message: String(err) });
      }
    });

    this.panel.onDidDispose(() => {
      this.stopPolling();
      this.panel = undefined;
    });
  }

  private static startPolling(sessionId: string, guestName: string, context: vscode.ExtensionContext): void {
    this.stopPolling();
    this.pollTimer = setInterval(async () => {
      try {
        const resp = await fetch(`http://localhost:4000/sessions/${sessionId}/state`);
        if (!resp.ok) return;
        const state = await resp.json() as any;

        if (state.status === 'active') {
          this.stopPolling();

          // Populate task tracker for guest
          if (state.division_of_work && state.participants) {
            TaskTrackerProvider.instance?.setParticipants(state.participants);
            TaskTrackerProvider.instance?.setDivisions(state.division_of_work as any);
          }

          // Transition to guest development view
          this.panel?.dispose();
          GuestDevelopmentView.createOrShow(
            context,
            guestName,
            state.division_of_work ?? [],
            state.participants ?? [],
            sessionId,
            state.project_title ?? ''
          );
        }
      } catch {
        // Server may not be reachable; keep polling
      }
    }, 5000);
  }

  private static stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private static getHtml(liveShare: any): string {
    const prefillName = (liveShare.session?.user?.displayName ?? '').replace(/'/g, "\\'");
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 40px 32px;
    }
    .card {
      width: 100%;
      max-width: 520px;
    }
    h2 {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .subtitle {
      font-size: 13px;
      opacity: 0.7;
      margin-bottom: 28px;
      line-height: 1.6;
    }
    .field { margin-bottom: 20px; }
    label {
      display: block;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      opacity: 0.7;
      margin-bottom: 6px;
    }
    input[type="text"] {
      width: 100%;
      padding: 10px 12px;
      border-radius: 6px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-font-family);
      font-size: 13px;
    }
    input[type="text"]:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }
    textarea {
      width: 100%;
      min-height: 80px;
      padding: 10px 12px;
      border-radius: 6px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-font-family);
      font-size: 13px;
      resize: vertical;
    }
    textarea:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }
    #confirmBtn {
      padding: 10px 28px;
      border-radius: 6px;
      border: 1px solid var(--vscode-button-border);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font-weight: 700;
      font-size: 13px;
      font-family: var(--vscode-font-family);
      width: 100%;
    }
    #confirmBtn:disabled { opacity: 0.4; cursor: not-allowed; }
    #errorMsg {
      margin-top: 10px;
      font-size: 12px;
      color: var(--vscode-errorForeground);
      display: none;
    }
    .waiting {
      text-align: center;
      padding: 32px 0;
      display: none;
    }
    .waiting h3 {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 10px;
    }
    .waiting p {
      font-size: 13px;
      opacity: 0.7;
    }
    .dots-row {
      display: flex;
      gap: 8px;
      justify-content: center;
      margin: 20px 0;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--vscode-button-background);
      animation: bounce 1.2s ease-in-out infinite;
    }
    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce {
      0%, 80%, 100% { transform: translateY(0); }
      40%           { transform: translateY(-10px); }
    }
  </style>
</head>
<body>
  <div class="card">
    <div id="formSection">
      <h2>Welcome, Teammate!</h2>
      <p class="subtitle">
        You've joined a CoGEN collaborative session.<br/>
        Tell us about yourself so the AI can assign tasks that fit your skills.
      </p>

      <div class="field">
        <label for="displayName">Your Name <span style="color:var(--vscode-errorForeground)">*</span></label>
        <input type="text" id="displayName" value="${prefillName}" placeholder="Enter your name" />
      </div>

      <div class="field">
        <label for="strengths">Your Strengths</label>
        <textarea id="strengths" placeholder="e.g. React, TypeScript, REST APIs, testing..."></textarea>
      </div>

      <div class="field">
        <label for="weaknesses">Areas to Improve / Weaknesses</label>
        <textarea id="weaknesses" placeholder="e.g. DevOps, databases, CSS..."></textarea>
      </div>

      <button id="confirmBtn">Confirm &amp; Join</button>
      <div id="errorMsg"></div>
    </div>

    <div class="waiting" id="waitingSection">
      <h3>Profile saved!</h3>
      <div class="dots-row">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
      <p>Waiting for the host to begin the session...</p>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    document.getElementById('confirmBtn').addEventListener('click', () => {
      const displayName = document.getElementById('displayName').value.trim();
      const strengths = document.getElementById('strengths').value.trim();
      const weaknesses = document.getElementById('weaknesses').value.trim();

      if (!displayName) {
        const err = document.getElementById('errorMsg');
        err.textContent = 'Your name is required.';
        err.style.display = '';
        return;
      }

      if (!strengths && !weaknesses) {
        const err = document.getElementById('errorMsg');
        err.textContent = 'Please enter at least your strengths or weaknesses.';
        err.style.display = '';
        return;
      }

      document.getElementById('confirmBtn').disabled = true;
      document.getElementById('confirmBtn').textContent = 'Submitting...';
      document.getElementById('errorMsg').style.display = 'none';

      vscode.postMessage({ type: 'confirmGuest', displayName, strengths, weaknesses });
    });

    window.addEventListener('message', (event) => {
      if (event.data?.type === 'confirmed') {
        document.getElementById('formSection').style.display = 'none';
        document.getElementById('waitingSection').style.display = 'block';
      }
      if (event.data?.type === 'submitError') {
        const err = document.getElementById('errorMsg');
        err.textContent = event.data.message;
        err.style.display = '';
        document.getElementById('confirmBtn').disabled = false;
        document.getElementById('confirmBtn').textContent = 'Confirm & Join';
      }
    });
  </script>
</body>
</html>`;
  }
}
