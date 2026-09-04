const { app, BrowserWindow, ipcMain, Notification, dialog, Menu, Tray } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const http = require('http');
require('dotenv').config({ path: path.join(__dirname, '.env') });

let mainWindow;
let localServer;
let localPort;
let tray = null;
app.isQuitting = false;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

// ============================================================
//  Auto-Updater Configuration
// ============================================================
autoUpdater.autoDownload = true;           // Download updates automatically in the background
autoUpdater.autoInstallOnAppQuit = true;   // Install update when user quits
autoUpdater.allowPrerelease = false;       // Only stable releases

// Auto-updater logging
autoUpdater.logger = require('electron').app ? console : console;

function setupAutoUpdater() {
  // --- Update lifecycle events → forwarded to renderer ---

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for update...');
    sendUpdateStatus('checking');
  });

  autoUpdater.on('update-available', (info) => {
    console.log(`[AutoUpdater] Update available: v${info.version}`);
    sendUpdateStatus('available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log(`[AutoUpdater] Already up-to-date (v${info.version})`);
    sendUpdateStatus('not-available', { version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[AutoUpdater] Download: ${Math.round(progress.percent)}%`);
    sendUpdateStatus('downloading', {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[AutoUpdater] Update downloaded: v${info.version} — ready to install`);
    sendUpdateStatus('downloaded', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err.message);
    sendUpdateStatus('error', { message: err.message });
  });

  // --- Check for updates on launch (with small delay to let the UI load) ---
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[AutoUpdater] Initial check failed:', err.message);
    });
  }, 5000);

  // --- Periodic check every 4 hours ---
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[AutoUpdater] Periodic check failed:', err.message);
    });
  }, 4 * 60 * 60 * 1000);
}

/** Send update status to all renderer windows */
function sendUpdateStatus(status, data = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { status, ...data });
  }
}

// Start local HTTP server to satisfy Firebase Auth location.protocol requirements
function startLocalServer() {
  return new Promise((resolve, reject) => {
    localServer = http.createServer((req, res) => {
      // CORS for auth proxy
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      let reqPath = decodeURI(req.url.split('?')[0]);

      // Catch Google Auth callback
      if (req.method === 'POST' && reqPath === '/__/auth-callback') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.token && mainWindow) {
              mainWindow.webContents.send('google-auth-token', data.token);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } else {
              res.writeHead(400);
              res.end('No token');
            }
          } catch (e) {
            res.writeHead(500);
            res.end('Error');
          }
        });
        return;
      }

      if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
      
      const filePath = path.join(__dirname, 'src', reqPath);

      // Security check: prevent directory traversal
      if (!filePath.startsWith(path.join(__dirname, 'src'))) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
    });

    localServer.listen(42899, 'localhost', () => {
      localPort = localServer.address().port;
      resolve(localPort);
    });

    localServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn('Port 42899 in use, assuming app is already running or another service is using it. Falling back to dynamic port...');
        localServer.listen(0, 'localhost'); // Fallback (localStorage won't persist, but app will run)
      } else {
        console.error('Local server error:', err);
        reject(err);
      }
    });
  });
}

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

const CHROME_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
app.userAgentFallback = CHROME_USER_AGENT;

// Enforce persistent storage directory even for portable mode
const persistentDataPath = path.join(app.getPath('appData'), 'NoiseDesktop');
app.setPath('userData', persistentDataPath);

async function createWindow() {
  await startLocalServer();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    frame: false, // Frameless for professional custom desktop titlebar
    titleBarStyle: 'hidden',
    backgroundColor: '#09090b',
    show: false,
    icon: path.join(__dirname, 'src/assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  mainWindow.webContents.setUserAgent(CHROME_USER_AGENT);

  // Allow Firebase OAuth popups with Chrome user agent
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    return { 
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 500,
        height: 650,
        autoHideMenuBar: true,
        titleBarStyle: 'default',
        frame: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      }
    };
  });

  // Load from local HTTP server on localhost (which is pre-authorized by Firebase Auth by default)
  mainWindow.loadURL(`http://localhost:${localPort}/index.html`);

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[RENDERER] ${message} (${sourceId}:${line})`);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window maximize/unmaximize state check
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized-change', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized-change', false);
  });

  // Minimize to tray instead of quitting
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Initialize auto-updater after window is ready
  setupAutoUpdater();
}

// Window control IPC handlers
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-toggle-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) {
    if (!app.isQuitting) {
      mainWindow.hide();
    } else {
      mainWindow.close();
    }
  }
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// Secure API Key Retrieval
ipcMain.handle('get-ai-key', () => {
  return process.env.GEMINI_API_KEY || '';
});

// Startup/Login Item IPC handlers
ipcMain.handle('get-login-item-settings', () => {
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.on('set-login-item-settings', (event, openAtLogin) => {
  app.setLoginItemSettings({
    openAtLogin,
    openAsHidden: false
  });
});

// --- Auto-Update IPC handlers ---
ipcMain.on('restart-to-update', () => {
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.on('check-for-updates', () => {
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[AutoUpdater] Manual check failed:', err.message);
  });
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// Desktop Notification API
ipcMain.on('show-notification', (event, { title, body, icon }) => {
  if (Notification.isSupported()) {
    new Notification({
      title: title || 'Noise',
      body: body || '',
      icon: icon ? path.join(__dirname, icon) : undefined
    }).show();
  }
});

// File Save/Export IPC (Calendar export .json or .ics)
ipcMain.handle('export-file', async (event, { defaultName, content, filters }) => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Calendar Data',
    defaultPath: defaultName || 'noise-export.json',
    filters: filters || [{ name: 'JSON Files', extensions: ['json'] }, { name: 'iCalendar', extensions: ['ics'] }, { name: 'All Files', extensions: ['*'] }]
  });

  if (!canceled && filePath) {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true, filePath };
  }
  return { success: false };
});

app.whenReady().then(() => {
  createWindow();

  tray = new Tray(path.join(__dirname, 'src/assets/icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show App', click: () => { if (mainWindow) mainWindow.show(); } },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
  ]);
  tray.setToolTip('Noise Calendar');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => { if (mainWindow) mainWindow.show(); });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else if (mainWindow) mainWindow.show();
  });
});

app.on('before-quit', (e) => {
  if (!app.isCleanupDone && mainWindow && !mainWindow.isDestroyed()) {
    e.preventDefault();
    mainWindow.webContents.send('app-quitting');
    setTimeout(() => {
      app.isCleanupDone = true;
      app.quit();
    }, 1500);
  }
});

app.on('window-all-closed', () => {
  if (localServer) {
    localServer.close();
  }
  // Let the app run in the background on all platforms due to Tray
  if (app.isQuitting) {
    app.quit();
  }
});
