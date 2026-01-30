"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSessionLog = createSessionLog;
const liveshareHelpers_1 = require("./liveshareHelpers");
async function createSessionLog(params, serverManager) {
    const { sessionId, firstProject, liveShare, sessionNumber } = params;
    const s = liveShare.session;
    if (!s)
        throw new Error("No LiveShare session");
    const hostParticipant = {
        name: "Host",
        role: (0, liveshareHelpers_1.roleToString)(s.role),
        joined_at: new Date().toISOString(),
        access_level: (0, liveshareHelpers_1.accessToString)(s.access)
    };
    const allParticipants = [hostParticipant, ...liveShare.peers.map(p => ({
            name: `Peer${p.peerNumber}`,
            role: (0, liveshareHelpers_1.roleToString)(p.role),
            joined_at: new Date().toISOString(),
            access_level: (0, liveshareHelpers_1.accessToString)(p.access)
        }))];
    const sessionLog = {
        session_id: sessionId,
        session_number: sessionNumber,
        project_title: firstProject.title,
        start_time: new Date().toISOString(),
        no_of_participants: allParticipants.length,
        participants: allParticipants,
        project_details: firstProject,
        division_of_work: {}
    };
    await serverManager.httpFetch("/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionLog)
    });
    console.log(`Created session log ${sessionNumber} for ${sessionId}`);
}
//# sourceMappingURL=session_log_utils.js.map