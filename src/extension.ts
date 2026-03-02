import * as vscode from "vscode";
import * as vsls from "vsls";
import { serverManager } from "./serverManager";
import { createSessionLog } from "./utils/session_log_utils";


import { ChatManager2 } from "./ui/chatManager2";
import { InitialSessionView } from "./ui/initialSessionView";
import { TaskTrackerProvider } from "./ui/taskTrackerProvider";

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("HELLOCIGEN");
  output.show(true);

  const initialSessionProvider = new InitialSessionView(context);
  const chatManager2 = new ChatManager2(context, serverManager);
  const taskTrackerProvider = new TaskTrackerProvider();
  TaskTrackerProvider.instance = taskTrackerProvider;

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      InitialSessionView.viewId,
      initialSessionProvider
    ),
    vscode.window.registerWebviewViewProvider(
      TaskTrackerProvider.viewId,
      taskTrackerProvider
    )
  );

  const disposable = vscode.commands.registerCommand(
    "helloCigen.start",
    async () => {
      output.show(true);
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

  const openChat2Cmd = vscode.commands.registerCommand(
    "helloCigen.openChat",
    () => {
      chatManager2.openChat();
    }
  );

  const toggleChatCmd = vscode.commands.registerCommand(
    "helloCigen.toggleChat",
    () => {
      chatManager2.toggleChat();
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

  const sendActiveFileCmd = vscode.commands.registerCommand(
    "helloCigen.sendActiveFile",
    async () => {
      try {
        await chatManager2.sendActiveFile();
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to send active file: ${err}`);
      }
    }
  );

  context.subscriptions.push(disposable);
  context.subscriptions.push(openChat2Cmd);
  context.subscriptions.push(toggleChatCmd);
  context.subscriptions.push(setApiKeyCmd);
  context.subscriptions.push(clearApiKeyCmd);
  context.subscriptions.push(sendActiveFileCmd);
}

export function deactivate() {
  // In deactivate():
  serverManager.stopServer();
}