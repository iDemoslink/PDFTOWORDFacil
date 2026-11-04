// Lógica de conversión PDF -> párrafos -> Word. Funciona en el navegador y en Node.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PDFWordCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  function median(arr) {
    if (!arr.length) return 11;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    return a[Math.floor(a.length / 2)];
  }

  // Une los fragmentos de texto de pdf.js en líneas (respeta el orden de lectura del PDF).
  function linesFromItems(items) {
    var lines = [], cur = null, last = null;
    items.forEach(function (it) {
      if (typeof it.str !== 'string' || !it.transform) return;
      var size = Math.abs(it.transform[3]) || it.height || 11;
      var x = it.transform[4], y = it.transform[5], w = it.width || 0;
      if (it.str === '' && !it.hasEOL) return;
      var newLine = !cur || Math.abs(y - cur.y) > 0.5 * Math.max(size, cur.size);
      if (newLine) {
        cur = { text: '', size: size, y: y, x0: x, endX: x };
        lines.push(cur); last = null;
      }
      if (last) {
        var gap = x - last.endX;
        var needsSpace = gap > 0.15 * size && !/\s$/.test(cur.text) && !/^\s/.test(it.str);
        if (gap > 2.5 * size) cur.text += '\t';
        else if (needsSpace) cur.text += ' ';
      }
      cur.text += it.str;
      cur.size = Math.max(cur.size, size);
      cur.endX = x + w;
      cur.y = y;
      last = it.str.trim() ? { endX: x + w } : last;
      if (it.hasEOL) { cur = null; }
    });
    return lines.filter(function (l) { return l.text.trim().length; });
  }

  var LIST_RE = /^([\uE000-\uF8FF]|\u2022|\u25CF|\u25AA|\u25E6|\u2023|[-\u2013\u2014*]|\(?\d{1,3}[.)]|\(?[a-zA-Z][.)])\s+/;

  function paragraphsFromLines(lines, opts) {
    if (!lines.length) return [];
    var gapF = (opts && opts.gapFactor) || 1.6;
    var body = median(lines.map(function (l) { return l.size; }));
    var paras = [], p = null, prev = null;
    var minX = Math.min.apply(null, lines.map(function (l) { return l.x0; }));
    var maxEnd = Math.max.apply(null, lines.map(function (l) { return l.endX; }));
    var shortLimit = maxEnd - 0.2 * (maxEnd - minX);
    lines.forEach(function (l) {
      var gap = prev ? prev.y - l.y : 0;
      var sizeChange = prev && Math.abs(l.size - prev.size) / prev.size > 0.15;
      var isList = LIST_RE.test(l.text.trim());
      var tabbed = /\t/.test(l.text) || (prev && /\t/.test(prev.text));
      var prevShort = prev && prev.endX < shortLimit;
      var breakPara = !p || gap > gapF * Math.max(prev.size, l.size) || gap < 0 || sizeChange || isList || p.heading || tabbed || prevShort;
      if (breakPara) {
        p = { text: l.text.replace(/^\s+/, '').replace(/\s+$/, '').replace(/^[\uE000-\uF8FF]\s*/, '\u2022 '), size: l.size, x0: l.x0 };
        paras.push(p);
      } else {
        var t = l.text.trim();
        if (/[A-Za-z\u00C0-\u017F]-$/.test(p.text) && /^[a-z\u00E0-\u00FF]/.test(t)) p.text = p.text.slice(0, -1) + t;
        else p.text += ' ' + t;
        p.size = Math.max(p.size, l.size);
      }
      p.heading = (p.size >= body * 1.25 && p.text.length < 120) ? (p.size >= body * 1.6 ? 1 : 2) : 0;
      prev = l;
    });
    return paras.map(function (q) { return { text: q.text, size: q.size, heading: q.heading }; });
  }

  // Líneas de OCR (tesseract.js: {text, bbox:{x0,y0,x1,y1}}) -> párrafos, con la misma lógica que el texto normal.
  function paragraphsFromOcrLines(ocrLines, dpi) {
    dpi = dpi || 200;
    var s = 72 / dpi;
    var good = (ocrLines || []).filter(function (l) { return l && l.bbox && String(l.text || '').trim(); });
    if (!good.length) return [];
    var med = median(good.map(function (l) { return l.bbox.y1 - l.bbox.y0; }));
    var lines = good.map(function (l) {
      var h = l.bbox.y1 - l.bbox.y0;
      var size = (h >= 1.35 * med ? h : med) * s * 1.08;
      return { text: String(l.text).trim().replace(/^[*\u2022\u00B7\u00BB]\s+/, '\u2022 '), size: size, y: -l.bbox.y1 * s, x0: l.bbox.x0 * s, endX: l.bbox.x1 * s };
    });
    return paragraphsFromLines(lines, { gapFactor: 1.9 });
  }

  function paragraphsFromItems(items) { return paragraphsFromLines(linesFromItems(items)); }

  // Texto de OCR: los párrafos vienen separados por líneas en blanco.
  function paragraphsFromOcrText(text) {
    return String(text || '').split(/\n\s*\n/).map(function (block) {
      var t = block.replace(/\s*-\n\s*(?=[a-z\u00E0-\u00FF])/g, '').replace(/\s*\n\s*/g, ' ').trim();
      return { text: t, size: 11, heading: 0 };
    }).filter(function (p) { return p.text.length; });
  }

  function runsFor(docx, text, opts) {
    var parts = text.split('\t'), children = [];
    parts.forEach(function (part, i) {
      if (i > 0) children.push(new docx.Tab());
      if (part) children.push(part);
    });
    return new docx.TextRun(Object.assign({ children: children }, opts));
  }

  // pages: [ [ {text,size,heading}, ... ], ... ]
  function buildDocx(docx, pages) {
    var children = [];
    pages.forEach(function (paras, pi) {
      if (!paras.length) paras = [{ text: '', size: 11, heading: 0 }];
      paras.forEach(function (p, i) {
        var halfPts = Math.min(96, Math.max(16, Math.round((p.heading ? p.size : Math.min(Math.max(p.size, 9), 14)) * 2)));
        children.push(new docx.Paragraph({
          pageBreakBefore: pi > 0 && i === 0,
          spacing: { after: p.heading ? 200 : 160, line: 276 },
          children: [runsFor(docx, p.text, { bold: !!p.heading, size: halfPts, font: 'Calibri' })]
        }));
      });
    });
    return new docx.Document({
      creator: 'PDF y Word Fácil',
      sections: [{ properties: {}, children: children }]
    });
  }

  return {
    linesFromItems: linesFromItems,
    paragraphsFromLines: paragraphsFromLines,
    paragraphsFromItems: paragraphsFromItems,
    paragraphsFromOcrText: paragraphsFromOcrText,
    paragraphsFromOcrLines: paragraphsFromOcrLines,
    buildDocx: buildDocx
  };
});
