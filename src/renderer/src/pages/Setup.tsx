import React, { useState } from "react";
import { Shield, Monitor, Eye, EyeOff, Zap } from "lucide-react";
import TitleBar from "../components/TitleBar";

interface Props {
  onComplete: (role: "admin" | "client") => void;
}

export default function Setup({ onComplete }: Props) {
  const [step, setStep] = useState<"role" | "password">("role");
  const [role, setRole] = useState<"admin" | "client" | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pcName, setPcName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRoleNext = () => {
    if (!role) return;
    setStep("password");
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
    } catch (e) {
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
          <div
            style={{
              width: 56,
              height: 56,
              background: "var(--accent)",
              borderRadius: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <Zap size={26} color="#fff" />
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: "var(--text-primary)",
            }}
          >
            LabSwift
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              marginTop: 4,
            }}
          >
            LAN File Transfer System
          </div>
        </div>

        <div className="setup-card">
          {step === "role" ? (
            <>
              <div className="setup-title">First-time Setup</div>
              <div className="setup-sub">
                What role does this computer play in the lab?
              </div>

              <div className="role-cards">
                <div
                  className={`role-card ${role === "admin" ? "selected" : ""}`}
                  onClick={() => setRole("admin")}
                >
                  <Shield size={28} color="var(--accent)" />
                  <div className="role-card-title">Admin</div>
                  <div className="role-card-desc">
                    Lab attendant. Sends files to all PCs.
                  </div>
                </div>
                <div
                  className={`role-card ${role === "client" ? "selected" : ""}`}
                  onClick={() => setRole("client")}
                >
                  <Monitor size={28} color="var(--success)" />
                  <div className="role-card-title">Client</div>
                  <div className="role-card-desc">
                    Student PC. Receives files from admin.
                  </div>
                </div>
              </div>

              <button
                className="btn btn-primary"
                style={{ width: "100%", justifyContent: "center" }}
                disabled={!role}
                onClick={handleRoleNext}
              >
                Continue
              </button>
            </>
          ) : (
            <>
              <button
                className="btn-icon"
                style={{ width: "fit-content" }}
                onClick={() => setStep("role")}
              >
                ← Back
              </button>

              <div className="setup-title">
                {role === "admin" ? "Set Admin Password" : "Enter Lab Password"}
              </div>
              <div className="setup-sub">
                {role === "admin"
                  ? "Create a password. Clients will use this to verify the connection."
                  : "Enter the password provided by your lab admin."}
              </div>

              <div className="input-group">
                <label className="input-label">This PC's Name (optional)</label>
                <input
                  className="input"
                  placeholder="e.g. Lab-PC-01"
                  value={pcName}
                  onChange={(e) => setPcName(e.target.value)}
                />
              </div>

              <div className="input-group">
                <label className="input-label">
                  {role === "admin" ? "Admin Password" : "Lab Password"}
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    className="input"
                    type={showPw ? "text" : "password"}
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ paddingRight: 40 }}
                    onKeyDown={(e) => e.key === "Enter" && handleFinish()}
                  />
                  <button
                    className="btn-icon"
                    style={{ position: "absolute", right: 6, top: 4 }}
                    onClick={() => setShowPw((v) => !v)}
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {role === "admin" && (
                <div className="input-group">
                  <label className="input-label">Confirm Password</label>
                  <input
                    className="input"
                    type={showPw ? "text" : "password"}
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleFinish()}
                  />
                </div>
              )}

              {error && (
                <div
                  style={{
                    color: "var(--danger)",
                    fontSize: 12.5,
                    padding: "8px 12px",
                    background: "var(--danger-dim)",
                    borderRadius: 6,
                  }}
                >
                  {error}
                </div>
              )}

              <button
                className="btn btn-primary"
                style={{ width: "100%", justifyContent: "center" }}
                disabled={loading}
                onClick={handleFinish}
              >
                {loading ? "Setting up…" : "Launch LabSwift"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
