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
- Be self-contained so each developer can work and test their piece independently without waiting on others
- Own a concrete list of 1-4 files appropriate to the project size and structure
- Define clear interfaces (function signatures, return types) for any points where divisions interact
- Have 2-4 concrete tasks with 2-4 subtasks each
- Include a 1-2 sentence rationale explaining why these files and tasks form a coherent ownership boundary
- Be scoped to the project's actual structure — do not invent layers (frontend/backend/deployment) that are not described in the project

If participant profiles are provided, actively match each division to the participant whose strengths best fit that division's requirements. Prioritize pairing divisions with the participants strength and weaknesses as described by them during onboarding.

File naming rule: Use only the file name (e.g. "engine.py"), NOT a full path. Only prefix the parent folder when two divisions would otherwise share the same file name.

Output ONLY a valid JSON array (no markdown, no extra text). Example format:
[
  {
    "id": "d1",
    "title": "Division Name",
    "rationale": "Short 1-2 sentence explanation of why these files and tasks belong together.",
    "files": ["engine.py"],
    "tasks": [
      {
        "id": "t1",
        "title": "Task description",
        "status": "todo",
        "subtasks": [
          {"id": "s1", "title": "Subtask description", "status": "todo"}
        ]
      }
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
