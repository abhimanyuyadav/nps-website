const availableDuringMaintenance = new Set([
  "/newsletter/confirm",
  "/newsletter/unsubscribe",
  "/events/cancel",
  "/privacy",
  "/terms",
  "/accessibility",
]);
export function showsMaintenanceNotice(enabled: boolean, pathname: string) {
  return enabled && !availableDuringMaintenance.has(pathname);
}
