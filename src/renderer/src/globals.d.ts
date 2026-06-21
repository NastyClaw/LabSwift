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
      // Save path (local)
      getSavePath: () => Promise<string>;
      setSavePath: (p: string) => Promise<void>;
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
