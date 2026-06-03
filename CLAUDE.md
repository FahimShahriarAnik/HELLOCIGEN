# HelloCigen — CLAUDE.md

## Behavior and Style Guidelines
- **Be extremely concise:** Always provide the shortest possible answer that is still accurate.
- **Minimize output size:** Only show changed code blocks (diffs) rather than full files.
- **No conversational filler:** Skip greetings, pleasantries, and unnecessary explanations.
- **Bullet points:** Default to 3-5 bullet points for summaries.
- **Think about edge cases:** Always think about the implication of changes being made and point out at the start.

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
Express server      devChatPanel.ts
   ↓                    ↓
MongoDB          OpenAI GPT-4 API (via @AI mention)
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
| `src/ui/devChatPanel.ts` | Unified team chat panel; @AI triggers server-side GPT-4 |
| `src/ui/guestOnboardingView.ts` | Guest profile form + polling for session state transitions |
| `src/ui/guestDevelopmentView.ts` | Guest post-division view showing assigned tasks |
| `src/ui/taskTrackerProvider.ts` | Sidebar task tracker (singleton, shared by host & guests) |
| `src/ui/initialSessionView.ts` | Welcome/initial session webview |
| `src/utils/aiUtils.ts` | `generateDivisionOfWork` (initial) + `generateRedistribution` / `validateRedistribution` (mid-session re-plan) |
| `src/utils/session_log_utils.ts` | Helpers for creating/patching session logs |
| `src/utils/liveshareHelpers.ts` | Enums for Live Share Role and Access levels |

---

## Commands

Registered commands (prefix `helloCigen.`):
- `start` — Creates a Live Share session and logs participants to MongoDB
- `setApiKey` — Stores OpenAI API key in VS Code secrets
- `clearApiKey` — Removes the stored OpenAI API key
- `restartServer` — Restarts the Express server child process

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

### Session Creation (Host)
1. User runs "Create Live Share Session"
2. Extension starts Express server (child process)
3. Fetches project config from MongoDB
4. Prompts user to confirm all participants have joined
5. Creates `SessionLogDocument` with participants and stores in MongoDB
6. Host confirms AI-generated division → server state transitions to `"active"`

### Guest Flow
1. Guest joins Live Share → `GuestOnboardingView` opens (name + strengths/weaknesses form)
2. Guest submits profile → stored in server pending-participants (keyed by `peerNumber`)
3. Guest polls `GET /sessions/:id/state` every 5s
4. When state = `"active"` → `GuestDevelopmentView` opens, `TaskTrackerProvider` populated

### Team Chat (DevChatPanel)
1. `DevChatPanel` opens alongside development view for both host and guests
2. All participants chat in real-time via server polling (3s interval)
3. Messages mentioning `@AI` (case-insensitive) trigger server-side GPT-4 response
4. Regular messages (no @AI) are human-to-human — no AI invocation
5. Chat history persisted to MongoDB `chat_history` array

### Mid-session Task Redistribution (`/redistribute`)
1. Any participant types `/redistribute <new requirement>` in DevChatPanel
2. `POST /sessions/:id/redistribute` calls `generateRedistribution` (re-plan only `todo` items; freeze `done` + `in progress`; file-additive per owner) → validates → stores `pending_proposal` on session doc → posts diff to chat
3. Host replies with standalone `accept` / `apply` / `approve` / `lgtm` → applies proposal to `division_of_work`, bumps `division_version`, clears `pending_proposal`. Standalone `reject` / `cancel` / `no` discards
4. Sidebar task tracker picks up the new state on next 4s poll; session dashboard on next 5s poll
5. Task ids are scoped per division (each division has its own `t1`, `t2`…) — validators must compare by `(owner_id, task_id)`

---

## Git Branches

- `main` — Stable branch (use for PRs)
- `phase-1-guest-sync` — Phase 1 implementation (guest state sync & participant tracking)
- `phase-2-session-robustness` — Phase 2 (planned)
- `phase-3-polish` — Phase 3 (planned)

## Notes

- `src/ui/devChatPanel.ts` is the sole chat implementation (chatManager2 removed in Phase 5)
- AI is invoked only when a message contains `@AI` — system prompt positions GPT-4 as "CoGEN" project manager
- Task tracking is synced across participants via server polling (4s interval) with fingerprint-based diffing