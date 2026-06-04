# MongoDB Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken Atlas Data API persistence layer with a native MongoDB driver; deliver the connection URI through VS Code secret storage (same pattern as the existing OpenAI API key); make persistence failures visible instead of silent.

**Architecture:** Host's forked Express child process holds the URI in memory after the extension sends it via `POST /mongo-uri` during startup. Guests connect to the host's server through Live Share's `shareServer` tunnel and never touch MongoDB credentials. `/health` probes the database so silent failures become loud failures.

**Tech Stack:** TypeScript 5, Node16 module target, mongodb ^7 (native driver, already in deps), express ^5, VS Code Extension API (`context.secrets`), Live Share API.

**Spec:** `docs/superpowers/specs/2026-06-03-mongodb-persistence-design.md`

**Reference for engineer with zero context:**
- Project root: `/Users/fahimshahriar/Github_projects/CIGEN extension/HelloCigen`
- Branch: `action-items-to-mongodb-fix`
- Project conventions: `CLAUDE.md` (be concise, edge cases first, no over-engineering)
- The server is a Node child process forked from the extension host on port 4000; logs appear in the "Server Manager" output channel inside VS Code.
- There is **no automated test suite**. Each task ends with a manual verification step instead of unit tests. Compile success (`npm run compile`) is the closest thing to a unit-level signal.

---

## Task 0: Atlas IAM setup (manual prerequisite — user executes in Atlas console)

**Why this first:** all code tasks need a working URI to test against. Without this, you can't verify anything.

**Files:** none (Atlas web console)

- [ ] **Step 1: Create the custom no-delete role.**

In Atlas: **Database Access → Custom Roles → Add New Custom Role**.

- Custom Role Name: `hellocigen-app-role`
- Database: `session_logs`
- Collection: leave blank (applies to all collections in `session_logs`)
- Privileges (check exactly these three, nothing else):
  - `find`
  - `insert`
  - `update`
- Save.

- [ ] **Step 2: Create the database user.**

**Database Access → Add New Database User**.

- Authentication Method: Password
- Username: `hellocigen-app`
- Password: click "Autogenerate Secure Password", copy it somewhere safe (you'll paste it into `setMongoUri` later)
- Database User Privileges: **Custom Roles** → select `hellocigen-app-role`
- No additional built-in roles.
- Save.

- [ ] **Step 3: Confirm network access allows the world.**

**Network Access → IP Access List**. Confirm `0.0.0.0/0` is present (or add it). Hosts connect from anywhere; the narrow custom role bounds the risk.

- [ ] **Step 4: Construct and save the URI.**

Build:
```
mongodb+srv://hellocigen-app:<PASSWORD>@cluster0.fp3ny34.mongodb.net/session_logs?retryWrites=true&w=majority
```

Save this URI in your password manager / sticky note. You will paste it into VS Code via `helloCigen.setMongoUri` after Task 1 lands.

- [ ] **Step 5: Smoke-test the URI from your laptop before coding.**

Run:
```bash
cd "/Users/fahimshahriar/Github_projects/CIGEN extension/HelloCigen"
node -e "const {MongoClient}=require('mongodb');(async()=>{const c=new MongoClient(process.env.URI);await c.connect();const db=c.db('session_logs');console.log(await db.command({ping:1}));await c.close();})().catch(e=>{console.error(e);process.exit(1)})"
```
Run with `URI='<your-uri-from-step-4>' node -e ...`.

Expected output: `{ ok: 1 }`. If you see authentication failure, the user/role isn't set up right — go back to Step 1.

- [ ] **Step 6: Note existing document counts (verification baseline).**

In Atlas → Browse Collections → `session_logs`. Record current counts of:
- `projectConfigs`: ____ docs
- `sessionLogs`: ____ docs
- `chatMessages`: ____ docs

(Per spec: keep existing data; use these counts as the baseline for the smoke test in Task 12.)

---

## Task 1: Add `setMongoUri` / `clearMongoUri` commands

**Files:**
- Modify: `package.json` (contributes.commands array)
- Modify: `src/extension.ts:258-282` (add command handlers after existing setApiKey/clearApiKey)
- Modify: `src/extension.ts:286-287` (push new commands into subscriptions)

- [ ] **Step 1: Register commands in package.json.**

Read `package.json`. Find the `"contributes": { "commands": [...] }` array (around line 41-66 in the current file). After the existing `helloCigen.clearApiKey` entry, add two new entries so the array looks like:

```json
{
  "command": "helloCigen.clearApiKey",
  "title": "HELLOCIGEN: Clear OpenAI API Key"
},
{
  "command": "helloCigen.setMongoUri",
  "title": "HELLOCIGEN: Set MongoDB URI"
},
{
  "command": "helloCigen.clearMongoUri",
  "title": "HELLOCIGEN: Clear MongoDB URI"
},
{
  "command": "helloCigen.restartServer",
  "title": "HELLOCIGEN: Restart Server"
}
```

- [ ] **Step 2: Add command handlers in extension.ts.**

In `src/extension.ts`, locate the existing `clearApiKeyCmd` block (line 276-282). Immediately after it (before `context.subscriptions.push(disposable);` at line 284), add:

```ts
const setMongoUriCmd = vscode.commands.registerCommand(
  "helloCigen.setMongoUri",
  async () => {
    const uri = await vscode.window.showInputBox({
      prompt: "Enter your MongoDB connection URI (mongodb+srv://...)",
      password: true,
      ignoreFocusOut: true,
      placeHolder: "mongodb+srv://user:pass@cluster.mongodb.net/db?...",
    });

    if (uri) {
      await context.secrets.store("mongodb-uri", uri);
      vscode.window.showInformationMessage(
        "MongoDB URI saved successfully!"
      );
    }
  }
);

const clearMongoUriCmd = vscode.commands.registerCommand(
  "helloCigen.clearMongoUri",
  async () => {
    await context.secrets.delete("mongodb-uri");
    vscode.window.showInformationMessage("MongoDB URI cleared.");
  }
);
```

- [ ] **Step 3: Push new commands into subscriptions.**

In `src/extension.ts`, find the existing `context.subscriptions.push(...)` block at lines 284-287. Add two new lines so it reads:

```ts
context.subscriptions.push(disposable);
context.subscriptions.push(restartServerCmd);
context.subscriptions.push(setApiKeyCmd);
context.subscriptions.push(clearApiKeyCmd);
context.subscriptions.push(setMongoUriCmd);
context.subscriptions.push(clearMongoUriCmd);
```

- [ ] **Step 4: Compile.**

Run: `npm run compile`
Expected: clean exit, no TypeScript errors.

- [ ] **Step 5: Manual verification — run extension, store URI.**

Press F5 in VS Code to launch the Extension Development Host. In the new window:

1. Open Command Palette (Cmd+Shift+P), type "HELLOCIGEN: Set MongoDB URI" — verify command appears.
2. Run it, paste the URI from Task 0 Step 4, press Enter.
3. Verify success toast: "MongoDB URI saved successfully!"
4. Open Command Palette again, run "HELLOCIGEN: Clear MongoDB URI" — verify "MongoDB URI cleared." toast.
5. Re-run "Set MongoDB URI" and store it again (you'll need it for later tasks).

- [ ] **Step 6: Commit.**

```bash
git add package.json src/extension.ts
git commit -m "$(cat <<'EOF'
Add setMongoUri/clearMongoUri commands

Mirrors existing setApiKey/clearApiKey pattern. URI is stored in
VS Code secret storage under key 'mongodb-uri'. Not yet wired into
the server — that lands in subsequent tasks.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Rewrite `src/server/db.ts` with native driver + delete obsolete config files

**Why this groups three changes:** `db.ts` currently imports from `src/utils/config.ts`. Deleting `config.ts` first breaks the build. The new `db.ts` imports from neither config file, so the deletions become safe once the rewrite lands. All three changes must compile as a unit.

**Files:**
- Rewrite: `src/server/db.ts` (full file)
- Delete: `src/utils/config.ts`
- Delete: `src/utils/config.local.ts`

- [ ] **Step 1: Write the new db.ts.**

Replace the entire contents of `src/server/db.ts` with:

```ts
import { MongoClient, Db, Collection, ObjectId } from 'mongodb';
import { ProjectConfigDocument } from '../models/projectConfig';
import { SessionLogDocument } from '../models/sessionLog';

const DB_NAME = 'session_logs';

// URI is set at runtime via setMongoUri() — called from POST /mongo-uri
// after the extension reads it from VS Code secret storage.
let _mongoUri: string | undefined;
let client: MongoClient | undefined;
let dbPromise: Promise<Db> | undefined;
let _connectionLogged = false;

// Returns the host portion of the URI for logging (no credentials).
function uriHost(uri: string): string {
  try {
    const noScheme = uri.replace(/^mongodb(\+srv)?:\/\//, '');
    const afterCreds = noScheme.split('@').pop() ?? noScheme;
    return afterCreds.split('/')[0];
  } catch {
    return '<unparseable>';
  }
}

export function setMongoUri(uri: string): void {
  if (_mongoUri === uri) return; // idempotent
  if (client) {
    client.close().catch(() => {});
  }
  client = undefined;
  dbPromise = undefined;
  _connectionLogged = false;
  _mongoUri = uri;
}

async function getDb(): Promise<Db> {
  if (!_mongoUri) {
    throw new Error('MongoDB URI not configured — POST /mongo-uri before issuing DB calls');
  }
  if (!dbPromise) {
    const uri = _mongoUri;
    client = new MongoClient(uri);
    dbPromise = client.connect()
      .then(c => {
        const db = c.db(DB_NAME);
        if (!_connectionLogged) {
          _connectionLogged = true;
          console.log(`Connected to cluster: ${uriHost(uri)}`);
          console.log(`Database: ${DB_NAME}`);
          console.log(`Collections: projectConfigs, sessionLogs, chatMessages`);
        }
        return db;
      })
      .catch(err => {
        // Reset cache so the next call can retry once the underlying issue resolves
        dbPromise = undefined;
        client = undefined;
        throw err;
      });
  }
  return dbPromise;
}

// Health-check helper — used by GET /health to surface DB reachability.
// Returns true if a ping round-trip succeeds; false otherwise (never throws).
export async function pingDb(): Promise<boolean> {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

// Called from server.ts shutdown handlers — closes the connection pool cleanly.
export async function closeDb(): Promise<void> {
  if (client) {
    await client.close().catch(() => {});
    client = undefined;
    dbPromise = undefined;
  }
}

// Convert {$oid: hex} EJSON shapes used by callers (legacy from the Data API era)
// into native ObjectId values recursively, so the native driver matches them in queries.
function denormalize(v: any): any {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(denormalize);
  if (typeof v === 'object') {
    if (typeof v.$oid === 'string') return new ObjectId(v.$oid);
    const out: any = {};
    for (const [k, val] of Object.entries(v)) out[k] = denormalize(val);
    return out;
  }
  return v;
}

// Convert native ObjectId values in returned docs back to {$oid: hex} so chat
// cursor logic (server.ts:932, 947) and other call sites keep working.
function normalize<T>(doc: any): T {
  if (doc === null || doc === undefined) return doc;
  if (Array.isArray(doc)) return doc.map(normalize) as any;
  if (doc instanceof ObjectId) return { $oid: doc.toHexString() } as any;
  if (typeof doc === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(doc)) out[k] = normalize(v);
    return out;
  }
  return doc;
}

class Col<T> {
  constructor(private name: string) {}

  private async coll(): Promise<Collection<any>> {
    const db = await getDb();
    return db.collection(this.name);
  }

  async insertOne(doc: Partial<T>): Promise<{ insertedId: string }> {
    const c = await this.coll();
    const r = await c.insertOne(denormalize(doc));
    return { insertedId: r.insertedId.toHexString() };
  }

  async findOne(filter: object): Promise<T | null> {
    const c = await this.coll();
    const r = await c.findOne(denormalize(filter));
    return r ? normalize<T>(r) : null;
  }

  find(filter: object) {
    let _sort: object | undefined;
    let _limit: number | undefined;
    const collPromise = this.coll();
    const builder = {
      sort(s: object) { _sort = s; return builder; },
      limit(n: number) { _limit = n; return builder; },
      async toArray(): Promise<T[]> {
        const c = await collPromise;
        let cursor = c.find(denormalize(filter));
        if (_sort) cursor = cursor.sort(_sort as any);
        if (_limit !== undefined) cursor = cursor.limit(_limit);
        const docs = await cursor.toArray();
        return docs.map(d => normalize<T>(d));
      }
    };
    return builder;
  }

  async updateOne(filter: object, update: object): Promise<{ matchedCount: number; modifiedCount: number }> {
    const c = await this.coll();
    const r = await c.updateOne(denormalize(filter), denormalize(update));
    return { matchedCount: r.matchedCount, modifiedCount: r.modifiedCount };
  }

  async replaceOne(filter: object, replacement: object, options?: { upsert?: boolean }) {
    const c = await this.coll();
    return c.replaceOne(denormalize(filter), denormalize(replacement) as any, { upsert: options?.upsert ?? false });
  }

  aggregate(pipeline: object[]) {
    const collPromise = this.coll();
    return {
      async toArray(): Promise<T[]> {
        const c = await collPromise;
        const docs = await c.aggregate(denormalize(pipeline) as object[]).toArray();
        return docs.map(d => normalize<T>(d));
      }
    };
  }
}

export interface ChatMessageDoc {
  // _id is {"$oid": "hexstring"} after normalize(); native ObjectId internally before normalize.
  _id?: any;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  participant_name: string;
  recipient: 'broadcast' | 'ai' | string;
  timestamp: string;
}

export function getProjectConfigCollection() { return new Col<ProjectConfigDocument>('projectConfigs'); }
export function getSessionLogCollection() { return new Col<SessionLogDocument>('sessionLogs'); }
export function getChatMessagesCollection() { return new Col<ChatMessageDoc>('chatMessages'); }
```

- [ ] **Step 2: Delete obsolete config files.**

```bash
cd "/Users/fahimshahriar/Github_projects/CIGEN extension/HelloCigen"
git rm src/utils/config.ts
rm -f src/utils/config.local.ts  # untracked, may or may not exist locally
```

- [ ] **Step 3: Compile.**

Run: `npm run compile`
Expected: clean exit, no TypeScript errors.

If you get `Cannot find module '../utils/config'`, find the offending file (likely a stale reference in `server.ts` or elsewhere) and remove the import. The only legitimate consumer was `db.ts`, which we just rewrote.

- [ ] **Step 4: Commit.**

```bash
git add src/server/db.ts src/utils/config.ts
git commit -m "$(cat <<'EOF'
Rewrite db.ts with native MongoDB driver

Replaces the deprecated Atlas Data API HTTP wrapper. URI is now
provided at runtime via setMongoUri() (called from POST /mongo-uri
in a subsequent commit). Preserves the Col<T> shape and {$oid}
EJSON normalization that server.ts call sites depend on.

Adds pingDb() and closeDb() for health probing and clean shutdown.
Resets the cached connection promise on connect failure so a
transient first-connect error doesn't brick the server. Deletes
the placeholder src/utils/config.ts that caused the original bug.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add `/mongo-uri` and `/alive` endpoints in server.ts

**Why both at once:** the `/alive` endpoint is the first half of the startup-ordering fix. The forked child needs to be reachable for the extension to POST the URI to `/mongo-uri` before the DB-aware `/health` probe runs. Without `/alive`, the extension has no way to tell "process up but URI not yet set" apart from "process not up".

**Files:**
- Modify: `src/server/server.ts:1-9` (imports)
- Modify: `src/server/server.ts:77-79` (add /alive next to /health; /health rewrite lands in Task 4)
- Modify: `src/server/server.ts:706-711` (add /mongo-uri next to /api-key)

- [ ] **Step 1: Import `setMongoUri` from db.ts.**

In `src/server/server.ts` line 3, the current import is:

```ts
import { getProjectConfigCollection, getSessionLogCollection, getChatMessagesCollection, ChatMessageDoc } from "./db";
```

Replace with:

```ts
import { getProjectConfigCollection, getSessionLogCollection, getChatMessagesCollection, ChatMessageDoc, setMongoUri, pingDb, closeDb } from "./db";
```

- [ ] **Step 2: Add `/alive` endpoint.**

In `src/server/server.ts` around line 77, the existing `/health` block is:

```ts
app.get("/health", (_req: Request, res: Response) => {
  res.sendStatus(200);
});
```

Replace with two endpoints (we'll change /health properly in Task 4 — for now leave it as-is so existing waitForReady doesn't break before the serverManager update):

```ts
// Process-level liveness — returns 200 as soon as Express is bound.
// Used by serverManager to know when it's safe to POST /mongo-uri.
app.get("/alive", (_req: Request, res: Response) => {
  res.sendStatus(200);
});

// DB-aware health — updated in a later commit to probe MongoDB.
app.get("/health", (_req: Request, res: Response) => {
  res.sendStatus(200);
});
```

- [ ] **Step 3: Add `/mongo-uri` endpoint.**

In `src/server/server.ts`, find the existing `/api-key` endpoint (line 706-711):

```ts
app.post('/api-key', (req: Request, res: Response) => {
  const { apiKey } = req.body as { apiKey: string };
  if (!apiKey) return res.status(400).json({ ok: false, error: 'apiKey is required' });
  openaiApiKey = apiKey;
  res.json({ ok: true });
});
```

Immediately after it, add:

```ts
// POST /mongo-uri — host-only. Receives the MongoDB connection URI from
// the extension on startup. URI lives in db.ts module-private state until
// the server process exits.
app.post('/mongo-uri', (req: Request, res: Response) => {
  const { uri } = req.body as { uri: string };
  if (!uri) return res.status(400).json({ ok: false, error: 'uri is required' });
  setMongoUri(uri);
  res.json({ ok: true });
});
```

- [ ] **Step 4: Compile.**

Run: `npm run compile`
Expected: clean exit.

- [ ] **Step 5: Manual verification — endpoints exist.**

```bash
# Start the server standalone for a quick smoke test
node out/server/server.js &
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4000/alive
# Expected: 200
curl -s -X POST -H 'Content-Type: application/json' -d '{"uri":"mongodb+srv://test"}' http://127.0.0.1:4000/mongo-uri
# Expected: {"ok":true}
curl -s -X POST -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:4000/mongo-uri
# Expected: {"ok":false,"error":"uri is required"}
kill %1
```

- [ ] **Step 6: Commit.**

```bash
git add src/server/server.ts
git commit -m "$(cat <<'EOF'
Add /alive and /mongo-uri endpoints

/alive is the process-level readiness signal (Express bound).
/mongo-uri receives the URI from the extension's secret store and
hands it to db.ts at runtime. /health is unchanged in this commit
to keep waitForReady working until the serverManager update lands.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Update `serverManager.ts` — two-stage readiness, forward URI between stages

**Why this before the /health change:** the moment /health starts probing MongoDB, `waitForReady` will hang unless the URI has been sent first. This task introduces the two-stage flow (alive → POST /mongo-uri → ready) so the /health change in Task 5 doesn't break startup.

**Files:**
- Modify: `src/serverManager.ts:22-72` (change `startServer()` signature and lifecycle)
- Modify: `src/serverManager.ts:108-127` (split `waitForReady` into `waitForAlive` + `waitForReady`)
- Modify: `src/serverManager.ts:100-106` (`restartServer` needs to accept the URI too)

- [ ] **Step 1: Change `startServer` signature to accept a URI; add waitForAlive; sequence URI forwarding inline.**

In `src/serverManager.ts`, the current `startServer` method (lines 22-72) reads:

```ts
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

  // ... stdout/stderr/close handlers ...

  await this.waitForReady();
  this.restartCount = 0;
}
```

Replace the entire method with this complete version (the stdout/stderr/close handler blocks are unchanged from the original — they're included here in full so you can replace the whole method as one edit):

```ts
async startServer(mongoUri?: string): Promise<void> {
  if (serverReady && serverProcess) {
    output.appendLine("Server already running");
    return;
  }
  if (serverProcess && !serverReady) {
    // Process spawned but not yet healthy — wait instead of re-forking
    await this.waitForAlive();
    if (mongoUri) await this.postMongoUri(mongoUri);
    await this.waitForReady();
    return;
  }

  this.intentionallyStopped = false;
  serverPortConflict = false;
  if (mongoUri) this._lastMongoUri = mongoUri;
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

  await this.waitForAlive();
  if (mongoUri) {
    await this.postMongoUri(mongoUri);
  } else {
    output.appendLine("[WARN] No MongoDB URI provided; DB-backed endpoints will fail until POST /mongo-uri is called");
  }
  await this.waitForReady();
  this.restartCount = 0;
}
```

Note: this version moves the `_lastMongoUri` assignment up next to `serverPortConflict = false` (combined with the field-declaration step below) so the auto-restart path in Step 3 has it cached. The stdout/stderr/close handler logic is unchanged.

- [ ] **Step 2: Add `waitForAlive` and `postMongoUri` methods.**

In `src/serverManager.ts`, the current `waitForReady` (lines 108-127) reads:

```ts
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
```

Replace the entire method with three methods:

```ts
private async waitForAlive(timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (serverPortConflict) {
      throw new Error(`Port ${SERVER_PORT} in use — kill the conflicting process and retry`);
    }
    try {
      const resp = await fetch(`${SERVER_URL}/alive`);
      if (resp.ok) {
        output.appendLine("Server process is alive.");
        return;
      }
    } catch {
      // not bound yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Server process failed to bind within 15s");
}

private async postMongoUri(uri: string): Promise<void> {
  const resp = await fetch(`${SERVER_URL}/mongo-uri`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uri }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Failed to forward MongoDB URI to server: ${resp.status} ${body}`);
  }
  output.appendLine("MongoDB URI forwarded to server.");
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
    } catch {
      // DB not reachable yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Server failed to become healthy within 30s (DB unreachable?)");
}
```

- [ ] **Step 3: Update `restartServer` to accept a URI.**

The current `restartServer` (lines 100-106):

```ts
async restartServer(): Promise<void> {
  output.appendLine("Manual server restart requested");
  this.stopServer();
  this.restartCount = 0;
  await new Promise(resolve => setTimeout(resolve, 500));
  await this.startServer();
}
```

Replace with:

```ts
async restartServer(mongoUri?: string): Promise<void> {
  output.appendLine("Manual server restart requested");
  this.stopServer();
  this.restartCount = 0;
  await new Promise(resolve => setTimeout(resolve, 500));
  await this.startServer(mongoUri);
}
```

Also update the auto-restart path. The existing `attemptAutoRestart` (lines 74-98) calls `this.startServer()` without arguments at line 94. After this change, auto-restart will start the server but never re-forward the URI, leaving it stuck unhealthy. Fix by changing line 94 from `await this.startServer();` to:

```ts
await this.startServer(this._lastMongoUri);
```

Add a private field at the top of the class (after `private intentionallyStopped = false;` on line 20):

```ts
private _lastMongoUri: string | undefined;
```

(The assignment `if (mongoUri) this._lastMongoUri = mongoUri;` is already included inside the `startServer` replacement in Step 1 — no extra edit needed inside startServer.)

- [ ] **Step 4: Compile.**

Run: `npm run compile`
Expected: clean exit.

- [ ] **Step 5: Commit.**

```bash
git add src/serverManager.ts
git commit -m "$(cat <<'EOF'
serverManager: two-stage readiness + URI forwarding

Splits server-up detection into /alive (process bound) and /health
(DB reachable). Between stages, forwards the MongoDB URI to the
forked child via POST /mongo-uri. Caches the URI so auto-restart
after a crash can recover without the extension re-prompting.

Lays the groundwork for the next commit, which changes /health to
actually probe MongoDB.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Make `/health` actually probe MongoDB

**Files:**
- Modify: `src/server/server.ts:77-86` (the /health block from Task 3)

- [ ] **Step 1: Rewrite /health to probe MongoDB.**

In `src/server/server.ts`, the current /health from Task 3 is:

```ts
// DB-aware health — updated in a later commit to probe MongoDB.
app.get("/health", (_req: Request, res: Response) => {
  res.sendStatus(200);
});
```

Replace with:

```ts
// DB-aware health probe. Returns 200 only when MongoDB is reachable.
// Used by serverManager.waitForReady; failure here means the extension
// will refuse to start (fail-loud over silent persistence loss).
app.get("/health", async (_req: Request, res: Response) => {
  const ok = await pingDb();
  if (ok) {
    res.json({ ok: true, dbReachable: true, db: 'session_logs' });
  } else {
    res.status(503).json({ ok: false, dbReachable: false, error: 'MongoDB ping failed (URI not set or cluster unreachable)' });
  }
});
```

- [ ] **Step 2: Compile.**

Run: `npm run compile`
Expected: clean exit.

- [ ] **Step 3: Manual verification — /health behavior.**

```bash
# Start server fresh, no URI set
node out/server/server.js &
sleep 1
curl -s -w "\nHTTP %{http_code}\n" http://127.0.0.1:4000/health
# Expected: HTTP 503, body contains "dbReachable":false
curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"uri\":\"$YOUR_REAL_URI\"}" http://127.0.0.1:4000/mongo-uri
# (paste the URI from Task 0 Step 4)
sleep 2
curl -s -w "\nHTTP %{http_code}\n" http://127.0.0.1:4000/health
# Expected: HTTP 200, body contains "dbReachable":true
kill %1
```

If the second curl returns 503, check: (a) the URI is correct, (b) network access in Atlas allows your IP, (c) you're online.

- [ ] **Step 4: Commit.**

```bash
git add src/server/server.ts
git commit -m "$(cat <<'EOF'
/health: probe MongoDB instead of always returning 200

Returns 200 + dbReachable:true only when db.command({ping:1})
succeeds. Returns 503 otherwise. This makes Atlas unreachability
visible to serverManager.waitForReady, which now refuses to mark
the extension ready until the cluster is actually serving requests.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Close MongoClient on server shutdown

**Files:**
- Modify: `src/server/server.ts:1163-1176` (existing shutdown handlers)

- [ ] **Step 1: Make shutdown handlers async and close the DB.**

In `src/server/server.ts`, the current shutdown block (lines 1163-1176) reads:

```ts
// Parent (extension host) gone → exit so the port is freed and we don't orphan.
process.on('disconnect', () => {
  console.log('Parent disconnected, shutting down');
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
});

const shutdown = (sig: string) => {
  console.log(`Received ${sig}, shutting down`);
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
```

Replace with:

```ts
// Parent (extension host) gone → exit so the port is freed and we don't orphan.
process.on('disconnect', () => {
  console.log('Parent disconnected, shutting down');
  closeDb().finally(() => {
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
});

const shutdown = (sig: string) => {
  console.log(`Received ${sig}, shutting down`);
  closeDb().finally(() => {
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  });
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
```

- [ ] **Step 2: Compile.**

Run: `npm run compile`
Expected: clean exit.

- [ ] **Step 3: Commit.**

```bash
git add src/server/server.ts
git commit -m "$(cat <<'EOF'
Close MongoClient on server shutdown

Prevents leaked Atlas connections when the extension host exits
or the server is killed via SIGINT/SIGTERM.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Wire MongoDB URI pre-flight in `extension.ts:helloCigen.start`

**Files:**
- Modify: `src/extension.ts:108-170` (the `helloCigen.start` command, around the existing API key pre-flight + server start)

- [ ] **Step 1: Add MongoDB URI pre-flight after the API key pre-flight.**

In `src/extension.ts`, the existing API key pre-flight runs at lines 119-134:

```ts
// API key pre-flight check (host only — guests never see this)
let apiKey = await context.secrets.get('openai-api-key');
if (!apiKey && process.env.OPENAI_API_KEY) {
  // Auto-store env var in secrets
  await context.secrets.store('openai-api-key', process.env.OPENAI_API_KEY);
  apiKey = process.env.OPENAI_API_KEY;
}
if (!apiKey) {
  const action = await vscode.window.showWarningMessage(
    "No OpenAI API key set. AI features won't work.",
    "Set API Key"
  );
  if (action === "Set API Key") {
    await vscode.commands.executeCommand("helloCigen.setApiKey");
  }
}
```

Immediately after that block (before line 136 `const liveShare = await vsls.getApi();`), add:

```ts
// MongoDB URI pre-flight (host only — guests connect via shareServer)
let mongoUri = await context.secrets.get('mongodb-uri');
if (!mongoUri) {
  const action = await vscode.window.showWarningMessage(
    "MongoDB URI not set. Session persistence cannot work without it.",
    "Set MongoDB URI",
    "Cancel"
  );
  if (action === "Set MongoDB URI") {
    await vscode.commands.executeCommand("helloCigen.setMongoUri");
    mongoUri = await context.secrets.get('mongodb-uri');
  }
  if (!mongoUri) {
    vscode.window.showErrorMessage("Cannot start session: MongoDB URI is required.");
    return;
  }
}
```

- [ ] **Step 2: Pass the URI to `serverManager.startServer`.**

In the same file, find the existing server startup block (lines 152-170 in the current file):

```ts
/* ---------------- MONGO SERVER INITIALIZATION ---------------- */
let projectDetails: any;
try {
  await serverManager.startServer();

  // Forward API key to server for server-side AI chat
  if (apiKey) {
    await serverManager.httpFetch('/api-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey })
    }).catch(() => {}); // Non-critical
  }

  projectDetails = await serverManager.httpFetch("/project_details");
  output.appendLine(`Loaded project details: ${JSON.stringify(projectDetails)}`);
} catch (err) {
  output.appendLine(`Server error: ${err}`);
}
```

Replace with:

```ts
/* ---------------- MONGO SERVER INITIALIZATION ---------------- */
let projectDetails: any;
try {
  await serverManager.startServer(mongoUri);

  // Forward API key to server for server-side AI chat
  if (apiKey) {
    await serverManager.httpFetch('/api-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey })
    }).catch(err => output.appendLine(`API key forward failed: ${err}`));
  }

  projectDetails = await serverManager.httpFetch("/project_details");
  output.appendLine(`Loaded project details: ${JSON.stringify(projectDetails)}`);
} catch (err) {
  output.appendLine(`Server error: ${err}`);
  vscode.window.showErrorMessage(`Server error: ${err}`);
  return;
}
```

Two changes here:
1. `startServer(mongoUri)` — pass the URI from the pre-flight.
2. The previously-silent `.catch(() => {})` on the API key forward (line 163) is now `.catch(err => output.appendLine(...))` — failures are logged, not swallowed.
3. Server errors now surface as a user-visible toast AND abort the start flow (previously the code continued past a server failure and tried to use undefined `projectDetails` later).

- [ ] **Step 3: Compile.**

Run: `npm run compile`
Expected: clean exit.

- [ ] **Step 4: Commit.**

```bash
git add src/extension.ts
git commit -m "$(cat <<'EOF'
extension.ts: wire MongoDB URI pre-flight into helloCigen.start

Reads URI from VS Code secret storage; prompts host to set it if
missing; passes to serverManager.startServer so the URI lands
before /health probes the DB. Also unswallows the API key forward
catch and surfaces server-start failures as a user-visible error.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Wire MongoDB URI pre-flight in `sessionDashboard.ts:createSession`

**Why a separate task:** `sessionDashboard.ts` has its own session-start path (line 870+) that starts the server independently from `helloCigen.start`. Easy to miss; spec called this out as an open risk.

**Files:**
- Modify: `src/ui/sessionDashboard.ts:870-917` (createSession flow)

- [ ] **Step 1: Read `sessionDashboard.ts` lines 860-920 to confirm current layout.**

```bash
sed -n '860,920p' "src/ui/sessionDashboard.ts"
```

Confirm the current ordering is roughly: API key pre-flight → `liveShare.share()` → `serverManager.startServer()` → API key POST → `liveShare.shareServer()` → `serverManager.httpFetch('/project_details')`.

- [ ] **Step 2: Add MongoDB URI pre-flight before `liveShare.share()`.**

The existing API key pre-flight in `sessionDashboard.ts` is around lines 874-886 (matches the structure of `extension.ts:119-134`). Immediately after the API key pre-flight ends and before `const liveShare = await vsls.getApi();`, add:

```ts
// MongoDB URI pre-flight (host only — guests connect via shareServer)
let mongoUri = await this.context.secrets.get('mongodb-uri');
if (!mongoUri) {
  const action = await vscode.window.showWarningMessage(
    "MongoDB URI not set. Session persistence cannot work without it.",
    "Set MongoDB URI",
    "Cancel"
  );
  if (action === "Set MongoDB URI") {
    await vscode.commands.executeCommand("helloCigen.setMongoUri");
    mongoUri = await this.context.secrets.get('mongodb-uri');
  }
  if (!mongoUri) {
    this.postStartStatus(false, "MongoDB URI is required to start a session.");
    return;
  }
}
```

(Note: this file accesses VS Code context via `this.context` because it's inside the `SessionDashboard` class. If `this.context` isn't already a field, verify the constructor — the file does store the context based on the spec; check the class definition near the top.)

- [ ] **Step 3: Pass the URI to `serverManager.startServer`.**

Find the existing `await serverManager.startServer();` at line 896 and change to:

```ts
await serverManager.startServer(mongoUri);
```

Also check line 946 (the second `serverManager.startServer()` call in `loadSessions`) — it's behind a guard that returns for guests, so for hosts that path also needs the URI. Change line 946 to:

```ts
const uri = await this.context.secrets.get('mongodb-uri');
if (!uri) {
  this.view?.webview.postMessage({ type: "sessions", sessions: [] });
  return;
}
await serverManager.startServer(uri);
```

(If the host hasn't set the URI yet, `loadSessions` silently shows no sessions instead of triggering a prompt. Prompt-on-create-session is the right UX trigger; prompt-on-dashboard-load would be annoying.)

- [ ] **Step 4: Compile.**

Run: `npm run compile`
Expected: clean exit. If you get `this.context` errors, locate where `SessionDashboard` stores its `vscode.ExtensionContext` and adjust accordingly.

- [ ] **Step 5: Commit.**

```bash
git add src/ui/sessionDashboard.ts
git commit -m "$(cat <<'EOF'
sessionDashboard: wire MongoDB URI pre-flight into createSession

Mirror of the extension.ts:helloCigen.start change. Also gates
loadSessions on having a URI so the dashboard doesn't trigger a
500 by hitting /sessions before the URI is configured.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Surface silent error swallows in `taskTrackerProvider.ts`

**Files:**
- Modify: `src/ui/taskTrackerProvider.ts:201-203` (`_triggerCodeReview` catch)
- Modify: `src/ui/taskTrackerProvider.ts:206-219` (`_persistDivisions`)

- [ ] **Step 1: Replace `_persistDivisions` body to check resp.ok and surface failures.**

In `src/ui/taskTrackerProvider.ts`, the current method (lines 206-219):

```ts
private async _persistDivisions(): Promise<void> {
  if (!this._sessionId) return;
  this._skipNextPoll = true;
  this._lastFingerprint = divisionsFingerprint(this._divisions);
  try {
    await fetch(`${SERVER_URL}/sessions/${this._sessionId}/divisions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ division_of_work: this._divisions })
    });
  } catch {
    // Non-critical — local state is already updated
  }
}
```

Replace with:

```ts
private async _persistDivisions(): Promise<void> {
  if (!this._sessionId) return;
  this._skipNextPoll = true;
  this._lastFingerprint = divisionsFingerprint(this._divisions);
  try {
    const resp = await fetch(`${SERVER_URL}/sessions/${this._sessionId}/divisions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ division_of_work: this._divisions })
    });
    if (!resp.ok) {
      const body = await resp.text();
      vscode.window.showWarningMessage(`Task tracker failed to sync to server: HTTP ${resp.status} ${body}`);
    }
  } catch (err) {
    vscode.window.showWarningMessage(`Task tracker failed to sync to server: ${err}`);
  }
}
```

If `vscode` isn't already imported at the top of `taskTrackerProvider.ts`, add `import * as vscode from "vscode";`.

- [ ] **Step 2: Replace the `_triggerCodeReview` catch.**

The current catch block at lines 201-203 reads:

```ts
} catch {
  // Non-critical
}
```

This is inside the `_triggerCodeReview` method. Read lines 180-205 first to see the full method, then replace just the catch with:

```ts
} catch (err) {
  console.error('[taskTrackerProvider] code review trigger failed (non-critical):', err);
}
```

(`console.error` here surfaces to the extension host log, which the user can view via "Developer: Show Logs..." → "Extension Host". Not a user-facing toast because code-review failures genuinely are non-critical — the AI ack on task completion is nice-to-have.)

- [ ] **Step 3: Compile.**

Run: `npm run compile`
Expected: clean exit.

- [ ] **Step 4: Commit.**

```bash
git add src/ui/taskTrackerProvider.ts
git commit -m "$(cat <<'EOF'
taskTrackerProvider: surface persist failures, log code-review errors

_persistDivisions now checks resp.ok and shows a user warning on
both throws and non-2xx responses. This is the path that previously
diverged the local tracker from MongoDB without any user signal.

_triggerCodeReview catch logs to console (developer-visible) but
stays silent for the user — code review is a nice-to-have, not
on the critical persistence path.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: End-to-end manual verification (Steps 1-5 of spec Verification Plan)

**Goal:** prove the plan works against the real Atlas cluster. This is the final acceptance test before declaring the work done.

**Files:** none (manual testing)

- [ ] **Step 1 — Cluster/DB visibility.**

Press F5 in VS Code (Extension Development Host launches). In the new window:

1. Open Command Palette → "HELLOCIGEN: Set MongoDB URI" → paste your URI from Task 0 Step 4.
2. Open Command Palette → "HELLOCIGEN: Create a Live Share Session".
3. Open the "Server Manager" output channel (View → Output → select "Server Manager" from dropdown).
4. Look for these three lines (printed once on first DB call):
   ```
   Connected to cluster: cluster0.fp3ny34.mongodb.net
   Database: session_logs
   Collections: projectConfigs, sessionLogs, chatMessages
   ```
5. Open the Atlas dashboard in your browser. Navigate to your project → Clusters → Cluster0 → Browse Collections.
6. **Pass criterion:** the cluster hostname in your Atlas browser URL matches `cluster0.fp3ny34.mongodb.net` from the output channel. `session_logs` DB visible with the three collections.

- [ ] **Step 2 — Write smoke tests.**

Continuing from Step 1's running session:

1. Complete the host wizard. Take note of the `session_id` printed in the output channel ("New session #1 for ...").
2. In Atlas → `session_logs.sessionLogs` → refresh. **Pass:** one new doc visible, `session_id` matches, doc count = your Task 0 Step 6 baseline + 1.
3. Open the dev chat panel, send a message: "test message". In Atlas → `session_logs.chatMessages` → refresh. **Pass:** doc visible with `content: "test message"`.
4. In the chat, type `/redistribute add a unit test for the login flow`. Wait for the proposal to appear. In Atlas → `session_logs.sessionLogs` → click the session doc → expand. **Pass:** `pending_proposal` field present with `new_requirement: "add a unit test for the login flow"`.

- [ ] **Step 3 — Failure-mode verification.**

1. Disable WiFi on your Mac.
2. In the running extension, toggle any task in the Task Tracker. **Pass:** a yellow warning toast appears with text starting `Task tracker failed to sync to server: ...`. (Before this work, this was silent.)
3. In Terminal: `curl -s -w "\n%{http_code}\n" http://127.0.0.1:4000/health`. **Pass:** `503` with body containing `dbReachable:false`.
4. Re-enable WiFi. Wait 10s for the driver's reconnect. Re-run the curl. **Pass:** `200` with `dbReachable:true`.

- [ ] **Step 4 — Custom-role enforcement (proves IAM is tight).**

Either use Atlas's web shell (Connect → Shell → Web) or `mongosh` locally:

```bash
mongosh "$YOUR_URI"
```

Then in the shell:

```js
use session_logs
db.sessionLogs.deleteOne({})
// Expected: MongoServerError: not authorized on session_logs to execute command
db.adminCommand({ listDatabases: 1 })
// Expected: error or only session_logs visible
db.sessionLogs.dropIndex("any_index")
// Expected: not authorized error
```

**Pass:** all three operations rejected by Atlas due to insufficient permissions.

- [ ] **Step 5 — Distribution test (VSIX cleanliness).**

```bash
cd "/Users/fahimshahriar/Github_projects/CIGEN extension/HelloCigen"
npm run compile
npx @vscode/vsce package
```

Note the produced filename (e.g., `hello-cigen-2.0.4.vsix`).

```bash
unzip -p hello-cigen-*.vsix extension/out/server/db.js | grep -c 'mongodb+srv'
```

**Pass:** prints `0` (no URI is baked into the shipped artifact).

```bash
unzip -p hello-cigen-*.vsix extension/out/server/db.js | grep -c '_mongoUri'
```

**Pass:** prints a small positive number (e.g., `4` or `5`) — confirms the secret-storage glue is present, even though no actual URI is.

Optional install test:

```bash
code --install-extension hello-cigen-*.vsix
```

In a fresh VS Code window, run "HELLOCIGEN: Create a Live Share Session" *without* setting the URI first. **Pass:** the warning prompt appears asking to set the URI. Set it. Session proceeds.

- [ ] **Step 6: Final commit (just the plan completion + any docs you want to add).**

If the verification reveals any code adjustments needed, fix them in a small commit. Otherwise:

```bash
git log --oneline action-items-to-mongodb-fix ^main
```

Confirm the commit sequence reflects each task above as a separate commit. The branch is ready for PR review.

---

## Done

All ten tasks complete = MongoDB persistence is restored, durable, and visibly observable when broken. The original symptom ("can't find docs in Atlas dashboard") is permanently solved by Step 1's cluster/DB logging.
