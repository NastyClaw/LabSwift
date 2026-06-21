import Store from "electron-store";
import path from "path";
import os from "os";

let store: Store | null = null;

/**
 * Initialise the shared store.
 *
 * On Windows we use %PROGRAMDATA%\LabSwift as the data directory so that ALL
 * Windows user accounts on the same machine share the same config (important
 * for lab PCs where teachers log in as a different account than students).
 *
 * On other platforms we fall back to Electron's default userData path.
 */
export function setupStore(): void {
  let cwd: string | undefined;

  if (process.platform === "win32") {
    const programData = process.env.PROGRAMDATA || "C:\\ProgramData";
    cwd = path.join(programData, "LabSwift");
  }

  store = new Store({ cwd }) as unknown as Store;
}

export function getStore(): Store {
  if (!store) {
    // Safety net: auto-initialise if called before setupStore()
    setupStore();
  }
  return store!;
}
