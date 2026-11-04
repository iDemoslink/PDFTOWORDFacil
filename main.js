const { app, BrowserWindow, Menu, shell, protocol, net, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const { execFile } = require('child_process');
const mammoth = require('mammoth');

// Sirve la app desde app://local para que fetch, workers y wasm funcionen sin internet.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

if (!app.requestSingleInstanceLock()) app.quit();

function findSoffice() {
  const c = [];
  if (process.platform === 'win32') {
    [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')]
      .filter(Boolean).forEach((b) => c.push(path.join(b, 'LibreOffice', 'program', 'soffice.exe')));
  } else if (process.platform === 'darwin') {
    c.push('/Applications/LibreOffice.app/Contents/MacOS/soffice');
  } else {
    c.push('/usr/bin/soffice', '/usr/local/bin/soffice', '/opt/libreoffice/program/soffice');
  }
  return c.find((p) => fs.existsSync(p)) || null;
}

function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (err, stdout, stderr) => (err ? reject(new Error((stderr || err.message).toString())) : resolve(stdout)));
  });
}

async function viaLibreOffice(lo, name, buf) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfword-'));
  try {
    const ext = (path.extname(name) || '.docx').toLowerCase();
    const input = path.join(tmp, 'entrada' + ext);
    fs.writeFileSync(input, buf);
    const profile = pathToFileURL(path.join(tmp, 'perfil')).href;
    await run(lo, ['--headless', '--norestore', '-env:UserInstallation=' + profile, '--convert-to', 'pdf', '--outdir', tmp, input], { timeout: 180000, windowsHide: true });
    const out = path.join(tmp, 'entrada.pdf');
    if (!fs.existsSync(out)) throw new Error('LibreOffice no generó el PDF.');
    return fs.readFileSync(out);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const BASIC_CSS = `
  @page { margin: 2.2cm; }
  body { font-family: Calibri, "Segoe UI", Arial, sans-serif; font-size: 11pt; line-height: 1.4; color: #000; }
  h1 { font-size: 20pt; } h2 { font-size: 16pt; } h3 { font-size: 13pt; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  td, th { border: 1px solid #888; padding: 4px 6px; vertical-align: top; }
  img { max-width: 100%; height: auto; }
  p { margin: 0 0 8pt; }
`;

async function viaBasic(buf) {
  const result = await mammoth.convertToHtml({ buffer: buf });
  const html = '<!doctype html><html><head><meta charset="utf-8"><style>' + BASIC_CSS + '</style></head><body>' + result.value + '</body></html>';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfword-'));
  const file = path.join(tmp, 'doc.html');
  fs.writeFileSync(file, html, 'utf8');
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await win.loadFile(file);
    return await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'none' } });
  } finally {
    win.destroy();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

ipcMain.handle('info', () => ({ libreoffice: findSoffice() }));

ipcMain.handle('word-to-pdf', async (_e, { name, data, engine }) => {
  const buf = Buffer.from(data);
  const lo = engine === 'basic' ? null : findSoffice();
  if (lo) {
    try { return { engine: 'LibreOffice', data: await viaLibreOffice(lo, name, buf) }; }
    catch (e) { if (!/\.docx$/i.test(name)) throw e; /* si falla, se intenta el motor básico */ }
  }
  if (!/\.docx$/i.test(name)) throw new Error('El motor básico solo abre archivos .docx. Para .doc, .odt o .rtf instala LibreOffice.');
  return { engine: 'básico', data: await viaBasic(buf) };
});

ipcMain.handle('save', async (_e, { defaultName, data, ext }) => {
  const win = BrowserWindow.getAllWindows()[0];
  const r = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
  });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, Buffer.from(data));
  return r.filePath;
});

ipcMain.handle('show', (_e, p) => { shell.showItemInFolder(p); });

function createWindow() {
  const win = new BrowserWindow({
    width: 680,
    height: 820,
    minWidth: 420,
    minHeight: 560,
    title: 'PDF y Word Fácil',
    backgroundColor: '#171716',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js') }
  });
  Menu.setApplicationMenu(null);
  win.loadURL('app://local/index.html');
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p === '/' || p === '') p = '/index.html';
    const full = path.normalize(path.join(__dirname, p));
    if (!full.startsWith(__dirname)) return new Response('Prohibido', { status: 403 });
    return net.fetch(pathToFileURL(full).toString());
  });
  createWindow();
});
app.on('window-all-closed', () => app.quit());
