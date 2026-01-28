import { log } from "console";
import * as vscode from "vscode";
import * as vsls from "vsls";
import { serverManager } from "./serverManager";


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
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {
  // In deactivate():
  serverManager.stopServer();
}