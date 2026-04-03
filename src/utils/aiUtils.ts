import { createAiClient, AiProviderType } from './aiProvider';

export interface AiDivision {
  id: string;
  title: string;
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
  participants?: ParticipantProfile[],
  provider?: AiProviderType
): Promise<AiDivision[]> {
  const { client, model } = createAiClient(apiKey, provider);

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
- Include specific files/modules to own
- Define clear interfaces/APIs for integration
- Cover frontend/backend/testing/deployment aspects balanced
- Have 2-4 concrete tasks

Output ONLY a valid JSON array (no markdown, no extra text). Example format:
[
  {
    "id": "d1",
    "title": "Division Name",
    "tasks": [
      {"id": "t1", "title": "Task description", "status": "todo"},
      {"id": "t2", "title": "Another task", "status": "todo"}
    ]
  }
]`;

  console.log(`[CoGEN AI] Provider: ${provider ?? 'default'}, Model: ${model}, BaseURL: ${client.baseURL}`);

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: taskPrompt }
      ],
      max_tokens: 1500
    });

    const content = response.choices[0].message.content || '[]';
    return JSON.parse(content) as AiDivision[];
  } catch (err: any) {
    console.error(`[CoGEN AI] Error — status: ${err?.status}, message: ${err?.message}`);
    console.error(`[CoGEN AI] Full error:`, JSON.stringify(err, null, 2));
    throw err;
  }
}
