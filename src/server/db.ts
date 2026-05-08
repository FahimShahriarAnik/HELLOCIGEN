// src/db.ts
import { MongoClient, Db, Collection, ObjectId } from "mongodb";
import { ProjectConfigDocument } from "../models/projectConfig";
import { SessionLogDocument } from "../models/sessionLog";
import { MONGO_URI } from "../utils/config.local";

const uri = MONGO_URI;
const dbName = "session_logs";

let client: MongoClient;
let db: Db;

export async function connectToDb(): Promise<Db> {
  if (!client) {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);
  }
  if (!db) {
    throw new Error("Database not initialized");
  }
  return db;
}

export async function getProjectConfigCollection(): Promise<Collection<ProjectConfigDocument>> {
  const database = await connectToDb();
  return database.collection<ProjectConfigDocument>("projectConfigs");
}

export async function getSessionLogCollection(): Promise<Collection<SessionLogDocument>> {
  const database = await connectToDb();
  return database.collection<SessionLogDocument>("sessionLogs");
}

// Each chat message is its own document — enables cursor-based fetch and atomic inserts.
export interface ChatMessageDoc {
  _id?: ObjectId;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  participant_name: string;
  // 'broadcast' = visible to all; 'ai' = private query to AI (sender-only); any other string = DM to that participant
  recipient: 'broadcast' | 'ai' | string;
  timestamp: string;
}

export async function getChatMessagesCollection(): Promise<Collection<ChatMessageDoc>> {
  const database = await connectToDb();
  return database.collection<ChatMessageDoc>("chatMessages");
}