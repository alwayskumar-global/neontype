/**
 * Downloads a Blob as a file through a temporary anchor. The object URL is
 * revoked after 60 s, not synchronously: revoking right after click() cancels
 * the download in Firefox and Safari. No network; `rel="noopener"` for hygiene.
 */
export const REVOKE_DELAY_MS = 60_000;

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
