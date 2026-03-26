// src/server.ts
import express from "express";
import { getProjectConfigCollection, getSessionLogCollection } from "./db";
import { ProjectConfigDocument } from "../models/projectConfig";
import { SessionLogDocument } from "../models/sessionLog";
import type { Request, Response } from "express";


// Create Express app
const app = express();
app.use(express.json()); // Middleware to parse JSON bodies

// In-memory store for guest pending confirmations, keyed by liveShare session_id.
// Cleared after session log is created via POST /sessions.
interface PendingParticipant {
  strengths: string;
  weaknesses: string;
  confirmedAt: string;
}
const pendingParticipants = new Map<string, PendingParticipant[]>();

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
app.post("/sessions", async (req: Request, res: Response) => {
  try {
    const coll = await getSessionLogCollection();
    const body = req.body as SessionLogDocument;

    // Merge pending guest S&W into guest participant entries (matched by join order).
    const pending = pendingParticipants.get(body.session_id);
    if (pending && pending.length > 0) {
      let guestIdx = 0;
      body.participants = body.participants.map(p => {
        if (p.role !== "Host" && guestIdx < pending.length) {
          const guestData = pending[guestIdx++];
          return { ...p, strengths: guestData.strengths, weaknesses: guestData.weaknesses };
        }
        return p;
      });
      pendingParticipants.delete(body.session_id);
    }

    const result = await coll.insertOne(body);
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
    const { session_id } = req.params;
    const update = req.body as Partial<SessionLogDocument>;

    // Get max session_number for this session_id
    const latest = await coll.find({ session_id }).sort({ session_number: -1 }).limit(1).toArray();
    if (latest.length === 0) {
      return res.status(404).json({ ok: false, error: "No sessions found" });
    }

    const result = await coll.updateOne(
      { session_id, session_number: latest[0].session_number },  // target latest
      { $set: update }
    );

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

// POST /sessions/:liveShareSessionId/pending-participants
// Called by guests after they submit their strengths/weaknesses form.
app.post("/sessions/:liveShareSessionId/pending-participants", (req: Request, res: Response) => {
  const liveShareSessionId = req.params.liveShareSessionId as string;
  const { strengths, weaknesses } = req.body as { strengths: string; weaknesses: string };

  if (!strengths && !weaknesses) {
    return res.status(400).json({ ok: false, error: "strengths and weaknesses are required" });
  }

  const existing = pendingParticipants.get(liveShareSessionId) ?? [];
  existing.push({ strengths: strengths ?? "", weaknesses: weaknesses ?? "", confirmedAt: new Date().toISOString() });
  pendingParticipants.set(liveShareSessionId, existing);

  res.json({ ok: true, count: existing.length });
});

// GET /sessions/:liveShareSessionId/pending-participants
// Polled by the host's NewSessionCreationView to get confirmed guest count.
app.get("/sessions/:liveShareSessionId/pending-participants", (req: Request, res: Response) => {
  const liveShareSessionId = req.params.liveShareSessionId as string;
  const list = pendingParticipants.get(liveShareSessionId) ?? [];
  res.json({ count: list.length, participants: list });
});

const port = process.env.PORT ?? 4000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
