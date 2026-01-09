import * as vscode from "vscode";
import * as vsls from "vsls";

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("HELLOCIGEN");


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

      // 4. Observe activities (optional API)
      if (liveShare.onActivity) {
        liveShare.onActivity(e => {
          console.log("Activity:", e);
        });
      }

      // 5. Host-only: expose a test service
      if (liveShare.session?.role === vsls.Role.Host) {
        const svc = await liveShare.shareService("helloCigen.test");
        if (!svc) return;
        svc.onNotify("testNotify", (data: any) => {
          console.log("Service notify:", data);
        });
      }
    }
  );

  context.subscriptions.push(startSessionCmd);
  context.subscriptions.push(joinSessionCmd);
}

export function deactivate() {}
