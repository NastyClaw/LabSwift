import React, { useState } from "react";
import { Shield, Monitor, Eye, EyeOff, Key } from "lucide-react";
import TitleBar from "../components/TitleBar";
import { LabSwiftMark } from "../components/LabSwiftMark";

interface Props {
  onComplete: (role: "admin" | "client") => void;
}

type Step = "role" | "admin-key-check" | "password";

export default function Setup({ onComplete }: Props) {
  const [step, setStep]                   = useState<Step>("role");
  const [role, setRole]                   = useState<"admin" | "client" | null>(null);
  const [adminKeyInput, setAdminKeyInput] = useState("");
  const [password, setPassword]           = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw]               = useState(false);
  const [pcName, setPcName]               = useState("");
  const [error, setError]                 = useState("");
  const [loading, setLoading]             = useState(false);

  const handleRoleNext = async () => {
    if (!role) return;

    if (role === "client") {
      // Clients go straight to the password step — no gate needed
      setStep("password");
      return;
    }

    // Admin: check whether an Admin Setup Key has already been configured.
    // If this is the very first admin setup on the network (no key stored yet)
    // we skip the check and go directly to password — the admin IS the one
    // creating the key right now.
    const hasExistingKey = await window.labswift.storeGet("adminPasswordHash");
    if (!hasExistingKey) {
      // First-ever admin setup — no key to verify against yet
      setStep("password");
      return;
    }

    // A key already exists — someone must prove they're the admin
    setStep("admin-key-check");
  };

  const handleAdminKeyCheck = async () => {
    if (!adminKeyInput.trim()) {
      setError("Enter the Admin Setup Key to continue.");
      return;
    }
    setLoading(true);
    setError("");
    const ok = await window.labswift.verifyAdmin(adminKeyInput);
    setLoading(false);
    if (ok) {
      setStep("password");
      setAdminKeyInput("");
    } else {
      setError("Incorrect Admin Setup Key. Contact the lab administrator.");
      setAdminKeyInput("");
    }
  };

  const handleFinish = async () => {
    setError("");
    if (!password) {
      setError("Password is required.");
      return;
    }
    if (role === "admin" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (pcName.trim()) {
      await window.labswift.storeSet("pcName", pcName.trim());
    }
    setLoading(true);
    try {
      await window.labswift.setupComplete(role!, password);
      onComplete(role!);
    } catch {
      setError("Setup failed. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="app-shell">
      <TitleBar title="Setup" />
      <div className="setup-container">
        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, background: "var(--accent)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <LabSwiftMark size={26} color="#fff" />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)" }}>LabSwift</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>LAN File Transfer System</div>
        </div>

        <div className="setup-card">

          {/* ── Step 1: Role selection ── */}
          {step === "role" && (
            <>
              <div className="setup-title">First-time Setup</div>
              <div className="setup-sub">What role does this computer play in the lab?</div>

              <div className="role-cards">
                <div className={`role-card ${role === "admin" ? "selected" : ""}`} onClick={() => setRole("admin")}>
                  <Shield size={28} color="var(--accent)" />
                  <div className="role-card-title">Admin</div>
                  <div className="role-card-desc">Admin/Distributor. This is the admin sends files to all PCs.</div>
                </div>
                <div className={`role-card ${role === "client" ? "selected" : ""}`} onClick={() => setRole("client")}>
                  <Monitor size={28} color="var(--success)" />
                  <div className="role-card-title">Client</div>
                  <div className="role-card-desc">Client/Receiver. Receives files from admin.</div>
                </div>
              </div>

              {error && <div style={{ color: "var(--danger)", fontSize: 12.5, padding: "8px 12px", background: "var(--danger-dim)", borderRadius: 6 }}>{error}</div>}

              <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={!role || loading} onClick={handleRoleNext}>
                {loading ? "Checking…" : "Continue"}
              </button>
            </>
          )}

          {/* ── Step 1b: Admin key verification ── */}
          {/* Only shown when claiming Admin on a machine that already has an
              Admin Setup Key stored. Prevents students from resetting and
              claiming admin on their own PCs. */}
          {step === "admin-key-check" && (
            <>
              <button className="btn-icon" style={{ width: "fit-content" }} onClick={() => { setStep("role"); setError(""); }}>← Back</button>

              <div className="setup-title">Admin Verification</div>
              <div className="setup-sub">
                An admin is already configured on this network. Enter the <strong>Admin Setup Key</strong> to claim admin on this machine.
                <br /><br />
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  If you are a student, select <strong>Client</strong> instead. Ask your lab attendant for the lab password.
                </span>
              </div>

              <div className="input-group">
                <label className="input-label"><Key size={12} style={{ display: "inline", marginRight: 4 }} />Admin Setup Key</label>
                <div style={{ position: "relative" }}>
                  <input
                    className="input"
                    type={showPw ? "text" : "password"}
                    placeholder="Enter admin setup key"
                    value={adminKeyInput}
                    onChange={(e) => { setAdminKeyInput(e.target.value); if (error) setError(""); }}
                    style={{ paddingRight: 40 }}
                    onKeyDown={(e) => e.key === "Enter" && !loading && handleAdminKeyCheck()}
                    autoFocus
                  />
                  <button className="btn-icon" style={{ position: "absolute", right: 6, top: 4 }} onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {error && <div style={{ color: "var(--danger)", fontSize: 12.5, padding: "8px 12px", background: "var(--danger-dim)", borderRadius: 6 }}>{error}</div>}

              <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={loading || !adminKeyInput.trim()} onClick={handleAdminKeyCheck}>
                {loading ? "Verifying…" : "Verify & Continue"}
              </button>
            </>
          )}

          {/* ── Step 2: Password entry ── */}
          {step === "password" && (
            <>
              <button className="btn-icon" style={{ width: "fit-content" }} onClick={() => { setStep("role"); setError(""); }}>← Back</button>

              <div className="setup-title">
                {role === "admin" ? "Set Admin Password" : "Enter Lab Password"}
              </div>
              <div className="setup-sub">
                {role === "admin"
                  ? "Create a password. Clients will use this to verify the connection. Keep it safe — it is also the Admin Setup Key for future admin registrations."
                  : "Enter the lab password provided by your lab admin."}
              </div>

              <div className="input-group">
                <label className="input-label">This PC's Name (optional)</label>
                <input className="input" placeholder="e.g. Lab-PC-01" value={pcName} onChange={(e) => setPcName(e.target.value)} />
              </div>

              <div className="input-group">
                <label className="input-label">{role === "admin" ? "Admin Password" : "Lab Password"}</label>
                <div style={{ position: "relative" }}>
                  <input
                    className="input"
                    type={showPw ? "text" : "password"}
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ paddingRight: 40 }}
                    onKeyDown={(e) => e.key === "Enter" && handleFinish()}
                    autoFocus
                  />
                  <button className="btn-icon" style={{ position: "absolute", right: 6, top: 4 }} onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {role === "admin" && (
                <div className="input-group">
                  <label className="input-label">Confirm Password</label>
                  <input className="input" type={showPw ? "text" : "password"} placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleFinish()} />
                </div>
              )}

              {error && <div style={{ color: "var(--danger)", fontSize: 12.5, padding: "8px 12px", background: "var(--danger-dim)", borderRadius: 6 }}>{error}</div>}

              <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={loading} onClick={handleFinish}>
                {loading ? "Setting up…" : "Launch LabSwift"}
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
