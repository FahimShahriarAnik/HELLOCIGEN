import { log } from "console";
import * as vscode from "vscode";
import * as vsls from "vsls";

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function activate(context: vscode.ExtensionContext) {

  const output = vscode.window.createOutputChannel("HELLOCIGEN");
  output.show(true);

  const disposable = vscode.commands.registerCommand(
    "helloCigen.start",
    async () => {
      const liveShare = await vsls.getApi();

      if (!liveShare) {
        vscode.window.showErrorMessage("Live Share API not available.");
        return;
      }

      // Start or attach to session
      await liveShare.share();

      // ---- SESSION STATE ----
      const logSession = () => {
        const s = liveShare.session;
        if (!s) {
          output.appendLine("Session: none");
          return;
        }

        const msg =
          `Session ID: ${s.id}\n` +
          `Role: ${s.role}\n` +
          `Access: ${s.access}\n` +
          `User: ${s.user?.displayName ?? "unknown"}`;

        output.appendLine(msg);
        vscode.window.showInformationMessage("Live Share session updated");
      };

      logSession();

      liveShare.onDidChangeSession(() => {
        output.appendLine("onDidChangeSession fired");
        logSession();
      });

      // ---- PEERS ----
      const logPeers = () => {
        const peers = [...liveShare.peers.values()];
        output.appendLine(`Peers count: ${peers.length}`);

        peers.forEach(p => {
          output.appendLine(
            `Peer ${p.peerNumber} | Role: ${p.role} | Access: ${p.access} | User: ${p.user?.displayName ?? "unknown"}`
          );
        });

        vscode.window.showInformationMessage("Live Share peers changed");
      };

      logPeers();

      liveShare.onDidChangePeers(() => {
        output.appendLine("onDidChangePeers fired");
        logPeers();
        logSession();
      });
    
    // ---- TEXT CHANGE ATTRIBUTION ----
    const textChangeDisposable = vscode.workspace.onDidChangeTextDocument(
      async (e) => {
        if (e.document.uri.scheme !== "file") {return;} // Only track file changes
        try {
          const peer = await liveShare.getPeerForTextDocumentChangeEvent(e);

          await sleep(30000);
          const file = e.document.uri.toString();
          const peerLabel = peer
            ? `Peer ${peer.peerNumber} (${peer.user?.displayName ?? "unknown"})`
            : "Local user";

          output.appendLine(
            `[EDIT] ${peerLabel} edited file: ${file}`
          );
        } catch {
          // Not a Live Share edit → ignore
        }
      }
    );
  }
  );


  context.subscriptions.push(disposable);
}

export function deactivate() {}
