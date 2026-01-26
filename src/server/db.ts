// src/db.ts
import { MongoClient, Db, Collection } from "mongodb"; //Brings in the MongoDB driver types
// Imports your TypeScript interfaces 
import { ProjectConfigDocument } from "../models/projectConfig";
import { SessionLogDocument } from "../models/sessionLog";

const uri = "mongodb+srv://shahr072_db_user:8ObDC6pWuNuUBCWN@cluster0.fp3ny34.mongodb.net/session_logs?retryWrites=true&w=majority"; // severe security risk: hardcoding credentials in source code, but okay for demo purposes

//const uri = process.env.MONGO_URI ?? "mongodb://localhost:27017";
const dbName = "session_logs";

// Module-level variables
let client: MongoClient;
let db: Db;

// Connect to MongoDB and return the database instance
// Any caller can await connectToDb() to be sure the connection is ready.
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

// Get the Project Config collection
export async function getProjectConfigCollection(): Promise<Collection<ProjectConfigDocument>> {
  const database = await connectToDb();
  return database.collection<ProjectConfigDocument>("projectConfigs"); // The string "projectConfigs" is the Mongo collection name; the generic type parameter gives you TS types for that collection.
}

export async function getSessionLogCollection(): Promise<Collection<SessionLogDocument>> {
  const database = await connectToDb();
  return database.collection<SessionLogDocument>("sessionLogs");
}