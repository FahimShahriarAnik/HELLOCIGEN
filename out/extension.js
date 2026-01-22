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
            // Now fetch project details
            const projectDetails = await serverManager_1.serverManager.httpFetch("/project_details");
            output.appendLine(`Loaded project details: ${JSON.stringify(projectDetails)}`);
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
    });
    context.subscriptions.push(disposable);
}
function deactivate() {
    // In deactivate():
    serverManager_1.serverManager.stopServer();
}
//# sourceMappingURL=extension.js.map