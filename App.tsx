import React, { useEffect, useState } from "react";
import Setup from "./pages/Setup";
import AdminApp from "./pages/AdminApp";
import ClientApp from "./pages/ClientApp";
import { ToastProvider } from "./lib/toast";
import { ThemeProvider } from "./lib/theme";
import LockScreen from "./pages/LockScreen";

type Role = "admin" | "client" | null;

export default function App() {
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);
  // locked = true means we have a role but the user hasn't entered the password yet
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    window.labswift.storeGet("role").then((r) => {
      const foundRole = r as Role;
      setRole(foundRole);
      // If a role is already configured, require the password before showing the app
      if (foundRole) {
        setLocked(true);
      }
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          background: "var(--bg-base)",
          color: "var(--text-muted)",
          fontSize: 13,
        }}
      >
        Starting LabSwift…
      </div>
    );
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        {!role ? (
          // First-time setup
          <Setup onComplete={(r) => { setRole(r); setLocked(false); }} />
        ) : locked ? (
          // Lock screen — shown every time the app is opened while already configured
          <LockScreen role={role} onUnlock={() => setLocked(false)} />
        ) : role === "admin" ? (
          <AdminApp />
        ) : (
          <ClientApp />
        )}
      </ToastProvider>
    </ThemeProvider>
  );
}
