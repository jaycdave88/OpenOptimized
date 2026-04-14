/**
 * Copy text to the clipboard with a fallback for environments where
 * `navigator.clipboard` is blocked (e.g. Tauri 2.x webview).
 *
 * 1. Tries the modern Clipboard API.
 * 2. Falls back to a hidden textarea + `document.execCommand("copy")`.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  }
}

