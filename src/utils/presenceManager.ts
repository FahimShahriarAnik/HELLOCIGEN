import * as vscode from 'vscode';
import * as vsls from 'vsls';
import { FilePresenceDecorator } from '../ui/filePresenceDecorator';
import { Role } from './liveshareHelpers';

const SERVICE_NAME = 'cogen-presence';

// Returns the workspace-relative key for the currently active editor, or null.
function activeKey(): string | null {
  const uri = vscode.window.activeTextEditor?.document.uri;
  if (!uri) return null;
  return FilePresenceDecorator.toKey(uri);
}

export async function initPresenceManager(
  liveShare: vsls.LiveShare,
  myName: string,
  decorator: FilePresenceDecorator,
  context: vscode.ExtensionContext
): Promise<vscode.Disposable> {
  const disposables: vscode.Disposable[] = [];

  const role = liveShare.session?.role;

  if (role === Role.Host) {
    const service = await liveShare.shareService(SERVICE_NAME);
    if (!service) return vscode.Disposable.from();

    // Presence snapshot that the host maintains and rebroadcasts
    const allPresence: Record<string, string | null> = {};

    const broadcastSelf = (key: string | null) => {
      allPresence[myName] = key;
      decorator.setParticipantFile(myName, key);
      service.notify('presence-update', { presence: allPresence });
    };

    // Seed with current active file
    broadcastSelf(activeKey());

    disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => broadcastSelf(activeKey()))
    );

    // Relay guest file-focus events to all connected guests
    service.onNotify('file-focus', (args: any) => {
      const name = args.name as string;
      const key = (args.key as string | null) ?? null;
      allPresence[name] = key;
      decorator.setParticipantFile(name, key);
      service.notify('presence-update', { presence: allPresence });
    });

  } else if (role === Role.Guest) {
    const proxy = await liveShare.getSharedService(SERVICE_NAME);
    if (!proxy) return vscode.Disposable.from();

    const broadcastSelf = (key: string | null) => {
      proxy.notify('file-focus', { name: myName, key });
    };

    // Receive full presence snapshots from host
    proxy.onNotify('presence-update', (args: any) => {
      decorator.setAllPresence(args.presence ?? {});
    });

    // Seed with current active file
    broadcastSelf(activeKey());

    disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => broadcastSelf(activeKey()))
    );
  }

  return vscode.Disposable.from(...disposables);
}
