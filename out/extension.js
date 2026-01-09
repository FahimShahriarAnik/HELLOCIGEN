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
function activate(context) {
    const output = vscode.window.createOutputChannel("HELLOCIGEN");
    output.show(true);
    const disposable = vscode.commands.registerCommand("helloCigen.start", async () => {
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
            const msg = `Session ID: ${s.id}\n` +
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
                output.appendLine(`Peer ${p.peerNumber} | Role: ${p.role} | Access: ${p.access} | User: ${p.user?.displayName ?? "unknown"}`);
            });
            vscode.window.showInformationMessage("Live Share peers changed");
        };
        logPeers();
        liveShare.onDidChangePeers(() => {
            output.appendLine("onDidChangePeers fired");
            logPeers();
            logSession();
        });
    });
    context.subscriptions.push(disposable);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map