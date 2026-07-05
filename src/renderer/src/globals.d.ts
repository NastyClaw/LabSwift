export {};

declare global {
  interface Window {
    labswift: {
      minimize: () => Promise<void>;
      maximize: () => Promise<void>;
      close: () => Promise<void>;
      storeGet: (key: string) => Promise<unknown>;
      storeSet: (key: string, value: unknown) => Promise<void>;
      storeDelete: (key: string) => Promise<void>;
      // Lock screen
      verifyLockScreen: (password: string) => Promise<boolean>;
      // Setup
      setupComplete: (role: "admin" | "client", password: string) => Promise<{ success: boolean }>;
      verifyAdmin: (password: string) => Promise<boolean>;
      setupReset: () => Promise<{ success: boolean }>;
      // Dialogs
      openFile: () => Promise<string[]>;
      openFolder: () => Promise<string | null>;
      saveFolder: () => Promise<string | null>;
      // Transfers
      sendFiles: (targetIds: string[], filePaths: string[], adminPassword: string) => Promise<{ queued: number }>;
      sendFolder: (targetIds: string[], folderPath: string, adminPassword: string) => Promise<{ queued: number } | { error: string }>;
      // Chat
      broadcastMessage: (targetIds: string[], text: string, adminPassword: string) => Promise<{ sent: number; total: number }>;
      onChatMessage: (cb: (msg: { from: string; text: string; at: number }) => void) => () => void;
      // Remote save path
      pushSavePathToClients: (targetIds: string[], savePath: string, adminPassword: string) => Promise<{ pushed: number; total: number }>;
      onSavePathUpdated: (cb: (newPath: string) => void) => () => void;
      // Transfers
      listTransfers: () => Promise<import("./lib/types").Transfer[]>;
      cancelTransfer: (id: string) => Promise<void>;
      retryTransfer: (id: string, adminPassword: string) => Promise<void>;
      // Peers
      listPeers: () => Promise<import("./lib/types").Peer[]>;
      renamePeer: (id: string, name: string) => Promise<import("./lib/types").Peer[]>;
      setPeerRow: (id: string, row: string, seat: string) => Promise<import("./lib/types").Peer[]>;
      forgetPeer: (id: string) => Promise<import("./lib/types").Peer[]>;
      // Remote lock / unlock
      remoteLock: (targetIds: string[], adminPassword: string) => Promise<{ sent: number; total: number; errors: { peerId: string; reason: string }[] }>;
      remoteUnlock: (targetIds: string[], adminPassword: string) => Promise<{ sent: number; total: number }>;
      // Security settings
      getSecuritySettings: () => Promise<{ extensionFilter: boolean; malwareScan: boolean }>;
      setSecuritySettings: (settings: { extensionFilter?: boolean; malwareScan?: boolean }) => Promise<{ success: boolean }>;
      // Threat / lock events
      onThreatDetected: (cb: (info: { fileName: string; detail?: string }) => void) => () => void;
      onLockEngage: (cb: () => void) => () => void;
      onLockRelease: (cb: () => void) => () => void;
      // Save path (local)
      getSavePath: () => Promise<string>;
      setSavePath: (p: string) => Promise<void>;
      // Work collection
      collectWork: (targetIds: string[], destFolder: string, adminPassword: string) => Promise<{ results: { peerId: string; pcName: string; files: number; skipped: number; error?: string }[]; destFolder: string }>;
      // Open URL
      pushUrl: (targetIds: string[], url: string, adminPassword: string) => Promise<{ sent: number; total: number }>;
      openUrlLocal: (url: string) => Promise<void>;
      onOpenUrl: (cb: (url: string) => void) => () => void;
      // Shutdown / Restart
      remoteShutdown: (targetIds: string[], action: "shutdown" | "restart", adminPassword: string) => Promise<{ sent: number; total: number }>;
      remoteCancelShutdown: (targetIds: string[], adminPassword: string) => Promise<{ sent: number; total: number }>;
      systemShutdown: (action: "shutdown" | "restart") => Promise<void>;
      onShutdownCountdown: (cb: (data: { action: "shutdown" | "restart" }) => void) => () => void;
      onShutdownCancel: (cb: () => void) => () => void;
      // Multi-admin approval
      requestAdminApproval: (peerId: string, pcName: string) => Promise<{ success: boolean; error?: string; primaryName?: string }>;
      respondToAdminRequest: (requesterIp: string, requesterPort: number, approved: boolean) => Promise<{ success: boolean }>;
      revokeAdminAccess: (ip: string) => Promise<unknown[]>;
      listApprovedAdmins: () => Promise<{ ip: string; port: number; token: string; approvedAt: number }[]>;
      isAdminApproved: () => Promise<boolean>;
      onApprovalRequest: (cb: (req: { peerId: string; pcName: string; ip: string; at: number }) => void) => () => void;
      onAdminApproved: (cb: (data: { token: string }) => void) => () => void;
      onAdminDenied: (cb: () => void) => () => void;
      onApprovedListUpdated: (cb: (list: unknown[]) => void) => () => void;
      // Audit log
      getLog: () => Promise<{ id: string; type: string; direction: string; from: string; fromIp: string; detail: string; at: number }[]>;
      clearLog: () => Promise<void>;
      addLogEntry: (entry: { type: string; direction: "incoming" | "outgoing"; from: string; fromIp: string; detail: string }) => Promise<void>;
      onLogUpdated: (cb: (entries: unknown[]) => void) => () => void;
      // Shell
      openPath: (p: string) => Promise<void>;
      // Notifications
      notify: (title: string, body: string) => Promise<void>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      on: (channel: string, cb: (...args: any[]) => void) => void;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      off: (channel: string, cb: (...args: any[]) => void) => void;
    };
  }
}
