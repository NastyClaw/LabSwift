import React, { useEffect, useState, useCallback } from "react";
import {
  Monitor,
  Send,
  FolderOpen,
  Folder,
  Settings,
  Activity,
  CheckSquare,
  Square,
  RefreshCw,
  Edit2,
  LayoutGrid,
  X,
  Check,
  Users,
} from "lucide-react";
import TitleBar from "../components/TitleBar";
import TransferRow from "../components/TransferRow";
import ThemeSwitcher from "../components/ThemeSwitcher";
import { Peer, Transfer } from "../lib/types";
import { formatBytes } from "../lib/format";
import { useToast } from "../lib/toast";

type Page = "send" | "computers" | "transfers" | "settings";

export default function AdminApp() {
  const [page, setPage] = useState<Page>("send");
  const [peers, setPeers] = useState<Peer[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  // Track which entries are folders (for display icon)
  const [folderPaths, setFolderPaths] = useState<Set<string>>(new Set());
  const [adminPassword, setAdminPassword] = useState("");
  const [sending, setSending] = useState(false);
  const [savePath, setSavePath] = useState("");
  const [pcName, setPcName] = useState("");
  const [editPeer, setEditPeer] = useState<Peer | null>(null);
  const [editName, setEditName] = useState("");
  const [editRow, setEditRow] = useState("");
  const [editSeat, setEditSeat] = useState("");
  const [rowFilter, setRowFilter] = useState<string>("all");
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    window.labswift.listPeers().then(setPeers);
    window.labswift.listTransfers().then(setTransfers);
    window.labswift.getSavePath().then(setSavePath);
    window.labswift.storeGet("pcName").then((n) => setPcName((n as string) || ""));
    window.labswift.storeGet("adminPassword").then((p) => {
      if (p) setAdminPassword(p as string);
    });
    window.labswift.storeGet("minimizeToTray").then((v) => {
      setMinimizeToTray(v !== false);
    });
  }, []);

  useEffect(() => {
    const onPeers = (updated: Peer[]) => setPeers(updated);
    const onTransfers = (updated: Transfer[]) => setTransfers(updated);
    const onReceived = (data: { fileName: string }) => {
      showToast({
        type: "success",
        title: "File Received",
        body: data.fileName,
      });
    };
    window.labswift.on("peers:updated", onPeers);
    window.labswift.on("transfers:updated", onTransfers);
    window.labswift.on("transfer:received", onReceived);
    return () => {
      window.labswift.off("peers:updated", onPeers);
      window.labswift.off("transfers:updated", onTransfers);
      window.labswift.off("transfer:received", onReceived);
    };
  }, [showToast]);

  const clientPeers = peers.filter((p) => p.role === "client");
  const onlinePeers = clientPeers.filter((p) => p.online);
  const rows = Array.from(
    new Set(clientPeers.filter((p) => p.row).map((p) => p.row!))
  ).sort();
  const filteredPeers =
    rowFilter === "all"
      ? clientPeers
      : clientPeers.filter((p) => p.row === rowFilter);

  const togglePeer = (id: string, online: boolean) => {
    if (!online) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(onlinePeers.map((p) => p.id)));
  const selectRow = (row: string) => {
    const rowPeers = onlinePeers.filter((p) => p.row === row).map((p) => p.id);
    setSelectedIds(new Set(rowPeers));
  };
  const clearSelection = () => setSelectedIds(new Set());

  const pickFiles = async () => {
    const files = await window.labswift.openFile();
    if (files.length > 0) {
      setSelectedFiles((prev) => [
        ...prev,
        ...files.filter((f: string) => !prev.includes(f)),
      ]);
    }
  };

  // ── Folder selection: picks a folder, adds it to the queue ──
  const pickFolder = async () => {
    const folder = await window.labswift.openFolder();
    if (folder && !selectedFiles.includes(folder)) {
      setSelectedFiles((prev) => [...prev, folder]);
      setFolderPaths((prev) => new Set([...prev, folder]));
    }
  };

  const removeFile = (path: string) => {
    setSelectedFiles((prev) => prev.filter((f) => f !== path));
    setFolderPaths((prev) => {
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
  };

  const handleSend = async () => {
    if (selectedIds.size === 0) {
      showToast({ type: "error", title: "No PCs selected" });
      return;
    }
    if (selectedFiles.length === 0) {
      showToast({ type: "error", title: "No files or folders selected" });
      return;
    }
    if (!adminPassword) {
      showToast({ type: "error", title: "Admin password not set" });
      return;
    }
    setSending(true);

    const targets = Array.from(selectedIds);
    let totalQueued = 0;
    let anyError = false;

    // Send plain files
    const plainFiles = selectedFiles.filter((f) => !folderPaths.has(f));
    if (plainFiles.length > 0) {
      try {
        const result = await window.labswift.sendFiles(targets, plainFiles, adminPassword);
        totalQueued += result.queued;
      } catch (e) {
        showToast({ type: "error", title: "Send failed", body: String(e) });
        anyError = true;
      }
    }

    // Send folders (each one zipped individually)
    for (const folderPath of selectedFiles.filter((f) => folderPaths.has(f))) {
      try {
        const result = await window.labswift.sendFolder(targets, folderPath, adminPassword);
        if ("error" in result) {
          showToast({ type: "error", title: "Folder send failed", body: result.error });
          anyError = true;
        } else {
          totalQueued += result.queued;
        }
      } catch (e) {
        showToast({ type: "error", title: "Folder send failed", body: String(e) });
        anyError = true;
      }
    }

    if (!anyError) {
      showToast({
        type: "success",
        title: "Transfer started",
        body: `Sending to ${selectedIds.size} PC${selectedIds.size !== 1 ? "s" : ""} — ${totalQueued} item${totalQueued !== 1 ? "s" : ""} queued`,
      });
      setSelectedFiles([]);
      setFolderPaths(new Set());
      setPage("transfers");
    }

    setSending(false);
  };

  const cancelTransfer = async (id: string) => {
    await window.labswift.cancelTransfer(id);
    const updated = await window.labswift.listTransfers();
    setTransfers(updated);
  };

  const retryTransfer = async (id: string) => {
    if (!adminPassword) {
      showToast({ type: "error", title: "Admin password not set" });
      return;
    }
    await window.labswift.retryTransfer(id, adminPassword);
    showToast({ type: "info", title: "Retrying transfer" });
  };

  const openPath = (p: string) => {
    const folder =
      p.includes("/") || p.includes("\\")
        ? p.substring(0, Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")))
        : p;
    window.labswift.openPath(folder);
  };

  const saveSettings = async () => {
    if (pcName.trim()) {
      await window.labswift.storeSet("pcName", pcName.trim());
    }
    if (adminPassword) {
      await window.labswift.storeSet("adminPassword", adminPassword);
    }
    showToast({ type: "success", title: "Settings saved" });
  };

  const pickSavePath = async () => {
    const p = await window.labswift.saveFolder();
    if (p) {
      setSavePath(p);
      await window.labswift.setSavePath(p);
      showToast({ type: "success", title: "Save folder updated" });
    }
  };

  const openEditModal = (peer: Peer) => {
    setEditPeer(peer);
    setEditName(peer.name);
    setEditRow(peer.row || "");
    setEditSeat(peer.seat || "");
  };

  const saveEditPeer = async () => {
    if (!editPeer) return;
    await window.labswift.renamePeer(editPeer.id, editName || editPeer.name);
    await window.labswift.setPeerRow(editPeer.id, editRow, editSeat);
    const updated = await window.labswift.listPeers();
    setPeers(updated);
    setEditPeer(null);
    showToast({ type: "success", title: "PC updated" });
  };

  const doneCount = transfers.filter((t) => t.status === "done").length;
  const failCount = transfers.filter((t) => t.status === "failed").length;
  const sendingCount = transfers.filter((t) => t.status === "sending").length;
  const activeTransfers = transfers.filter(
    (t) => t.status === "sending" || t.status === "retrying"
  );
  const overallProgress =
    activeTransfers.length > 0
      ? Math.round(
          activeTransfers.reduce((sum, t) => sum + t.progress, 0) /
            activeTransfers.length
        )
      : 0;

  return (
    <div className="app-shell">
      <TitleBar title="Admin Console" role="admin" />
      <div className="app-body">
        {/* Sidebar */}
        <nav className="sidebar">
          <div className="sidebar-logo">
            <div className="logo-mark">LS</div>
            <div>
              <div className="logo-text">LabSwift</div>
              <div className="logo-sub">Admin</div>
            </div>
          </div>

          <div className="nav-section">Main</div>

          {(
            [
              { id: "send", icon: <Send size={16} />, label: "Send Files" },
              { id: "computers", icon: <Monitor size={16} />, label: "Computers" },
              { id: "transfers", icon: <Activity size={16} />, label: "Transfers" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => setPage(item.id)}
            >
              {item.icon}
              {item.label}
              {item.id === "transfers" && sendingCount > 0 && (
                <span
                  style={{
                    marginLeft: "auto",
                    background: "var(--accent)",
                    color: "#fff",
                    borderRadius: 10,
                    padding: "1px 7px",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {sendingCount}
                </span>
              )}
            </button>
          ))}

          <div className="nav-section" style={{ marginTop: 8 }}>System</div>
          <button
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            onClick={() => setPage("settings")}
          >
            <Settings size={16} />
            Settings
          </button>

          {/* Stats */}
          <div className="sidebar-footer">
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
              Network Status
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span className="badge badge-online" style={{ fontSize: 10, padding: "2px 8px" }}>
                <span className="dot" />
                {onlinePeers.length} online
              </span>
              <span className="badge badge-offline" style={{ fontSize: 10, padding: "2px 8px" }}>
                {clientPeers.length - onlinePeers.length} offline
              </span>
            </div>
          </div>
        </nav>

        {/* Main */}
        <main className="main-content">
          {/* ── SEND PAGE ── */}
          {page === "send" && (
            <>
              <div>
                <div className="page-title">Send Files</div>
                <div className="page-sub">Select computers and files or folders, then send.</div>
              </div>

              {/* Stats row */}
              <div className="stats-row">
                <div className="stat-card">
                  <div className="stat-label">Online PCs</div>
                  <div className="stat-value">{onlinePeers.length}</div>
                  <div className="stat-sub">ready to receive</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Selected</div>
                  <div className="stat-value">{selectedIds.size}</div>
                  <div className="stat-sub">PCs targeted</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Items queued</div>
                  <div className="stat-value">{selectedFiles.length}</div>
                  <div className="stat-sub">
                    {folderPaths.size > 0
                      ? `${folderPaths.size} folder${folderPaths.size !== 1 ? "s" : ""}`
                      : "ready to send"}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Sent today</div>
                  <div className="stat-value">{doneCount}</div>
                  <div className="stat-sub">
                    {failCount > 0 ? `${failCount} failed` : "no failures"}
                  </div>
                </div>
              </div>

              {/* Active transfer banner */}
              {activeTransfers.length > 0 && (
                <div className="card" style={{ padding: 16 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <RefreshCw size={14} className="spin" color="var(--accent)" />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        Sending {activeTransfers.length} item
                        {activeTransfers.length > 1 ? "s" : ""}…
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        fontFamily: "'JetBrains Mono', monospace",
                        color: "var(--accent)",
                      }}
                    >
                      {overallProgress}%
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill active"
                      style={{ width: `${overallProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* PC Selection */}
              <div className="card">
                <div className="card-title">
                  <Monitor size={14} />
                  Select Computers
                  <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    {rows.map((r) => (
                      <button
                        key={r}
                        className="btn btn-sm btn-secondary"
                        onClick={() => selectRow(r)}
                      >
                        Row {r}
                      </button>
                    ))}
                    <button className="btn btn-sm btn-secondary" onClick={selectAll}>
                      <CheckSquare size={13} />
                      All
                    </button>
                    <button className="btn btn-sm btn-secondary" onClick={clearSelection}>
                      <Square size={13} />
                      None
                    </button>
                  </div>
                </div>

                {clientPeers.length === 0 ? (
                  <div className="empty-state">
                    <Monitor size={36} />
                    <div className="empty-state-title">No computers found</div>
                    <div className="empty-state-desc">
                      Waiting for clients to connect to the network…
                    </div>
                  </div>
                ) : (
                  <div className="pc-grid">
                    {clientPeers.map((peer) => (
                      <div
                        key={peer.id}
                        className={`pc-card ${selectedIds.has(peer.id) ? "selected" : ""} ${!peer.online ? "offline" : ""}`}
                        onClick={() => togglePeer(peer.id, peer.online)}
                        title={!peer.online ? "This PC is offline" : undefined}
                      >
                        {selectedIds.has(peer.id) && (
                          <div className="pc-check">
                            <Check size={10} color="#fff" />
                          </div>
                        )}
                        <div className="pc-icon">
                          <Monitor size={20} />
                        </div>
                        <div className="pc-name">{peer.name}</div>
                        <div className="pc-meta">
                          {peer.row && peer.seat
                            ? `Row ${peer.row} · Seat ${peer.seat}`
                            : peer.host}
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <span
                            className={`badge ${peer.online ? "badge-online" : "badge-offline"}`}
                            style={{ fontSize: 10, padding: "1px 7px" }}
                          >
                            <span className="dot" />
                            {peer.online ? "Online" : "Offline"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* File / Folder Selection */}
              <div className="card">
                <div className="card-title">
                  <FolderOpen size={14} />
                  Select Files or Folders
                  <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    <button className="btn btn-sm btn-secondary" onClick={pickFiles}>
                      <FolderOpen size={13} />
                      Add Files
                    </button>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={pickFolder}
                      title="Select a whole folder — it will be zipped and extracted on the client"
                    >
                      <Folder size={13} />
                      Add Folder
                    </button>
                  </div>
                </div>

                {selectedFiles.length === 0 ? (
                  <div className="empty-state" style={{ padding: "24px" }}>
                    <FolderOpen size={28} />
                    <div className="empty-state-desc">
                      No files or folders selected. Use the buttons above to add items.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {selectedFiles.map((f) => {
                      const isFolder = folderPaths.has(f);
                      const name = f.replace(/\\/g, "/").split("/").pop()!;
                      return (
                        <div key={f} className="file-item">
                          {isFolder ? (
                            <Folder size={14} color="var(--warning, #f59e0b)" />
                          ) : (
                            <FolderOpen size={14} color="var(--accent)" />
                          )}
                          <span className="file-name" title={f}>
                            {name}
                          </span>
                          <span className="file-size" title={f}>
                            {isFolder
                              ? "folder"
                              : f.replace(/\\/g, "/").split("/").slice(-2).join("/")}
                          </span>
                          <button className="btn-icon" onClick={() => removeFile(f)}>
                            <X size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Send button */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button
                  className="btn btn-primary"
                  style={{ padding: "10px 28px", fontSize: 14 }}
                  onClick={handleSend}
                  disabled={
                    sending ||
                    selectedIds.size === 0 ||
                    selectedFiles.length === 0
                  }
                >
                  <Send size={15} />
                  {sending
                    ? "Sending…"
                    : `Send to ${selectedIds.size} PC${selectedIds.size !== 1 ? "s" : ""}`}
                </button>
              </div>
            </>
          )}

          {/* ── COMPUTERS PAGE ── */}
          {page === "computers" && (
            <>
              <div className="page-header">
                <div>
                  <div className="page-title">Computers</div>
                  <div className="page-sub">
                    Manage lab PCs — rename, assign rows, and monitor status.
                  </div>
                </div>
                <button
                  className="btn btn-secondary"
                  onClick={() => window.labswift.listPeers().then(setPeers)}
                >
                  <RefreshCw size={14} />
                  Refresh
                </button>
              </div>

              {rows.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className={`btn btn-sm ${rowFilter === "all" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setRowFilter("all")}
                  >
                    All Rows
                  </button>
                  {rows.map((r) => (
                    <button
                      key={r}
                      className={`btn btn-sm ${rowFilter === r ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => setRowFilter(r)}
                    >
                      Row {r}
                    </button>
                  ))}
                </div>
              )}

              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                {filteredPeers.length === 0 ? (
                  <div className="empty-state">
                    <Users size={36} />
                    <div className="empty-state-title">No computers found</div>
                    <div className="empty-state-desc">
                      Client PCs will appear here once connected.
                    </div>
                  </div>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Computer</th>
                        <th>IP Address</th>
                        <th>Row / Seat</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPeers.map((peer) => (
                        <tr key={peer.id}>
                          <td>
                            <div style={{ fontWeight: 500 }}>{peer.name}</div>
                          </td>
                          <td>
                            <span
                              style={{
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: 12,
                                color: "var(--text-secondary)",
                              }}
                            >
                              {peer.host}:{peer.port}
                            </span>
                          </td>
                          <td>
                            {peer.row && peer.seat ? (
                              <span>
                                Row {peer.row}, Seat {peer.seat}
                              </span>
                            ) : (
                              <span style={{ color: "var(--text-muted)" }}>—</span>
                            )}
                          </td>
                          <td>
                            <span
                              className={`badge ${peer.online ? "badge-online" : "badge-offline"}`}
                            >
                              <span className="dot" />
                              {peer.online ? "Online" : "Offline"}
                            </span>
                          </td>
                          <td>
                            <button
                              className="btn btn-sm btn-secondary"
                              onClick={() => openEditModal(peer)}
                            >
                              <Edit2 size={12} />
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {/* ── TRANSFERS PAGE ── */}
          {page === "transfers" && (
            <>
              <div>
                <div className="page-title">Transfers</div>
                <div className="page-sub">All outgoing file and folder transfers.</div>
              </div>
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                {transfers.length === 0 ? (
                  <div className="empty-state">
                    <Activity size={36} />
                    <div className="empty-state-title">No transfers yet</div>
                    <div className="empty-state-desc">
                      Sent files will appear here.
                    </div>
                  </div>
                ) : (
                  transfers.map((t) => (
                    <TransferRow
                      key={t.id}
                      transfer={t}
                      onCancel={cancelTransfer}
                      onRetry={retryTransfer}
                      onOpen={openPath}
                    />
                  ))
                )}
              </div>
            </>
          )}

          {/* ── SETTINGS PAGE ── */}
          {page === "settings" && (
            <>
              <div>
                <div className="page-title">Settings</div>
                <div className="page-sub">Configure the admin console.</div>
              </div>

              <div className="card" style={{ maxWidth: 500 }}>
                <div className="card-title">
                  <Settings size={14} />
                  Admin Configuration
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div className="input-group">
                    <label className="input-label">This PC's Name</label>
                    <input
                      className="input"
                      value={pcName}
                      onChange={(e) => setPcName(e.target.value)}
                      placeholder="e.g. Admin-PC"
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label">Admin / Lab Password</label>
                    <input
                      className="input"
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="Change password"
                    />
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      Clients must use this password to accept incoming files.
                    </span>
                  </div>

                  <div className="input-group">
                    <label className="input-label">Received Files Save Folder</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        className="input"
                        value={savePath}
                        readOnly
                        placeholder="Default: Downloads/LabSwift"
                        style={{ flex: 1 }}
                      />
                      <button className="btn btn-secondary" onClick={pickSavePath}>
                        <FolderOpen size={14} />
                        Browse
                      </button>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      The folder will be created automatically if it doesn't exist.
                    </span>
                  </div>

                  <div className="input-group">
                    <label
                      className="input-label"
                      style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                    >
                      <input
                        type="checkbox"
                        checked={minimizeToTray}
                        onChange={async (e) => {
                          setMinimizeToTray(e.target.checked);
                          await window.labswift.storeSet("minimizeToTray", e.target.checked);
                        }}
                      />
                      Minimize to tray instead of closing
                    </label>
                  </div>

                  <button className="btn btn-primary" onClick={saveSettings}>
                    Save Settings
                  </button>
                </div>
              </div>

              <div className="card" style={{ maxWidth: 500 }}>
                <div className="card-title">Appearance</div>
                <ThemeSwitcher />
              </div>

              <div className="card" style={{ maxWidth: 500 }}>
                <div className="card-title" style={{ color: "var(--danger)" }}>
                  Danger Zone
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    Reset this PC back to the first-time setup screen. All settings and
                    peer history will be cleared.
                  </div>
                  <button
                    className="btn btn-danger"
                    onClick={async () => {
                      if (
                        !window.confirm(
                          "Reset LabSwift? This will clear all settings and return to setup."
                        )
                      )
                        return;
                      await window.labswift.setupReset();
                      // Small delay so main process fully releases the port before reload
                      setTimeout(() => window.location.reload(), 200);
                    }}
                  >
                    Reset Setup
                  </button>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Edit peer modal */}
      {editPeer && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={() => setEditPeer(null)}
        >
          <div
            className="card"
            style={{ width: 360, padding: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-title" style={{ marginBottom: 16 }}>
              <LayoutGrid size={14} />
              Edit PC
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="input-group">
                <label className="input-label">Name</label>
                <input
                  className="input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <div className="input-group" style={{ flex: 1 }}>
                  <label className="input-label">Row</label>
                  <input
                    className="input"
                    value={editRow}
                    onChange={(e) => setEditRow(e.target.value)}
                    placeholder="A"
                  />
                </div>
                <div className="input-group" style={{ flex: 1 }}>
                  <label className="input-label">Seat</label>
                  <input
                    className="input"
                    value={editSeat}
                    onChange={(e) => setEditSeat(e.target.value)}
                    placeholder="1"
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setEditPeer(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={saveEditPeer}
                >
                  <Check size={13} />
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
