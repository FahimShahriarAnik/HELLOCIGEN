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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.serverManager = exports.ServerManager = void 0;
// src/serverManager.ts
const vscode = __importStar(require("vscode"));
const child_process = __importStar(require("child_process"));
const path = __importStar(require("path"));
const node_fetch_1 = __importDefault(require("node-fetch")); // npm install node-fetch @types/node-fetch
const SERVER_PORT = 4000; // // Fixed port for our Express server
const SERVER_URL = `http://localhost:${SERVER_PORT}`; // Base URL for server API
let serverProcess = null; // Tracks the running Node child process
let serverReady = false; // Tracks if server responded to health check
const output = vscode.window.createOutputChannel("Server Manager");
class ServerManager {
    async startServer() {
        if (serverReady || serverProcess) {
            output.appendLine("Server already running");
            return;
        }
        output.appendLine("Starting MongoDB server...");
        const serverPath = path.join(__dirname.replace("/out", ""), "out/server/server.js"); // Adjust path if your build differs
        // silent:true to capture output
        serverProcess = child_process.fork(serverPath, [], { silent: true });
        serverProcess.stdout?.on("data", (data) => {
            const msg = data.toString();
            output.appendLine(`[SERVER] ${msg}`);
        });
        serverProcess.stderr?.on("data", (data) => {
            const msg = data.toString();
            output.appendLine(`[SERVER ERROR] ${msg}`);
        });
        serverProcess.on("close", (code) => {
            output.appendLine(`Server closed with code ${code}`);
            serverReady = false;
            serverProcess = null;
        });
        // Wait for server to be ready (poll health check)
        await this.waitForReady();
    }
    async waitForReady(timeoutMs = 30000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            try {
                const resp = await (0, node_fetch_1.default)(`${SERVER_URL}/sessions/test`); // Use a non-existent route; 404 means server is up
                if (resp.status === 404) {
                    serverReady = true;
                    output.appendLine("Server is ready!");
                    return;
                }
            }
            catch (err) {
                // Server not ready yet
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
        throw new Error("Server failed to start within 30s");
    }
    async httpFetch(endpoint) {
        if (!serverReady) {
            throw new Error("Server not ready");
        }
        const resp = await (0, node_fetch_1.default)(`${SERVER_URL}${endpoint}`);
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
        }
        return resp.json();
    }
    stopServer() {
        if (serverProcess) {
            serverProcess.kill();
            serverProcess = null;
            serverReady = false;
            output.appendLine("Server stopped");
        }
    }
    isReady() {
        return serverReady;
    }
}
exports.ServerManager = ServerManager;
// Global singleton
exports.serverManager = new ServerManager();
//# sourceMappingURL=serverManager.js.map