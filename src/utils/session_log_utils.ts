import { ServerManager } from "../serverManager";
import { roleToString, accessToString } from "./liveshareHelpers";

export interface CreateSessionParams {
  sessionId: string;
  firstProject: any;
  liveShare: any; // LiveShare type
  sessionNumber: number;
}

export async function createSessionLog(
  params: CreateSessionParams,
  serverManager: ServerManager
): Promise<void> {
  const { sessionId, firstProject, liveShare, sessionNumber } = params;
  
  const s = liveShare.session;
  if (!s) throw new Error("No LiveShare session");
  
  const hostParticipant = {
    name: "Host",
    role: roleToString(s.role),
    joined_at: new Date().toISOString(),
    access_level: accessToString(s.access)
  };
  
  const allParticipants = [hostParticipant, ...liveShare.peers.map((p: any) => ({
    name: `Peer${p.peerNumber}`,
    role: roleToString(p.role),
    joined_at: new Date().toISOString(),
    access_level: accessToString(p.access)
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

export async function patchSessionLog(
  sessionId: string,
  updates: Record<string, any>,
  serverManager: ServerManager
): Promise<void> {
  await serverManager.httpFetch(`/sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates)
  });
}

