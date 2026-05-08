import * as vscode from 'vscode';

const PALETTE: vscode.ThemeColor[] = [
  new vscode.ThemeColor('charts.blue'),
  new vscode.ThemeColor('charts.green'),
  new vscode.ThemeColor('charts.yellow'),
  new vscode.ThemeColor('charts.orange'),
  new vscode.ThemeColor('charts.purple'),
  new vscode.ThemeColor('charts.red'),
];

export class FilePresenceDecorator implements vscode.FileDecorationProvider {
  static instance: FilePresenceDecorator | undefined;

  private readonly _onDidChangeFileDecorations =
    new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  // Workspace-relative path → participant names
  private presence = new Map<string, Set<string>>();
  // Participant name → workspace-relative path
  private participantFile = new Map<string, string>();
  private colorMap = new Map<string, vscode.ThemeColor>();
  private colorIndex = 0;

  private colorFor(name: string): vscode.ThemeColor {
    if (!this.colorMap.has(name)) {
      this.colorMap.set(name, PALETTE[this.colorIndex % PALETTE.length]);
      this.colorIndex++;
    }
    return this.colorMap.get(name)!;
  }

  // Normalize any URI (file: or vsls:) to a workspace-relative key
  static toKey(uri: vscode.Uri): string | null {
    if (uri.scheme !== 'file' && uri.scheme !== 'vsls') return null;
    const rel = vscode.workspace.asRelativePath(uri, false);
    // asRelativePath returns the absolute path unchanged when outside the workspace
    if (rel === uri.fsPath || rel === uri.path) return null;
    return rel;
  }

  setParticipantFile(name: string, key: string | null): void {
    const prev = this.participantFile.get(name);
    if (prev === (key ?? undefined)) return;

    if (prev) {
      const set = this.presence.get(prev);
      set?.delete(name);
      if (set?.size === 0) this.presence.delete(prev);
    }

    if (key) {
      this.participantFile.set(name, key);
      if (!this.presence.has(key)) this.presence.set(key, new Set());
      this.presence.get(key)!.add(name);
    } else {
      this.participantFile.delete(name);
    }

    this._onDidChangeFileDecorations.fire(undefined);
  }

  setAllPresence(snapshot: Record<string, string | null>): void {
    for (const [name, key] of Object.entries(snapshot)) {
      this.setParticipantFile(name, key);
    }
  }

  clearAll(): void {
    this.presence.clear();
    this.participantFile.clear();
    this.colorMap.clear();
    this.colorIndex = 0;
    this._onDidChangeFileDecorations.fire(undefined);
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const key = FilePresenceDecorator.toKey(uri);
    if (!key) return undefined;

    const names = [...(this.presence.get(key) ?? [])];
    if (names.length === 0) return undefined;

    const badge = names.length === 1
      ? names[0].slice(0, 2).toUpperCase()
      : `${names.length}+`;

    const tooltip = names.length === 1
      ? `${names[0]} is here`
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are here`;

    return { badge, tooltip, color: this.colorFor(names[0]) };
  }
}
