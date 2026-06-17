export interface Peer {
  id: string;
  name: string;
  host: string;
  port: number;
  role: string;
  online: boolean;
  row?: string;
  seat?: string;
  lastSeen?: number;
}

export interface Transfer {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  targetId: string;
  targetName: string;
  direction: "outgoing" | "incoming";
  status: "pending" | "sending" | "retrying" | "done" | "failed" | "cancelled";
  progress: number;
  savedPath?: string;
  error?: string;
  startedAt: number;
  attempt?: number;
  maxAttempts?: number;
}

export type Role = "admin" | "client";
