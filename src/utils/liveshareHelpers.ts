export enum Role {
  None = 0,
  Host = 1,
  Guest = 2,
}

export enum Access {
  None = 0,
  ReadOnly = 1,
  ReadWrite = 3,
  Owner = 0xFF,
}

export function roleToString(role: number): string {
  return Role[role] || "Unknown";
}

export function accessToString(access: number): string {
  return Access[access] || "Unknown";
}
