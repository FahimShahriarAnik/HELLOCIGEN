# HelloCigen — Feature Status & Next Steps

## Feature Status

| Feature | Status |
|---------|--------|
| Live Share session creation (host) | ✅ Done |
| Guest detection & onboarding UI trigger | ✅ Done — race condition fixed |
| Guest onboarding form (strengths/weaknesses) | ✅ Done |
| Port sharing — guests reach host server via localhost:4000 | ✅ Done |
| Real participant identity (vsls displayName + user.id) | ✅ Done |
| Pending store keyed by userId (no duplicate submissions) | ✅ Done |
| Division review with real participant names | ✅ Done |
| AI-powered task division (GPT-4) | ✅ Done |
| Task Tracker sidebar (interactive, click-to-toggle) | ✅ Done |
| Both AI chat interfaces (DevChat + ChatManager2) | ✅ Done |
| MongoDB session logs + project configs | ✅ Done |
| Express REST API (11 endpoints) | ✅ Done |
| API key management (VS Code secrets) | ✅ Done |
| VSIX packaging | ✅ Done |
| Task Tracker persistence to MongoDB | ⏳ Pending |
| `helloCigen.launch` command | ⏳ Pending |
| `helloCigen.join` command | ⏳ Pending |
| Task status attribution by user ID | ⏳ Pending |
| Live end-to-end test with real guest | ⏳ Pending |

---

## Next Immediate Step

**Live test** — run the extension with a real guest joining via Live Share link and verify:
1. Guest sees the onboarding form immediately upon joining
2. Host's "Participants Joined" count increments after guest submits
3. Session log in MongoDB contains real `displayName` and `user.id`
4. Division review panel shows real names

---

## Remaining Work (After Testing)

### Task Tracker MongoDB Persistence
- `taskTrackerProvider.ts:57` has a TODO comment
- Needs `sessionId` + `serverMgr` passed into the provider
- Store task status changes via `PATCH /sessions/:session_id`

### Task Status Attribution
- With real `user.id` now in place, status changes can be tagged to the person who made them
- MongoDB queries can filter by participant ID for individual contribution view

### `helloCigen.launch` / `helloCigen.join`
- Both commands registered in `package.json` but have no implementation
- Decide intended behavior before implementing

---

## Architecture Notes

```
Guest VS Code ──[Live Share port tunnel]──► Host localhost:4000 (Express)
                                                    │
                                              MongoDB Atlas
```

- Server runs only on host machine as a child process (port 4000)
- Guests access it via Live Share port sharing (`liveShare.shareServer()`)
- Guests do NOT have direct MongoDB access — all DB ops go through Express
- Pending participants stored in-memory on server; cleared after session log created
