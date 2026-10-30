// The analytics sink is injected only into the website build. Offline packages
// have no sink; analytics must never interfere with document operations.
export function recordProductEvent(name, parameters) {
  try { globalThis.window?.cttProductEvent?.(name, parameters); } catch (_) {}
}
