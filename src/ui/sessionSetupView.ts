import * as vscode from "vscode";
import * as vsls from "vsls";

export class SessionSetupView {
  private view?: vscode.WebviewView;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly onSessionStart?: (participantCount: number) => Promise<void>
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

          // Call the callback if provided
          if (this.onSessionStart) {
            await this.onSessionStart(msg.participantCount);
          }

          vscode.window.showInformationMessage(
            `Live Share session started with ${msg.participantCount} expected participants!`
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to start session: ${error}`);
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
      padding: 24px;
      color: var(--vscode-foreground);
      margin: 0;
      background: var(--vscode-editor-background);
    }
    .container {
      max-width: 400px;
      margin: 0 auto;
    }
    h2 {
      margin: 0 0 8px 0;
      font-size: 18px;
      font-weight: 700;
    }
    .subtitle {
      margin: 0 0 24px 0;
      opacity: 0.85;
      font-size: 13px;
    }
    .form-group {
      margin-bottom: 18px;
    }
    label {
      display: block;
      margin-bottom: 8px;
      font-size: 13px;
      font-weight: 600;
      color: var(--vscode-foreground);
    }
    input[type="number"] {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--vscode-border-color);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 6px;
      font-family: var(--vscode-font-family);
      font-size: 13px;
      transition: border-color 0.2s;
    }
    input[type="number"]:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }
    input[type="number"]::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }
    button {
      width: 100%;
      padding: 12px 16px;
      border: none;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      font-size: 13px;
      transition: opacity 0.2s;
    }
    button:hover {
      opacity: 0.9;
    }
    button:active {
      opacity: 0.8;
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .info-text {
      margin-top: 16px;
      padding: 12px;
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-textBlockQuote-border);
      border-radius: 4px;
      font-size: 12px;
      opacity: 0.85;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="container">
    <h2>Start Live Share Session</h2>
    <p class="subtitle">Initialize a collaborative session</p>

    <div class="form-group">
      <label for="participantCount">Number of Participants</label>
      <input 
        type="number" 
        id="participantCount" 
        min="1" 
        max="100"
        placeholder="Enter expected number of participants"
        value="2"
      />
    </div>

    <button id="startBtn">Start Session</button>

    <div class="info-text">
      💡 This will start a Live Share session and prepare the environment for collaborative development.
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    
    document.getElementById('startBtn').addEventListener('click', () => {
      const input = document.getElementById('participantCount');
      const count = parseInt(input.value, 10);
      
      if (isNaN(count) || count < 1) {
        alert('Please enter a valid number of participants');
        return;
      }

      const btn = document.getElementById('startBtn');
      btn.disabled = true;
      btn.textContent = 'Starting...';

      vscode.postMessage({ 
        type: 'startSession', 
        participantCount: count 
      });

      // Re-enable button after 2 seconds
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = 'Start Session';
      }, 2000);
    });

    // Allow Enter key to start session
    document.getElementById('participantCount').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('startBtn').click();
      }
    });
  </script>
</body>
</html>`;
  }
}
