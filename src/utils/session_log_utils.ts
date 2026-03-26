import { ServerManager } from "../serverManager";
import { roleToString, accessToString } from "./liveshareHelpers";

export interface CreateSessionParams {
  sessionId: string;
  sessionName?: string;
  firstProject: any;
  liveShare: any; // LiveShare type
  sessionNumber: number;
  hostStrengths?: string;
  hostWeaknesses?: string;
}

export async function createSessionLog(
  params: CreateSessionParams,
  serverManager: ServerManager
): Promise<void> {
  const { sessionId, sessionName, firstProject, liveShare, sessionNumber, hostStrengths, hostWeaknesses } = params;

  const s = liveShare.session;
  if (!s) throw new Error("No LiveShare session");

  const hostParticipant = {
    id: s.user?.id ?? 'u1',
    name: s.user?.displayName ?? "Host",
    role: roleToString(s.role),
    joined_at: new Date().toISOString(),
    access_level: accessToString(s.access),
    strengths: hostStrengths ?? "",
    weaknesses: hostWeaknesses ?? ""
  };

  const allParticipants = [hostParticipant, ...liveShare.peers.map((p: any, idx: number) => ({
    id: p.user?.id ?? `u${idx + 2}`,
    name: p.user?.displayName ?? `Peer${p.peerNumber}`,
    role: roleToString(p.role),
    joined_at: new Date().toISOString(),
    access_level: accessToString(p.access)
  }))];

  const sessionLog = {
    session_id: sessionId,
    session_name: sessionName ?? "",
    session_number: sessionNumber,
    project_title: firstProject.title,
    start_time: new Date().toISOString(),
    no_of_participants: allParticipants.length,
    participants: allParticipants,
    project_details: firstProject,
    division_of_work: []
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

