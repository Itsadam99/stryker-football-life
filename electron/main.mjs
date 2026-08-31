import path from "path";
import { app, BrowserWindow, dialog, Menu, shell } from "electron";
import { startServer } from "../server/index.js";
import { parseProtocolLink } from "./protocol-links.mjs";
import { createUpdateManager } from "./update-manager.mjs";

let mainWindow = null;
let localServer = null;
let allowedOrigin = "";
let pendingDeepLink = process.argv.find((argument) => /^stryker:\/\//i.test(argument)) || null;
const updateManager = createUpdateManager({
  currentVersion: app.getVersion(),
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
});

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

async function openInstallLink(request) {
  if (!mainWindow || !allowedOrigin) return false;
  const target = new URL(allowedOrigin);
  target.searchParams.set("mode", "desktop");
  target.searchParams.set("installMod", request.modId);
  if (request.repository) target.searchParams.set("repository", request.repository);
  await mainWindow.loadURL(target.href);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  return true;
}

async function handleProtocolLink(value) {
  try {
    const request = parseProtocolLink(value);
    if (!request) return false;
    if (request.type === "open") {
      if (!mainWindow || !allowedOrigin) return false;
      const currentUrl = new URL(mainWindow.webContents.getURL());
      if (!isTrustedLocalUrl(currentUrl.href) || currentUrl.searchParams.get("mode") !== "desktop") {
        await mainWindow.loadURL(`${allowedOrigin}/?mode=desktop`);
      }
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      return true;
    }
    return openInstallLink(request);
  } catch {
    return false;
  }
}

async function createWindow() {
  localServer = await startServer({
    port: 0,
    host: "127.0.0.1",
    rootDir: app.getAppPath(),
    updateManager,
    nativeDialogs: {
      pickGameFolder: async () => {
        const options = {
          title: "Sélectionner le dossier de Football Life",
          buttonLabel: "Lier cette installation",
          properties: ["openDirectory"],
        };
        const result = mainWindow
          ? await dialog.showOpenDialog(mainWindow, options)
          : await dialog.showOpenDialog(options);
        return result.canceled ? null : result.filePaths[0] || null;
      },
      pickArchive: async () => {
        const options = {
          title: "Sélectionner une archive de mod",
          buttonLabel: "Choisir ce ZIP",
          properties: ["openFile"],
          filters: [{ name: "Archives ZIP", extensions: ["zip"] }],
        };
        const result = mainWindow
          ? await dialog.showOpenDialog(mainWindow, options)
          : await dialog.showOpenDialog(options);
        return result.canceled ? null : result.filePaths[0] || null;
      },
    },
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
  if (pendingDeepLink) {
    const link = pendingDeepLink;
    pendingDeepLink = null;
    await handleProtocolLink(link);
  }
}

app.on("second-instance", (event, commandLine) => {
  const deepLink = commandLine.find((argument) => /^stryker:\/\//i.test(argument));
  if (deepLink) void handleProtocolLink(deepLink);
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  if (mainWindow) void handleProtocolLink(url);
  else pendingDeepLink = url;
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  if (app.isPackaged) app.setAsDefaultProtocolClient("stryker");
  else if (process.argv[1]) app.setAsDefaultProtocolClient("stryker", process.execPath, [path.resolve(process.argv[1])]);
  try {
    await createWindow();
    updateManager.start();
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
