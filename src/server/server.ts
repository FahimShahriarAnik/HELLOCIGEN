// src/server.ts
import express from "express";
import { getProjectConfigCollection, getSessionLogCollection } from "./db";
import { ProjectConfigDocument } from "../models/projectConfig";
import { SessionLogDocument, Division } from "../models/sessionLog";
import type { Request, Response } from "express";
import { OpenAI } from 'openai';


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
  session_name?: string;
}
const sessionStates = new Map<string, SessionState>();

// In-memory API key for server-side AI chat
let openaiApiKey: string | undefined;

app.get("/health", (_req: Request, res: Response) => {
  res.sendStatus(200);
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

    await coll.updateOne(
      { _id: latest[0]._id },
      { $set: { division_of_work } }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Failed to update divisions' });
  }
});

// POST /api-key — Store OpenAI API key for server-side AI chat
app.post('/api-key', (req: Request, res: Response) => {
  const { apiKey } = req.body as { apiKey: string };
  if (!apiKey) return res.status(400).json({ ok: false, error: 'apiKey is required' });
  openaiApiKey = apiKey;
  res.json({ ok: true });
});

// POST /sessions/:session_id/chat — Append a chat message and optionally generate AI response
app.post('/sessions/:session_id/chat', async (req: Request, res: Response) => {
  try {
    const session_id = req.params.session_id as string;
    const { role, content, participant_name, skipAi } = req.body as {
      role: 'user' | 'assistant';
      content: string;
      participant_name?: string;
      skipAi?: boolean;
    };

    if (!content) return res.status(400).json({ ok: false, error: 'content is required' });

    const coll = await getSessionLogCollection();
    const latest = await coll.find({ session_id }).sort({ session_number: -1 }).limit(1).toArray();
    if (latest.length === 0) return res.status(404).json({ ok: false, error: 'Session not found' });
    const session = latest[0];

    const userMessage = {
      role: role || 'user',
      content,
      participant_name: participant_name || 'Unknown',
      timestamp: new Date().toISOString()
    };

    // Append message to chat_history via atomic $push
    await coll.updateOne(
      { _id: session._id },
      { $push: { chat_history: userMessage } } as any
    );

    const messages: any[] = [userMessage];

    // Only generate AI response when the message contains @AI (case-insensitive)
    const mentionsAi = /@ai\b/i.test(content);
    if (role === 'user' && openaiApiKey && mentionsAi && !skipAi) {
      try {
        const openai = new OpenAI({ apiKey: openaiApiKey });
        const systemPrompt = buildSystemPrompt(session);
        const existingHistory = (session.chat_history || []) as any[];

        const openaiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: systemPrompt },
          ...existingHistory.map((m: any) => ({
            role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: m.participant_name && m.role === 'user'
              ? `[${m.participant_name}]: ${m.content}`
              : m.content
          })),
          { role: 'user', content: participant_name ? `[${participant_name}]: ${content}` : content }
        ];

        const response = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: openaiMessages,
          max_tokens: 1000
        });

        const aiContent = response.choices[0].message.content ?? '';
        const aiMessage = {
          role: 'assistant' as const,
          content: aiContent,
          participant_name: 'CoGEN',
          timestamp: new Date().toISOString()
        };

        await coll.updateOne(
          { _id: session._id },
          { $push: { chat_history: aiMessage } } as any
        );

        messages.push(aiMessage);
      } catch (aiErr) {
        console.error('AI chat error:', aiErr);
        // Don't fail the whole request if AI fails — user message is already persisted
      }
    }

    const existingCount = (session.chat_history?.length ?? 0);
    const total = existingCount + messages.length;
    res.json({ ok: true, messages, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Failed to process chat message' });
  }
});

// GET /sessions/:session_id/chat — Retrieve chat messages (supports polling via ?after=N)
app.get('/sessions/:session_id/chat', async (req: Request, res: Response) => {
  try {
    const session_id = req.params.session_id as string;
    const after = parseInt(req.query.after as string, 10) || 0;

    const coll = await getSessionLogCollection();
    const latest = await coll.find({ session_id }).sort({ session_number: -1 }).limit(1).toArray();
    if (latest.length === 0) return res.status(404).json({ ok: false, error: 'Session not found' });

    const chatHistory = (latest[0].chat_history || []) as any[];
    const messages = chatHistory.slice(after);

    res.json({ messages, total: chatHistory.length });
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
    const divisionSummary = session.division_of_work.map((d: any, i: number) => {
      const tasks = (d.tasks || []).map((t: any) => `  - ${t.title}`).join('\n');
      return `Teammate ${i + 1} (${d.owner_id}): ${d.title}\n${tasks}`;
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
  prompt += `Produce a structured summary with these sections:\n`;
  prompt += `1. **Session Overview** — duration, participants, project\n`;
  prompt += `2. **Work Accomplished** — per-division task completion summary\n`;
  prompt += `3. **Key Decisions** — extracted from chat history\n`;
  prompt += `4. **Blockers & Unresolved Issues**\n`;
  prompt += `5. **Recommendations for Next Session**\n`;
  prompt += `Be concise and actionable.`;

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
      max_tokens: 2000
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

const port = process.env.PORT ?? 4000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
