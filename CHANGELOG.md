# Change Log

All notable changes to the "HelloCigen" extension will be documented in this file.

## [Unreleased]

### Feature Status

| Feature | Status |
|---------|--------|
| Live Share session creation (host) | ✅ Done |
| Guest detection & onboarding UI trigger | ✅ Done — race condition fixed |
| Guest onboarding form (strengths/weaknesses) | ✅ Done |
| Port sharing — guests reach host's server via localhost:4000 | ✅ Done |
| Real participant identity (vsls displayName + user.id) | ✅ Done |
| Pending store keyed by userId (prevents duplicate submissions) | ✅ Done |
| Division review panel with real participant names | ✅ Done |
| AI-powered task division (GPT-4) | ✅ Done |
| Task Tracker sidebar (interactive, click-to-toggle status) | ✅ Done |
| Both AI chat interfaces (DevChat + ChatManager2) | ✅ Done |
| MongoDB session logs + project configs | ✅ Done |
| Express REST API (11 endpoints) | ✅ Done |
| API key management (VS Code secrets) | ✅ Done |
| VSIX packaging | ✅ Done |
| Task Tracker persistence to MongoDB | ⏳ Pending |
| `helloCigen.launch` command | ⏳ Pending |
| `helloCigen.join` command | ⏳ Pending |
| Task status attribution by user ID | ⏳ Pending |
| Live test with real guest (end-to-end validation) | ⏳ Pending |

### Recent Changes (Session — 2026-03-26)

**Bug Fixes**
- Fixed race condition where guest never saw the onboarding form (`extension.ts`) — listener now also checks current session state at registration time
- Added explicit `liveShare.shareServer({ port: 4000 })` so guests can reliably reach the host's Express server via port forwarding

**Participant Identity**
- Host and guests now use real vsls `displayName` and `user.id` instead of `"Host"` / `"Peer1"` / `u1` / `u2` (`session_log_utils.ts`)
- Guest onboarding POST body now includes `userId` and `displayName` (`guestOnboardingView.ts`)
- Pending participant store refactored from anonymous array to `Map<userId, PendingParticipant>` — prevents duplicate submissions and enables identity-based merge (`server.ts`)
- Division review panel now uses real names from session log instead of generating generic names (`divisionReviewPanel.ts`)