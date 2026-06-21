import React from "react";

/**
 * LabSwift brand mark — two connected network nodes with a directional arrow,
 * representing LAN file transfer between computers.
 *
 * Replaces the generic Zap (lightning bolt) icon that shipped with the
 * original Replit-generated scaffold.
 */
export function LabSwiftMark({
  size = 16,
  color = "#fff",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Left node (sender) */}
      <circle cx="3.5" cy="8" r="2.5" stroke={color} strokeWidth="1.5" />
      {/* Right node (receiver) */}
      <circle cx="12.5" cy="8" r="2.5" stroke={color} strokeWidth="1.5" />
      {/* Transfer arrow */}
      <path
        d="M6.2 8H9.8M8.5 6.3L10.2 8L8.5 9.7"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
