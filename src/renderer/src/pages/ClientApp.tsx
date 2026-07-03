import React, { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  FolderOpen,
  Settings,
  Activity,
  Bell,
  Wifi,
  MessageSquare,
  Lock,
} from "lucide-react";
import TitleBar from "../components/TitleBar";
import TransferRow from "../components/TransferRow";
import ThemeSwitcher from "../components/ThemeSwitcher";
import { Transfer } from "../lib/types";
import { useToast } from "../lib/toast";

type ChatMsg = { id: string; from: string; text: string; at: number };
type Page = "receive" | "messages" | "transfers" | "settings";

export default function ClientApp() {
  const [page, setPage] = useState<Page>("receive");
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [savePath, setSavePath] = useState("");
  const [pcName, setPcName] = useState("");
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  const [notifications, setNotifications] = useState<{ id: string; fileName: string; time: number }[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  // Remote lock state — when true, shows a fullscreen overlay the student can't dismiss
  const [remotelyLocked, setRemotelyLocked] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    window.labswift.listTransfers().then(setTransfers);
    window.labswift.getSavePath().then(setSavePath);
    window.labswift.storeGet("pcName").then((n) => setPcName((n as string) || ""));
    window.labswift.storeGet("minimizeToTray").then((v) => setMinimizeToTray(v !== false));
  }, []);

  // Clear unread badge when user opens messages tab
  useEffect(() => {
    if (page === "messages") setUnreadCount(0);
  }, [page]);

  useEffect(() => {
    const onTransfers = (updated: Transfer[]) => setTransfers(updated);

    const onReceived = (data: { fileName: string; savedPath: string }) => {
      showToast({ type: "success", title: "File Received", body: `Saved: ${data.fileName}` });
      window.labswift.notify("LabSwift — File Received", data.fileName);
      setNotifications((prev) => [
        { id: Math.random().toString(36).slice(2), fileName: data.fileName, time: Date.now() },
        ...prev.slice(0, 19),
      ]);
    };

    // Chat messages pushed by admin
    const removeChatListener = window.labswift.onChatMessage((msg) => {
      setMessages((prev) => [
        { id: Math.random().toString(36).slice(2), ...msg },
        ...prev.slice(0, 99),
      ]);
      setUnreadCount((c) => c + 1);
      showToast({ type: "info", title: `Message from ${msg.from}`, body: msg.text });
      window.labswift.notify(`LabSwift — ${msg.from}`, msg.text);
    });

    // Save path remotely updated by admin — refresh UI instantly
    const removeSavePathListener = window.labswift.onSavePathUpdated((newPath) => {
      setSavePath(newPath);
      showToast({ type: "success", title: "Save folder updated by admin", body: newPath });
    });

    // Remote lock / unlock pushed by admin
    const removeLockListener = window.labswift.onLockEngage(() => {
      setRemotelyLocked(true);
    });
    const removeUnlockListener = window.labswift.onLockRelease(() => {
      setRemotelyLocked(false);
    });

    window.labswift.on("transfers:updated", onTransfers);
    window.labswift.on("transfer:received", onReceived);

    return () => {
      window.labswift.off("transfers:updated", onTransfers);
      window.labswift.off("transfer:received", onReceived);
      removeChatListener();
      removeSavePathListener();
      removeLockListener();
      removeUnlockListener();
    };
  }, [showToast]);

  const pickSavePath = async () => {
    const p = await window.labswift.saveFolder();
    if (p) {
      setSavePath(p);
      await window.labswift.setSavePath(p);
      showToast({ type: "success", title: "Save folder updated" });
    }
  };

  const openSaveFolder = () => { if (savePath) window.labswift.openPath(savePath); };

  const saveSettings = async () => {
    if (pcName.trim()) await window.labswift.storeSet("pcName", pcName.trim());
    showToast({ type: "success", title: "Settings saved" });
  };

  const incomingDone = transfers.filter((t) => t.direction === "incoming" && t.status === "done").length;

  const openPath = (p: string) => {
    const folder = p.includes("/") || p.includes("\\")
      ? p.substring(0, Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"))) : p;
    window.labswift.openPath(folder);
  };

  return (
    <div className="app-shell">
      <TitleBar title="Client" role="client" />

      {/* ── Remote lock overlay ─────────────────────────────────────────── */}
      {remotelyLocked && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.97)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 24, userSelect: "none",
        }}>
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--danger, #ef4444)22", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Lock size={40} color="var(--danger, #ef4444)" />
          </div>
          <div style={{ textAlign: "center", color: "#fff" }}>
            <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Screen Locked</div>
            <div style={{ fontSize: 14, opacity: 0.6 }}>The lab administrator has locked this screen.</div>
            <div style={{ fontSize: 13, opacity: 0.4, marginTop: 4 }}>Wait for the administrator to unlock, or enter the lab password below.</div>
          </div>
          {/* Allow student to self-unlock with the lab password */}
          <UnlockForm onUnlock={() => setRemotelyLocked(false)} />
        </div>
      )}

      <div className="app-body">
        {/* Sidebar */}
        <nav className="sidebar">
          <div className="sidebar-logo">
            <div className="logo-mark" style={{ background: "var(--success)" }}>LS</div>
            <div><div className="logo-text">LabSwift</div><div className="logo-sub">Client</div></div>
          </div>

          <div className="nav-section">Main</div>
          {([
            { id: "receive", icon: <ArrowDownLeft size={16} />, label: "Receive", badge: 0 },
            { id: "messages", icon: <MessageSquare size={16} />, label: "Messages", badge: unreadCount },
            { id: "transfers", icon: <Activity size={16} />, label: "History", badge: 0 },
            { id: "settings", icon: <Settings size={16} />, label: "Settings", badge: 0 },
          ] as const).map((item) => (
            <button key={item.id} className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => setPage(item.id)}>
              {item.icon}{item.label}
              {item.badge > 0 && (
                <span style={{ marginLeft: "auto", background: "var(--accent)", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>
                  {item.badge}
                </span>
              )}
            </button>
          ))}

          <div className="sidebar-footer">
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0" }}>
              <span className="badge badge-online" style={{ fontSize: 10 }}><span className="dot" />Listening</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{pcName || "Client PC"}</div>
          </div>
        </nav>

        {/* Main */}
        <main className="main-content">

          {/* ── RECEIVE PAGE ── */}
          {page === "receive" && (
            <>
              <div><div className="page-title">Receive Files</div><div className="page-sub">This PC is ready to receive files from the lab admin.</div></div>

              <div className="stats-row">
                <div className="stat-card">
                  <div className="stat-label">Files Received</div>
                  <div className="stat-value">{incomingDone}</div>
                  <div className="stat-sub">total this session</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Save Location</div>
                  <div style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: "var(--text-primary)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {savePath || "Downloads/LabSwift"}
                  </div>
                  <button className="btn btn-sm btn-secondary" style={{ marginTop: 6 }} onClick={openSaveFolder}>
                    <FolderOpen size={12} />Open Folder
                  </button>
                </div>
              </div>

              <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 48, gap: 16, textAlign: "center" }}>
                <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--success-dim)", display: "flex", alignItems: "center", justifyContent: "center", animation: "pulse 2s infinite" }}>
                  <Wifi size={32} color="var(--success)" />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>Ready to Receive</div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6, maxWidth: 320 }}>
                    Files and folders sent by the lab admin will be automatically saved to your LabSwift folder and you'll be notified instantly.
                  </div>
                </div>
              </div>

              {notifications.length > 0 && (
                <div className="card">
                  <div className="card-title"><Bell size={14} />Recent Files</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {notifications.map((n) => (
                      <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "var(--bg-elevated)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                        <ArrowDownLeft size={14} color="var(--success)" />
                        <span style={{ flex: 1, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.fileName}</span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{new Date(n.time).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── MESSAGES PAGE ── */}
          {page === "messages" && (
            <>
              <div><div className="page-title">Messages</div><div className="page-sub">Notification messages sent by the lab admin.</div></div>
              {messages.length === 0 ? (
                <div className="card">
                  <div className="empty-state" style={{ padding: "48px 24px" }}>
                    <MessageSquare size={36} />
                    <div className="empty-state-title">No messages yet</div>
                    <div className="empty-state-desc">Messages broadcast by the admin will appear here.</div>
                  </div>
                </div>
              ) : (
                <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {messages.map((m) => (
                    <div key={m.id} style={{ padding: "12px 14px", background: "var(--bg-elevated)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <MessageSquare size={13} color="var(--accent)" />
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>{m.from}</span>
                        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>{new Date(m.at).toLocaleTimeString()}</span>
                      </div>
                      <div style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.5 }}>{m.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── HISTORY ── */}
          {page === "transfers" && (
            <>
              <div><div className="page-title">Transfer History</div><div className="page-sub">All files received this session.</div></div>
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                {transfers.length === 0 ? (
                  <div className="empty-state"><Activity size={36} /><div className="empty-state-title">No transfers yet</div><div className="empty-state-desc">Files received from the admin will appear here.</div></div>
                ) : (
                  transfers.map((t) => <TransferRow key={t.id} transfer={t} onOpen={openPath} />)
                )}
              </div>
            </>
          )}

          {/* ── SETTINGS ── */}
          {page === "settings" && (
            <>
              <div><div className="page-title">Settings</div><div className="page-sub">Configure this client PC.</div></div>

              <div className="card" style={{ maxWidth: 500 }}>
                <div className="card-title"><Settings size={14} />Client Configuration</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div className="input-group">
                    <label className="input-label">This PC's Name</label>
                    <input className="input" value={pcName} onChange={(e) => setPcName(e.target.value)} placeholder="e.g. Lab-PC-01" />
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Shown on the admin's computer list.</span>
                  </div>

                  <div className="input-group">
                    <label className="input-label">Received Files Save Folder</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input className="input" value={savePath} readOnly placeholder="Default: Downloads/LabSwift" style={{ flex: 1 }} />
                      <button className="btn btn-secondary" onClick={pickSavePath}><FolderOpen size={14} />Browse</button>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      You can change this here, or the admin can push a folder to all PCs at once from the Broadcast page.
                    </span>
                  </div>

                  <div className="input-group">
                    <label className="input-label" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input type="checkbox" checked={minimizeToTray} onChange={async (e) => { setMinimizeToTray(e.target.checked); await window.labswift.storeSet("minimizeToTray", e.target.checked); }} />
                      Minimize to tray instead of closing
                    </label>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Keeps this PC listening in the background. Use the tray icon to quit.</span>
                  </div>

                  <button className="btn btn-primary" onClick={saveSettings}>Save Settings</button>
                </div>
              </div>

              <div className="card" style={{ maxWidth: 500 }}>
                <div className="card-title">Appearance</div>
                <ThemeSwitcher />
              </div>

              <div className="card" style={{ maxWidth: 500 }}>
                <div className="card-title" style={{ color: "var(--danger)" }}>Danger Zone</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Reset this PC back to the first-time setup screen. You will need to re-enter the lab password.</div>
                  <button className="btn btn-danger" onClick={async () => {
                    if (!window.confirm("Reset LabSwift? This will clear all settings and return to setup.")) return;
                    await window.labswift.setupReset();
                    setTimeout(() => window.location.reload(), 200);
                  }}>Reset Setup</button>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}

// ── Self-unlock form ────────────────────────────────────────────────────────
// Lets a student dismiss the remote lock by entering the lab password.
// This doesn't require a server round-trip — the password is already stored
// locally (same value the client used during Setup).
function UnlockForm({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");

  const attempt = async () => {
    const ok = await window.labswift.verifyLockScreen(pw);
    if (ok) { onUnlock(); }
    else { setError("Incorrect password"); setPw(""); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
      <input
        className="input"
        type="password"
        placeholder="Enter lab password to unlock"
        value={pw}
        onChange={(e) => { setPw(e.target.value); setError(""); }}
        onKeyDown={(e) => { if (e.key === "Enter") attempt(); }}
        style={{ width: 280, background: "#ffffff15", border: "1px solid #ffffff30", color: "#fff" }}
        autoFocus
      />
      {error && <div style={{ fontSize: 12, color: "var(--danger, #ef4444)" }}>{error}</div>}
      <button className="btn btn-secondary" onClick={attempt} style={{ width: 280 }}>Unlock</button>
    </div>
  );
}

