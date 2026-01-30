import { log } from "console";
import * as vscode from "vscode";
import * as vsls from "vsls";
import { serverManager } from "./serverManager";
import { roleToString, accessToString } from "./utils/liveshareHelpers";

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
        // // Now fetch project details
        // const projectDetails = await serverManager.httpFetch("/project_details");
        // output.appendLine(`Loaded project details: ${JSON.stringify(projectDetails)}`);

        // // printing each project infos
        // projectDetails.projects.forEach((project: any) => {
        //   output.appendLine(`Project ID: ${project.project_id}`);
        //   output.appendLine(`Title: ${project.title}`);
        //   output.appendLine(`Description: ${project.description}`);
        //   output.appendLine(`Complexity: ${project.complexity}`);
        //   output.appendLine('---------------------------');
        // });


        //creating and managing session logs

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

      /* ---------------- CREATING AND MANAGING SESSION LOGS ---------------- */
      // Select first project automatically
      const projectDetails = await serverManager.httpFetch("/project_details");
      output.appendLine(`Loaded project details: ${JSON.stringify(projectDetails)}`);
      const firstProject = projectDetails.projects[0]; // assumes array[web:2]
      // Confirm everybody joined
      await new Promise(r => setTimeout(r, 30000)); // wait 30s -- in real use, better to have a UI button
      const confirm = await vscode.window.showInformationMessage(
        `Start session for ${firstProject.title}? (${liveShare.peers.length} peers)`,
        "Yes", "No"
      );
      if (confirm !== "Yes") return;

      // 1. Create session log doc
      const s = liveShare.session;
      const hostParticipant = {
        name: "Host",
        role: roleToString(s.role),
        joined_at: new Date().toISOString(),
        access_level: accessToString(s.access)
      };
      const allParticipants = [hostParticipant, ...liveShare.peers.map(p => ({
        name: `Peer${p.peerNumber}`,
        role: roleToString(p.role),
        joined_at: new Date().toISOString(),
        access_level: accessToString(p.access)
      }))];
      if (!s) throw new Error("No LiveShare session");
      const sessionId = s.id;
      const sessionLog = {
        session_id: sessionId,
        //session_link: `http://localhost:4000/sessions/${sessionId}`, // example
        session_number: 1, // for now, will change later to fetch latest + 1
        project_title: firstProject.title,
        start_time: new Date().toISOString(),
        no_of_participants: allParticipants.length,
        participants: allParticipants,
        project_details: firstProject,
        division_of_work: {} // empty for now
      };
      await serverManager.httpFetch("/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionLog)
      });
      output.appendLine(`Created session log 1 for ${sessionId}`);
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {
  // In deactivate():
  serverManager.stopServer();
}