import { autoUpdater } from 'electron-updater';
import { dialog } from 'electron';

let notified = false;

export function setupAutoUpdater(): void {
  // Suppress auto-download until user confirms (good for metered connections)
  autoUpdater.autoDownload = false;

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update available',
      message: `PharmaBay Lister v${info.version} is available.`,
      detail: 'Would you like to download it now? The app will restart automatically after installation.',
      buttons: ['Download', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update ready',
      message: 'Update downloaded. The app will now restart to apply it.',
      buttons: ['Restart Now', 'Later'],
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (err) => {
    console.log('[updater] Error:', err.message);
  });
}

export function checkForUpdates(): void {
  if (notified) return;
  notified = true;
  // Only check in packaged builds (skip during dev)
  if (process.env.VITE_DEV_SERVER_URL) {
    console.log('[updater] Skipping update check in development mode');
    return;
  }
  autoUpdater.checkForUpdates().catch((err) => {
    console.log('[updater] Check failed (no publish provider configured?):', err.message);
  });
}
