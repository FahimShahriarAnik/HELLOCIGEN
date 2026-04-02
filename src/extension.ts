import * as vscode from "vscode";
import * as vsls from "vsls";
import { serverManager } from "./serverManager";
import { createSessionLog } from "./utils/session_log_utils";
import { Role } from "./utils/liveshareHelpers";

import { SessionDashboard } from "./ui/sessionDashboard";
import { TaskTrackerProvider } from "./ui/taskTrackerProvider";
import { GuestOnboardingView } from "./ui/guestOnboardingView";

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("HELLOCIGEN");
  output.show(true);

  // API Key Pre-flight: show auto-dismissing notification if key is found
  context.secrets.get('openai-api-key').then(apiKey => {
    if (apiKey) {
      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, cancellable: false },
        async (progress) => {
          progress.report({ message: 'OpenAI API key found.' });
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      );
    }
  });

  const initialSessionProvider = new SessionDashboard(context);
  SessionDashboard.instance = initialSessionProvider;
  const taskTrackerProvider = new TaskTrackerProvider();
  TaskTrackerProvider.instance = taskTrackerProvider;

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SessionDashboard.viewId,
      initialSessionProvider
    ),
    vscode.window.registerWebviewViewProvider(
      TaskTrackerProvider.viewId,
      taskTrackerProvider
    )
  );

  // Auto-detect when this instance joins a Live Share session as a guest.
  vsls.getApi().then(liveShare => {
    if (!liveShare) return;

    const tryShowOnboarding = () => {
      const session = liveShare.session;
      if (session && session.role === Role.Guest) {
        GuestOnboardingView.createOrShow(context, liveShare);
        // Notify sidebar so it starts polling for session state
        const sessionId = session.id;
        if (sessionId) {
          initialSessionProvider.setActiveSession(sessionId, false);
        }
      }
    };

    // Check if already in a guest session (fixes race where session
    // is connected before the listener is registered)
    tryShowOnboarding();

    // Also listen for future session changes
    liveShare.onDidChangeSession(() => {
      tryShowOnboarding();
      // Host auto-end: when Live Share session ends, mark completed
      const s = liveShare.session;
      if ((!s || s.role === Role.None) && initialSessionProvider.activeSessionId && initialSessionProvider.isHost) {
        initialSessionProvider.endSession();
      }
    });
  });

  const restartServerCmd = vscode.commands.registerCommand(
    "helloCigen.restartServer",
    async () => {
      try {
        await serverManager.restartServer();
        vscode.window.showInformationMessage("Server restarted successfully.");
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to restart server: ${err}`);
      }
    }
  );

  const disposable = vscode.commands.registerCommand(
    "helloCigen.start",
    async () => {
      output.show(true);

      // Folder validation guard
      if (!vscode.workspace.workspaceFolders?.length) {
        vscode.window.showErrorMessage('Please open a folder before creating a session.');
        return;
      }

      // API key pre-flight check (host only — guests never see this)
      let apiKey = await context.secrets.get('openai-api-key');
      if (!apiKey && process.env.OPENAI_API_KEY) {
        // Auto-store env var in secrets
        await context.secrets.store('openai-api-key', process.env.OPENAI_API_KEY);
        apiKey = process.env.OPENAI_API_KEY;
      }
      if (!apiKey) {
        const action = await vscode.window.showWarningMessage(
          "No OpenAI API key set. AI features won't work.",
          "Set API Key"
        );
        if (action === "Set API Key") {
          await vscode.commands.executeCommand("helloCigen.setApiKey");
        }
      }

      const liveShare = await vsls.getApi();
      if (!liveShare) {
        vscode.window.showErrorMessage("Live Share API not available.");
        return;
      }
      // Start or attach to Live Share session
      await liveShare.share();

      /* ---------------- MONGO SERVER INITIALIZATION ---------------- */
      let projectDetails: any;
      try {
        await serverManager.startServer();

        // Forward API key to server for server-side AI chat
        if (apiKey) {
          await serverManager.httpFetch('/api-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey })
          }).catch(() => {}); // Non-critical
        }

        projectDetails = await serverManager.httpFetch("/project_details");
        output.appendLine(`Loaded project details: ${JSON.stringify(projectDetails)}`);
      } catch (err) {
        output.appendLine(`Server error: ${err}`);
      }
      /* ---------------- SESSION STATE TRACKING ---------------- */
      const logSession = () => {
        const s = liveShare.session;
        if (!s) return;
        output.appendLine(
          `Session ID: ${s.id} | Role: ${s.role} | Access: ${s.access}`
        );
      };

      logSession();

      liveShare.onDidChangeSession(() => {
        output.appendLine("onDidChangeSession fired");
        logSession();
        // Host auto-end: when Live Share session ends, mark completed
        const s = liveShare.session;
        if ((!s || s.role === Role.None) && initialSessionProvider.activeSessionId && initialSessionProvider.isHost) {
          initialSessionProvider.endSession();
        }
      });

      /* ---------------- PEER TRACKING ---------------- */
      const logPeers = () => {
        output.appendLine(`Peers count: ${liveShare.peers.length}`);
        liveShare.peers.forEach(p => {
          output.appendLine(
            `Peer ${p.peerNumber} | Role: ${p.role} | Access: ${p.access}`
          );
        });
      };
      logPeers();
      liveShare.onDidChangePeers(() => {
        output.appendLine("onDidChangePeers fired");
        logPeers();
      });

      await vscode.window.showInformationMessage(
        "Live Share session started. Click when all participants have joined.",
        "Everyone is here"
      );

      /* ---------------- CREATING AND MANAGING SESSION LOGS ---------------- */
      // Ask continue first
      const cont = await vscode.window.showInformationMessage(
        "Continue previous session?",
        "Yes", "No"
      );
      let sessionNumber: number;
      let sessionId: string;

      // check if it's continuation
      if (cont === "Yes") {
        // Continue previous
        const input = await vscode.window.showInputBox({ 
          prompt: "Enter previous session ID" 
        })!;
        if (!input) return;
        sessionId = input
        
        const prevSessions = await serverManager.httpFetch(`/sessions/${sessionId}`);
        if (prevSessions.length === 0) {
          throw new Error("No sessions found");
        }
        sessionNumber = prevSessions[prevSessions.length - 1].session_number + 1;
        output.appendLine(`Continuing with session #${sessionNumber}`);
      } else {
        // New session
        const s = liveShare.session!;
        if (!s.id) throw new Error("Session ID is null");
        sessionId = s.id;
        sessionNumber = 1;
        output.appendLine(`New session #1 for ${sessionId}`);
      }

      const firstProject = projectDetails.projects[0]; // assumes array[web:2] and using first project as placeholder.
      // Reuse createSessionLog
      await createSessionLog({ 
        sessionId, 
        firstProject, 
        liveShare, 
        sessionNumber 
      }, serverManager);

      output.appendLine(`Session ${sessionNumber} created successfully.`);
    }
  );

  const setApiKeyCmd = vscode.commands.registerCommand(
    "helloCigen.setApiKey",
    async () => {
      const apiKey = await vscode.window.showInputBox({
        prompt: "Enter your OpenAI API key",
        password: true,
        ignoreFocusOut: true,
      });

      if (apiKey) {
        await context.secrets.store("openai-api-key", apiKey);
        vscode.window.showInformationMessage(
          "OpenAI API key saved successfully!"
        );
      }
    }
  );

  const clearApiKeyCmd = vscode.commands.registerCommand(
    "helloCigen.clearApiKey",
    async () => {
      await context.secrets.delete("openai-api-key");
      vscode.window.showInformationMessage("OpenAI API key cleared.");
    }
  );

  context.subscriptions.push(disposable);
  context.subscriptions.push(restartServerCmd);
  context.subscriptions.push(setApiKeyCmd);
  context.subscriptions.push(clearApiKeyCmd);
}

export async function deactivate() {
  await SessionDashboard.instance?.endSession();
  serverManager.stopServer();
}