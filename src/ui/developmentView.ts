import * as vscode from 'vscode';
import * as vsls from 'vsls';
import { Project } from '../models/projectConfig';
import { ServerManager } from '../serverManager';
import { patchSessionLog } from '../utils/session_log_utils';
import { generateDivisionOfWork, AiDivision } from '../utils/aiUtils';
import { getActiveProvider, getSecretKeyName, getProviderConfig } from '../utils/aiProvider';
import { TaskTrackerProvider } from './taskTrackerProvider';
import { DevChatPanel } from './devChatPanel';
import { SessionDashboard } from './sessionDashboard';

type DivisionWithOwner = AiDivision & { owner_id: string };

export class DevelopmentView {
  static createOrShow(
    sessionId: string,
    selectedProject: Project,
    participantCount: number,
    serverMgr: ServerManager,
    context: vscode.ExtensionContext,
    precomputedDivisions?: DivisionWithOwner[]
  ): void {
    this.runAiDivision(sessionId, selectedProject, participantCount, serverMgr, context, precomputedDivisions);
  }

  private static async runAiDivision(
    sessionId: string,
    project: Project,
    participantCount: number,
    serverMgr: ServerManager,
    context: vscode.ExtensionContext,
    precomputedDivisions?: DivisionWithOwner[]
  ): Promise<void> {
    const provider = getActiveProvider();
    const providerConfig = getProviderConfig(provider);
    const apiKey = await context.secrets.get(getSecretKeyName(provider));

    let divisions: DivisionWithOwner[];

    if (precomputedDivisions) {
      // Divisions already confirmed and patched by DivisionReviewPanel — skip AI call
      divisions = precomputedDivisions;
    } else {
      if (!apiKey) {
        vscode.window.showWarningMessage(`No ${providerConfig.displayName} API key set — division of work skipped.`);
        return;
      }

      let computed: DivisionWithOwner[] | undefined;
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Generating task divisions for "${project.title}"...`,
          cancellable: false
        },
        async () => {
          try {
            const rawDivisions = await generateDivisionOfWork(project, participantCount, apiKey, undefined, provider);
            const participantIds = Array.from({ length: participantCount }, (_, i) => `u${i + 1}`);
            computed = rawDivisions.map((d: AiDivision, i: number) => ({
              ...d,
              owner_id: participantIds[i] ?? `u${i + 1}`
            }));
            await patchSessionLog(sessionId, { division_of_work: computed }, serverMgr);
          } catch (err) {
            vscode.window.showWarningMessage(`AI division failed: ${err}`);
          }
        }
      );

      if (!computed) return;
      divisions = computed;
    }

    // Populate task tracker, connect to session for sync, and reveal in sidebar
    TaskTrackerProvider.instance?.setDivisions(divisions);
    TaskTrackerProvider.instance?.setSession(sessionId);
    SessionDashboard.instance?.setActiveSession(sessionId, true);
    await vscode.commands.executeCommand('helloCigen.taskTracker.focus');

    // Open the shared AI chat panel to the right
    const liveShareApi = await vsls.getApi();
    const hostName = liveShareApi?.session?.user?.displayName ?? 'Host';
    DevChatPanel.openOrReveal(sessionId, hostName, project.title);

    vscode.window.showInformationMessage('Session ready. Tasks loaded.');
  }
}
