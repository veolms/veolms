export function downloadBackupCodesTxt(
  codes: string[],
  filename = "veolms-backup-codes.txt",
): void {
  const content = [
    "VeoLMS - Two-Factor Authentication Backup Codes",
    "============================================================",
    "Keep these backup codes in a safe place. Each code can be used once",
    "if you ever lose access to your primary authenticator device.",
    "",
    ...codes.map((code, index) => `${index + 1}. ${code}`),
    "",
    `Generated: ${new Date().toLocaleString()}`,
  ].join("\r\n");

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
