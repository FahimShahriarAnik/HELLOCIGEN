// src/serverManager.ts
import * as vscode from "vscode";
import * as child_process from "child_process";
import * as path from "path";
import fetch from "node-fetch"; // npm install node-fetch @types/node-fetch

const SERVER_PORT = 4000; // // Fixed port for our Express server
const SERVER_URL = `http://localhost:${SERVER_PORT}`; // Base URL for server API
let serverProcess: child_process.ChildProcess | null = null; // Tracks the running Node child process
let serverReady = false; // Tracks if server responded to health check

const output = vscode.window.createOutputChannel("Server Manager");

export class ServerManager {
  async startServer(): Promise<void> {
    if (serverReady || serverProcess) {
      output.appendLine("Server already running");
      return;
    }

    output.appendLine("Starting MongoDB server...");
    const serverPath = path.join(
      __dirname.replace("/out", ""),
      "out/server/server.js"
    ); // Adjust path if your build differs

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

  private async waitForReady(timeoutMs = 30000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
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
