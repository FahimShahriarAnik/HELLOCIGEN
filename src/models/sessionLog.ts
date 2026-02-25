// src/models/sessionLog.ts
export interface FileTrackingEntry {
  file_name: string;
  // Allow arbitrary keys like "subtask_1", "subtask_2", etc.
  [key: string]: string | undefined;
}

export interface Participant {
  name: string;
  role: string;
  joined_at: string;      // ISO string, or Date if you parse
  access_level: string;
  file_tracking?: FileTrackingEntry[]; // optional. Some Participant objects may have file_tracking, others may omit it.
  // future fields allowed:
  [key: string]: unknown; // index signature. It tells TypeScript: “Besides the named fields (name, role, etc.), this object may also have other string‑named properties with values of type unknown.
}

export interface SessionLogDocument {
  _id: string;
  session_id: string;
  session_link?: string; // making it optional since it won't be required and hard to fetch from clipboard.
  session_name?: string; // yet to reflect in existing log files and UI
  session_number: number;
  project_title: string;
  start_time: string;
  no_of_participants: number;
  participants: Participant[];
  project_details: {
    project_id: string;
    title: string;
    description: string;
    complexity: string;
    [key: string]: unknown;
  };
  division_of_work: {
    [name: string]: string;
  };
  // Allow extra top-level fields in the future
  // Ideas for more fields: end_time, summary, notes, etc.
  [key: string]: unknown;
}