"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectToDb = connectToDb;
exports.getProjectConfigCollection = getProjectConfigCollection;
exports.getSessionLogCollection = getSessionLogCollection;
// src/db.ts
const mongodb_1 = require("mongodb"); //Brings in the MongoDB driver types
const uri = process.env.MONGO_URI ?? "mongodb://localhost:27017";
const dbName = "session_logs";
// Module-level variables
let client;
let db;
// Connect to MongoDB and return the database instance
// Any caller can await connectToDb() to be sure the connection is ready.
async function connectToDb() {
    if (!client) {
        client = new mongodb_1.MongoClient(uri);
        await client.connect();
        db = client.db(dbName);
    }
    if (!db) {
        throw new Error("Database not initialized");
    }
    return db;
}
// Get the Project Config collection
async function getProjectConfigCollection() {
    const database = await connectToDb();
    return database.collection("projectConfigs"); // The string "projectConfigs" is the Mongo collection name; the generic type parameter gives you TS types for that collection.
}
async function getSessionLogCollection() {
    const database = await connectToDb();
    return database.collection("sessionLogs");
}
//# sourceMappingURL=db.js.map