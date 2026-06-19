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
      setupComplete: (
        role: "admin" | "client",
        password: string
      ) => Promise<{ success: boolean }>;
      verifyAdmin: (password: string) => Promise<boolean>;
      setupReset: () => Promise<{ success: boolean }>;
      openFile: () => Promise<string[]>;
      openFolder: () => Promise<string | null>;
      saveFolder: () => Promise<string | null>;
      sendFiles: (
        targetIds: string[],
        filePaths: string[],
        adminPassword: string
      ) => Promise<{ queued: number }>;
      listTransfers: () => Promise<import("./lib/types").Transfer[]>;
      cancelTransfer: (id: string) => Promise<void>;
      retryTransfer: (id: string, adminPassword: string) => Promise<void>;
      listPeers: () => Promise<import("./lib/types").Peer[]>;
      renamePeer: (id: string, name: string) => Promise<import("./lib/types").Peer[]>;
      setPeerRow: (
        id: string,
        row: string,
        seat: string
      ) => Promise<import("./lib/types").Peer[]>;
      getSavePath: () => Promise<string>;
      setSavePath: (p: string) => Promise<void>;
      openPath: (p: string) => Promise<void>;
      notify: (title: string, body: string) => Promise<void>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      on: (channel: string, cb: (...args: any[]) => void) => void;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      off: (channel: string, cb: (...args: any[]) => void) => void;
    };
  }
}
