/**
 * Copies text to the clipboard. `navigator.clipboard` only exists in secure contexts (https or
 * localhost), but Quotation is normally opened over plain http on a LAN address
 * (e.g. http://192.168.1.10:8766), where it is undefined. Fall back to a hidden textarea and
 * `document.execCommand("copy")`, which still works there when called from a click handler.
 */
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or document not focused: try the fallback below.
    }
  }

  const previouslyFocused = document.activeElement as HTMLElement | null;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  area.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;";
  document.body.appendChild(area);
  let ok = false;
  try {
    area.select();
    area.setSelectionRange(0, text.length);
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  } finally {
    area.remove();
    previouslyFocused?.focus();
  }
  return ok;
}
