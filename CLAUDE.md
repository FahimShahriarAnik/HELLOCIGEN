# HelloCigen — CLAUDE.md

## Behavior and Style Guidelines
- **Be extremely concise:** Always provide the shortest possible answer that is still accurate.
- **Minimize output size:** Only show changed code blocks (diffs) rather than full files.
- **No conversational filler:** Skip greetings, pleasantries, and unnecessary explanations.
- **Bullet points:** Default to 3-5 bullet points for summaries.

## Project Overview

**HelloCigen** is a VS Code extension that integrates collaborative AI-powered code generation with VS Live Share. It helps development teams:
- Create and manage Live Share collaborative sessions
- Track session activities and participant engagement via MongoDB
- Use OpenAI GPT-4 to generate task breakdowns and provide project-aware AI assistance
- Divide projects into parallel-developable chunks for team members

---

## Architecture

```
User Commands (VS Code)
        ↓
extension.ts  (activation & command handlers)
        ↓
   ┌────┴────┐
   ↓         ↓
serverManager.ts   UI Views (webview panels)
   ↓                    ↓
Express server      chatManager2.ts
   ↓                    ↓
MongoDB          OpenAI GPT-4 API
(session_logs, projectConfigs)
```

### Key Source Files

| File | Role |
|------|------|
| `src/extension.ts` | Extension entry point; registers all commands and providers |
| `src/serverManager.ts` | Spawns/manages the Express server as a child process |
| `src/server/server.ts` | Express REST API (project_details, sessions endpoints) |
| `src/server/db.ts` | MongoDB connection; collections: `projectConfigs`, `sessionLogs` |
| `src/models/sessionLog.ts` | `SessionLogDocument`, `Participant`, `FileTrackingEntry` types |
| `src/models/projectConfig.ts` | `Project` and `ProjectConfigDocument` types |
| `src/ui/chatManager2.ts` | **Active** project-aware AI chat with GPT-4 (new UI) |
| `src/ui/chatManager.ts` | Legacy basic chat (without project awareness) |
| `src/ui/initialSessionView.ts` | Welcome/initial session webview |
| `src/ui/sidebarView.ts` | Sidebar panel provider |
| `src/utils/session_log_utils.ts` | Helpers for creating/patching session logs |
| `src/utils/liveshareHelpers.ts` | Enums for Live Share Role and Access levels |

---

## Commands

Registered commands (prefix `helloCigen.`):
- `launch` — Opens the extension
- `start` — Creates a Live Share session
- `openChat2` — Opens the project-aware AI chat panel
- `setApiKey` — Stores OpenAI API key in VS Code secrets

---

## Dependencies

- **express ^5** — REST server (runs as child process on port 4000)
- **mongodb ^7** — Atlas persistence (URI in `src/utils/config.local.ts`, git-ignored)
- **openai ^6** — GPT-4 API client
- **vsls ^0.3** — VS Live Share API
- **node-fetch ^2** — HTTP client for server calls
- **TypeScript 5 / Node16 module** — Build target `out/`

---

## Development Workflow

```bash
# Build
npm run compile        # tsc -p ./

# Watch mode
npm run watch          # tsc -watch -p ./

# Run extension
# Press F5 in VS Code (uses .vscode/launch.json)
```

Output goes to `out/` (git-ignored). Extension main entry: `./out/extension.js`.

---

## Configuration

- **`src/utils/config.local.ts`** — MongoDB Atlas URI (NOT committed; excluded by `.gitignore`)
- **OpenAI API key** — Stored in VS Code's secrets manager via `context.secrets.store()`
- **Server port** — Fixed at `4000` (localhost only)

---

## Data Flow

### Session Creation
1. User runs "Create Live Share Session"
2. Extension starts Express server (child process)
3. Fetches project config from MongoDB
4. Waits for peers to join (30s)
5. Creates `SessionLogDocument` with participants and stores in MongoDB

### AI Chat (chatManager2)
1. User selects project from dropdown
2. Clicks "Divide into 3 Chunks"
3. GPT-4 returns task breakdown JSON
4. User continues chat for refinements
5. Active editor file content can be injected as context

---

## Git Branches

- `main` — Stable branch (use for PRs)
- `integrating_openai_fahim` — Current active branch

## Notes

- `src/ui/chatManager2.ts` is the **new, active** chat implementation; `src/ui/chatManager.ts` is the legacy version
- Chat history is capped at 40 messages in chatManager2
- System prompt positions GPT-4 as "CoGEN Project Manager"