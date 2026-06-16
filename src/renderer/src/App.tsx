import React, { useEffect, useState } from "react";
import Setup from "./pages/Setup";
import AdminApp from "./pages/AdminApp";
import ClientApp from "./pages/ClientApp";
import { ToastProvider } from "./lib/toast";

type Role = "admin" | "client" | null;

export default function App() {
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.labswift.storeGet("role").then((r) => {
      setRole(r as Role);
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
    <ToastProvider>
      {!role ? (
        <Setup onComplete={(r) => setRole(r)} />
      ) : role === "admin" ? (
        <AdminApp />
      ) : (
        <ClientApp />
      )}
    </ToastProvider>
  );
}
