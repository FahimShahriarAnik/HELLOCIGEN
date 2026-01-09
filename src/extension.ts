import { log } from "console";
import * as vscode from "vscode";
import * as vsls from "vsls";

/* ------------------------------------------------------------------
   FILE-WISE EDITOR TRACKING DATA STRUCTURE
   ------------------------------------------------------------------
   Key   : file path
   Value : who last edited it + latest content
-------------------------------------------------------------------*/

interface FileState {
  lastEditor: string;
  peerNumber: number | null;
  lastUpdated: number;
  content: string;
}

const fileStateMap = new Map<string, FileState>();

export function activate(context: vscode.ExtensionContext) {

  const output = vscode.window.createOutputChannel("HELLOCIGEN");
  output.show(true);

  /* ---------------- Json to keep track of file changes and fuction to write to that ---------------- */
  const snapshotUri = vscode.Uri.joinPath(
  context.globalStorageUri,
  "file_state.json"
);
  async function writeSnapshot() {
  const obj = Object.fromEntries(fileStateMap);
  await vscode.workspace.fs.writeFile(
    snapshotUri,
    Buffer.from(JSON.stringify(obj, null, 2))
  );
}
  const snapshotTimer = setInterval(writeSnapshot, 30_000);
  context.subscriptions.push({ dispose: () => clearInterval(snapshotTimer) });

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

      /* ==========================================================
         FILE-WISE EDITOR + CONTENT TRACKING (CORE LOGIC)
         ==========================================================
         This listens to ALL text edits, attributes them to a peer
         (if Live Share edit), and stores ONLY the latest state.
      =========================================================== */

      const textChangeDisposable =
        vscode.workspace.onDidChangeTextDocument(async (e) => {

          // Ignore non-workspace files (output panel, virtual docs, etc.)
          if (e.document.uri.scheme !== "file") return;

          let editorLabel = "Local user";
          let peerNumber: number | null = null;

          try {
            // Live Share API: who caused THIS edit
            const peer =
              await liveShare.getPeerForTextDocumentChangeEvent(e);

            if (peer) {
              editorLabel =
                peer.user?.displayName ?? `Peer ${peer.peerNumber}`;
              peerNumber = peer.peerNumber;
            }
          } catch {
            // Not a Live Share edit → treat as local
          }

          /* -------------------------------------------------------
             UPDATE FILE STATE MAP
             -------------------------------------------------------
             This is your ground truth:
             - which peer last edited which file
             - what the file looks like right now
          --------------------------------------------------------*/

          fileStateMap.set(e.document.uri.fsPath, {
            lastEditor: editorLabel,
            peerNumber,
            lastUpdated: Date.now(),
            content: e.document.getText(),
          });

          output.appendLine(
            `[TRACK] ${editorLabel} → ${e.document.uri.fsPath}`
          );
        });

      context.subscriptions.push(textChangeDisposable);
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
