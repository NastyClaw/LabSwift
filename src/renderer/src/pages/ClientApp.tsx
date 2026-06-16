import React, { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  FolderOpen,
  Settings,
  Activity,
  Zap,
  Bell,
} from "lucide-react";
import TitleBar from "../components/TitleBar";
import TransferRow from "../components/TransferRow";
import { Transfer } from "../lib/types";
import { useToast } from "../lib/toast";

type Page = "receive" | "transfers" | "settings";

export default function ClientApp() {
  const [page, setPage] = useState<Page>("receive");
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [savePath, setSavePath] = useState("");
  const [pcName, setPcName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [notifications, setNotifications] = useState<
    { id: string; fileName: string; time: number }[]
  >([]);
  const { showToast } = useToast();

  useEffect(() => {
    window.labswift.listTransfers().then(setTransfers);
    window.labswift.getSavePath().then(setSavePath);
    window.labswift.storeGet("pcName").then((n) => setPcName((n as string) || ""));
    window.labswift.storeGet("adminPassword").then((p) => {
      if (p) setAdminPassword(p as string);
    });
  }, []);

  useEffect(() => {
    const onTransfers = (updated: Transfer[]) => setTransfers(updated);
    const onReceived = (data: { fileName: string; savedPath: string }) => {
      showToast({
        type: "success",
        title: "File Received",
        body: `Saved: ${data.fileName}`,
      });
      window.labswift.notify("LabSwift — File Received", data.fileName);
      setNotifications((prev) => [
        { id: Math.random().toString(36).slice(2), fileName: data.fileName, time: Date.now() },
        ...prev.slice(0, 19),
      ]);
    };
    window.labswift.on("transfers:updated", onTransfers);
    window.labswift.on("transfer:received", onReceived);
    return () => {
      window.labswift.off("transfers:updated", onTransfers);
      window.labswift.off("transfer:received", onReceived);
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

  const openSaveFolder = () => {
    if (savePath) window.labswift.openPath(savePath);
  };

  const saveSettings = async () => {
    if (pcName.trim()) {
      await window.labswift.storeSet("pcName", pcName.trim());
    }
    showToast({ type: "success", title: "Settings saved" });
  };

  const incomingDone = transfers.filter(
    (t) => t.direction === "incoming" && t.status === "done"
  ).length;

  const openPath = (p: string) => {
    const folder = p.includes("/") || p.includes("\\")
      ? p.substring(0, Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")))
      : p;
    window.labswift.openPath(folder);
  };

  return (
    <div className="app-shell">
      <TitleBar title="Client" role="client" />
      <div className="app-body">
        {/* Sidebar */}
        <nav className="sidebar">
          <div className="sidebar-logo">
            <div className="logo-mark" style={{ background: "var(--success)" }}>
              LS
            </div>
            <div>
              <div className="logo-text">LabSwift</div>
              <div className="logo-sub">Client</div>
            </div>
          </div>

          <div className="nav-section">Main</div>

          {(
            [
              {
                id: "receive",
                icon: <ArrowDownLeft size={16} />,
                label: "Receive",
              },
              {
                id: "transfers",
                icon: <Activity size={16} />,
                label: "History",
              },
              {
                id: "settings",
                icon: <Settings size={16} />,
                label: "Settings",
              },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => setPage(item.id)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}

          <div className="sidebar-footer">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 0",
              }}
            >
              <span className="badge badge-online" style={{ fontSize: 10 }}>
                <span className="dot" />
                Listening
              </span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {pcName || "Client PC"}
            </div>
          </div>
        </nav>

        {/* Main */}
        <main className="main-content">
          {/* ── RECEIVE PAGE ── */}
          {page === "receive" && (
            <>
              <div>
                <div className="page-title">Receive Files</div>
                <div className="page-sub">
                  This PC is ready to receive files from the lab admin.
                </div>
              </div>

              {/* Stats */}
              <div className="stats-row">
                <div className="stat-card">
                  <div className="stat-label">Files Received</div>
                  <div className="stat-value">{incomingDone}</div>
                  <div className="stat-sub">total this session</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Save Location</div>
                  <div
                    style={{
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: "var(--text-primary)",
                      marginTop: 4,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {savePath || "Downloads/LabSwift"}
                  </div>
                  <button
                    className="btn btn-sm btn-secondary"
                    style={{ marginTop: 6 }}
                    onClick={openSaveFolder}
                  >
                    <FolderOpen size={12} />
                    Open Folder
                  </button>
                </div>
              </div>

              {/* Status card */}
              <div
                className="card"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 48,
                  gap: 16,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: "50%",
                    background: "var(--success-dim)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    animation: "pulse 2s infinite",
                  }}
                >
                  <Zap size={32} color="var(--success)" />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                    }}
                  >
                    Ready to Receive
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--text-secondary)",
                      marginTop: 6,
                      maxWidth: 320,
                    }}
                  >
                    Files sent by the lab admin will be automatically saved to
                    your LabSwift folder and you'll be notified instantly.
                  </div>
                </div>
              </div>

              {/* Recent notifications */}
              {notifications.length > 0 && (
                <div className="card">
                  <div className="card-title">
                    <Bell size={14} />
                    Recent Files
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 10px",
                          background: "var(--bg-elevated)",
                          borderRadius: "var(--radius)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        <ArrowDownLeft size={14} color="var(--success)" />
                        <span
                          style={{
                            flex: 1,
                            fontSize: 13,
                            fontFamily: "'JetBrains Mono', monospace",
                            color: "var(--text-primary)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {n.fileName}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {new Date(n.time).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── HISTORY ── */}
          {page === "transfers" && (
            <>
              <div>
                <div className="page-title">Transfer History</div>
                <div className="page-sub">All files received this session.</div>
              </div>

              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                {transfers.length === 0 ? (
                  <div className="empty-state">
                    <Activity size={36} />
                    <div className="empty-state-title">No transfers yet</div>
                    <div className="empty-state-desc">
                      Files received from the admin will appear here.
                    </div>
                  </div>
                ) : (
                  transfers.map((t) => (
                    <TransferRow
                      key={t.id}
                      transfer={t}
                      onOpen={openPath}
                    />
                  ))
                )}
              </div>
            </>
          )}

          {/* ── SETTINGS ── */}
          {page === "settings" && (
            <>
              <div>
                <div className="page-title">Settings</div>
                <div className="page-sub">Configure this client PC.</div>
              </div>

              <div className="card" style={{ maxWidth: 500 }}>
                <div className="card-title">
                  <Settings size={14} />
                  Client Configuration
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                  }}
                >
                  <div className="input-group">
                    <label className="input-label">This PC's Name</label>
                    <input
                      className="input"
                      value={pcName}
                      onChange={(e) => setPcName(e.target.value)}
                      placeholder="e.g. Lab-PC-01"
                    />
                    <span
                      style={{ fontSize: 11, color: "var(--text-muted)" }}
                    >
                      Shown on the admin's computer list.
                    </span>
                  </div>

                  <div className="input-group">
                    <label className="input-label">
                      Received Files Save Folder
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        className="input"
                        value={savePath}
                        readOnly
                        placeholder="Default: Downloads/LabSwift"
                        style={{ flex: 1 }}
                      />
                      <button
                        className="btn btn-secondary"
                        onClick={pickSavePath}
                      >
                        <FolderOpen size={14} />
                        Browse
                      </button>
                    </div>
                    <span
                      style={{ fontSize: 11, color: "var(--text-muted)" }}
                    >
                      You can choose any folder — C:\, D:\, or anywhere.
                    </span>
                  </div>

                  <button className="btn btn-primary" onClick={saveSettings}>
                    Save Settings
                  </button>
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
