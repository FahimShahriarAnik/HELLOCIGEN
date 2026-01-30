"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/server.ts
const express_1 = __importDefault(require("express"));
const db_1 = require("./db");
// Create Express app
const app = (0, express_1.default)();
app.use(express_1.default.json()); // Middleware to parse JSON bodies
// 1) Upsert (store/rewrite) the single static project config
// Reads the full static config JSON from req.body.
// Calls getProjectConfigCollection() to get a collection handle.
// Uses replaceOne({}, body, { upsert: true }) to “replace any existing config document with this one, or insert if none exists”.
// Returns a simple status JSON to the caller.
app.post("/project_details", async (req, res) => {
    try {
        const coll = await (0, db_1.getProjectConfigCollection)();
        const body = req.body;
        // For now, assume you always send a full config with "projects" array.
        const result = await coll.replaceOne({}, // match any existing doc
        body, { upsert: true } // insert if none
        );
        res.json({ ok: true, result });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: "Failed to save config" });
    }
});
// 2) Read the static project config
// Grabs the projectConfigs collection.
// findOne({}) fetches the single config document (any doc, since there should be exactly one).
// Sends it back to the client as JSON.
// On the client/UI side, the data you care about lives in doc.projects.
app.get("/project_details", async (_req, res) => {
    try {
        const coll = await (0, db_1.getProjectConfigCollection)();
        const doc = await coll.findOne({});
        res.json(doc);
    }
    catch (err) {
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
app.post("/sessions", async (req, res) => {
    try {
        const coll = await (0, db_1.getSessionLogCollection)();
        const body = req.body;
        const result = await coll.insertOne(body);
        res.status(201).json({ ok: true, id: result.insertedId });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: "Failed to create session" });
    }
});
// 4) Update a session log via session_id (flexible fields)
app.patch("/sessions/:session_id", async (req, res) => {
    try {
        const coll = await (0, db_1.getSessionLogCollection)();
        const { session_id } = req.params;
        const update = req.body;
        // Get max session_number for this session_id
        const latest = await coll.find({ session_id }).sort({ session_number: -1 }).limit(1).toArray();
        if (latest.length === 0) {
            return res.status(404).json({ ok: false, error: "No sessions found" });
        }
        const result = await coll.updateOne({ session_id, session_number: latest[0].session_number }, // target latest
        { $set: update });
        res.json({ ok: true, matched: result.matchedCount, modified: result.modifiedCount });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: "Failed to update session" });
    }
});
// GET /sessions/:session_id - Get ALL session logs for a given session_id, sorted by session_number
// In Client-side:
// docs.length = total session count.
// docs[docs.length - 1] = latest session log.
app.get("/sessions/:session_id", async (req, res) => {
    try {
        const coll = await (0, db_1.getSessionLogCollection)();
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
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: "Failed to fetch session logs" });
    }
});
const port = process.env.PORT ?? 4000;
app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
});
//# sourceMappingURL=server.js.map