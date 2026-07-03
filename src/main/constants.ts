// Shared policy constants used by both the sending side (transfers.ts) and
// the receiving side (server.ts) so the two can never drift out of sync.

export const MAX_FILE_SIZE_BYTES = 250 * 1024 * 1024; // 200MB
export const MAX_FILE_SIZE_MB = 250;

// Extensions blocked by default for direct sends and inside zipped folder
// transfers. This is a denylist of executable/script types most likely to
// be used to run code on the receiving machine. Admins can disable this
// check from Settings if they specifically need to push installers/scripts.
export const DEFAULT_BLOCKED_EXTENSIONS = [
  ".exe",
  ".msi",
  ".msp",
  ".mst",
  ".bat",
  ".cmd",
  ".com",
  ".scr",
  ".pif",
  ".gadget",
  ".vb",
  ".vbs",
  ".vbe",
  ".js",
  ".jse",
  ".ws",
  ".wsf",
  ".wsh",
  ".ps1",
  ".ps1xml",
  ".psc1",
  ".psd1",
  ".psm1",
  ".jar",
  ".lnk",
  ".reg",
  ".hta",
  ".cpl",
  ".scf",
  ".dll",
  ".sys",
];

export function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  if (idx === -1) return "";
  return fileName.slice(idx).toLowerCase();
}
