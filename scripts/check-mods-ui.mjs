import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { startServer } from "../server/index.js";
import { createZip } from "../test/helpers/zip.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-ui-test-"));
let service, browser, socket;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await check()) return; await wait(150); }
  throw new Error("Timeout: " + label);
}
try {
  fs.cpSync("dist", path.join(root, "dist"), { recursive: true });
  const bundled = path.join(root, "bundled-mods");
  fs.mkdirSync(bundled);
  const zip = createZip([{ name: "common/ui-fixture.bin", data: "UI test" }]);
  fs.writeFileSync(path.join(bundled, "fixture.zip"), zip);
  fs.writeFileSync(path.join(bundled, "catalog.json"), JSON.stringify([{
    id: "ui-fixture", title: "Mod interface test", author: "STRYKER", version: "1", category: "other",
    shortDesc: "Paquet réservé au test isolé.", compatibility: ["Football Life 2026"], tags: ["test"], size: "1 Ko",
    archiveFile: "fixture.zip", archiveHash: crypto.createHash("sha256").update(zip).digest("hex"),
  }]));
  service = await startServer({ port: 0, rootDir: root, dataRoot: path.join(root, "data") });
  service.runtime.siderManager.documentsRoots = [path.join(root, "Documents")];
  const profile = path.join(root, "browser");
  browser = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=0", "--user-data-dir=" + profile, "about:blank",
  ], { windowsHide: true, stdio: "ignore" });
  await until(() => fs.existsSync(path.join(profile, "DevToolsActivePort")), "browser startup");
  const port = fs.readFileSync(path.join(profile, "DevToolsActivePort"), "utf8").split("\n")[0];
  const targets = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json();
  socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
    if (message.id) { const item = pending.get(message.id); pending.delete(message.id); message.error ? item.reject(message.error) : item.resolve(message.result); }
  });
  function cdp(method, params = {}) {
    return new Promise((resolve, reject) => { const key = ++id; const timer = setTimeout(() => { pending.delete(key); reject(new Error("CDP timeout: " + method)); }, 10000); pending.set(key, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } }); socket.send(JSON.stringify({ id: key, method, params })); });
  }
  async function evaluate(expression) {
    const value = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (value.exceptionDetails) throw new Error(JSON.stringify(value.exceptionDetails));
    return value.result.value;
  }
  console.log("Browser connected");
  await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1280, height: 850, deviceScaleFactor: 1, mobile: false });
  await cdp("Page.navigate", { url: "http://127.0.0.1:" + service.port + "/?mode=desktop" });
  await until(() => evaluate("Array.from(document.querySelectorAll('nav button')).some(b=>b.textContent.includes('Découvrir'))"), "app load");
  await evaluate("Array.from(document.querySelectorAll('nav button')).find(b=>b.textContent.includes('Découvrir')).click()");
  await until(() => evaluate("!!document.querySelector('input[type=search]')"), "catalog search");
  assert.equal(await evaluate("document.body.innerText.includes('Source vérifiée') || document.body.innerText.includes('À vérifier')"), false);
  assert.equal(await evaluate("document.body.innerText.includes('SmokePatch Football Life')"), false);
  const search = (text) => evaluate("(function(){const e=document.querySelector('input[type=search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e," + JSON.stringify(text) + ");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await search("interface test");
  await until(() => evaluate("document.querySelectorAll('article').length===1"), "filtered catalog");
  const click = (text) => evaluate("Array.from(document.querySelectorAll('article button')).find(b=>b.textContent.trim()===" + JSON.stringify(text) + ").click()");
  console.log("Catalog and search OK");
  await click("Installer");
  await until(() => evaluate("Array.from(document.querySelectorAll('article button')).some(b=>b.textContent.includes('Désinstaller')&&!b.disabled)"), "installed state");
  assert.equal(service.runtime.modEngine.list().length, 1);
  await click("Désactiver");
  await until(() => evaluate("Array.from(document.querySelectorAll('article button')).some(b=>b.textContent.trim()==='Activer'&&!b.disabled)"), "disabled state");
  assert.equal(service.runtime.modEngine.list()[0].enabled, false);
  await click("Désinstaller");
  await until(() => evaluate("Array.from(document.querySelectorAll('article button')).some(b=>b.textContent.trim()==='Installer'&&!b.disabled)"), "uninstalled state");
  assert.equal(service.runtime.modEngine.list().length, 0);
  await search("no-match-123456");
  await until(() => evaluate("document.body.innerText.includes('Aucun mod ne correspond')"), "empty search");
  await search("");
  await until(() => evaluate("document.querySelectorAll('article').length>10"), "full catalog");
  fs.mkdirSync("artifacts", { recursive: true });
  const screen = await cdp("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("artifacts/mods-desktop-qa.png", Buffer.from(screen.data, "base64"));
  await cdp("Emulation.setDeviceMetricsOverride", { width: 420, height: 900, deviceScaleFactor: 1, mobile: false });
  await wait(200);
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), true, "horizontal overflow");
  assert.deepEqual(errors, []);
  console.log("UI OK: filtered installable catalog, search, install, disable, uninstall, empty results, narrow layout, no runtime errors.");
  await cdp("Browser.close").catch(() => {});
} finally {
  socket?.close();
  browser?.kill();
  if (service) { service.server.closeAllConnections(); await service.close(); }
  await wait(500);
  assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
