import { OpenAI } from 'openai';

export interface AiDivision {
  id: string;
  title: string;
  rationale?: string;
  files?: string[];
  tasks: Array<{
    id: string;
    title: string;
    status: 'todo' | 'doing' | 'done';
    subtasks?: Array<{ id: string; title: string; status: 'todo' | 'doing' | 'done' }>;
  }>;
}

export interface ParticipantProfile {
  id: string;
  name: string;
  strengths?: string;
  weaknesses?: string;
}

export async function generateDivisionOfWork(
  project: any,
  participantCount: number,
  apiKey: string,
  participants?: ParticipantProfile[]
): Promise<AiDivision[]> {
  const openai = new OpenAI({ apiKey });

  const systemPrompt = `You are CoGEN, a collaborative Generative AI agent for software engineering teams. You are acting as a Project Manager.
    You are tasked with managing the whole Software development life cycle, Including planning, division of labor, overview of project completion, and keeping track of progress as well as each member's contribution.
    Be concise, actionable, and engineer-focused. Analyze projects holistically considering architecture, dependencies, testing, and deployment.`;

  const profileContext = participants && participants.length > 0
    ? `\n\nParticipant profiles (use as context only — let AI decide optimal task assignment):\n` +
      participants.map(p =>
        `- ${p.name}: Strengths: ${p.strengths || 'not specified'}. Weaknesses: ${p.weaknesses || 'not specified'}.`
      ).join('\n')
    : '';

  const taskPrompt = `Project: "${project.title}". Full details: ${JSON.stringify(project, null, 2)}.${profileContext}

Divide this project into EXACTLY ${participantCount} independent, parallel-developable divisions, one per developer. Each division must:
- Be self-contained with minimal cross-dependencies
- Own a concrete list of 3-8 files
- Define clear interfaces/APIs for integration
- Cover frontend/backend/testing/deployment aspects balanced
- Have 2-4 concrete tasks
- Include a 1-2 sentence rationale explaining why these files and tasks form a coherent ownership boundary

File naming rule: Use only the file name (e.g. "server.ts", "chatPanel.ts"), NOT a full path. Only prefix the parent folder when two divisions would otherwise share the same file name (e.g. "ui/chat.ts" vs "server/chat.ts").

Output ONLY a valid JSON array (no markdown, no extra text). Example format:
[
  {
    "id": "d1",
    "title": "Division Name",
    "rationale": "Short 1-2 sentence explanation of why these files and tasks belong together.",
    "files": ["server.ts", "db.ts", "server.test.ts"],
    "tasks": [
      {"id": "t1", "title": "Task description", "status": "todo"},
      {"id": "t2", "title": "Another task", "status": "todo"}
    ]
  }
]`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: taskPrompt }
    ],
    max_tokens: 1500
  });

  const content = response.choices[0].message.content || '[]';
  return JSON.parse(content) as AiDivision[];
}
