import * as vscode from "vscode";
import * as vsls from "vsls";

import { ChatManager } from "./chatManager";

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("HELLOCIGEN");

  const chatManager = new ChatManager(context);

  const joinSessionCmd = vscode.commands.registerCommand(
    "helloCigen.join",
    () => {
      vscode.window.showInformationMessage("Join session command executed.");
    }
  );

  const startSessionCmd = vscode.commands.registerCommand(
    "helloCigen.start",
    async () => {
      const liveShare = await vsls.getApi();
      if (!liveShare) {
        vscode.window.showErrorMessage(
          "Live Share extension is not available or not enabled."
        );
        return;
      }
      else {
        vscode.window.showInformationMessage("Live Share extension is available.");
      }

      // 1. Start (or attach to) session
      await liveShare.share();

      // 2. Observe session lifecycle
      liveShare.onDidChangeSession(() => {
        console.log("Session changed:", liveShare.session);
      });

      // 3. Observe peers
      liveShare.onDidChangePeers(() => {
        console.log(
          "Peers:",
          [...liveShare.peers.values()]
        );
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

  context.subscriptions.push(startSessionCmd);
  context.subscriptions.push(joinSessionCmd);
  context.subscriptions.push(openChatCmd);
  context.subscriptions.push(setApiKeyCmd);
  context.subscriptions.push(clearApiKeyCmd);
}

export function deactivate() {}
