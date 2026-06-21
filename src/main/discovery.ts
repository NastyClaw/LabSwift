import BonjourLib from "bonjour-service";
import { BrowserWindow } from "electron";
import http from "http";
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

// Active HTTP health poll state: peerId → interval handle
const healthPollers = new Map<string, NodeJS.Timeout>();

// Re-publish our mDNS presence on this interval so peers' stale timers reset.
const HEARTBEAT_INTERVAL_MS = 30_000;

// A peer is considered stale if we haven't seen it within this window.
const PEER_STALE_MS = 90_000;

// How often we check for stale peers via mDNS lastSeen.
const PRUNE_INTERVAL_MS = 15_000;

// Active HTTP poll: ping every peer every this many milliseconds.
const HEALTH_POLL_INTERVAL_MS = 15_000;

// Mark offline after this many consecutive HTTP ping failures.
const HEALTH_FAIL_THRESHOLD = 2;

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

  // Heartbeat: re-announce ourselves so peers' stale timers reset.
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

  // Start active HTTP health polling for this peer if not already running
  startHealthPoller(updated, win);
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

  const changed = updated.some((p, i) => p.online !== peers[i].online);
  if (changed) {
    store.set("peers", updated);
    win.webContents.send("peers:updated", updated);
  }
}

// ── Active HTTP health polling ──────────────────────────────────────────────
// mDNS multicast is unreliable on some managed lab switches (IGMP snooping off,
// or peers on different VLAN segments). We supplement it with direct HTTP pings
// so the admin always has an accurate picture of which PCs are reachable.

function startHealthPoller(peer: Peer, win: BrowserWindow) {
  if (healthPollers.has(peer.id)) return; // already polling this peer

  let failCount = 0;

  const timer = setInterval(async () => {
    try {
      await pingPeer(peer.host, peer.port);
      failCount = 0;

      // Peer is reachable — ensure it's marked online and refresh lastSeen
      const store = getStore();
      const peers = (store.get("peers") as Peer[]) ?? [];
      const current = peers.find((p) => p.id === peer.id);
      if (!current) return;

      if (!current.online) {
        const newPeers = peers.map((p) =>
          p.id === peer.id ? { ...p, online: true, lastSeen: Date.now() } : p
        );
        store.set("peers", newPeers);
        win.webContents.send("peers:updated", newPeers);
      } else {
        // Just update lastSeen quietly (no UI push needed for routine pings)
        store.set(
          "peers",
          peers.map((p) =>
            p.id === peer.id ? { ...p, lastSeen: Date.now() } : p
          )
        );
      }
    } catch {
      failCount++;
      if (failCount >= HEALTH_FAIL_THRESHOLD) {
        const store = getStore();
        const peers = (store.get("peers") as Peer[]) ?? [];
        const current = peers.find((p) => p.id === peer.id);
        if (current?.online) {
          const newPeers = peers.map((p) =>
            p.id === peer.id ? { ...p, online: false } : p
          );
          store.set("peers", newPeers);
          win.webContents.send("peers:updated", newPeers);
        }
      }
    }
  }, HEALTH_POLL_INTERVAL_MS);

  healthPollers.set(peer.id, timer);
}

/**
 * Fire a single GET /health at a peer and resolve/reject based on result.
 * Times out after 3 seconds so a dead peer doesn't stall the poller.
 */
function pingPeer(host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: host, port, path: "/health", method: "GET", timeout: 3000 },
      (res) => {
        res.resume(); // consume response body to free socket
        if (res.statusCode === 200) resolve();
        else reject(new Error(`HTTP ${res.statusCode}`));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.end();
  });
}

export function stopDiscovery() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (offlineTimer) clearInterval(offlineTimer);

  for (const timer of healthPollers.values()) clearInterval(timer);
  healthPollers.clear();

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
