import { MongoClient, Db, Collection, ObjectId } from 'mongodb';
import { ProjectConfigDocument } from '../models/projectConfig';
import { SessionLogDocument } from '../models/sessionLog';

const DB_NAME = 'session_logs';

// URI is set at runtime via setMongoUri() — called from POST /mongo-uri
// after the extension reads it from VS Code secret storage.
let _mongoUri: string | undefined;
let client: MongoClient | undefined;
let dbPromise: Promise<Db> | undefined;
let _connectionLogged = false;

// Returns the host portion of the URI for logging (no credentials).
function uriHost(uri: string): string {
  try {
    const noScheme = uri.replace(/^mongodb(\+srv)?:\/\//, '');
    const afterCreds = noScheme.split('@').pop() ?? noScheme;
    return afterCreds.split('/')[0];
  } catch {
    return '<unparseable>';
  }
}

export function setMongoUri(uri: string): void {
  if (_mongoUri === uri) return; // idempotent
  if (client) {
    client.close().catch(() => {});
  }
  client = undefined;
  dbPromise = undefined;
  _connectionLogged = false;
  _mongoUri = uri;
}

async function getDb(): Promise<Db> {
  if (!_mongoUri) {
    throw new Error('MongoDB URI not configured — POST /mongo-uri before issuing DB calls');
  }
  if (!dbPromise) {
    const uri = _mongoUri;
    client = new MongoClient(uri);
    dbPromise = client.connect()
      .then(c => {
        const db = c.db(DB_NAME);
        if (!_connectionLogged) {
          _connectionLogged = true;
          console.log(`Connected to cluster: ${uriHost(uri)}`);
          console.log(`Database: ${DB_NAME}`);
          console.log(`Collections: projectConfigs, sessionLogs, chatMessages`);
        }
        return db;
      })
      .catch(err => {
        // Reset cache so the next call can retry once the underlying issue resolves
        dbPromise = undefined;
        client = undefined;
        throw err;
      });
  }
  return dbPromise;
}

// Health-check helper — used by GET /health to surface DB reachability.
// Returns true if a ping round-trip succeeds; false otherwise (never throws).
export async function pingDb(): Promise<boolean> {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

// Called from server.ts shutdown handlers — closes the connection pool cleanly.
export async function closeDb(): Promise<void> {
  if (client) {
    await client.close().catch(() => {});
    client = undefined;
    dbPromise = undefined;
  }
}

// Convert {$oid: hex} EJSON shapes used by callers (legacy from the Data API era)
// into native ObjectId values recursively, so the native driver matches them in queries.
function denormalize(v: any): any {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(denormalize);
  if (typeof v === 'object') {
    if (typeof v.$oid === 'string') return new ObjectId(v.$oid);
    const out: any = {};
    for (const [k, val] of Object.entries(v)) out[k] = denormalize(val);
    return out;
  }
  return v;
}

// Convert native ObjectId values in returned docs back to {$oid: hex} so chat
// cursor logic (server.ts:932, 947) and other call sites keep working.
function normalize<T>(doc: any): T {
  if (doc === null || doc === undefined) return doc;
  if (Array.isArray(doc)) return doc.map(normalize) as any;
  if (doc instanceof ObjectId) return { $oid: doc.toHexString() } as any;
  if (typeof doc === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(doc)) out[k] = normalize(v);
    return out;
  }
  return doc;
}

class Col<T> {
  constructor(private name: string) {}

  private async coll(): Promise<Collection<any>> {
    const db = await getDb();
    return db.collection(this.name);
  }

  async insertOne(doc: Partial<T>): Promise<{ insertedId: string }> {
    const c = await this.coll();
    const r = await c.insertOne(denormalize(doc));
    return { insertedId: r.insertedId.toHexString() };
  }

  async findOne(filter: object): Promise<T | null> {
    const c = await this.coll();
    const r = await c.findOne(denormalize(filter));
    return r ? normalize<T>(r) : null;
  }

  find(filter: object) {
    let _sort: object | undefined;
    let _limit: number | undefined;
    const collPromise = this.coll();
    const builder = {
      sort(s: object) { _sort = s; return builder; },
      limit(n: number) { _limit = n; return builder; },
      async toArray(): Promise<T[]> {
        const c = await collPromise;
        let cursor = c.find(denormalize(filter));
        if (_sort) cursor = cursor.sort(_sort as any);
        if (_limit !== undefined) cursor = cursor.limit(_limit);
        const docs = await cursor.toArray();
        return docs.map(d => normalize<T>(d));
      }
    };
    return builder;
  }

  async updateOne(filter: object, update: object): Promise<{ matchedCount: number; modifiedCount: number }> {
    const c = await this.coll();
    const r = await c.updateOne(denormalize(filter), denormalize(update));
    return { matchedCount: r.matchedCount, modifiedCount: r.modifiedCount };
  }

  async replaceOne(filter: object, replacement: object, options?: { upsert?: boolean }) {
    const c = await this.coll();
    return c.replaceOne(denormalize(filter), denormalize(replacement) as any, { upsert: options?.upsert ?? false });
  }

  aggregate(pipeline: object[]) {
    const collPromise = this.coll();
    return {
      async toArray(): Promise<T[]> {
        const c = await collPromise;
        const docs = await c.aggregate(denormalize(pipeline) as object[]).toArray();
        return docs.map(d => normalize<T>(d));
      }
    };
  }
}

export interface ChatMessageDoc {
  // _id is {"$oid": "hexstring"} after normalize(); native ObjectId internally before normalize.
  _id?: any;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  participant_name: string;
  recipient: 'broadcast' | 'ai' | string;
  timestamp: string;
}

export function getProjectConfigCollection() { return new Col<ProjectConfigDocument>('projectConfigs'); }
export function getSessionLogCollection() { return new Col<SessionLogDocument>('sessionLogs'); }
export function getChatMessagesCollection() { return new Col<ChatMessageDoc>('chatMessages'); }
