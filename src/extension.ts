import { log } from "console";
import * as vscode from "vscode";
import * as vsls from "vsls";
import { serverManager } from "./serverManager";
import { roleToString, accessToString } from "./utils/liveshareHelpers";
import { createSessionLog } from "./utils/session_log_utils";


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
      let projectDetails: any;
      try {
        await serverManager.startServer();
        // // Now fetch project details
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
      // After PEER TRACKING...
      await new Promise(r => setTimeout(r, 30000)); // wait for peers

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

      // Update after 1 min
      await new Promise(r => setTimeout(r, 60000));
      await serverManager.httpFetch(`/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          project_title: "changed just for testing purpose",
          updated_at: new Date().toISOString() 
        })
      });
      output.appendLine(`Updated session ${sessionNumber} in Atlas`);
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {
  // In deactivate():
  serverManager.stopServer();
}