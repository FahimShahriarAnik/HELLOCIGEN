# Next Phase: Participant Identity

## Problem
Participants currently get generic names (`"Host"`, `"Peer1"`) and positional IDs (`u1`, `u2`). No way to track who completed what.

## Available from vsls API
```typescript
peer.user.displayName  // "Fahim Shahriar"
peer.user.emailAddress // "fahim@example.com" (nullable)
peer.user.userName     // GitHub username (nullable)
peer.user.id           // persistent ID, stable across sessions
```

## Changes Required

### 1. `src/utils/session_log_utils.ts`
- Host: use `liveShare.session.user?.displayName` for name, `liveShare.session.user?.id` for id
- Guests: use `p.user?.displayName` and `p.user?.id` instead of `Peer${p.peerNumber}` and `u${idx+2}`

### 2. `src/ui/guestOnboardingView.ts`
- Pass `liveShare.session.user?.id` to the webview or include it in the POST
- POST body becomes `{ userId, displayName, strengths, weaknesses }`

### 3. `src/server/server.ts` — pending store
- Key pending entries by `userId` instead of appending to an anonymous array
- Prevents duplicate submissions from same guest
- Match by `userId` when merging into session log participants

### 4. `src/ui/divisionReviewPanel.ts`
- `buildParticipants()` should pull real names from the session log instead of generating `"Host"`, `"Peer 1"`

### 5. Task tracking (future)
- With real `user.id` as participant ID, task status changes can be attributed to the person who made them
- MongoDB queries can filter by participant ID to show individual contribution
