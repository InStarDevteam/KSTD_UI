/** Accept only a local request-list URL; never follow an arbitrary return target. */
export function safeRequestReturnPath(value: string | null): string {
  if (!value || !(value === "/requests" || value.startsWith("/requests?")))
    return "/requests";
  try {
    const url = new URL(value, "https://flowcore.local");
    if (url.origin !== "https://flowcore.local" || url.pathname !== "/requests")
      return "/requests";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/requests";
  }
}
