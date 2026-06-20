import React from "react";
import { Minus, Square, X } from "lucide-react";
import { LabSwiftMark } from "./LabSwiftMark";

interface Props {
  title?: string;
  role?: "admin" | "client";
}

export default function TitleBar({ title, role }: Props) {
  return (
    <div className="titlebar">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 22,
            height: 22,
            background: "var(--accent)",
            borderRadius: 5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <LabSwiftMark size={12} color="#fff" />
        </div>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-secondary)",
          }}
        >
          LabSwift
          {title && (
            <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
              {" "}
              — {title}
            </span>
          )}
        </span>
        {role && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 7px",
              borderRadius: 4,
              background:
                role === "admin" ? "var(--accent-dim)" : "var(--success-dim)",
              color: role === "admin" ? "var(--accent)" : "var(--success)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {role}
          </span>
        )}
      </div>
      <div className="titlebar-controls">
        <button
          className="titlebar-btn"
          onClick={() => window.labswift.minimize()}
          title="Minimize"
        >
          <Minus size={13} />
        </button>
        <button
          className="titlebar-btn"
          onClick={() => window.labswift.maximize()}
          title="Maximize"
        >
          <Square size={11} />
        </button>
        <button
          className="titlebar-btn close"
          onClick={() => window.labswift.close()}
          title="Close"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
