import { isTauri } from "./db";

let startupCheckStarted = false;

export async function checkForAppUpdate(): Promise<void> {
  if (!isTauri() || startupCheckStarted) return;
  startupCheckStarted = true;

  const [{ check }, { relaunch }] = await Promise.all([
    import("@tauri-apps/plugin-updater"),
    import("@tauri-apps/plugin-process"),
  ]);
  const update = await check({ timeout: 30_000 });
  if (!update) return;

  const details = update.body?.trim() ? `\n\n${update.body.trim()}` : "";
  const accepted = window.confirm(
    `QUASAR Timesheet Manager ${update.version} is available.${details}\n\nInstall it now?`,
  );
  if (!accepted) return;

  await update.downloadAndInstall();
  await relaunch();
}
