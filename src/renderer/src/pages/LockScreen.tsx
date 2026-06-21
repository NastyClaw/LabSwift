import React, { useState, useRef, useEffect } from "react";
import TitleBar from "../components/TitleBar";
import { Eye, EyeOff } from "lucide-react";
import { LabSwiftMark } from "../components/LabSwiftMark";

interface Props {
  role: "admin" | "client";
  onUnlock: () => void;
}

export default function LockScreen({ role, onUnlock }: Props) {
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus password input immediately
    inputRef.current?.focus();
  }, []);

  const handleUnlock = async () => {
    if (!password) {
      triggerShake("Enter the lab password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const ok = await window.labswift.verifyLockScreen(password);
      if (ok) {
        onUnlock();
      } else {
        triggerShake("Incorrect password. Try again.");
        setPassword("");
        inputRef.current?.focus();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  const triggerShake = (msg: string) => {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  return (
    <div className="app-shell">
      <TitleBar title="Locked" />
      <div className="setup-container">
        {/* Brand mark */}
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
            <LabSwiftMark size={26} color="#fff" />
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
            {role === "admin" ? "Admin Console" : "Client"} — Locked
          </div>
        </div>

        <div
          className="setup-card"
          style={{
            animation: shake ? "ls-shake 0.45s ease" : undefined,
          }}
        >
          <div className="setup-title">Enter Lab Password</div>
          <div className="setup-sub">
            This PC is configured as{" "}
            <strong style={{ color: role === "admin" ? "var(--accent)" : "var(--success)" }}>
              {role}
            </strong>
            . Enter the lab password to continue.
          </div>

          <div className="input-group">
            <label className="input-label">Lab Password</label>
            <div style={{ position: "relative" }}>
              <input
                ref={inputRef}
                className="input"
                type={showPw ? "text" : "password"}
                placeholder="Enter password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                style={{ paddingRight: 40 }}
                onKeyDown={(e) => e.key === "Enter" && !loading && handleUnlock()}
                autoComplete="current-password"
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
            disabled={loading || !password}
            onClick={handleUnlock}
          >
            {loading ? "Verifying…" : "Unlock"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes ls-shake {
          0%   { transform: translateX(0); }
          15%  { transform: translateX(-8px); }
          30%  { transform: translateX(8px); }
          45%  { transform: translateX(-6px); }
          60%  { transform: translateX(6px); }
          75%  { transform: translateX(-3px); }
          100% { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
