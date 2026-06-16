import React from "react";
import { Transfer } from "../lib/types";
import { formatBytes } from "../lib/format";
import { X, ArrowUpRight, ArrowDownLeft } from "lucide-react";

interface Props {
  transfer: Transfer;
  onCancel?: (id: string) => void;
  onOpen?: (path: string) => void;
}

export default function TransferRow({ transfer, onCancel, onOpen }: Props) {
  const statusColor: Record<string, string> = {
    done: "var(--success)",
    failed: "var(--danger)",
    sending: "var(--accent)",
    pending: "var(--warning)",
    cancelled: "var(--text-muted)",
  };

  const progressColor: Record<string, string> = {
    done: "success",
    failed: "failed",
    sending: "active",
    pending: "active",
    cancelled: "failed",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Direction icon */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background:
            transfer.direction === "outgoing"
              ? "var(--accent-dim)"
              : "var(--success-dim)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {transfer.direction === "outgoing" ? (
          <ArrowUpRight
            size={15}
            color="var(--accent)"
          />
        ) : (
          <ArrowDownLeft
            size={15}
            color="var(--success)"
          />
        )}
      </div>

      {/* File info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {transfer.fileName}
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            marginTop: 4,
          }}
        >
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {transfer.direction === "outgoing"
              ? `→ ${transfer.targetName}`
              : `← Admin`}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {formatBytes(transfer.fileSize)}
          </span>
        </div>
        {/* Progress bar */}
        {(transfer.status === "sending" || transfer.status === "done") && (
          <div className="progress-bar" style={{ marginTop: 6, width: "100%" }}>
            <div
              className={`progress-fill ${progressColor[transfer.status]}`}
              style={{ width: `${transfer.progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Status */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: statusColor[transfer.status],
            textTransform: "capitalize",
          }}
        >
          {transfer.status === "sending"
            ? `${transfer.progress}%`
            : transfer.status}
        </span>

        {transfer.status === "done" && transfer.savedPath && onOpen && (
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => onOpen(transfer.savedPath!)}
            title="Open folder"
          >
            Open
          </button>
        )}

        {(transfer.status === "sending" || transfer.status === "pending") &&
          onCancel && (
            <button
              className="btn-icon"
              onClick={() => onCancel(transfer.id)}
              title="Cancel"
            >
              <X size={14} />
            </button>
          )}
      </div>
    </div>
  );
}
