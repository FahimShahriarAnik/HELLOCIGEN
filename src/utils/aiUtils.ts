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
    files?: string[];
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
- Have 2-4 concrete tasks with 2-4 subtasks each, where each task includes the specific files or modules the developer should work in (inferred from the project structure)
- Include a 1-2 sentence rationale explaining why these files and tasks form a coherent ownership boundary
- Be scoped to the project's actual structure — do not invent layers (frontend/backend/deployment) that are not described in the project

If participant profiles are provided, actively match each division to the participant whose strengths best fit that division's requirements. Prioritize pairing divisions with the participants strength and weaknesses as described by them during onboarding.

File naming rule: Use relative paths from the project root (e.g. "src/engine.py"). Only use the bare file name when the project structure provides no path context.

Output ONLY a valid JSON array (no markdown, no extra text). Example format:
[
  {
    "id": "d1",
    "title": "Division Name",
    "rationale": "Short 1-2 sentence explanation of why these files and tasks belong together.",
    "files": ["src/engine.py"],
    "tasks": [
      {
        "id": "t1",
        "title": "Task description",
        "status": "todo",
        "files": ["src/engine.py", "src/utils/helpers.py"],
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

type TaskStatus = 'todo' | 'in progress' | 'done';

export interface RedistributionTask {
  id: string;
  title: string;
  status: TaskStatus;
  files?: string[];
  subtasks?: Array<{ id: string; title: string; status: TaskStatus }>;
}

export interface RedistributionDivision {
  id: string;
  title: string;
  rationale?: string;
  files?: string[];
  owner_id: string;
  tasks: RedistributionTask[];
}

export interface ValidationResult {
  ok: boolean;
  violations: string[];
}

export async function generateRedistribution(
  project: any,
  participants: ParticipantProfile[],
  existingDivisions: RedistributionDivision[],
  newRequirement: string,
  apiKey: string,
  previousViolations?: string[]
): Promise<RedistributionDivision[]> {
  const openai = new OpenAI({ apiKey });

  const systemPrompt = `You are CoGEN, a collaborative Generative AI agent for software engineering teams. You are acting as a Project Manager.
You are tasked with managing the whole Software development life cycle, Including planning, division of labor, overview of project completion, and keeping track of progress as well as each member's contribution.
Be concise, actionable, and engineer-focused. Analyze projects holistically considering architecture, dependencies, testing, and deployment.`;

  const participantContext = participants
    .map(p => `- ${p.name} (id: ${p.id})${p.strengths ? ` — Strengths: ${p.strengths}` : ''}${p.weaknesses ? `, Weaknesses: ${p.weaknesses}` : ''}`)
    .join('\n');

  const retryNote = previousViolations && previousViolations.length > 0
    ? `\n\nYour previous attempt was REJECTED for the following constraint violations. Fix these in this attempt:\n${previousViolations.map(v => `  - ${v}`).join('\n')}\n`
    : '';

  const taskPrompt = `Project: "${project.title}". Full details: ${JSON.stringify(project, null, 2)}.

Participants:
${participantContext}

NEW REQUIREMENT TO INCORPORATE: ${newRequirement}

Current state of work (full division_of_work array — includes every task's live status):
${JSON.stringify(existingDivisions, null, 2)}
${retryNote}
HARD CONSTRAINTS — your output WILL be validated against these. Violations cause rejection:
1. Output must contain EXACTLY ${existingDivisions.length} divisions, one per participant, with the SAME owner_id values as the current divisions.
2. For each division, the output's "files" array MUST be a SUPERSET of the current division's "files" array. You may ADD files but you MUST NOT REMOVE any existing file from any participant's "files" list.
3. Every task with status "done" or "in progress" MUST appear in the output UNCHANGED: same id, same title, same files array, same status. Do not retitle, do not reassign, do not delete, do not split frozen tasks. Copy them VERBATIM. Each frozen task must remain under the SAME owner_id (the same division) it was in — do NOT move a frozen task to a different division. Note: task ids like "t1", "t2" are scoped per division, so the same id may exist in multiple divisions — preserve each one under its original owner.
4. Tasks with status "todo" are open work. You MAY add new ones, remove obsolete ones, retitle them, move them between participants, or split them. New task ids should not collide with existing task ids.
5. All status values must be exactly one of: "todo", "in progress", "done".
6. Each division should have 2-4 tasks total (counting both frozen and todo) when possible; if a participant has more frozen tasks already, do not artificially trim.

WHAT TO DO:
- Read the new requirement and decide what additional work it implies.
- Add new "todo" tasks for that work to the most appropriate participant(s), respecting the file-additive rule (if Bob needs to touch src/foo.ts, add src/foo.ts to Bob's division.files even if Alice also owns it).
- Optionally reshuffle existing "todo" tasks between participants if the new requirement changes priorities. Frozen tasks stay put.
- If the requirement implies removing planned work, you may delete obsolete "todo" tasks — but the underlying files stay in their owner's list (file-additive rule).

Output ONLY a valid JSON array of divisions (no markdown, no commentary, no surrounding text). Use the exact same schema as the input:
[
  {
    "id": "...",
    "title": "...",
    "rationale": "...",
    "files": ["..."],
    "owner_id": "...",
    "tasks": [
      { "id": "...", "title": "...", "status": "todo"|"in progress"|"done", "files": ["..."], "subtasks": [...] }
    ]
  }
]`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: taskPrompt }
    ],
    max_tokens: 2000
  });

  const content = response.choices[0].message.content || '[]';
  return JSON.parse(content) as RedistributionDivision[];
}

// KNOWN RISK: gpt-4 may not perfectly copy frozen tasks verbatim (subtle title rewording, file reordering,
// dropping a file from division.files). The retry-once loop in the server catches one such miss; persistent
// hallucination falls back to an error chat message. Watch the server logs during manual testing — every
// violation list is printed below so we can see exactly what tripped.
export function validateRedistribution(
  existing: RedistributionDivision[],
  proposed: RedistributionDivision[]
): ValidationResult {
  const violations: string[] = [];

  if (proposed.length !== existing.length) {
    violations.push(`Expected ${existing.length} divisions, got ${proposed.length}.`);
  }

  const existingByOwner = new Map(existing.map(d => [d.owner_id, d]));
  const proposedByOwner = new Map(proposed.map(d => [d.owner_id, d]));

  for (const ownerId of existingByOwner.keys()) {
    if (!proposedByOwner.has(ownerId)) {
      violations.push(`Division for owner_id "${ownerId}" is missing from the output.`);
    }
  }

  for (const [ownerId, exDiv] of existingByOwner) {
    const propDiv = proposedByOwner.get(ownerId);
    if (!propDiv) continue;

    const exFiles = new Set(exDiv.files ?? []);
    const propFiles = new Set(propDiv.files ?? []);
    for (const file of exFiles) {
      if (!propFiles.has(file)) {
        violations.push(`Owner "${ownerId}": file "${file}" was removed from division.files (file-additive rule violated).`);
      }
    }

    const frozenInputs: RedistributionTask[] = exDiv.tasks.filter(
      t => t.status === 'done' || t.status === 'in progress'
    );

    // Task ids are scoped per division (each division has its own t1, t2, …), so frozen lookups
    // must compare within the same owner_id; otherwise unrelated tasks with colliding ids get matched.
    for (const frozen of frozenInputs) {
      const match = propDiv.tasks.find(t => t.id === frozen.id);
      if (!match) {
        violations.push(`Frozen task "${frozen.id}" (${frozen.status}) missing from owner "${ownerId}".`);
        continue;
      }
      if (match.title !== frozen.title) {
        violations.push(`Frozen task "${frozen.id}" title changed from "${frozen.title}" to "${match.title}".`);
      }
      if (match.status !== frozen.status) {
        violations.push(`Frozen task "${frozen.id}" status changed from "${frozen.status}" to "${match.status}".`);
      }
      const exTaskFiles = new Set(frozen.files ?? []);
      const propTaskFiles = new Set(match.files ?? []);
      for (const f of exTaskFiles) {
        if (!propTaskFiles.has(f)) {
          violations.push(`Frozen task "${frozen.id}" lost file "${f}" from its files list.`);
        }
      }
    }
  }

  if (violations.length > 0) {
    console.warn('[validateRedistribution] violations:', violations);
  }

  return { ok: violations.length === 0, violations };
}
