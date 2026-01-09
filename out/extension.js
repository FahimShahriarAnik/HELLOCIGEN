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
const fileStateMap = new Map();
function activate(context) {
    const output = vscode.window.createOutputChannel("HELLOCIGEN");
    output.show(true);
    /* ---------------- Json to keep track of file changes and fuction to write to that ---------------- */
    const snapshotUri = vscode.Uri.joinPath(context.globalStorageUri, "file_state.json");
    async function writeSnapshot() {
        const obj = Object.fromEntries(fileStateMap);
        await vscode.workspace.fs.writeFile(snapshotUri, Buffer.from(JSON.stringify(obj, null, 2)));
    }
    const snapshotTimer = setInterval(writeSnapshot, 30_000);
    context.subscriptions.push({ dispose: () => clearInterval(snapshotTimer) });
    const disposable = vscode.commands.registerCommand("helloCigen.start", async () => {
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
        /* ==========================================================
           FILE-WISE EDITOR + CONTENT TRACKING (CORE LOGIC)
           ==========================================================
           This listens to ALL text edits, attributes them to a peer
           (if Live Share edit), and stores ONLY the latest state.
        =========================================================== */
        const textChangeDisposable = vscode.workspace.onDidChangeTextDocument(async (e) => {
            // Ignore non-workspace files (output panel, virtual docs, etc.)
            if (e.document.uri.scheme !== "file")
                return;
            let editorLabel = "Local user";
            let peerNumber = null;
            try {
                // Live Share API: who caused THIS edit
                const peer = await liveShare.getPeerForTextDocumentChangeEvent(e);
                if (peer) {
                    editorLabel =
                        peer.user?.displayName ?? `Peer ${peer.peerNumber}`;
                    peerNumber = peer.peerNumber;
                }
            }
            catch {
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
            output.appendLine(`[TRACK] ${editorLabel} → ${e.document.uri.fsPath}`);
        });
        context.subscriptions.push(textChangeDisposable);
    });
    context.subscriptions.push(disposable);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map