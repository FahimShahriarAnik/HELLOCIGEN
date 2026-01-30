import { log } from "console";
import * as vscode from "vscode";
import * as vsls from "vsls";
import { serverManager } from "./serverManager";


import { ChatManager } from "./ui/chatManager";
import { SessionSetupView } from "./ui/sessionSetupView";
import { HelloCigenSidebarViewProvider } from "./ui/sidebarView";

export function activate(context: vscode.ExtensionContext) {

  const output = vscode.window.createOutputChannel("HELLOCIGEN");
  output.show(true);

  const chatManager = new ChatManager(context);

  // const sidebarProvider = new HelloCigenSidebarViewProvider(
  //   context,
  //   chatManager
  // );

  // context.subscriptions.push(
  //   vscode.window.registerWebviewViewProvider(
  //     HelloCigenSidebarViewProvider.viewId,
  //     sidebarProvider
  //   )
  // );

  // Setup SessionSetupView
  const sessionSetupProvider = new SessionSetupView(
    context,
    async (participantCount) => {
      output.appendLine(`Session started with ${participantCount} participants`);
    }
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "helloCigen.sessionSetup",
      sessionSetupProvider
    )
  );

  // const launchCmd = vscode.commands.registerCommand(
  //   "helloCigen.launch",
  //   async () => {
  //     await sidebarProvider.launch();
  //   }
  // );

  const joinSessionCmd = vscode.commands.registerCommand(
    "helloCigen.join",
    () => {
      vscode.window.showInformationMessage("Join session command executed.");
    }
  );

  const disposable = vscode.commands.registerCommand(
    "helloCigen.start",
    async () => {
      const liveShare = await vsls.getApi();
      if (!liveShare) {
        vscode.window.showErrorMessage("Live Share API not available.");
        return;
      }
      // Start or attach to Live Share session
      await liveShare.share();

      /* ---------------- MONGO SERVER INITIALIZATION ---------------- */
      try {
        await serverManager.startServer();
        // Now fetch project details
        const projectDetails = await serverManager.httpFetch("/project_details");
        output.appendLine(`Loaded project details: ${JSON.stringify(projectDetails)}`);

        // printing each project infos
        projectDetails.projects.forEach((project: any) => {
          output.appendLine(`Project ID: ${project.project_id}`);
          output.appendLine(`Title: ${project.title}`);
          output.appendLine(`Description: ${project.description}`);
          output.appendLine(`Complexity: ${project.complexity}`);
          output.appendLine('---------------------------');
        });

        // Later: create/update sessions
        // const sessionLogs = await serverManager.httpFetch(`/sessions/${liveShare.session?.id}`);
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

      // 4. Host-only: expose a test service
      if (liveShare.session?.role === vsls.Role.Host) {
        const svc = await liveShare.shareService("helloCigen.test");
        if (!svc) return;
        svc.onNotify("testNotify", (data: any) => {
          console.log("Service notify:", data);
        });
      }
    }
  );

  const openChatCmd = vscode.commands.registerCommand(
    "helloCigen.openChat", () => {
      chatManager.openChat();
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
        await chatManager.sendActiveFile();
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to send active file: ${err}`);
      }
    }
  );

  // context.subscriptions.push(launchCmd);
  context.subscriptions.push(disposable);
  context.subscriptions.push(openChatCmd);
  context.subscriptions.push(setApiKeyCmd);
  context.subscriptions.push(clearApiKeyCmd);
  context.subscriptions.push(sendActiveFileCmd);
}

export function deactivate() {
  // In deactivate():
  serverManager.stopServer();
}