"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const vsls = __importStar(require("vsls"));
const serverManager_1 = require("./serverManager");
const liveshareHelpers_1 = require("./utils/liveshareHelpers");
function activate(context) {
    const output = vscode.window.createOutputChannel("HELLOCIGEN");
    output.show(true);
    const disposable = vscode.commands.registerCommand("helloCigen.start", async () => {
        const liveShare = await vsls.getApi();
        if (!liveShare) {
            vscode.window.showErrorMessage("Live Share API not available.");
            return;
        }
        // Start or attach to Live Share session
        await liveShare.share();
        /* ---------------- MONGO SERVER INITIALIZATION ---------------- */
        try {
            await serverManager_1.serverManager.startServer();
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
        }
        catch (err) {
            output.appendLine(`Server error: ${err}`);
        }
        /* ---------------- SESSION STATE TRACKING ---------------- */
        const logSession = () => {
            const s = liveShare.session;
            if (!s)
                return;
            output.appendLine(`Session ID: ${s.id} | Role: ${s.role} | Access: ${s.access}`);
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
                output.appendLine(`Peer ${p.peerNumber} | Role: ${p.role} | Access: ${p.access}`);
            });
        };
        logPeers();
        liveShare.onDidChangePeers(() => {
            output.appendLine("onDidChangePeers fired");
            logPeers();
        });
        /* ---------------- CREATING AND MANAGING SESSION LOGS ---------------- */
        // Select first project automatically
        const projectDetails = await serverManager_1.serverManager.httpFetch("/project_details");
        output.appendLine(`Loaded project details: ${JSON.stringify(projectDetails)}`);
        const firstProject = projectDetails.projects[0]; // assumes array[web:2]
        // Confirm everybody joined
        await new Promise(r => setTimeout(r, 30000)); // wait 30s -- in real use, better to have a UI button
        const confirm = await vscode.window.showInformationMessage(`Start session for ${firstProject.title}? (${liveShare.peers.length} peers)`, "Yes", "No");
        if (confirm !== "Yes")
            return;
        // 1. Create session log doc
        const s = liveShare.session;
        const hostParticipant = {
            name: "Host",
            role: (0, liveshareHelpers_1.roleToString)(s.role),
            joined_at: new Date().toISOString(),
            access_level: (0, liveshareHelpers_1.accessToString)(s.access)
        };
        const allParticipants = [hostParticipant, ...liveShare.peers.map(p => ({
                name: `Peer${p.peerNumber}`,
                role: (0, liveshareHelpers_1.roleToString)(p.role),
                joined_at: new Date().toISOString(),
                access_level: (0, liveshareHelpers_1.accessToString)(p.access)
            }))];
        if (!s)
            throw new Error("No LiveShare session");
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
        await serverManager_1.serverManager.httpFetch("/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(sessionLog)
        });
        output.appendLine(`Created session log 1 for ${sessionId}`);
    });
    context.subscriptions.push(disposable);
}
function deactivate() {
    // In deactivate():
    serverManager_1.serverManager.stopServer();
}
//# sourceMappingURL=extension.js.map