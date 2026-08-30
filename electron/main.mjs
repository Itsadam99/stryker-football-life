import path from "path";
import { app, BrowserWindow, Menu, shell } from "electron";
import { startServer } from "../server/index.js";

let mainWindow = null;
let localServer = null;
let allowedOrigin = "";

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

function isTrustedLocalUrl(value) {
  try {
    return new URL(value).origin === allowedOrigin;
  } catch {
    return false;
  }
}

function isSafeExternalUrl(value) {
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

async function openExternal(value) {
  if (isSafeExternalUrl(value)) await shell.openExternal(value);
}

async function createWindow() {
  localServer = await startServer({
    port: 0,
    host: "127.0.0.1",
    rootDir: app.getAppPath(),
  });
  allowedOrigin = `http://${localServer.host}:${localServer.port}`;

  mainWindow = new BrowserWindow({
    title: "STRYKER",
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 650,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#070507",
    icon: path.join(app.getAppPath(), "dist", "stryker.ico"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isTrustedLocalUrl(url)) return;
    event.preventDefault();
    void openExternal(url);
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => { mainWindow = null; });
  await mainWindow.loadURL(`${allowedOrigin}/?mode=desktop`);
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  try {
    await createWindow();
  } catch (error) {
    console.error(`[STRYKER] Démarrage impossible : ${error.stack || error.message}`);
    app.exit(1);
  }
});

app.on("window-all-closed", () => app.quit());

app.on("before-quit", (event) => {
  if (!localServer) return;
  event.preventDefault();
  const server = localServer;
  localServer = null;
  server.close().catch(() => undefined).finally(() => app.quit());
});
