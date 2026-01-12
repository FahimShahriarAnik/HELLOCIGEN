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
const chatManager_1 = require("./chatManager");
function activate(context) {
    const output = vscode.window.createOutputChannel("HELLOCIGEN");
    const chatManager = new chatManager_1.ChatManager(context);
    const joinSessionCmd = vscode.commands.registerCommand("helloCigen.join", () => {
        vscode.window.showInformationMessage("Join session command executed.");
    });
    const startSessionCmd = vscode.commands.registerCommand("helloCigen.start", async () => {
        const liveShare = await vsls.getApi();
        if (!liveShare) {
            vscode.window.showErrorMessage("Live Share extension is not available or not enabled.");
            return;
        }
        else {
            vscode.window.showInformationMessage("Live Share extension is available.");
        }
        // 1. Start (or attach to) session
        await liveShare.share();
        // 2. Observe session lifecycle
        liveShare.onDidChangeSession(() => {
            console.log("Session changed:", liveShare.session);
        });
        // 3. Observe peers
        liveShare.onDidChangePeers(() => {
            console.log("Peers:", [...liveShare.peers.values()]);
        });
        // 4. Host-only: expose a test service
        if (liveShare.session?.role === vsls.Role.Host) {
            const svc = await liveShare.shareService("helloCigen.test");
            if (!svc)
                return;
            svc.onNotify("testNotify", (data) => {
                console.log("Service notify:", data);
            });
        }
    });
    const openChatCmd = vscode.commands.registerCommand("helloCigen.openChat", () => {
        chatManager.openChat();
    });
    context.subscriptions.push(startSessionCmd);
    context.subscriptions.push(joinSessionCmd);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map