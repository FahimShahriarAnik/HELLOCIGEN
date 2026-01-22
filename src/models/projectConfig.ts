// src/models/projectConfig.ts
export interface Project {
  project_id: string;
  title: string;
  description: string;
  complexity: "low" | "medium" | "high";  // or just string
}

export interface ProjectConfigDocument {
  _id?: string;           // MongoDB id
  projects: Project[];
}
