// Web: in-app notifications (realtime) only. Web push could be added later.
export async function registerForPush(_userId: string): Promise<string | null> {
  return null;
}
export async function unregisterPush(_token: string | null) {}
export function listenForNotificationTaps(): () => void {
  return () => {};
}
