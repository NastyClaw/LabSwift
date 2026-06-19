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
let heartbeatTimer: NodeJS.Timeout | null = null;

// How often we re-publish our own presence so peers don't mark us offline.
const HEARTBEAT_INTERVAL_MS = 30_000;

// A peer is considered stale if we haven't seen it within this window.
// Must be longer than HEARTBEAT_INTERVAL_MS so a single missed beat doesn't
// immediately flip a peer offline.
const PEER_STALE_MS = 90_000;

// How often we check for stale peers.
const PRUNE_INTERVAL_MS = 15_000;

export function startDiscovery(
  role: string,
  port: number,
  win: BrowserWindow
) {
  bonjour = new BonjourLib();

  const store = getStore();
  const pcName =
    (store.get("pcName") as string) || os.hostname() || "Unknown-PC";

  const publishService = () => {
    try {
      advertiser?.stop();
    } catch {
      // ignore stop errors during re-publish
    }
    advertiser = bonjour!.publish({
      name: `labswift-${role}-${pcName}-${getPeerId()}`,
      type: "labswift",
      port,
      txt: {
        role,
        pcName,
        id: getPeerId(),
      },
    });
  };

  publishService();

  // Re-announce ourselves on a heartbeat so peers' stale timers reset.
  // This is the main fix for the online/offline flicker: previously peers
  // relied solely on Bonjour "up"/"down" events, which are unreliable on
  // some routers/switches and can silently drop. Now every PC actively
  // re-publishes every 30 s, so the admin's prune window has fresh timestamps.
  heartbeatTimer = setInterval(() => {
    publishService();
  }, HEARTBEAT_INTERVAL_MS);

  browser = bonjour.find({ type: "labswift" }, (service: ServiceInstance) => {
    handleServiceUp(service, win);
  });

  browser.on("down", (service: ServiceInstance) => {
    handleServiceDown(service, win);
  });

  offlineTimer = setInterval(() => {
    pruneOfflinePeers(win);
  }, PRUNE_INTERVAL_MS);
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

  // Skip our own service advertisement
  if (id === getPeerId()) return;

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

  if (id === getPeerId()) return;

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
  const cutoff = Date.now() - PEER_STALE_MS;

  const updated = peers.map((p) =>
    p.online && p.lastSeen && p.lastSeen < cutoff
      ? { ...p, online: false }
      : p
  );

  // Only write + emit if something actually changed
  const changed = updated.some((p, i) => p.online !== peers[i].online);
  if (changed) {
    store.set("peers", updated);
    win.webContents.send("peers:updated", updated);
  }
}

export function stopDiscovery() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (offlineTimer) clearInterval(offlineTimer);
  try { advertiser?.stop(); } catch { /* ignore */ }
  try { browser?.stop(); } catch { /* ignore */ }
  try { bonjour?.destroy(); } catch { /* ignore */ }
  heartbeatTimer = null;
  offlineTimer = null;
  bonjour = null;
  advertiser = null;
  browser = null;
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
