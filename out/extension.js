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
const session_log_utils_1 = require("./utils/session_log_utils");
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
        let projectDetails;
        try {
            await serverManager_1.serverManager.startServer();
            // // Now fetch project details
            projectDetails = await serverManager_1.serverManager.httpFetch("/project_details");
            output.appendLine(`Loaded project details: ${JSON.stringify(projectDetails)}`);
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
        // After PEER TRACKING...
        await new Promise(r => setTimeout(r, 30000)); // wait for peers
        /* ---------------- CREATING AND MANAGING SESSION LOGS ---------------- */
        // Ask continue first
        const cont = await vscode.window.showInformationMessage("Continue previous session?", "Yes", "No");
        let sessionNumber;
        let sessionId;
        // check if it's continuation
        if (cont === "Yes") {
            // Continue previous
            const input = await vscode.window.showInputBox({
                prompt: "Enter previous session ID"
            });
            if (!input)
                return;
            sessionId = input;
            const prevSessions = await serverManager_1.serverManager.httpFetch(`/sessions/${sessionId}`);
            if (prevSessions.length === 0) {
                throw new Error("No sessions found");
            }
            sessionNumber = prevSessions[prevSessions.length - 1].session_number + 1;
            output.appendLine(`Continuing with session #${sessionNumber}`);
        }
        else {
            // New session
            const s = liveShare.session;
            if (!s.id)
                throw new Error("Session ID is null");
            sessionId = s.id;
            sessionNumber = 1;
            output.appendLine(`New session #1 for ${sessionId}`);
        }
        const firstProject = projectDetails.projects[0]; // assumes array[web:2] and using first project as placeholder.
        // Reuse createSessionLog
        await (0, session_log_utils_1.createSessionLog)({
            sessionId,
            firstProject,
            liveShare,
            sessionNumber
        }, serverManager_1.serverManager);
        // Update after 1 min
        await new Promise(r => setTimeout(r, 60000));
        await (0, session_log_utils_1.patchSessionLog)(sessionId, {
            project_title: "changed just for testing purpose after 1 min",
            updated_at: new Date().toISOString()
        }, serverManager_1.serverManager);
        output.appendLine(`Updated session ${sessionNumber}`);
    });
    context.subscriptions.push(disposable);
}
function deactivate() {
    // In deactivate():
    serverManager_1.serverManager.stopServer();
}
//# sourceMappingURL=extension.js.map