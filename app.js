(function () {
  var $ = function (id) { return document.getElementById(id); };
  var fileW = null, filePDF = null, busy = false, lastSaved = null;

  pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

  function say(t, err) { $('msg').textContent = t || ''; $('msg').className = 'msg' + (err ? ' err' : ''); }
  function progress(p) {
    var b = $('bar');
    if (p == null) { b.style.display = 'none'; return; }
    b.style.display = 'block'; $('bari').style.width = Math.round(p * 100) + '%';
  }
  function setBusy(v) { busy = v; refresh(); }
  function refresh() {
    $('go-w').disabled = busy || !fileW;
    $('go-p').disabled = busy || !filePDF;
  }
  function setTab(w) {
    $('t-w2p').setAttribute('aria-selected', w === 'w');
    $('t-p2w').setAttribute('aria-selected', w === 'p');
    $('p-w2p').className = 'pane' + (w === 'w' ? ' on' : '');
    $('p-p2w').className = 'pane' + (w === 'p' ? ' on' : '');
    say(''); progress(null); $('open').style.display = 'none';
  }
  $('t-w2p').onclick = function () { setTab('w'); };
  $('t-p2w').onclick = function () { setTab('p'); };

  function wire(pickId, inputId, nameId, setter) {
    var inp = $(inputId);
    $(pickId).onclick = function () { inp.click(); };
    inp.onchange = function () {
      var f = inp.files[0]; inp.value = '';
      if (f) { setter(f); $(nameId).textContent = f.name; say(''); progress(null); $('open').style.display = 'none'; refresh(); }
    };
  }
  wire('pick-w', 'in-w', 'fn-w', function (f) { fileW = f; });
  wire('pick-p', 'in-p', 'fn-p', function (f) { filePDF = f; });

  // Arrastrar y soltar
  ['dragover', 'drop'].forEach(function (ev) {
    window.addEventListener(ev, function (e) { e.preventDefault(); });
  });
  window.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files[0]; if (!f) return;
    if (/\.pdf$/i.test(f.name)) { setTab('p'); filePDF = f; $('fn-p').textContent = f.name; }
    else { setTab('w'); fileW = f; $('fn-w').textContent = f.name; }
    say(''); refresh();
  });

  function baseName(n) { return n.replace(/\.[^.]+$/, ''); }

  async function saveAndReport(bytes, name, ext, extra) {
    var p = await window.api.save(name, bytes, ext);
    if (!p) { say('Cancelaste el guardado.'); return; }
    lastSaved = p;
    say('Ya quedó :D Se guardó en:\n' + p + (extra ? '\n' + extra : ''));
    $('open').style.display = 'inline';
  }
  $('open').onclick = function () { if (lastSaved) window.api.show(lastSaved); };

  // ---------- Word -> PDF ----------
  $('go-w').onclick = async function () {
    if (!fileW) return;
    setBusy(true); progress(null); $('open').style.display = 'none'; say('Convirtiendo…');
    try {
      var data = new Uint8Array(await fileW.arrayBuffer());
      var r = await window.api.wordToPdf(fileW.name, data);
      await saveAndReport(r.data, baseName(fileW.name) + '.pdf', 'pdf', 'Motor usado: ' + r.engine + '.');
    } catch (e) {
      say('Algo falló: ' + String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true);
    }
    setBusy(false);
  };

  // ---------- PDF -> Word ----------
  async function makeWorker(lang) {
    var base = new URL('.', location.href).href;
    return Tesseract.createWorker(lang, 1, {
      workerPath: base + 'lib/worker.min.js',
      corePath: base + 'lib/',
      langPath: base + 'tessdata/',
      workerBlobURL: false,
      cacheMethod: 'none',
      gzip: true
    });
  }

  async function renderToCanvas(page, dpi) {
    var v1 = page.getViewport({ scale: 1 });
    var scale = Math.min(dpi / 72, Math.sqrt(16000000 / (v1.width * v1.height)));
    var v = page.getViewport({ scale: scale });
    var c = document.createElement('canvas');
    c.width = Math.floor(v.width); c.height = Math.floor(v.height);
    var cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: cx, viewport: v }).promise;
    return c;
  }

  $('go-p').onclick = async function () {
    if (!filePDF) return;
    setBusy(true); $('open').style.display = 'none'; say('Abriendo el PDF…'); progress(0);
    var worker = null, doc = null;
    try {
      var data = new Uint8Array(await filePDF.arrayBuffer());
      doc = await pdfjsLib.getDocument({ data: data.slice(0), isEvalSupported: false }).promise;
      var mode = $('ocr').value, lang = $('lang').value, n = doc.numPages;
      var pages = [], ocrPages = 0, aviso = '';

      // ¿Cuántas páginas son escaneos (sin texto)?
      var scanned = 0;
      for (var k = 1; k <= n; k++) {
        var pk = await doc.getPage(k), tk = await pk.getTextContent();
        if (tk.items.reduce(function (t, it) { return t + (it.str || '').trim().length; }, 0) < 25) scanned++;
        pk.cleanup();
      }
      // PDF con texto: motor de alta fidelidad (tablas, imágenes, distribución)
      if (mode === 'never' || (mode === 'auto' && scanned === 0)) {
        try {
          say('Convirtiendo con alta fidelidad (tablas e imágenes)…\nPuede tardar en PDFs largos.'); progress(null);
          var hq = await window.api.pdfToDocx(data);
          await saveAndReport(hq, baseName(filePDF.name) + '.docx', 'docx', n + (n === 1 ? ' página' : ' páginas') + ' · modo alta fidelidad.');
          if (doc) { try { doc.destroy(); } catch (e0) {} }
          setBusy(false); return;
        } catch (e1) {
          aviso = /NO_ENGINE/.test(String(e1 && e1.message)) ? 'Nota: el motor de alta fidelidad no está disponible; se usó el modo de solo texto.' : 'Nota: el modo de alta fidelidad falló, se usó el modo de solo texto.';
          progress(0);
        }
      }
      if (scanned > 0 && mode === 'auto') aviso = 'Hay páginas escaneadas: se usó OCR en todo el documento (solo texto).';
      for (var i = 1; i <= n; i++) {
        progress((i - 1) / n);
        var page = await doc.getPage(i);
        var tc = await page.getTextContent();
        var chars = tc.items.reduce(function (t, it) { return t + (it.str || '').trim().length; }, 0);
        var needOcr = mode === 'always' || (mode === 'auto' && chars < 25);
        var paras;
        if (needOcr) {
          say('Página ' + i + ' de ' + n + ': reconociendo texto (OCR)…');
          if (!worker) { say('Preparando el reconocimiento de texto…'); worker = await makeWorker(lang); }
          var canvas = await renderToCanvas(page, 200);
          var res = await worker.recognize(canvas);
          canvas.width = 0; canvas.height = 0;
          paras = (res.data.lines && res.data.lines.length)
            ? PDFWordCore.paragraphsFromOcrLines(res.data.lines, 200)
            : PDFWordCore.paragraphsFromOcrText(res.data.text);
          ocrPages++;
        } else {
          say('Página ' + i + ' de ' + n + '…');
          paras = PDFWordCore.paragraphsFromItems(tc.items);
        }
        pages.push(paras);
        page.cleanup();
      }
      progress(0.97); say('Armando el documento de Word…');
      var wordDoc = PDFWordCore.buildDocx(docx, pages);
      var blob = await docx.Packer.toBlob(wordDoc);
      var bytes = new Uint8Array(await blob.arrayBuffer());
      progress(1);
      var words = pages.reduce(function (t, p) { return t + p.reduce(function (s, q) { return s + q.text.split(/\s+/).length; }, 0); }, 0);
      var extra = n + (n === 1 ? ' página' : ' páginas') + ', ' + ocrPages + ' con OCR, unas ' + words + ' palabras.';
      if (!words) extra += '\nOjo: no encontré texto. Prueba con OCR en "Siempre".';
      await saveAndReport(bytes, baseName(filePDF.name) + '.docx', 'docx', extra + (aviso ? '\n' + aviso : ''));
    } catch (e) {
      var m = String((e && e.message) || e);
      if (e && e.name === 'PasswordException') m = 'Este PDF pide contraseña para abrirlo.';
      say('Algo falló: ' + m, true);
    }
    if (worker) { try { await worker.terminate(); } catch (e) {} }
    if (doc) { try { doc.destroy(); } catch (e) {} }
    progress(null); setBusy(false);
  };

  // ---------- Modo oscuro / claro ----------
  var root = document.documentElement, tb = $('theme');
  function isDark() { var t = root.getAttribute('data-theme'); return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches; }
  function paint() { tb.textContent = isDark() ? '☀️' : '🌙'; }
  try { var saved = localStorage.getItem('pdfword-theme'); if (saved) root.setAttribute('data-theme', saved); } catch (e) {}
  tb.onclick = function () {
    var next = isDark() ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('pdfword-theme', next); } catch (e) {}
    paint();
  };
  paint();

  refresh();
})();
