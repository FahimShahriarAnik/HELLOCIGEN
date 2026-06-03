// src/serverManager.ts
import * as vscode from "vscode";
import * as child_process from "child_process";
import * as path from "path";
import fetch from "node-fetch"; // npm install node-fetch @types/node-fetch

const SERVER_PORT = 4000;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
let serverProcess: child_process.ChildProcess | null = null;
let serverReady = false;
let serverPortConflict = false;

const MAX_RESTART_ATTEMPTS = 3;
const RESTART_DELAY_MS = 2000;

const output = vscode.window.createOutputChannel("Server Manager");

export class ServerManager {
  private restartCount = 0;
  private intentionallyStopped = false;

  async startServer(): Promise<void> {
    if (serverReady && serverProcess) {
      output.appendLine("Server already running");
      return;
    }
    if (serverProcess && !serverReady) {
      // Process spawned but not yet healthy — wait instead of re-forking
      await this.waitForReady();
      return;
    }

    this.intentionallyStopped = false;
    serverPortConflict = false;
    output.appendLine("Starting MongoDB server...");
    const serverPath = path.join(__dirname, "server", "server.js");

    serverProcess = child_process.fork(serverPath, [], { silent: true });

    serverProcess.stdout?.on("data", (data) => {
      const msg = data.toString();
      output.appendLine(`[SERVER] ${msg}`);
    });

    serverProcess.stderr?.on("data", (data) => {
      const msg = data.toString();
      output.appendLine(`[SERVER ERROR] ${msg}`);

      // Detect port conflict — set flag so waitForReady can bail fast
      if (msg.includes("EADDRINUSE")) {
        serverPortConflict = true;
        vscode.window.showErrorMessage(
          `Port ${SERVER_PORT} is already in use. Close the conflicting process or change the server port.`,
          "OK"
        );
      }
    });

    serverProcess.on("close", (code) => {
      output.appendLine(`Server closed with code ${code}`);
      serverReady = false;
      serverProcess = null;

      // Auto-restart on unexpected exit (not intentionally stopped)
      if (!this.intentionallyStopped && code !== 0) {
        this.attemptAutoRestart();
      }
    });

    await this.waitForReady();
    this.restartCount = 0; // Reset on successful start
  }

  private async attemptAutoRestart(): Promise<void> {
    if (this.restartCount >= MAX_RESTART_ATTEMPTS) {
      const action = await vscode.window.showErrorMessage(
        "Server crashed and auto-restart failed after 3 attempts.",
        "Restart Server"
      );
      if (action === "Restart Server") {
        this.restartCount = 0;
        this.startServer();
      }
      return;
    }

    this.restartCount++;
    output.appendLine(`Auto-restart attempt ${this.restartCount}/${MAX_RESTART_ATTEMPTS}...`);
    vscode.window.showWarningMessage(`Server disconnected, reconnecting... (attempt ${this.restartCount}/${MAX_RESTART_ATTEMPTS})`);

    await new Promise(resolve => setTimeout(resolve, RESTART_DELAY_MS));

    try {
      await this.startServer();
    } catch (err) {
      output.appendLine(`Auto-restart failed: ${err}`);
    }
  }

  async restartServer(): Promise<void> {
    output.appendLine("Manual server restart requested");
    this.stopServer();
    this.restartCount = 0;
    await new Promise(resolve => setTimeout(resolve, 500));
    await this.startServer();
  }

  private async waitForReady(timeoutMs = 30000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (serverPortConflict) {
        throw new Error(`Port ${SERVER_PORT} in use — kill the conflicting process and retry`);
      }
      try {
        const resp = await fetch(`${SERVER_URL}/health`);
        if (resp.ok) {
          serverReady = true;
          output.appendLine("Server is ready!");
          return;
        }
      } catch (err) {
        // Server not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("Server failed to start within 30s");
  }

  async httpFetch(endpoint: string, options: import("node-fetch").RequestInit = {}): Promise<any> {
    if (!serverReady) {
      throw new Error("Server not ready");
    }
    const resp = await fetch(`${SERVER_URL}${endpoint}`, options);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    }
    return resp.json();
  }

  stopServer(): void {
    this.intentionallyStopped = true;
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
      serverReady = false;
      output.appendLine("Server stopped");
    }
  }

  isReady(): boolean {
    return serverReady;
  }
}

// Global singleton
export const serverManager = new ServerManager();
