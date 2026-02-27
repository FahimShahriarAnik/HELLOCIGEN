// src/models/sessionLog.ts
export interface FileTrackingEntry {
  file_name: string;
  // Allow arbitrary keys like "subtask_1", "subtask_2", etc.
  [key: string]: string | undefined;
}

export interface Participant {
  id: string;
  name: string;
  role: string;
  access_level: string;
  joined_at: string;      // ISO string, or Date if you parse
}

type Status = "todo" | "in progress" | "done";
interface Task {
  id: string;
  title: string;
  status: Status;
  subtasks?: Task[];   // optional nested subtasks
}

interface Division {
  id: string;
  title: string;        // module / chunk name
  owner_id: string;     // participant id reference
  tasks: Task[];
}

export interface SessionLogDocument {
  _id: string;
  session_id: string;
  session_link?: string; // making it optional since it won't be required and hard to fetch from clipboard.
  session_name?: string; // yet to reflect in existing log files and UI
  session_number: number;
  project_title: string;
  start_time: string;
  last_updated?: string;  // ISO string, updated whenever session log is patched
  no_of_participants: number;
  participants: Participant[];
  project_details: {
    project_id: string;
    title: string;
    description: string;
    complexity: string;
    [key: string]: unknown;
  };
  division_of_work: Division[];
  // Allow extra top-level fields in the future
  // Ideas for more fields: end_time, summary, notes, etc.
  [key: string]: unknown;
}