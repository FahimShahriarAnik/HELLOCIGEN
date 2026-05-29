import fetch from 'node-fetch';
import { ATLAS_APP_ID, ATLAS_API_KEY, ATLAS_DATA_SOURCE } from '../utils/config';
import { ProjectConfigDocument } from '../models/projectConfig';
import { SessionLogDocument } from '../models/sessionLog';

const BASE = `https://data.mongodb-api.com/app/${ATLAS_APP_ID}/endpoint/data/v1/action`;
const DB = 'session_logs';

// Recursively serialize query objects — preserves existing {"$oid": "..."} EJSON values as-is.
function serialize(v: any): any {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(serialize);
  if (typeof v === 'object') {
    if ('$oid' in v) return v;
    const out: any = {};
    for (const [k, val] of Object.entries(v)) out[k] = serialize(val);
    return out;
  }
  return v;
}

async function apiAction(name: string, coll: string, body: object): Promise<any> {
  const res = await fetch(`${BASE}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': ATLAS_API_KEY },
    body: JSON.stringify({ dataSource: ATLAS_DATA_SOURCE, database: DB, collection: coll, ...body }),
  });
  if (!res.ok) throw new Error(`Atlas Data API [${name}] failed: ${res.status} ${await res.text()}`);
  return res.json();
}

class Col<T> {
  constructor(private colName: string) {}

  async insertOne(doc: Partial<T>) {
    const r = await apiAction('insertOne', this.colName, { document: doc });
    return { insertedId: r.insertedId as string };
  }

  async findOne(filter: object): Promise<T | null> {
    const r = await apiAction('findOne', this.colName, { filter: serialize(filter) });
    return r.document ?? null;
  }

  find(filter: object) {
    const colName = this.colName;
    let _sort: object | undefined;
    let _limit: number | undefined;
    const builder = {
      sort(s: object) { _sort = s; return builder; },
      limit(n: number) { _limit = n; return builder; },
      async toArray(): Promise<T[]> {
        const body: any = { filter: serialize(filter) };
        if (_sort) body.sort = _sort;
        if (_limit !== undefined) body.limit = _limit;
        const r = await apiAction('find', colName, body);
        return (r.documents ?? []) as T[];
      }
    };
    return builder;
  }

  async updateOne(filter: object, update: object) {
    const r = await apiAction('updateOne', this.colName, { filter: serialize(filter), update: serialize(update) });
    return { matchedCount: r.matchedCount as number, modifiedCount: r.modifiedCount as number };
  }

  async replaceOne(filter: object, replacement: object, options?: { upsert?: boolean }) {
    return apiAction('replaceOne', this.colName, { filter, replacement, upsert: options?.upsert ?? false });
  }

  aggregate(pipeline: object[]) {
    const colName = this.colName;
    return {
      async toArray(): Promise<T[]> {
        const r = await apiAction('aggregate', colName, { pipeline });
        return (r.documents ?? []) as T[];
      }
    };
  }
}

export interface ChatMessageDoc {
  // _id is {"$oid": "hexstring"} in documents returned from Atlas Data API
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
