import Store from "electron-store";

type StoreSchema = Record<string, unknown>;

let store: Store<StoreSchema> | null = null;

export function setupStore() {
  store = new Store<StoreSchema>({
    name: "labswift-config",
    defaults: {
      role: null,
      adminPasswordHash: null,
      adminPassword: null,
      peers: [],
      savePath: null,
      pcName: null,
      transfers: [],
      peerId: null,
      incomingTransfers: {},
    },
  });
}

export function getStore(): Store<StoreSchema> {
  if (!store) throw new Error("Store not initialized");
  return store;
}
