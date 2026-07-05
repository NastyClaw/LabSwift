import React, { useEffect, useState } from "react";
import {
  Monitor, Send, FolderOpen, Folder, Settings, Activity, CheckSquare, Square,
  RefreshCw, Edit2, LayoutGrid, X, Check, Users, MessageSquare, Upload,
  Lock, Unlock, Shield, Trash2, Download, Power, ArrowDownLeft, Globe,
} from "lucide-react";
import TitleBar from "../components/TitleBar";
import TransferRow from "../components/TransferRow";
import ThemeSwitcher from "../components/ThemeSwitcher";
import { Peer, Transfer } from "../lib/types";
import { useToast } from "../lib/toast";

type Page = "send" | "broadcast" | "computers" | "transfers" | "settings" | "log";

export default function AdminApp() {
  const [page, setPage] = useState<Page>("send");
  const [peers, setPeers] = useState<Peer[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [folderPaths, setFolderPaths] = useState<Set<string>>(new Set());

  // ── Password split: livePassword is the ACTUAL credential used for every
  // outgoing request.  settingsPassword is only what's typed in the Settings
  // form — it doesn't change livePassword until Save Settings is clicked.
  // This prevents a stray keystroke in the password field from silently
  // invalidating all subsequent sends/broadcasts.
  const [livePassword, setLivePassword] = useState("");
  const [settingsPassword, setSettingsPassword] = useState("");

  const [sending, setSending] = useState(false);
  const [savePath, setSavePath] = useState("");
  const [pcName, setPcName] = useState("");
  const [editPeer, setEditPeer] = useState<Peer | null>(null);
  const [editName, setEditName] = useState("");
  const [editRow, setEditRow] = useState("");
  const [editSeat, setEditSeat] = useState("");
  const [rowFilter, setRowFilter] = useState<string>("all");
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  // Remote save path state
  const [remoteSavePath, setRemoteSavePath] = useState("");
  const [pushingPath, setPushingPath] = useState(false);
  const [pushTargetAll, setPushTargetAll] = useState(true);
  // Chat state
  const [broadcastText, setBroadcastText] = useState("");
  const [broadcastTargetAll, setBroadcastTargetAll] = useState(true);
  const [broadcasting, setBroadcasting] = useState(false);
  const [locking, setLocking] = useState(false);
  const [sentMessages, setSentMessages] = useState<
    { id: string; text: string; targets: number; sent: number; at: number }[]
  >([]);
  // Security settings
  const [extensionFilter, setExtensionFilter] = useState(true);
  const [malwareScan, setMalwareScan] = useState(true);
  const [savingSecuritySettings, setSavingSecuritySettings] = useState(false);
  // Work collection
  const [collecting, setCollecting] = useState(false);
  const [collectDest, setCollectDest] = useState("");
  const [collectTargetAll, setCollectTargetAll] = useState(true);
  // Open URL
  const [urlInput, setUrlInput] = useState("");
  const [urlTargetAll, setUrlTargetAll] = useState(true);
  const [pushingUrl, setPushingUrl] = useState(false);
  // Shutdown / Restart
  const [shutdownTargetAll, setShutdownTargetAll] = useState(true);
  const [shuttingDown, setShuttingDown] = useState(false);
  const [pendingShutdown, setPendingShutdown] = useState<"shutdown" | "restart" | null>(null);
  // Audit log
  type LogEntry = { id: string; type: string; direction: string; from: string; fromIp: string; detail: string; at: number };
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  // Approval requests from secondary admins
  type ApprovalReq = { peerId: string; pcName: string; ip: string; port: number; at: number };
  const [approvalRequests, setApprovalRequests] = useState<ApprovalReq[]>([]);
  const [approvedAdmins, setApprovedAdmins] = useState<{ ip: string; port: number; token: string; approvedAt: number }[]>([]);

  const { showToast } = useToast();

  useEffect(() => {
    window.labswift.listPeers().then(setPeers);
    window.labswift.listTransfers().then(setTransfers);
    window.labswift.getSavePath().then(setSavePath);
    window.labswift.storeGet("pcName").then((n) => setPcName((n as string) || ""));
    // Load the persisted password into BOTH slots on startup so the settings
    // field shows the current value, but the live credential is always the
    // one that's actually been saved to disk.
    window.labswift.storeGet("adminPassword").then((p) => {
      if (p) { setLivePassword(p as string); setSettingsPassword(p as string); }
    });
    window.labswift.storeGet("minimizeToTray").then((v) => setMinimizeToTray(v !== false));
    window.labswift.getSecuritySettings().then((s) => {
      setExtensionFilter(s.extensionFilter);
      setMalwareScan(s.malwareScan);
    });
    window.labswift.getLog().then((entries) => setLogEntries(entries as LogEntry[]));
    window.labswift.listApprovedAdmins().then(setApprovedAdmins);
  }, []);

  useEffect(() => {
    const onPeers = (updated: Peer[]) => setPeers(updated);
    const onTransfers = (updated: Transfer[]) => setTransfers(updated);
    const onReceived = (data: { fileName: string }) =>
      showToast({ type: "success", title: "File Received", body: data.fileName });

    // Threat notification from Windows Defender scan
    const offThreat = window.labswift.onThreatDetected(({ fileName, detail }) => {
      showToast({ type: "error", title: "⚠ Threat Detected — File Rejected", body: `${fileName}: ${detail ?? "Windows Defender flagged this file"}` });
    });

    // Audit log live updates
    const offLog = window.labswift.onLogUpdated((entries) => setLogEntries(entries as LogEntry[]));

    // Secondary admin approval requests
    const offApproval = window.labswift.onApprovalRequest((req) => {
      setApprovalRequests((prev) => [...prev.filter((r) => r.peerId !== req.peerId), { ...req, port: 7891 }]);
      showToast({ type: "info", title: "Admin access request", body: `${req.pcName} (${req.ip}) wants admin access` });
    });

    // Approved admins list updated
    const offApprovedList = window.labswift.onApprovedListUpdated((list) => {
      setApprovedAdmins(list as { ip: string; port: number; token: string; approvedAt: number }[]);
    });

    window.labswift.on("peers:updated", onPeers);
    window.labswift.on("transfers:updated", onTransfers);
    window.labswift.on("transfer:received", onReceived);
    return () => {
      window.labswift.off("peers:updated", onPeers);
      window.labswift.off("transfers:updated", onTransfers);
      window.labswift.off("transfer:received", onReceived);
      offThreat();
      offLog();
      offApproval();
      offApprovedList();
    };
  }, [showToast]);

  const clientPeers = peers.filter((p) => p.role === "client");
  const onlinePeers = clientPeers.filter((p) => p.online);
  const rows = Array.from(new Set(clientPeers.filter((p) => p.row).map((p) => p.row!))).sort();
  const filteredPeers = rowFilter === "all" ? clientPeers : clientPeers.filter((p) => p.row === rowFilter);

  const togglePeer = (id: string, online: boolean) => {
    if (!online) return;
    setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const selectAll = () => setSelectedIds(new Set(onlinePeers.map((p) => p.id)));
  const selectRow = (row: string) => setSelectedIds(new Set(onlinePeers.filter((p) => p.row === row).map((p) => p.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const pickFiles = async () => {
    const files = await window.labswift.openFile();
    if (files.length > 0) setSelectedFiles((prev) => [...prev, ...files.filter((f: string) => !prev.includes(f))]);
  };

  const pickFolder = async () => {
    const folder = await window.labswift.openFolder();
    if (folder && !selectedFiles.includes(folder)) {
      setSelectedFiles((prev) => [...prev, folder]);
      setFolderPaths((prev) => new Set([...prev, folder]));
    }
  };

  const removeFile = (p: string) => {
    setSelectedFiles((prev) => prev.filter((f) => f !== p));
    setFolderPaths((prev) => { const next = new Set(prev); next.delete(p); return next; });
  };

  const handleSend = async () => {
    if (selectedIds.size === 0) { showToast({ type: "error", title: "No PCs selected" }); return; }
    if (selectedFiles.length === 0) { showToast({ type: "error", title: "No files or folders selected" }); return; }
    if (!livePassword) { showToast({ type: "error", title: "Admin password not set — save it in Settings first" }); return; }
    setSending(true);
    const targets = Array.from(selectedIds);
    let totalQueued = 0;
    let anyError = false;

    const plainFiles = selectedFiles.filter((f) => !folderPaths.has(f));
    if (plainFiles.length > 0) {
      try {
        const result = await window.labswift.sendFiles(targets, plainFiles, livePassword);
        totalQueued += result.queued;
      } catch (e) { showToast({ type: "error", title: "Send failed", body: String(e) }); anyError = true; }
    }

    for (const fp of selectedFiles.filter((f) => folderPaths.has(f))) {
      try {
        const result = await window.labswift.sendFolder(targets, fp, livePassword);
        if ("error" in result) { showToast({ type: "error", title: "Folder send failed", body: result.error }); anyError = true; }
        else totalQueued += result.queued;
      } catch (e) { showToast({ type: "error", title: "Folder send failed", body: String(e) }); anyError = true; }
    }

    if (!anyError) {
      showToast({ type: "success", title: "Transfer started", body: `Sending to ${selectedIds.size} PC${selectedIds.size !== 1 ? "s" : ""} — ${totalQueued} item${totalQueued !== 1 ? "s" : ""} queued` });
      setSelectedFiles([]); setFolderPaths(new Set()); setPage("transfers");
    }
    setSending(false);
  };

  // ── Remote save path push ──
  const pickRemotePath = async () => {
    const p = await window.labswift.saveFolder();
    if (p) setRemoteSavePath(p);
  };

  const handlePushSavePath = async () => {
    if (!remoteSavePath.trim()) { showToast({ type: "error", title: "Enter a path to push" }); return; }
    if (!livePassword) { showToast({ type: "error", title: "Admin password not set — save it in Settings first" }); return; }
    const targetIds = pushTargetAll ? onlinePeers.map((p) => p.id) : Array.from(selectedIds);
    if (targetIds.length === 0) { showToast({ type: "error", title: "No online PCs to push to" }); return; }
    setPushingPath(true);
    try {
      const result = await window.labswift.pushSavePathToClients(targetIds, remoteSavePath.trim(), livePassword);
      showToast({ type: "success", title: `Save path pushed to ${result.pushed}/${result.total} PCs`, body: remoteSavePath.trim() });
    } catch (e) {
      showToast({ type: "error", title: "Push failed", body: String(e) });
    }
    setPushingPath(false);
  };

  // ── Broadcast ──
  const handleBroadcast = async () => {
    if (!broadcastText.trim()) { showToast({ type: "error", title: "Message is empty" }); return; }
    if (!livePassword) { showToast({ type: "error", title: "Admin password not set — save it in Settings first" }); return; }
    const targetIds = broadcastTargetAll ? onlinePeers.map((p) => p.id) : Array.from(selectedIds);
    if (targetIds.length === 0) { showToast({ type: "error", title: "No online PCs to send to" }); return; }
    setBroadcasting(true);
    try {
      const result = await window.labswift.broadcastMessage(targetIds, broadcastText.trim(), livePassword);
      setSentMessages((prev) => [
        { id: Math.random().toString(36).slice(2), text: broadcastText.trim(), targets: result.total, sent: result.sent, at: Date.now() },
        ...prev.slice(0, 49),
      ]);
      if (result.sent === 0) {
        showToast({ type: "error", title: `Message failed (0/${result.total} PCs)`, body: "Password mismatch or all clients offline." });
      } else if (result.sent < result.total) {
        showToast({ type: "info", title: `Message sent to ${result.sent}/${result.total} PCs`, body: "Some PCs failed — they may be offline." });
      } else {
        showToast({ type: "success", title: `Message sent to ${result.sent}/${result.total} PCs` });
      }
      setBroadcastText("");
    } catch (e) { showToast({ type: "error", title: "Broadcast failed", body: String(e) }); }
    setBroadcasting(false);
  };

  const handleLock = async () => {
    if (!livePassword) { showToast({ type: "error", title: "Admin password not set" }); return; }
    const targetIds = broadcastTargetAll ? onlinePeers.map((p) => p.id) : Array.from(selectedIds);
    if (targetIds.length === 0) { showToast({ type: "error", title: "No online PCs selected" }); return; }
    setLocking(true);
    const result = await window.labswift.remoteLock(targetIds, livePassword);
    showToast({ type: result.sent > 0 ? "success" : "error", title: `Lock sent to ${result.sent}/${result.total} PCs` });
    setLocking(false);
  };

  const handleUnlock = async () => {
    if (!livePassword) { showToast({ type: "error", title: "Admin password not set" }); return; }
    const targetIds = broadcastTargetAll ? onlinePeers.map((p) => p.id) : Array.from(selectedIds);
    if (targetIds.length === 0) { showToast({ type: "error", title: "No online PCs selected" }); return; }
    const result = await window.labswift.remoteUnlock(targetIds, livePassword);
    showToast({ type: result.sent > 0 ? "success" : "error", title: `Unlock sent to ${result.sent}/${result.total} PCs` });
  };

  const cancelTransfer = async (id: string) => {
    await window.labswift.cancelTransfer(id);
    setTransfers(await window.labswift.listTransfers());
  };

  const retryTransfer = async (id: string) => {
    if (!livePassword) { showToast({ type: "error", title: "Admin password not set" }); return; }
    await window.labswift.retryTransfer(id, livePassword);
    showToast({ type: "info", title: "Retrying transfer" });
  };

  const openPath = (p: string) => {
    const folder = p.includes("/") || p.includes("\\")
      ? p.substring(0, Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"))) : p;
    window.labswift.openPath(folder);
  };

  const saveSettings = async () => {
    if (pcName.trim()) await window.labswift.storeSet("pcName", pcName.trim());
    if (settingsPassword) {
      await window.labswift.storeSet("adminPassword", settingsPassword);
      // Only now promote the newly-saved password to the live credential
      setLivePassword(settingsPassword);
    }
    showToast({ type: "success", title: "Settings saved" });
  };

  const saveSecuritySettings = async () => {
    setSavingSecuritySettings(true);
    await window.labswift.setSecuritySettings({ extensionFilter, malwareScan });
    setSavingSecuritySettings(false);
    showToast({ type: "success", title: "Security settings saved" });
  };

  const pickSavePath = async () => {
    const p = await window.labswift.saveFolder();
    if (p) { setSavePath(p); await window.labswift.setSavePath(p); showToast({ type: "success", title: "Save folder updated" }); }
  };

  const openEditModal = (peer: Peer) => { setEditPeer(peer); setEditName(peer.name); setEditRow(peer.row || ""); setEditSeat(peer.seat || ""); };

  const saveEditPeer = async () => {
    if (!editPeer) return;
    await window.labswift.renamePeer(editPeer.id, editName || editPeer.name);
    await window.labswift.setPeerRow(editPeer.id, editRow, editSeat);
    setPeers(await window.labswift.listPeers());
    setEditPeer(null);
    showToast({ type: "success", title: "PC updated" });
  };

  const handleForgetPeer = async (peer: Peer) => {
    if (!window.confirm(`Remove "${peer.name}" from the computers list?\n\nIt will re-appear automatically if it comes back online.`)) return;
    const updated = await window.labswift.forgetPeer(peer.id);
    setPeers(updated);
    showToast({ type: "info", title: `${peer.name} removed` });
  };

  const handleCollect = async () => {
    if (!livePassword) { showToast({ type: "error", title: "Admin password not set" }); return; }
    const dest = collectDest || await window.labswift.saveFolder();
    if (!dest) return;
    if (!collectDest) setCollectDest(dest as string);
    const targetIds = collectTargetAll ? onlinePeers.map((p) => p.id) : Array.from(selectedIds);
    if (targetIds.length === 0) { showToast({ type: "error", title: "No online PCs selected" }); return; }
    setCollecting(true);
    const result = await window.labswift.collectWork(targetIds, dest as string, livePassword);
    const ok = result.results.filter((r) => !r.error);
    const failed = result.results.filter((r) => r.error);
    showToast({ type: ok.length > 0 ? "success" : "error", title: `Collected from ${ok.length}/${result.results.length} PCs`, body: failed.length > 0 ? `${failed.length} failed` : `Saved to: ${result.destFolder}` });
    if (ok.length > 0) window.labswift.openPath(result.destFolder);
    setCollecting(false);
  };

  const handlePushUrl = async () => {
    if (!urlInput.trim()) { showToast({ type: "error", title: "Enter a URL" }); return; }
    if (!livePassword) { showToast({ type: "error", title: "Admin password not set" }); return; }
    const targetIds = urlTargetAll ? onlinePeers.map((p) => p.id) : Array.from(selectedIds);
    if (targetIds.length === 0) { showToast({ type: "error", title: "No online PCs" }); return; }
    setPushingUrl(true);
    const result = await window.labswift.pushUrl(targetIds, urlInput.trim(), livePassword);
    showToast({ type: result.sent > 0 ? "success" : "error", title: `URL opened on ${result.sent}/${result.total} PCs` });
    if (result.sent > 0) setUrlInput("");
    setPushingUrl(false);
  };

  const handleShutdown = async (action: "shutdown" | "restart") => {
    if (!livePassword) { showToast({ type: "error", title: "Admin password not set" }); return; }
    const targetIds = shutdownTargetAll ? onlinePeers.map((p) => p.id) : Array.from(selectedIds);
    if (targetIds.length === 0) { showToast({ type: "error", title: "No online PCs" }); return; }
    if (!window.confirm(`Send 5-minute ${action} countdown to ${targetIds.length} PC(s)?`)) return;
    setShuttingDown(true);
    const result = await window.labswift.remoteShutdown(targetIds, action, livePassword);
    setPendingShutdown(action);
    showToast({ type: result.sent > 0 ? "success" : "error", title: `${action === "restart" ? "Restart" : "Shutdown"} sent to ${result.sent}/${result.total} PCs` });
    setShuttingDown(false);
  };

  const handleCancelShutdown = async () => {
    if (!livePassword) return;
    const targetIds = shutdownTargetAll ? onlinePeers.map((p) => p.id) : Array.from(selectedIds);
    await window.labswift.remoteCancelShutdown(targetIds, livePassword);
    setPendingShutdown(null);
    showToast({ type: "success", title: "Shutdown cancelled on all PCs" });
  };

  const handleApprove = async (req: ApprovalReq, approved: boolean) => {
    await window.labswift.respondToAdminRequest(req.ip, req.port, approved);
    setApprovalRequests((prev) => prev.filter((r) => r.peerId !== req.peerId));
    showToast({ type: approved ? "success" : "info", title: approved ? `${req.pcName} approved as admin` : `${req.pcName} denied` });
  };

  const handleRevoke = async (ip: string) => {
    if (!window.confirm("Revoke admin access for this machine?")) return;
    await window.labswift.revokeAdminAccess(ip);
    showToast({ type: "info", title: "Admin access revoked" });
  };

  const doneCount = transfers.filter((t) => t.status === "done").length;
  const failCount = transfers.filter((t) => t.status === "failed").length;
  const sendingCount = transfers.filter((t) => t.status === "sending").length;
  const activeTransfers = transfers.filter((t) => t.status === "sending" || t.status === "retrying");
  const overallProgress = activeTransfers.length > 0
    ? Math.round(activeTransfers.reduce((sum, t) => sum + t.progress, 0) / activeTransfers.length) : 0;

  return (
    <div className="app-shell">
      <TitleBar title="Admin Console" role="admin" />
      <div className="app-body">
        {/* Sidebar */}
        <nav className="sidebar">
          <div className="sidebar-logo">
            <div className="logo-mark">LS</div>
            <div><div className="logo-text">LabSwift</div><div className="logo-sub">Admin</div></div>
          </div>

          <div className="nav-section">Main</div>
          {([
            { id: "send", icon: <Send size={16} />, label: "Send Files" },
            { id: "broadcast", icon: <MessageSquare size={16} />, label: "Broadcast" },
            { id: "computers", icon: <Monitor size={16} />, label: "Computers" },
            { id: "transfers", icon: <Activity size={16} />, label: "Transfers" },
          ] as const).map((item) => (
            <button key={item.id} className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => setPage(item.id)}>
              {item.icon}{item.label}
              {item.id === "transfers" && sendingCount > 0 && (
                <span style={{ marginLeft: "auto", background: "var(--accent)", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>{sendingCount}</span>
              )}
            </button>
          ))}

          <div className="nav-section" style={{ marginTop: 8 }}>System</div>
          <button className={`nav-item ${page === "settings" ? "active" : ""}`} onClick={() => setPage("settings")}>
            <Settings size={16} />Settings
          </button>
          <button className={`nav-item ${page === "log" ? "active" : ""}`} onClick={() => setPage("log")} style={{ position: "relative" }}>
            <Shield size={16} />Audit Log
            {approvalRequests.length > 0 && (
              <span style={{ marginLeft: "auto", background: "var(--danger, #ef4444)", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>
                {approvalRequests.length}
              </span>
            )}
          </button>

          <div className="sidebar-footer">
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Network Status</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span className="badge badge-online" style={{ fontSize: 10, padding: "2px 8px" }}><span className="dot" />{onlinePeers.length} online</span>
              <span className="badge badge-offline" style={{ fontSize: 10, padding: "2px 8px" }}>{clientPeers.length - onlinePeers.length} offline</span>
            </div>
          </div>
        </nav>

        {/* Main */}
        <main className="main-content">

          {/* ── SEND PAGE ── */}
          {page === "send" && (
            <>
              <div><div className="page-title">Send Files</div><div className="page-sub">Select computers and files or folders, then send.</div></div>

              <div className="stats-row">
                <div className="stat-card"><div className="stat-label">Online PCs</div><div className="stat-value">{onlinePeers.length}</div><div className="stat-sub">ready to receive</div></div>
                <div className="stat-card"><div className="stat-label">Selected</div><div className="stat-value">{selectedIds.size}</div><div className="stat-sub">PCs targeted</div></div>
                <div className="stat-card"><div className="stat-label">Items queued</div><div className="stat-value">{selectedFiles.length}</div><div className="stat-sub">{folderPaths.size > 0 ? `${folderPaths.size} folder${folderPaths.size !== 1 ? "s" : ""}` : "ready to send"}</div></div>
                <div className="stat-card"><div className="stat-label">Sent today</div><div className="stat-value">{doneCount}</div><div className="stat-sub">{failCount > 0 ? `${failCount} failed` : "no failures"}</div></div>
              </div>

              {activeTransfers.length > 0 && (
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <RefreshCw size={14} className="spin" color="var(--accent)" />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Sending {activeTransfers.length} item{activeTransfers.length > 1 ? "s" : ""}…</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>{overallProgress}%</span>
                  </div>
                  <div className="progress-bar"><div className="progress-fill active" style={{ width: `${overallProgress}%` }} /></div>
                </div>
              )}

              <div className="card">
                <div className="card-title">
                  <Monitor size={14} />Select Computers
                  <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    {rows.map((r) => <button key={r} className="btn btn-sm btn-secondary" onClick={() => selectRow(r)}>Row {r}</button>)}
                    <button className="btn btn-sm btn-secondary" onClick={selectAll}><CheckSquare size={13} />All</button>
                    <button className="btn btn-sm btn-secondary" onClick={clearSelection}><Square size={13} />None</button>
                  </div>
                </div>
                {clientPeers.length === 0 ? (
                  <div className="empty-state"><Monitor size={36} /><div className="empty-state-title">No computers found</div><div className="empty-state-desc">Waiting for clients to connect…</div></div>
                ) : (
                  <div className="pc-grid">
                    {clientPeers.map((peer) => (
                      <div key={peer.id} className={`pc-card ${selectedIds.has(peer.id) ? "selected" : ""} ${!peer.online ? "offline" : ""}`} onClick={() => togglePeer(peer.id, peer.online)} title={!peer.online ? "This PC is offline" : undefined}>
                        {selectedIds.has(peer.id) && <div className="pc-check"><Check size={10} color="#fff" /></div>}
                        <div className="pc-icon"><Monitor size={20} /></div>
                        <div className="pc-name">{peer.name}</div>
                        <div className="pc-meta">{peer.row && peer.seat ? `Row ${peer.row} · Seat ${peer.seat}` : peer.host}</div>
                        <div style={{ marginTop: 6 }}>
                          <span className={`badge ${peer.online ? "badge-online" : "badge-offline"}`} style={{ fontSize: 10, padding: "1px 7px" }}><span className="dot" />{peer.online ? "Online" : "Offline"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card">
                <div className="card-title">
                  <FolderOpen size={14} />Select Files or Folders
                  <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    <button className="btn btn-sm btn-secondary" onClick={pickFiles}><FolderOpen size={13} />Add Files</button>
                    <button className="btn btn-sm btn-secondary" onClick={pickFolder}><Folder size={13} />Add Folder</button>
                  </div>
                </div>
                {selectedFiles.length === 0 ? (
                  <div className="empty-state" style={{ padding: "24px" }}><FolderOpen size={28} /><div className="empty-state-desc">No files or folders selected.</div></div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {selectedFiles.map((f) => {
                      const isFolder = folderPaths.has(f);
                      const name = f.replace(/\\/g, "/").split("/").pop()!;
                      return (
                        <div key={f} className="file-item">
                          {isFolder ? <Folder size={14} color="var(--warning, #f59e0b)" /> : <FolderOpen size={14} color="var(--accent)" />}
                          <span className="file-name" title={f}>{name}</span>
                          <span className="file-size">{isFolder ? "folder" : f.replace(/\\/g, "/").split("/").slice(-2).join("/")}</span>
                          <button className="btn-icon" onClick={() => removeFile(f)}><X size={13} /></button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className="btn btn-primary" style={{ padding: "10px 28px", fontSize: 14 }} onClick={handleSend} disabled={sending || selectedIds.size === 0 || selectedFiles.length === 0}>
                  <Send size={15} />{sending ? "Sending…" : `Send to ${selectedIds.size} PC${selectedIds.size !== 1 ? "s" : ""}`}
                </button>
              </div>
            </>
          )}

          {/* ── BROADCAST PAGE ── */}
          {page === "broadcast" && (
            <>
              <div><div className="page-title">Broadcast</div><div className="page-sub">Send messages or remotely set the save folder on client computers.</div></div>

              {/* Message composer */}
              <div className="card" style={{ maxWidth: 560 }}>
                <div className="card-title"><MessageSquare size={14} />Send Message</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div className="input-group">
                    <label className="input-label">Target</label>
                    <div style={{ display: "flex", gap: 16 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                        <input type="radio" checked={broadcastTargetAll} onChange={() => setBroadcastTargetAll(true)} />All online ({onlinePeers.length})
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                        <input type="radio" checked={!broadcastTargetAll} onChange={() => setBroadcastTargetAll(false)} />Selected ({selectedIds.size})
                      </label>
                    </div>
                  </div>
                  <div className="input-group">
                    <label className="input-label">Message</label>
                    <textarea className="input" rows={3} style={{ resize: "vertical", fontFamily: "inherit" }} value={broadcastText} onChange={(e) => setBroadcastText(e.target.value)} placeholder="e.g. Please save your work and close all programs." onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleBroadcast(); }} />
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Ctrl+Enter to send</span>
                  </div>
                  <button className="btn btn-primary" style={{ alignSelf: "flex-end", padding: "9px 24px" }} onClick={handleBroadcast} disabled={broadcasting || !broadcastText.trim()}>
                    <Send size={14} />{broadcasting ? "Sending…" : "Send Message"}
                  </button>
                </div>
              </div>

              {/* Remote save path push */}
              <div className="card" style={{ maxWidth: 560 }}>
                <div className="card-title"><Upload size={14} />Push Save Folder to Clients</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                  Set where all client PCs will save received files — remotely, without touching each machine.
                  The folder is created automatically on each client if it doesn't exist.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div className="input-group">
                    <label className="input-label">Target</label>
                    <div style={{ display: "flex", gap: 16 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                        <input type="radio" checked={pushTargetAll} onChange={() => setPushTargetAll(true)} />All online ({onlinePeers.length})
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                        <input type="radio" checked={!pushTargetAll} onChange={() => setPushTargetAll(false)} />Selected ({selectedIds.size})
                      </label>
                    </div>
                  </div>
                  <div className="input-group">
                    <label className="input-label">Save Folder Path</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        className="input"
                        value={remoteSavePath}
                        onChange={(e) => setRemoteSavePath(e.target.value)}
                        placeholder="e.g. C:\LabFiles or D:\Students"
                        style={{ flex: 1 }}
                      />
                      <button className="btn btn-secondary" onClick={pickRemotePath}>
                        <FolderOpen size={14} />Browse
                      </button>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      You can type a Windows path directly (e.g. D:\Lab) or browse to pick one from this machine. The path must be valid on the client PCs.
                    </span>
                  </div>
                  <button className="btn btn-primary" style={{ alignSelf: "flex-end", padding: "9px 24px" }} onClick={handlePushSavePath} disabled={pushingPath || !remoteSavePath.trim()}>
                    <Upload size={14} />{pushingPath ? "Pushing…" : "Push to Clients"}
                  </button>
                </div>
              </div>

              {/* Remote lock / unlock */}
              <div className="card" style={{ maxWidth: 560 }}>
                <div className="card-title"><Lock size={14} />Remote Screen Lock</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14 }}>
                  Instantly lock or unlock the screen on selected client PCs. Locked PCs show a full-screen overlay that only clears when you send Unlock or the student enters the lab password.
                </div>
                <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input type="radio" checked={broadcastTargetAll} onChange={() => setBroadcastTargetAll(true)} />All online ({onlinePeers.length})
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input type="radio" checked={!broadcastTargetAll} onChange={() => setBroadcastTargetAll(false)} />Selected ({selectedIds.size})
                  </label>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn btn-danger" style={{ flex: 1 }} onClick={handleLock} disabled={locking}>
                    <Lock size={14} />{locking ? "Locking…" : "Lock Screens"}
                  </button>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={handleUnlock}>
                    <Unlock size={14} />Unlock Screens
                  </button>
                </div>
              </div>

              {/* Open URL on student PCs */}
              <div className="card" style={{ maxWidth: 560 }}>
                <div className="card-title"><LayoutGrid size={14} />Open URL on Student PCs</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                  Instantly open a webpage on selected student computers — no student interaction needed.
                </div>
                <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input type="radio" checked={urlTargetAll} onChange={() => setUrlTargetAll(true)} />All online ({onlinePeers.length})
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input type="radio" checked={!urlTargetAll} onChange={() => setUrlTargetAll(false)} />Selected ({selectedIds.size})
                  </label>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input className="input" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="https://example.com" style={{ flex: 1 }} onKeyDown={(e) => e.key === "Enter" && handlePushUrl()} />
                  <button className="btn btn-primary" onClick={handlePushUrl} disabled={pushingUrl || !urlInput.trim()}>
                    <Send size={13} />{pushingUrl ? "Sending…" : "Open"}
                  </button>
                </div>
              </div>

              {/* Shutdown / Restart */}
              <div className="card" style={{ maxWidth: 560 }}>
                <div className="card-title"><Power size={14} />Shutdown / Restart</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14 }}>
                  Students get a 5-minute countdown with a save reminder before the PC powers off.
                  You can cancel before the timer runs out.
                </div>
                <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input type="radio" checked={shutdownTargetAll} onChange={() => setShutdownTargetAll(true)} />All online ({onlinePeers.length})
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input type="radio" checked={!shutdownTargetAll} onChange={() => setShutdownTargetAll(false)} />Selected ({selectedIds.size})
                  </label>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => handleShutdown("shutdown")} disabled={shuttingDown || !!pendingShutdown}>
                    <Power size={13} />Shutdown
                  </button>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => handleShutdown("restart")} disabled={shuttingDown || !!pendingShutdown}>
                    <RefreshCw size={13} />Restart
                  </button>
                  {pendingShutdown && (
                    <button className="btn btn-secondary" onClick={handleCancelShutdown}>
                      <X size={13} />Cancel {pendingShutdown}
                    </button>
                  )}
                </div>
                {pendingShutdown && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "var(--warning, #f59e0b)", display: "flex", alignItems: "center", gap: 6 }}>
                    <Activity size={12} />5-minute countdown is active on student PCs
                  </div>
                )}
              </div>

              {/* Sent message log */}
              {sentMessages.length > 0 && (
                <div className="card" style={{ maxWidth: 560 }}>
                  <div className="card-title"><Activity size={14} />Sent Messages</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {sentMessages.map((m) => (
                      <div key={m.id} style={{ padding: "10px 12px", background: "var(--bg-elevated)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 13, color: "var(--text-primary)", marginBottom: 4 }}>{m.text}</div>
                        <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--text-muted)" }}>
                          <span style={{ color: m.sent === m.targets ? "var(--success)" : "var(--warning, #f59e0b)" }}>{m.sent}/{m.targets} delivered</span>
                          <span>{new Date(m.at).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── COMPUTERS PAGE ── */}
          {page === "computers" && (
            <>
              <div className="page-header">
                <div><div className="page-title">Computers</div><div className="page-sub">Manage lab PCs — rename, assign rows, collect student work.</div></div>
                <button className="btn btn-secondary" onClick={() => window.labswift.listPeers().then(setPeers)}><RefreshCw size={14} />Refresh</button>
              </div>

              {/* Collect student work */}
              <div className="card" style={{ maxWidth: 640 }}>
                <div className="card-title"><ArrowDownLeft size={14} />Collect Student Work</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                  Pull files from each student's save folder directly to your machine. Files are scanned for threats on arrival.
                  Each PC's work is saved in a separate subfolder named after their computer.
                </div>
                <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input type="radio" checked={collectTargetAll} onChange={() => setCollectTargetAll(true)} />All online ({onlinePeers.length})
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input type="radio" checked={!collectTargetAll} onChange={() => setCollectTargetAll(false)} />Selected ({selectedIds.size})
                  </label>
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <input className="input" value={collectDest} onChange={(e) => setCollectDest(e.target.value)} placeholder="Save to folder (click Browse or leave blank to pick)" style={{ flex: 1 }} />
                  <button className="btn btn-secondary" onClick={async () => { const p = await window.labswift.saveFolder(); if (p) setCollectDest(p); }}>
                    <FolderOpen size={13} />Browse
                  </button>
                </div>
                <button className="btn btn-primary" onClick={handleCollect} disabled={collecting}>
                  <Download size={13} />{collecting ? "Collecting…" : "Collect Work"}
                </button>
              </div>
              {rows.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className={`btn btn-sm ${rowFilter === "all" ? "btn-primary" : "btn-secondary"}`} onClick={() => setRowFilter("all")}>All Rows</button>
                  {rows.map((r) => <button key={r} className={`btn btn-sm ${rowFilter === r ? "btn-primary" : "btn-secondary"}`} onClick={() => setRowFilter(r)}>Row {r}</button>)}
                </div>
              )}
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                {filteredPeers.length === 0 ? (
                  <div className="empty-state"><Users size={36} /><div className="empty-state-title">No computers found</div><div className="empty-state-desc">Client PCs will appear here once connected.</div></div>
                ) : (
                  <table className="table">
                    <thead><tr><th>Computer</th><th>IP Address</th><th>Row / Seat</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {filteredPeers.map((peer) => (
                        <tr key={peer.id}>
                          <td><div style={{ fontWeight: 500 }}>{peer.name}</div></td>
                          <td><span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "var(--text-secondary)" }}>{peer.host}:{peer.port}</span></td>
                          <td>{peer.row && peer.seat ? <span>Row {peer.row}, Seat {peer.seat}</span> : <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                          <td><span className={`badge ${peer.online ? "badge-online" : "badge-offline"}`}><span className="dot" />{peer.online ? "Online" : "Offline"}</span></td>
                          <td>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button className="btn btn-sm btn-secondary" onClick={() => openEditModal(peer)}><Edit2 size={12} />Edit</button>
                              <button
                                className="btn btn-sm btn-danger"
                                style={{ opacity: 0.7 }}
                                title="Remove this PC from the list"
                                onClick={() => handleForgetPeer(peer)}
                              ><Trash2 size={12} /></button>
                            </div>
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
              <div><div className="page-title">Transfers</div><div className="page-sub">All outgoing file and folder transfers.</div></div>
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                {transfers.length === 0 ? (
                  <div className="empty-state"><Activity size={36} /><div className="empty-state-title">No transfers yet</div><div className="empty-state-desc">Sent files will appear here.</div></div>
                ) : (
                  transfers.map((t) => <TransferRow key={t.id} transfer={t} onCancel={cancelTransfer} onRetry={retryTransfer} onOpen={openPath} />)
                )}
              </div>
            </>
          )}

          {/* ── SETTINGS PAGE ── */}
          {page === "settings" && (
            <>
              <div><div className="page-title">Settings</div><div className="page-sub">Configure the admin console.</div></div>

              <div className="card" style={{ maxWidth: 500 }}>
                <div className="card-title"><Settings size={14} />Admin Configuration</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div className="input-group">
                    <label className="input-label">This PC's Name</label>
                    <input className="input" value={pcName} onChange={(e) => setPcName(e.target.value)} placeholder="e.g. Admin-PC" />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Admin / Lab Password</label>
                    <input className="input" type="password" value={settingsPassword} onChange={(e) => setSettingsPassword(e.target.value)} placeholder="Change password" />
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Password is only applied when you click <strong>Save Settings</strong>.</span>
                  </div>
                  <div className="input-group">
                    <label className="input-label">Admin Save Folder (files received by this PC)</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input className="input" value={savePath} readOnly placeholder="Default: Downloads/LabSwift" style={{ flex: 1 }} />
                      <button className="btn btn-secondary" onClick={pickSavePath}><FolderOpen size={14} />Browse</button>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      This is where files sent <em>to this admin PC</em> are saved. To set the save folder on client machines, use <strong>Broadcast → Push Save Folder</strong>.
                    </span>
                  </div>
                  <div className="input-group">
                    <label className="input-label" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input type="checkbox" checked={minimizeToTray} onChange={async (e) => { setMinimizeToTray(e.target.checked); await window.labswift.storeSet("minimizeToTray", e.target.checked); }} />
                      Minimize to tray instead of closing
                    </label>
                  </div>
                  <button className="btn btn-primary" onClick={saveSettings}>Save Settings</button>
                </div>
              </div>

              <div className="card" style={{ maxWidth: 500 }}>
                <div className="card-title">Appearance</div>
                <ThemeSwitcher />
              </div>

              <div className="card" style={{ maxWidth: 500 }}>
                <div className="card-title"><Shield size={14} />Security</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    These settings apply to files received by <strong>all machines</strong> in the lab (both this admin PC and all clients). Changes take effect immediately — no restart needed.
                  </div>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                    <input type="checkbox" style={{ marginTop: 2 }} checked={extensionFilter} onChange={(e) => setExtensionFilter(e.target.checked)} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>Block dangerous file types</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        Rejects .exe, .bat, .cmd, .ps1, .vbs, .js, .lnk and other executable/script types. Uncheck only if you need to push installers.
                      </div>
                    </div>
                  </label>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                    <input type="checkbox" style={{ marginTop: 2 }} checked={malwareScan} onChange={(e) => setMalwareScan(e.target.checked)} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>Scan received files with Windows Defender</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        Runs a quick scan on each received file before saving it. Adds ~1–2 seconds. Requires Windows Defender to be installed (skipped silently if not available).
                      </div>
                    </div>
                  </label>
                  <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} onClick={saveSecuritySettings} disabled={savingSecuritySettings}>
                    <Shield size={13} />{savingSecuritySettings ? "Saving…" : "Save Security Settings"}
                  </button>
                </div>
              </div>

              <div className="card" style={{ maxWidth: 500 }}>
                <div className="card-title" style={{ color: "var(--danger)" }}>Danger Zone</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Reset this PC back to the first-time setup screen. All settings and peer history will be cleared.</div>
                  <button className="btn btn-danger" onClick={async () => {
                    if (!window.confirm("Reset LabSwift? This will clear all settings and return to setup.")) return;
                    await window.labswift.setupReset();
                    setTimeout(() => window.location.reload(), 200);
                  }}>Reset Setup</button>
                </div>
              </div>

              {/* Approved secondary admins */}
              <div className="card" style={{ maxWidth: 500 }}>
                <div className="card-title"><Shield size={14} />Approved Admin Machines</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                  Other teacher PCs that have been granted admin access. Pending requests appear in the Audit Log page with Approve / Deny buttons.
                </div>
                {approvedAdmins.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: 16 }}>No secondary admins approved yet.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {approvedAdmins.map((a) => (
                      <div key={a.ip} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "var(--bg-elevated)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                        <Shield size={13} color="var(--success)" />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{a.ip}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Approved {new Date(a.approvedAt).toLocaleDateString()}</div>
                        </div>
                        <button className="btn btn-sm btn-danger" style={{ opacity: 0.8 }} onClick={() => handleRevoke(a.ip)}>Revoke</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── LOG PAGE ── */}
          {page === "log" && (
            <>
              <div className="page-header">
                <div><div className="page-title">Audit Log</div><div className="page-sub">Who sent what, when, and from which machine.</div></div>
                <button className="btn btn-secondary" onClick={() => window.labswift.clearLog().then(() => setLogEntries([]))}>Clear Log</button>
              </div>

              {/* Pending approval requests */}
              {approvalRequests.length > 0 && (
                <div className="card" style={{ borderLeft: "3px solid var(--accent)" }}>
                  <div className="card-title"><Shield size={14} />Pending Admin Approval Requests</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {approvalRequests.map((req) => (
                      <div key={req.peerId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--bg-elevated)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                        <Shield size={14} color="var(--accent)" />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{req.pcName}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{req.ip} · {new Date(req.at).toLocaleTimeString()}</div>
                        </div>
                        <button className="btn btn-sm btn-primary" onClick={() => handleApprove(req, true)}><Check size={12} />Approve</button>
                        <button className="btn btn-sm btn-danger" style={{ opacity: 0.8 }} onClick={() => handleApprove(req, false)}><X size={12} />Deny</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                {logEntries.length === 0 ? (
                  <div className="empty-state"><Shield size={36} /><div className="empty-state-title">No log entries yet</div><div className="empty-state-desc">File sends, collections, broadcasts and commands will appear here.</div></div>
                ) : (
                  <table className="table">
                    <thead><tr><th>Time</th><th>Type</th><th>From</th><th>IP</th><th>Detail</th></tr></thead>
                    <tbody>
                      {logEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td style={{ whiteSpace: "nowrap", fontSize: 12, color: "var(--text-muted)" }}>{new Date(entry.at).toLocaleString()}</td>
                          <td>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: entry.direction === "incoming" ? "var(--success-dim)" : "var(--accent-dim)", color: entry.direction === "incoming" ? "var(--success)" : "var(--accent)" }}>
                              {entry.type}
                            </span>
                          </td>
                          <td style={{ fontSize: 13 }}>{entry.from}</td>
                          <td style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text-muted)" }}>{entry.fromIp}</td>
                          <td style={{ fontSize: 12, color: "var(--text-secondary)", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Edit peer modal */}
      {editPeer && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setEditPeer(null)}>
          <div className="card" style={{ width: 360, padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <div className="card-title" style={{ marginBottom: 16 }}><LayoutGrid size={14} />Edit PC</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="input-group"><label className="input-label">Name</label><input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
              <div style={{ display: "flex", gap: 8 }}>
                <div className="input-group" style={{ flex: 1 }}><label className="input-label">Row</label><input className="input" value={editRow} onChange={(e) => setEditRow(e.target.value)} placeholder="A" /></div>
                <div className="input-group" style={{ flex: 1 }}><label className="input-label">Seat</label><input className="input" value={editSeat} onChange={(e) => setEditSeat(e.target.value)} placeholder="1" /></div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setEditPeer(null)}>Cancel</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveEditPeer}><Check size={13} />Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
