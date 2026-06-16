import BonjourLib from "bonjour-service";
import { BrowserWindow } from "electron";
import os from "os";
import { getStore } from "./store";
import type { Peer } from "./main";

type BonjourInstance = InstanceType<typeof BonjourLib>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceInstance = any;

let bonjour: BonjourInstance | null = null;
let advertiser: ReturnType<BonjourInstance["publish"]> | null = null;
let browser: ReturnType<BonjourInstance["find"]> | null = null;
let offlineTimer: NodeJS.Timeout | null = null;

export function startDiscovery(
  role: string,
  port: number,
  win: BrowserWindow
) {
  bonjour = new BonjourLib();

  const store = getStore();
  const pcName =
    (store.get("pcName") as string) || os.hostname() || "Unknown-PC";

  advertiser = bonjour.publish({
    name: `labswift-${role}-${pcName}-${getPeerId()}`,
    type: "labswift",
    port,
    txt: {
      role,
      pcName,
      id: getPeerId(),
    },
  });

  browser = bonjour.find({ type: "labswift" }, (service: ServiceInstance) => {
    handleServiceUp(service, win);
  });

  browser.on("down", (service: ServiceInstance) => {
    handleServiceDown(service, win);
  });

  offlineTimer = setInterval(() => {
    pruneOfflinePeers(win);
  }, 15000);
}

function handleServiceUp(service: ServiceInstance, win: BrowserWindow) {
  const store = getStore();
  const txt = service.txt as Record<string, string> | undefined;
  const id = txt?.id || service.name;
  const role = txt?.role || "unknown";
  const pcName = txt?.pcName || service.name;
  const addresses = (service as { addresses?: string[] }).addresses;
  const host = addresses?.[0] || service.host;
  const port = service.port;

  const peers = (store.get("peers") as Peer[]) ?? [];
  const existing = peers.find((p) => p.id === id);

  const updated: Peer = {
    id,
    name: existing?.name || pcName,
    host,
    port,
    role,
    online: true,
    row: existing?.row,
    seat: existing?.seat,
    lastSeen: Date.now(),
  };

  const newPeers = existing
    ? peers.map((p) => (p.id === id ? updated : p))
    : [...peers, updated];

  store.set("peers", newPeers);
  win.webContents.send("peers:updated", newPeers);
}

function handleServiceDown(service: ServiceInstance, win: BrowserWindow) {
  const store = getStore();
  const txt = service.txt as Record<string, string> | undefined;
  const id = txt?.id || service.name;
  const peers = (store.get("peers") as Peer[]) ?? [];
  const updated = peers.map((p) =>
    p.id === id ? { ...p, online: false } : p
  );
  store.set("peers", updated);
  win.webContents.send("peers:updated", updated);
}

function pruneOfflinePeers(win: BrowserWindow) {
  const store = getStore();
  const peers = (store.get("peers") as Peer[]) ?? [];
  const cutoff = Date.now() - 60000;
  const updated = peers.map((p) =>
    p.online && p.lastSeen && p.lastSeen < cutoff
      ? { ...p, online: false }
      : p
  );
  store.set("peers", updated);
  win.webContents.send("peers:updated", updated);
}

export function stopDiscovery() {
  if (offlineTimer) clearInterval(offlineTimer);
  advertiser?.stop();
  browser?.stop();
  bonjour?.destroy();
}

function getPeerId(): string {
  const store = getStore();
  let id = store.get("peerId") as string | undefined;
  if (!id) {
    id = `ls-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    store.set("peerId", id);
  }
  return id;
}
