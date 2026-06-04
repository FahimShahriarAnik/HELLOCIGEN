// src/server.ts
import express from "express";
import { getProjectConfigCollection, getSessionLogCollection, getChatMessagesCollection, ChatMessageDoc, setMongoUri, pingDb, closeDb } from "./db";
import { ProjectConfigDocument } from "../models/projectConfig";
import { SessionLogDocument, Division, PendingProposal } from "../models/sessionLog";
import type { Request, Response } from "express";
import { OpenAI } from 'openai';
import { ObjectId } from "mongodb";
import { generateRedistribution, validateRedistribution, RedistributionDivision } from "../utils/aiUtils";


// Create Express app
const app = express();
app.use(express.json()); // Middleware to parse JSON bodies

// In-memory store for guest pending confirmations, keyed by liveShare session_id.
// Cleared after session log is created via POST /sessions.
interface PendingParticipant {
  userId: string;
  peerNumber?: number;
  displayName: string;
  strengths: string;
  weaknesses: string;
  confirmedAt: string;
}
// Outer key: liveShare session ID → inner map: userId → PendingParticipant
const pendingParticipants = new Map<string, Map<string, PendingParticipant>>();

// In-memory session state machine: tracks lifecycle so guests can poll for transitions.
interface SessionState {
  status: "draft" | "dividing" | "active" | "completed";
  division_of_work?: Division[];
  participants?: Array<{ id: string; name: string }>;
  project_title?: string;
  project_details?: { title: string; description?: string; complexity?: string };
  session_name?: string;
}
const sessionStates = new Map<string, SessionState>();

// In-memory API key for server-side AI chat
let openaiApiKey: string | undefined;

// Per-session @AI queue: serializes AI generation so userMsg+aiMsg are always written as a pair.
const aiQueues = new Map<string, Promise<void>>();
function enqueueAiGeneration(session_id: string, work: () => Promise<void>): void {
  const prev = aiQueues.get(session_id) ?? Promise.resolve();
  const next = prev.then(work).catch(err => console.error('AI queue error:', err));
  aiQueues.set(session_id, next);
}

// SSE clients: session_id → participantName → Set<Response>
const sseClients = new Map<string, Map<string, Set<Response>>>();

function broadcastMessages(session_id: string, messages: ChatMessageDoc[]): void {
  const sessionClients = sseClients.get(session_id);
  if (!sessionClients || sessionClients.size === 0) return;

  for (const msg of messages) {
    const payload = `data: ${JSON.stringify([msg])}\n\n`;
    const rec = msg.recipient ?? 'broadcast';

    if (rec === 'broadcast') {
      sessionClients.forEach(clientSet => {
        clientSet.forEach(res => { try { res.write(payload); } catch { /* disconnected */ } });
      });
    } else {
      // 'ai' → sender-only; DM → sender + named recipient
      const targets = new Set<string>([msg.participant_name]);
      if (rec !== 'ai') targets.add(rec);
      for (const name of targets) {
        sessionClients.get(name)?.forEach(res => { try { res.write(payload); } catch { /* disconnected */ } });
      }
    }
  }
}

// Process-level liveness — returns 200 as soon as Express is bound.
// Used by serverManager to know when it's safe to POST /mongo-uri.
app.get("/alive", (_req: Request, res: Response) => {
  res.sendStatus(200);
});

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

// 1) Upsert (store/rewrite) the single static project config
// Reads the full static config JSON from req.body.
// Calls getProjectConfigCollection() to get a collection handle.
// Uses replaceOne({}, body, { upsert: true }) to “replace any existing config document with this one, or insert if none exists”.
// Returns a simple status JSON to the caller.
app.post("/project_details", async (req: Request, res: Response) => {
  try {
    const coll = await getProjectConfigCollection();
    const body = req.body as ProjectConfigDocument;

    // For now, assume you always send a full config with "projects" array.
    const result = await coll.replaceOne(
      {},                 // match any existing doc
      body,
      { upsert: true }    // insert if none
    );

    res.json({ ok: true, result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Failed to save config" });
  }
});

// 2) Read the static project config
// Grabs the projectConfigs collection.
// findOne({}) fetches the single config document (any doc, since there should be exactly one).
// Sends it back to the client as JSON.
// On the client/UI side, the data you care about lives in doc.projects.
app.get("/project_details", async (_req: Request, res: Response) => {
  try {
    const coll = await getProjectConfigCollection();
    const doc = await coll.findOne({});
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Failed to load config" });
  }
});


/**
 * SESSION LOGS (dynamic)
 *
 * POST /sessions
 *   - UI decides if it’s a new session or continuation.
 *   - For new: send a fresh SessionLogDocument with session_number = 1.
 *   - For continuation: client first fetches previous, increments session_number, then POSTs a new document.
 *
 * GET /sessions/:session_id
 *   - Fetch the latest or specific session log (here: latest by session_number for that session_id).
 *
 * GET /sessions/:session_id/all
 *   - Fetch all logs for a given session_id, ordered by session_number.
 *
 * PATCH /sessions/:session_id/:session_number
 *   - Update a specific session log (e.g., tweak participants or division_of_work).
 */

// 3) Create a new session log (new or continuation -> always a new document) (dynamic)
// Supports both draft creation (status: "draft") and full creation (legacy flow).
app.post("/sessions", async (req: Request, res: Response) => {
  try {
    const coll = await getSessionLogCollection();
    const body = req.body as SessionLogDocument;

    // Only merge pending guest S&W for non-draft sessions (legacy full-creation flow).
    if (body.status !== "draft") {
      const pending = pendingParticipants.get(body.session_id);
      if (pending && pending.size > 0) {
        const pendingArray = [...pending.values()];
        body.participants = body.participants.map(p => {
          const match = pendingArray.find(pp =>
            (pp.peerNumber !== undefined && (p as any).peerNumber !== undefined && pp.peerNumber === (p as any).peerNumber) ||
            (pp.userId && pp.userId === p.id)
          );
          if (match) {
            return { ...p, name: match.displayName || p.name, strengths: match.strengths, weaknesses: match.weaknesses };
          }
          return p;
        });
        pendingParticipants.delete(body.session_id);
      }
    }

    const result = await coll.insertOne(body);

    // Set in-memory session state matching the document status
    const status = (body.status as SessionState["status"]) || "dividing";
    sessionStates.set(body.session_id, { status });

    res.status(201).json({ ok: true, id: result.insertedId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Failed to create session" });
  }
});

// 4) Update a session log via session_id (flexible fields)
app.patch("/sessions/:session_id", async (req: Request, res: Response) => {
  try {
    const coll = await getSessionLogCollection();
    const session_id = req.params.session_id as string;
    const update = req.body as Partial<SessionLogDocument>;

    // Get max session_number for this session_id
    const latest = await coll.find({ session_id }).sort({ session_number: -1 }).limit(1).toArray();
    if (latest.length === 0) {
      return res.status(404).json({ ok: false, error: "No sessions found" });
    }

    // When transitioning to "dividing", merge pending guest S&W into participants
    if (update.status === "dividing" && update.participants) {
      const pending = pendingParticipants.get(session_id);
      if (pending && pending.size > 0) {
        const pendingArray = [...pending.values()];
        update.participants = (update.participants as any[]).map((p: any) => {
          const match = pendingArray.find(pp =>
            (pp.peerNumber !== undefined && p.peerNumber !== undefined && pp.peerNumber === p.peerNumber) ||
            (pp.userId && pp.userId === p.id)
          );
          if (match) {
            return { ...p, name: match.displayName || p.name, strengths: match.strengths, weaknesses: match.weaknesses };
          }
          return p;
        });
        pendingParticipants.delete(session_id);
      }
      sessionStates.set(session_id, { status: "dividing" });
    }

    // If status is "completed", set last_updated before persisting
    if (update.status === "completed") {
      update.last_updated = new Date().toISOString();
    }

    // When division_of_work lands, the session has been confirmed and is active.
    // Persist that to MongoDB so endpoints reading the session doc (e.g. /redistribute) see the right status.
    if (update.division_of_work && !update.status) {
      update.status = "active";
    }

    const result = await coll.updateOne(
      { session_id, session_number: latest[0].session_number },  // target latest
      { $set: update }
    );

    // Update in-memory state for guest polling
    if (update.status === "completed") {
      sessionStates.set(session_id, { status: "completed" });
    }

    // If division_of_work was patched, transition state to "active" so guests detect it
    if (update.division_of_work) {
      const participants = (update.participants as any[] || latest[0].participants)?.map((p: any) => ({ id: p.id, name: p.name })) ?? [];
      sessionStates.set(session_id, {
        status: "active",
        division_of_work: update.division_of_work as Division[],
        participants,
        project_title: latest[0].project_title,
        project_details: latest[0].project_details,
        session_name: latest[0].session_name
      });
    }

    res.json({ ok: true, matched: result.matchedCount, modified: result.modifiedCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Failed to update session" });
  }
});

// This block gives the UI a list of sessions with name, number, and last_updated.
app.get("/sessions", async (_req: Request, res: Response) => {
  try {
    const coll = await getSessionLogCollection();
    const docs = await coll.aggregate([
      { $sort: { session_number: -1 } },
      {
        $group: {
          _id: "$session_id",
          session_id:     { $first: "$session_id" },
          session_name:   { $first: "$session_name" },
          session_number: { $first: "$session_number" },
          last_updated:   { $first: "$last_updated" },
          project_title:  { $first: "$project_title" },
        }
      }
    ]).toArray();
    res.json(docs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Failed to fetch sessions" });
  }
});

// GET /sessions/:session_id - Get ALL session logs for a given session_id, sorted by session_number
// In Client-side:
// docs.length = total session count.
// docs[docs.length - 1] = latest session log.
app.get("/sessions/:session_id", async (req: Request, res: Response) => {
  try {
    const coll = await getSessionLogCollection();
    const { session_id } = req.params;

    if (!session_id || Array.isArray(session_id)) {
      return res.status(400).json({ ok: false, error: "Invalid session_id" });
    }

    const docs = await coll
      .find({ session_id })
      .sort({ session_number: 1 }) // oldest first
      .toArray();

    if (docs.length === 0) {
      return res.status(404).json({ ok: false, error: "No sessions found" });
    }

    res.json(docs); // Array of all session logs; client picks latest via docs[docs.length-1]
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Failed to fetch session logs" });
  }
});

// GET /sessions/:liveShareSessionId/state
// Polled by guests to detect session lifecycle transitions (dividing → active).
app.get("/sessions/:liveShareSessionId/state", (req: Request, res: Response) => {
  const { liveShareSessionId } = req.params;
  const state = sessionStates.get(liveShareSessionId as string);
  if (!state) {
    return res.json({ status: "unknown" });
  }
  res.json(state);
});

// POST /sessions/:liveShareSessionId/pending-participants
// Called by guests after they submit their strengths/weaknesses form.
app.post("/sessions/:liveShareSessionId/pending-participants", (req: Request, res: Response) => {
  try {
    const liveShareSessionId = req.params.liveShareSessionId as string;
    const { userId, displayName, peerNumber, strengths, weaknesses } = req.body as {
      userId: string; displayName: string; peerNumber?: number; strengths: string; weaknesses: string;
    };

    if (!strengths && !weaknesses) {
      return res.status(400).json({ ok: false, error: "strengths and weaknesses are required" });
    }

    const sessionMap = pendingParticipants.get(liveShareSessionId) ?? new Map<string, PendingParticipant>();
    const key = peerNumber !== undefined ? `peer-${peerNumber}` : (userId || `anon-${sessionMap.size}`);
    sessionMap.set(key, {
      userId: userId ?? "",
      peerNumber,
      displayName: displayName ?? "",
      strengths: strengths ?? "",
      weaknesses: weaknesses ?? "",
      confirmedAt: new Date().toISOString()
    });
    pendingParticipants.set(liveShareSessionId, sessionMap);

    res.json({ ok: true, count: sessionMap.size });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Failed to store pending participant" });
  }
});

// GET /sessions/:liveShareSessionId/pending-participants
// Polled by the host's NewSessionCreationView to get confirmed guest count.
app.get("/sessions/:liveShareSessionId/pending-participants", (req: Request, res: Response) => {
  try {
    const liveShareSessionId = req.params.liveShareSessionId as string;
    const sessionMap = pendingParticipants.get(liveShareSessionId);
    const list = sessionMap ? [...sessionMap.values()] : [];
    res.json({ count: list.length, participants: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Failed to fetch pending participants" });
  }
});

// GET /sessions/:session_id/divisions — Return current division_of_work for polling
app.get('/sessions/:session_id/divisions', async (req: Request, res: Response) => {
  try {
    const session_id = req.params.session_id as string;
    const coll = await getSessionLogCollection();
    const latest = await coll.find({ session_id }).sort({ session_number: -1 }).limit(1).toArray();
    if (latest.length === 0) {
      return res.status(404).json({ ok: false, error: 'Session not found' });
    }

    res.json({ ok: true, division_of_work: latest[0].division_of_work ?? [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Failed to fetch divisions' });
  }
});

// PATCH /sessions/:session_id/divisions — Update task statuses within division_of_work
app.patch('/sessions/:session_id/divisions', async (req: Request, res: Response) => {
  try {
    const session_id = req.params.session_id as string;
    const { division_of_work } = req.body as { division_of_work: Division[] };

    if (!division_of_work) {
      return res.status(400).json({ ok: false, error: 'division_of_work is required' });
    }

    const coll = await getSessionLogCollection();
    const latest = await coll.find({ session_id }).sort({ session_number: -1 }).limit(1).toArray();
    if (latest.length === 0) {
      return res.status(404).json({ ok: false, error: 'Session not found' });
    }

    const nextVersion = (latest[0].division_version ?? 0) + 1;
    await coll.updateOne(
      { _id: latest[0]._id },
      { $set: { division_of_work, division_version: nextVersion } }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Failed to update divisions' });
  }
});

// POST /sessions/:session_id/task-complete — Broadcast completion notification + AI acknowledgment.
app.post('/sessions/:session_id/task-complete', async (req: Request, res: Response) => {
  const session_id = req.params.session_id as string;
  const { taskTitle, participantName, participantLabel } = req.body as {
    taskTitle: string;
    participantName: string;
    participantLabel: string; // e.g. "P1"
  };

  if (!taskTitle || !participantName) {
    return res.status(400).json({ ok: false, error: 'taskTitle and participantName are required' });
  }

  const notificationContent = `${participantLabel} completed: ${taskTitle}`;

  const notificationMsg: ChatMessageDoc = {
    session_id,
    role: 'assistant',
    content: notificationContent,
    participant_name: 'System',
    recipient: 'broadcast',
    timestamp: new Date().toISOString()
  };

  try {
    const chatColl = await getChatMessagesCollection();
    const inserted = await chatColl.insertOne({ ...notificationMsg });
    broadcastMessages(session_id, [{ ...notificationMsg, _id: inserted.insertedId }]);
  } catch (err) {
    console.error('task-complete notification error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to broadcast notification' });
  }

  res.json({ ok: true });

  if (!openaiApiKey) return;

  enqueueAiGeneration(session_id, async () => {
    const chatColl = await getChatMessagesCollection();
    const openai = new OpenAI({ apiKey: openaiApiKey });
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are CoGEN, an AI project manager. A team member just completed a task. Reply with a single short encouraging sentence (under 15 words). No markdown, no emoji.'
          },
          { role: 'user', content: `${participantName} just completed: "${taskTitle}"` }
        ],
        max_tokens: 60
      });
      const ackContent = response.choices[0].message.content?.trim() ?? `Nice work, ${participantName}!`;
      const ackMsg: ChatMessageDoc = {
        session_id,
        role: 'assistant',
        content: ackContent,
        participant_name: 'CoGEN',
        recipient: 'broadcast',
        timestamp: new Date().toISOString()
      };
      const ackInsert = await chatColl.insertOne({ ...ackMsg });
      broadcastMessages(session_id, [{ ...ackMsg, _id: ackInsert.insertedId }]);
    } catch (err) {
      console.error('task-complete AI ack error:', err);
    }
  });
});

// POST /sessions/:session_id/code-review — AI code review triggered on task completion.
// Returns a one-line assessment: "Looks good." or "Potential issue: [description]."
app.post('/sessions/:session_id/code-review', async (req: Request, res: Response) => {
  const { task_title, division_title, changed_files } = req.body as {
    task_title: string;
    division_title: string;
    changed_files: string[];
  };

  if (!openaiApiKey) {
    return res.json({ assessment: 'Code review unavailable (no API key).' });
  }

  const fileList = changed_files?.length > 0 ? changed_files.join(', ') : 'no tracked changes';
  const openai = new OpenAI({ apiKey: openaiApiKey });
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a concise code reviewer. Given a completed task and the files that changed, respond with exactly one line: either "Looks good." or "Potential issue: [specific concern]." No other text.'
        },
        {
          role: 'user',
          content: `Task completed: "${task_title}" (division: "${division_title}")\nChanged files: ${fileList}`
        }
      ],
      max_tokens: 80
    });
    res.json({ assessment: response.choices[0].message.content?.trim() ?? 'Looks good.' });
  } catch (err) {
    console.error('Code review error:', err);
    res.json({ assessment: 'Code review unavailable.' });
  }
});

// POST /sessions/:session_id/redistribute — slash-command-triggered AI task redistribution proposal.
// Phase 1: generates a proposal and posts it to chat. Does NOT apply changes to division_of_work.
// The host's accept/reject keyword handling lands in Phase 2.
app.post('/sessions/:session_id/redistribute', async (req: Request, res: Response) => {
  const session_id = req.params.session_id as string;
  const { new_requirement, participant_name } = req.body as {
    new_requirement: string;
    participant_name: string;
  };

  if (!new_requirement || !new_requirement.trim()) {
    return res.status(400).json({ ok: false, error: 'new_requirement is required' });
  }
  if (!participant_name) {
    return res.status(400).json({ ok: false, error: 'participant_name is required' });
  }
  if (!openaiApiKey) {
    return res.status(503).json({ ok: false, error: 'OpenAI API key not configured' });
  }

  const sessionColl = await getSessionLogCollection();
  const sessionDocs = await sessionColl
    .find({ session_id })
    .sort({ session_number: -1 })
    .limit(1)
    .toArray();
  if (sessionDocs.length === 0) {
    return res.status(404).json({ ok: false, error: 'Session not found' });
  }
  const session = sessionDocs[0];
  const inMemoryStatus = sessionStates.get(session_id)?.status;
  const effectiveStatus = session.status ?? inMemoryStatus;
  const hasDivisions = (session.division_of_work?.length ?? 0) > 0;
  if (effectiveStatus === 'completed') {
    return res.status(400).json({ ok: false, error: 'Cannot redistribute a completed session.' });
  }
  if (!hasDivisions) {
    return res.status(400).json({ ok: false, error: 'Cannot redistribute before the initial division is created.' });
  }

  res.json({ ok: true, queued: true });

  enqueueAiGeneration(session_id, async () => {
    const chatColl = await getChatMessagesCollection();
    const trimmed = new_requirement.trim();

    const userMsg: ChatMessageDoc = {
      session_id,
      role: 'user',
      content: `/redistribute ${trimmed}`,
      participant_name,
      recipient: 'broadcast',
      timestamp: new Date().toISOString()
    };
    const userInsert = await chatColl.insertOne({ ...userMsg });
    broadcastMessages(session_id, [{ ...userMsg, _id: userInsert.insertedId }]);

    if (session.pending_proposal) {
      await postCogenMessage(
        session_id,
        `Previous proposal "${session.pending_proposal.new_requirement}" was superseded by a newer one.`
      );
    }

    const project = session.project_details;
    const participants = (session.participants ?? []).map(p => ({
      id: p.id,
      name: p.name,
      strengths: p.strengths,
      weaknesses: p.weaknesses
    }));
    const existing = (session.division_of_work ?? []) as unknown as RedistributionDivision[];

    let proposed: RedistributionDivision[] | null = null;
    let lastViolations: string[] = [];

    try {
      const first = await generateRedistribution(project, participants, existing, trimmed, openaiApiKey!);
      const v1 = validateRedistribution(existing, first);
      if (v1.ok) {
        proposed = first;
      } else {
        lastViolations = v1.violations;
        const retry = await generateRedistribution(project, participants, existing, trimmed, openaiApiKey!, v1.violations);
        const v2 = validateRedistribution(existing, retry);
        if (v2.ok) {
          proposed = retry;
        } else {
          lastViolations = v2.violations;
        }
      }
    } catch (err) {
      console.error('[redistribute] AI generation error:', err);
      await postCogenMessage(
        session_id,
        `Could not generate a redistribution proposal — internal error. Please try again.`
      );
      return;
    }

    if (!proposed) {
      await postCogenMessage(
        session_id,
        `Couldn't generate a valid redistribution proposal for "${trimmed}" — the AI output failed constraints (${lastViolations.length} violations). Try rephrasing the requirement.`
      );
      return;
    }

    const proposalId = `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const pending: PendingProposal = {
      id: proposalId,
      new_requirement: trimmed,
      proposed_divisions: proposed as unknown as Division[],
      created_at: new Date().toISOString(),
      triggered_by: participant_name
    };
    await sessionColl.updateOne(
      { _id: session._id },
      { $set: { pending_proposal: pending, last_updated: new Date().toISOString() } }
    );

    const proposalText = formatProposalMessage(existing, proposed, trimmed);
    await postCogenMessage(session_id, proposalText);
  });
});

async function postCogenMessage(session_id: string, content: string): Promise<void> {
  const chatColl = await getChatMessagesCollection();
  const msg: ChatMessageDoc = {
    session_id,
    role: 'assistant',
    content,
    participant_name: 'CoGEN',
    recipient: 'broadcast',
    timestamp: new Date().toISOString()
  };
  const insert = await chatColl.insertOne({ ...msg });
  broadcastMessages(session_id, [{ ...msg, _id: insert.insertedId }]);
}

function formatProposalMessage(
  existing: RedistributionDivision[],
  proposed: RedistributionDivision[],
  newRequirement: string
): string {
  const lines: string[] = [];
  lines.push(`Proposed redistribution for: "${newRequirement}"`);
  lines.push('');

  const exByOwner = new Map(existing.map(d => [d.owner_id, d]));
  let anyChange = false;
  for (const propDiv of proposed) {
    const exDiv = exByOwner.get(propDiv.owner_id);
    if (!exDiv) continue;

    const exTodoIds = new Set(exDiv.tasks.filter(t => t.status === 'todo').map(t => t.id));
    const propTodoIds = new Set(propDiv.tasks.filter(t => t.status === 'todo').map(t => t.id));

    const added = propDiv.tasks.filter(t => t.status === 'todo' && !exTodoIds.has(t.id));
    const removed = exDiv.tasks.filter(t => t.status === 'todo' && !propTodoIds.has(t.id));

    const exFiles = new Set(exDiv.files ?? []);
    const newFiles = (propDiv.files ?? []).filter(f => !exFiles.has(f));

    if (added.length === 0 && removed.length === 0 && newFiles.length === 0) continue;
    anyChange = true;

    lines.push(`${propDiv.title} (owner: ${propDiv.owner_id})`);
    for (const t of added) {
      lines.push(`  + Add task: "${t.title}"${t.files?.length ? ` [${t.files.join(', ')}]` : ''}`);
    }
    for (const t of removed) {
      lines.push(`  - Drop task: "${t.title}"`);
    }
    if (newFiles.length > 0) {
      lines.push(`  + New files: ${newFiles.join(', ')}`);
    }
    lines.push('');
  }

  if (!anyChange) {
    lines.push('(No changes proposed — the new requirement appears to be already covered by the existing plan.)');
    lines.push('');
  }

  lines.push('Host: reply with `accept` to apply, `reject` to discard. (Phase 1 build — accept/reject handling not yet wired; nothing will be written to MongoDB on accept until Phase 2.)');

  return lines.join('\n');
}

// POST /api-key — Store OpenAI API key for server-side AI chat
app.post('/api-key', (req: Request, res: Response) => {
  const { apiKey } = req.body as { apiKey: string };
  if (!apiKey) return res.status(400).json({ ok: false, error: 'apiKey is required' });
  openaiApiKey = apiKey;
  res.json({ ok: true });
});

// POST /mongo-uri — host-only. Receives the MongoDB connection URI from
// the extension on startup. URI lives in db.ts module-private state until
// the server process exits.
app.post('/mongo-uri', (req: Request, res: Response) => {
  const { uri } = req.body as { uri: string };
  if (!uri) return res.status(400).json({ ok: false, error: 'uri is required' });
  setMongoUri(uri);
  res.json({ ok: true });
});

// GET /sessions/:session_id/chat/stream — SSE endpoint; pushes new messages to connected clients instantly.
// Client keeps this connection open for the lifetime of the chat panel.
app.get('/sessions/:session_id/chat/stream', (req: Request, res: Response) => {
  const session_id = req.params.session_id as string;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const participant = (req.query.participant as string) || 'anonymous';
  if (!sseClients.has(session_id)) sseClients.set(session_id, new Map());
  const sessionClients = sseClients.get(session_id)!;
  if (!sessionClients.has(participant)) sessionClients.set(participant, new Set());
  sessionClients.get(participant)!.add(res);

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const clientSet = sessionClients.get(participant);
    if (clientSet) {
      clientSet.delete(res);
      if (clientSet.size === 0) sessionClients.delete(participant);
    }
  });
});

// POST /sessions/:session_id/chat — Insert a chat message.
// Regular messages: inserted immediately and broadcast via SSE.
// @AI messages: entire pair (userMsg insert + AI call + aiMsg insert) is queued so chat_history
// is always userMsg_A → aiMsg_A → userMsg_B → aiMsg_B. Both are broadcast together when ready.
app.post('/sessions/:session_id/chat', async (req: Request, res: Response) => {
  const session_id = req.params.session_id as string;
  const { role, content, participant_name, skipAi, recipient } = req.body as {
    role: 'user' | 'assistant';
    content: string;
    participant_name?: string;
    skipAi?: boolean;
    recipient?: string;
  };

  if (!content) return res.status(400).json({ ok: false, error: 'content is required' });

  const effectiveRecipient = recipient || 'broadcast';
  const mentionsAi = /@ai\b/i.test(content);
  const isPrivateAi = effectiveRecipient === 'ai';
  const shouldQueue = (mentionsAi || isPrivateAi) && role !== 'assistant' && !skipAi && !!openaiApiKey;

  const acceptRegex = /^\s*(accept|apply|approve|lgtm)\.?\s*$/i;
  const rejectRegex = /^\s*(reject|cancel|discard|no)\.?\s*$/i;
  const isAccept = acceptRegex.test(content);
  const isReject = rejectRegex.test(content);
  const isProposalAction = (isAccept || isReject) && role !== 'assistant' && effectiveRecipient === 'broadcast';

  const userMsgData: ChatMessageDoc = {
    session_id,
    role: role || 'user',
    content,
    participant_name: participant_name || 'Unknown',
    recipient: effectiveRecipient,
    timestamp: new Date().toISOString()
  };

  if (isProposalAction) {
    res.json({ ok: true, queued: true });

    enqueueAiGeneration(session_id, async () => {
      const chatColl = await getChatMessagesCollection();
      const sessionColl = await getSessionLogCollection();

      const userInsert = await chatColl.insertOne({ ...userMsgData });
      const insertedUser = { ...userMsgData, _id: userInsert.insertedId };
      broadcastMessages(session_id, [insertedUser]);

      const fresh = await sessionColl
        .find({ session_id })
        .sort({ session_number: -1 })
        .limit(1)
        .toArray();
      const session = fresh[0];
      if (!session?.pending_proposal) return;

      const sender = session.participants?.find(p => p.name === (participant_name || ''));
      if (sender?.role !== 'Host') return;

      if (isAccept) {
        const proposal = session.pending_proposal;
        const nextVersion = (session.division_version ?? 0) + 1;
        await sessionColl.updateOne(
          { _id: session._id },
          {
            $set: {
              division_of_work: proposal.proposed_divisions,
              division_version: nextVersion,
              last_updated: new Date().toISOString()
            },
            $unset: { pending_proposal: '' }
          }
        );

        const inMem = sessionStates.get(session_id);
        if (inMem) {
          inMem.division_of_work = proposal.proposed_divisions;
        }

        await postCogenMessage(
          session_id,
          `Task tracker updated — new division applied (v${nextVersion}).`
        );
      } else {
        await sessionColl.updateOne(
          { _id: session._id },
          {
            $unset: { pending_proposal: '' },
            $set: { last_updated: new Date().toISOString() }
          }
        );
        await postCogenMessage(session_id, 'Proposal discarded.');
      }
    });

    return;
  }

  if (shouldQueue) {
    // Respond immediately — queue owns both inserts so the pair lands atomically
    res.json({ ok: true, queued: true });

    enqueueAiGeneration(session_id, async () => {
      const chatColl = await getChatMessagesCollection();
      const sessionColl = await getSessionLogCollection();

      // Insert user message first
      const userInsert = await chatColl.insertOne({ ...userMsgData });
      const insertedUser = { ...userMsgData, _id: userInsert.insertedId };

      // Build AI context: broadcast messages + messages from/to this participant (excludes other users' private chats)
      const sender = participant_name || 'Unknown';
      const allMessages = await chatColl
        .find({ session_id, $or: [
          { recipient: 'broadcast' },
          { recipient: { $exists: false } },
          { participant_name: sender },
          { recipient: sender }
        ]})
        .sort({ _id: 1 })
        .toArray();

      const sessionDocs = await sessionColl
        .find({ session_id })
        .sort({ session_number: -1 })
        .limit(1)
        .toArray();
      const session = sessionDocs[0];

      const openai = new OpenAI({ apiKey: openaiApiKey });
      const openaiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: buildSystemPrompt(session) },
        ...allMessages.map(m => ({
          role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.role === 'user' ? `[${m.participant_name}]: ${m.content}` : m.content
        }))
      ];

      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: openaiMessages,
        max_tokens: 1000
      });

      const aiMsgData: ChatMessageDoc = {
        session_id,
        role: 'assistant',
        content: response.choices[0].message.content ?? '',
        participant_name: 'CoGEN',
        // Private AI request → reply only to sender; broadcast @ai → reply to all
        recipient: isPrivateAi ? (participant_name || 'Unknown') : 'broadcast',
        timestamp: new Date().toISOString()
      };

      // Insert AI response immediately after user message — queue guarantees no interleaving
      const aiInsert = await chatColl.insertOne({ ...aiMsgData });
      const insertedAi = { ...aiMsgData, _id: aiInsert.insertedId };

      // Broadcast both as a pair — all SSE clients receive them together in order
      broadcastMessages(session_id, [insertedUser, insertedAi]);
    });

  } else {
    // Regular message: insert and broadcast immediately
    try {
      const chatColl = await getChatMessagesCollection();
      const result = await chatColl.insertOne({ ...userMsgData });
      const inserted = { ...userMsgData, _id: result.insertedId };
      broadcastMessages(session_id, [inserted]);
      res.json({ ok: true, messageId: result.insertedId });
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.status(500).json({ ok: false, error: 'Failed to send message' });
    }
  }
});

// GET /sessions/:session_id/chat — Cursor-based fetch for history load and fallback polling.
// ?after=<ObjectId hex string> returns all messages after that _id, sorted ascending.
// Omit ?after (or pass "0") to fetch all messages from the beginning.
app.get('/sessions/:session_id/chat', async (req: Request, res: Response) => {
  try {
    const session_id = req.params.session_id as string;
    const afterParam = req.query.after as string | undefined;
    const viewerParam = req.query.participant as string | undefined;

    const chatColl = await getChatMessagesCollection();

    const query: any = { session_id };
    if (afterParam && afterParam !== '0') {
      query._id = { $gt: { '$oid': afterParam } };
    }

    // Filter by viewer: show broadcast (incl. legacy docs without recipient), own messages, and DMs to/from viewer
    if (viewerParam) {
      query.$or = [
        { recipient: 'broadcast' },
        { recipient: { $exists: false } },
        { participant_name: viewerParam },
        { recipient: viewerParam }
      ];
    }

    const messages = await chatColl.find(query).sort({ _id: 1 }).toArray();
    const lastId = messages.length > 0 ? messages[messages.length - 1]._id : undefined;
    const nextCursor = lastId?.['$oid'] ?? String(lastId ?? afterParam ?? '0');

    res.json({ messages, nextCursor });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Failed to fetch chat messages' });
  }
});

function buildSystemPrompt(session: any): string {
  let prompt = `You are CoGEN, an AI project manager assistant embedded in a collaborative coding session's team chat.\n`;
  prompt += `You are only invoked when a participant mentions @AI in their message. The rest of the chat is human-to-human conversation you can see for context.\n`;
  prompt += `Respond helpfully and concisely to the question or request in the message that mentioned you.\n\n`;
  if (session.project_details?.title) {
    prompt += `Project: ${session.project_details.title}\n`;
    prompt += `Description: ${session.project_details.description ?? ''}\n\n`;
  }
  if (session.division_of_work?.length > 0) {
    const nameById: Record<string, string> = {};
    for (const p of session.participants || []) {
      nameById[p.id] = p.name;
    }
    const divisionSummary = session.division_of_work.map((d: any) => {
      const ownerName = nameById[d.owner_id] ?? d.owner_id;
      const tasks = d.tasks || [];
      const countByStatus = (status: string) => {
        let count = 0;
        for (const t of tasks) {
          if (t.status === status) count++;
          for (const st of t.subtasks || []) { if (st.status === status) count++; }
        }
        return count;
      };
      const done = countByStatus('done');
      const inProgress = countByStatus('in progress');
      const todo = countByStatus('todo');
      const taskLines = tasks.map((t: any) => {
        const subtaskLines = (t.subtasks || []).map((st: any) => `      - [${st.status}] ${st.title}`).join('\n');
        return `  - [${t.status}] ${t.title}` + (subtaskLines ? '\n' + subtaskLines : '');
      }).join('\n');
      return `${ownerName} (${d.title}) — ${done} done, ${inProgress} in progress, ${todo} todo\n${taskLines}`;
    }).join('\n\n');
    prompt += `Task breakdown:\n${divisionSummary}\n\n`;
  }
  if (session.participants?.length > 0) {
    const participantList = session.participants.map((p: any) =>
      `${p.name} (${p.id})${p.strengths ? ` — Strengths: ${p.strengths}` : ''}${p.weaknesses ? `, Weaknesses: ${p.weaknesses}` : ''}`
    ).join('\n');
    prompt += `Participants:\n${participantList}\n\n`;
  }
  prompt += `Help teammates with questions about their tasks, code, or the project. Be concise and actionable. `;
  prompt += `When a message is prefixed with [Name], that's the participant speaking. Address them by name when relevant.`;
  return prompt;
}

// Build a prompt for AI-generated session summary (separate from chat system prompt)
function buildSummaryPrompt(session: any): string {
  let prompt = `You are CoGEN, an AI project manager. Generate a structured retrospective summary for a collaborative coding session.\n\n`;

  // Project info
  if (session.project_details?.title) {
    prompt += `## Project\n`;
    prompt += `Title: ${session.project_details.title}\n`;
    prompt += `Description: ${session.project_details.description ?? 'N/A'}\n\n`;
  }

  // Duration
  prompt += `## Session Duration\n`;
  prompt += `Start: ${session.start_time ?? 'Unknown'}\n`;
  prompt += `End: ${session.end_time ?? 'Unknown'}\n\n`;

  // Participants
  if (session.participants?.length > 0) {
    prompt += `## Participants\n`;
    for (const p of session.participants) {
      prompt += `- ${p.name} (${p.role ?? 'member'})`;
      if (p.strengths) prompt += ` — Strengths: ${p.strengths}`;
      if (p.weaknesses) prompt += `, Weaknesses: ${p.weaknesses}`;
      prompt += `\n`;
    }
    prompt += `\n`;
  }

  // Division of work with task completion counts
  if (session.division_of_work?.length > 0) {
    prompt += `## Division of Work\n`;
    for (const d of session.division_of_work) {
      const tasks = d.tasks || [];
      const countByStatus = (status: string) => {
        let count = 0;
        for (const t of tasks) {
          if (t.status === status) count++;
          for (const st of t.subtasks || []) {
            if (st.status === status) count++;
          }
        }
        return count;
      };
      const done = countByStatus('done');
      const inProgress = countByStatus('in progress');
      const todo = countByStatus('todo');
      prompt += `- ${d.title} (Owner: ${d.owner_id}) — Done: ${done}, In Progress: ${inProgress}, Todo: ${todo}\n`;
      for (const t of tasks) {
        prompt += `  - [${t.status}] ${t.title}\n`;
      }
    }
    prompt += `\n`;
  }

  // Chat history (last 50 messages, skip system)
  const chatHistory = (session.chat_history || []) as any[];
  const relevantMessages = chatHistory.filter((m: any) => m.role !== 'system').slice(-50);
  if (relevantMessages.length > 0) {
    prompt += `## Chat History (last ${relevantMessages.length} messages)\n`;
    for (const m of relevantMessages) {
      const sender = m.participant_name || (m.role === 'assistant' ? 'CoGEN' : 'Unknown');
      prompt += `[${sender}]: ${m.content}\n`;
    }
    prompt += `\n`;
  }

  prompt += `## Instructions\n`;
  prompt += `Produce a structured summary under 300 words with these sections:\n`;
  prompt += `1. **Session Overview** — duration, participants, project (1-2 lines)\n`;
  prompt += `2. **Work Accomplished** — render as a markdown table with columns: Division | Owner | Done | In Progress | Todo\n`;
  prompt += `3. **Key Decisions** — extracted from chat history\n`;
  prompt += `4. **Blockers & Unresolved Issues**\n`;
  prompt += `5. **Recommendations for Next Session**\n`;
  prompt += `Use bullet points only — no prose paragraphs. Keep the entire response under 300 words.`;

  return prompt;
}

// POST /sessions/:session_id/summary — Generate AI summary and persist to MongoDB
app.post('/sessions/:session_id/summary', async (req: Request, res: Response) => {
  try {
    if (!openaiApiKey) {
      return res.status(400).json({ ok: false, error: 'No API key' });
    }

    const session_id = req.params.session_id as string;
    const coll = await getSessionLogCollection();
    const latest = await coll.find({ session_id }).sort({ session_number: -1 }).limit(1).toArray();
    if (latest.length === 0) {
      return res.status(404).json({ ok: false, error: 'Session not found' });
    }

    const session = latest[0];
    const openai = new OpenAI({ apiKey: openaiApiKey });
    const summaryPrompt = buildSummaryPrompt(session);

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: summaryPrompt }
      ],
      max_tokens: 500
    });

    const summary = response.choices[0].message.content ?? '';

    // Persist summary to MongoDB
    await coll.updateOne(
      { _id: session._id },
      { $set: { summary } }
    );

    // Store in sessionStates so guests can access via state polling
    const existing = sessionStates.get(session_id);
    if (existing) {
      (existing as any).summary = summary;
    }

    res.json({ ok: true, summary });
  } catch (err) {
    console.error('Summary generation error:', err);
    res.status(500).json({ ok: false, error: 'Failed to generate summary' });
  }
});

// GET /sessions/:session_id/summary — Retrieve persisted summary
app.get('/sessions/:session_id/summary', async (req: Request, res: Response) => {
  try {
    const session_id = req.params.session_id as string;
    const coll = await getSessionLogCollection();
    const latest = await coll.find({ session_id }).sort({ session_number: -1 }).limit(1).toArray();
    if (latest.length === 0) {
      return res.status(404).json({ ok: false, error: 'Session not found' });
    }

    const summary = latest[0].summary;
    if (!summary) {
      return res.status(404).json({ ok: false, error: 'Summary not yet generated' });
    }

    res.json({ ok: true, summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Failed to fetch summary' });
  }
});

const port = Number(process.env.PORT ?? 4000);
const httpServer = app.listen(port, '127.0.0.1', () => {
  console.log(`Server listening on http://127.0.0.1:${port}`);
});

httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} already in use — exiting`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

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
