import * as vscode from 'vscode';
import { Project } from '../models/projectConfig';
import { ServerManager } from '../serverManager';
import { patchSessionLog } from '../utils/session_log_utils';
import { generateDivisionOfWork, AiDivision } from '../utils/aiUtils';
import { TaskTrackerProvider } from './taskTrackerProvider';
import { DevChatPanel } from './devChatPanel';

export class DevelopmentView {
  static createOrShow(
    sessionId: string,
    selectedProject: Project,
    participantCount: number,
    serverMgr: ServerManager,
    context: vscode.ExtensionContext
  ): void {
    this.runAiDivision(sessionId, selectedProject, participantCount, serverMgr, context);
  }

  private static async runAiDivision(
    sessionId: string,
    project: Project,
    participantCount: number,
    serverMgr: ServerManager,
    context: vscode.ExtensionContext
  ): Promise<void> {
    const apiKey = await context.secrets.get('openai-api-key');
    if (!apiKey) {
      vscode.window.showWarningMessage('No OpenAI API key set — division of work skipped.');
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Generating task divisions for "${project.title}"...`,
        cancellable: false
      },
      async () => {
        try {
          const rawDivisions = await generateDivisionOfWork(project, participantCount, apiKey);

          const participantIds = Array.from({ length: participantCount }, (_, i) => `u${i + 1}`);
          const divisions = rawDivisions.map((d: AiDivision, i: number) => ({
            ...d,
            owner_id: participantIds[i] ?? `u${i + 1}`
          }));

          await patchSessionLog(sessionId, { division_of_work: divisions }, serverMgr);

          // Populate task tracker and reveal it in the Explorer sidebar
          TaskTrackerProvider.instance?.setDivisions(divisions);
          await vscode.commands.executeCommand('helloCigen.taskTracker.focus');

          // Open the AI chat panel to the right
          DevChatPanel.openOrReveal(project, divisions, apiKey);

          vscode.window.showInformationMessage('Session ready. Tasks loaded.');
        } catch (err) {
          vscode.window.showWarningMessage(`AI division failed: ${err}`);
        }
      }
    );
  }
}
