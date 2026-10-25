/* Minimal .xlsx reader (no libraries). Reads the first sheet into rows of text. Needs DecompressionStream (all current browsers). */
var XLSXLite = (function () {
  function u16(b, o) {
    return b[o] | (b[o + 1] << 8);
  }
  function u32(b, o) {
    return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  }
  function inflate(data) {
    var ds = new DecompressionStream("deflate-raw");
    var w = ds.writable.getWriter();
    w.write(data);
    w.close();
    return new Response(ds.readable).arrayBuffer().then(function (b) {
      return new Uint8Array(b);
    });
  }
  function unzip(buf) {
    var b = new Uint8Array(buf),
      e = -1,
      i;
    for (i = b.length - 22; i >= Math.max(0, b.length - 70000); i--)
      if (u32(b, i) === 0x06054b50) {
        e = i;
        break;
      }
    if (e < 0) throw new Error("Not an Excel (.xlsx) file");
    var n = u16(b, e + 10),
      p = u32(b, e + 16),
      files = {};
    for (i = 0; i < n; i++) {
      var method = u16(b, p + 10),
        csz = u32(b, p + 20),
        nl = u16(b, p + 28),
        xl = u16(b, p + 30),
        cl = u16(b, p + 32),
        lh = u32(b, p + 42);
      var name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nl));
      files[name] = { method: method, csz: csz, lh: lh };
      p += 46 + nl + xl + cl;
    }
    function read(name) {
      var f = files[name];
      if (!f) return Promise.resolve(null);
      var o = f.lh,
        st = o + 30 + u16(b, o + 26) + u16(b, o + 28),
        raw = b.subarray(st, st + f.csz);
      return (f.method === 0 ? Promise.resolve(raw) : inflate(raw)).then(
        function (d) {
          return new TextDecoder().decode(d);
        },
      );
    }
    return { names: Object.keys(files), read: read };
  }
  function dec(s) {
    return s
      .replace(/&#x([0-9a-f]+);/gi, function (m, h) {
        return String.fromCodePoint(parseInt(h, 16));
      })
      .replace(/&#(\d+);/g, function (m, d) {
        return String.fromCodePoint(+d);
      })
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }
  function texts(x) {
    var o = "",
      re = /<t[^>]*>([\s\S]*?)<\/t>/g,
      m;
    while ((m = re.exec(x))) o += m[1];
    return dec(o);
  }
  function colNum(ref) {
    var l = /^[A-Z]+/.exec(ref)[0],
      n = 0;
    for (var i = 0; i < l.length; i++) n = n * 26 + l.charCodeAt(i) - 64;
    return n - 1;
  }
  function parse(buf) {
    return Promise.resolve()
      .then(function () {
        return unzip(buf);
      })
      .then(function (z) {
        return z.read("xl/sharedStrings.xml").then(function (ss) {
          var shared = [];
          if (ss)
            (ss.match(/<si[\s>][\s\S]*?<\/si>|<si\/>/g) || []).forEach(
              function (s) {
                shared.push(texts(s));
              },
            );
          var sheet = z.names
            .filter(function (n) {
              return /^xl\/worksheets\/sheet\d+\.xml$/.test(n);
            })
            .sort()[0];
          if (!sheet) throw new Error("No sheet found in this file");
          return z.read(sheet).then(function (x) {
            var rows = [],
              rr = /<row[ >][\s\S]*?<\/row>/g,
              rm;
            while ((rm = rr.exec(x))) {
              var row = [],
                cr = /<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
                cm;
              while ((cm = cr.exec(rm[0]))) {
                var at = cm[1],
                  body = cm[2] || "",
                  ref = /r="([A-Z]+\d+)"/.exec(at);
                if (!ref) continue;
                var t = /t="(\w+)"/.exec(at),
                  v = /<v>([\s\S]*?)<\/v>/.exec(body),
                  val = "";
                if (t && t[1] === "s" && v) val = shared[+v[1]] || "";
                else if (t && t[1] === "inlineStr") val = texts(body);
                else if (v) val = dec(v[1]);
                row[colNum(ref[1])] = val;
              }
              for (var k = 0; k < row.length; k++)
                if (row[k] == null) row[k] = "";
              rows.push(row);
            }
            return rows;
          });
        });
      });
  }
  return { parse: parse };
})();

/* Optech "Customer List" -> clean customer records */
XLSXLite.optech = function (rows) {
  var hi = -1,
    i;
  for (i = 0; i < rows.length; i++)
    if (
      rows[i].some(function (c) {
        return /^ledger name$/i.test(String(c).trim());
      })
    ) {
      hi = i;
      break;
    }
  if (hi < 0)
    throw new Error(
      'This does not look like the Optech customer list (no "Ledger Name" column)',
    );
  var H = {};
  rows[hi].forEach(function (c, k) {
    H[String(c).trim().toLowerCase()] = k;
  });
  function g(r, n) {
    var k = H[n];
    return k == null ? "" : String(r[k] == null ? "" : r[k]).trim();
  }
  function phone(v) {
    var d = String(v || "").replace(/\D/g, "");
    if (/^0\d{9,10}$/.test(d)) return d;
    if (d.length > 10) d = d.slice(-10);
    return /^[6-9]\d{9}$/.test(d) ? d : "";
  }
  var out = [],
    skipped = 0,
    seen = {};
  for (i = hi + 1; i < rows.length; i++) {
    var r = rows[i],
      raw = g(r, "ledger name");
    if (!raw || (H["s.no"] != null && !/^\d+$/.test(g(r, "s.no")))) {
      if (
        r.some(function (c) {
          return String(c).trim();
        })
      )
        skipped++;
      continue;
    }
    var name = raw
      .replace(/^\s*-\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!name) {
      skipped++;
      continue;
    }
    var area = g(r, "area name");
    if (/^primary$/i.test(area)) area = "";
    var ph = [],
      seenP = {};
    ["cell", "cell2", "phone", "contact person"].forEach(function (f) {
      var p = phone(g(r, f));
      if (p && !seenP[p]) {
        seenP[p] = 1;
        ph.push(p);
      }
    });
    var gst = g(r, "gstin").toUpperCase().replace(/\s/g, "");
    if (gst.length !== 15) gst = "";
    var key = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (seen[key]) {
      seen[key]++;
      key += "#" + seen[key];
    } else seen[key] = 1;
    var lk = "";
    [
      "map link",
      "maplink",
      "google map",
      "google maps",
      "location",
      "pin",
      "map",
      "link",
    ].forEach(function (n) {
      if (!lk) lk = g(r, n);
    });
    var rl = g(r, "latitude") || g(r, "lat"),
      ro = g(r, "longitude") || g(r, "lng") || g(r, "long") || g(r, "lon");
    var adr = g(r, "address") || g(r, "shop address") || g(r, "full address");
    out.push({
      code: g(r, "code"),
      key: key,
      name: name,
      area: area,
      address: adr,
      phone: ph[0] || "",
      phone2: ph[1] || "",
      gstin: gst,
      regn: g(r, "regn type"),
      rawLat: rl,
      rawLng: ro,
      rawLink: lk,
      line: i + 1,
    });
  }
  return { customers: out, skipped: skipped };
};
/* Minimal .xlsx writer (no libraries). XLSXLite.build([{ name, rows, widths, fillCols, filter }]) -> Blob.
   rows: array of arrays (string, number or null). fillCols: column numbers whose header is highlighted yellow. */
XLSXLite.build = function (sheets) {
  var enc = new TextEncoder(),
    T = null;
  function crc(b) {
    if (!T) {
      T = [];
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++)
          c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        T[n] = c >>> 0;
      }
    }
    var r = 0xffffffff;
    for (var i = 0; i < b.length; i++) r = T[(r ^ b[i]) & 255] ^ (r >>> 8);
    return (r ^ 0xffffffff) >>> 0;
  }
  function xe(s) {
    return String(s)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function cn(i) {
    var s = "";
    i++;
    while (i > 0) {
      var m = (i - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  }
  var HEAD = 'xml version="1.0" encoding="UTF-8" standalone="yes"';
  function sheetXml(sh) {
    var rows = sh.rows,
      w = "";
    (sh.widths || []).forEach(function (x, i) {
      w +=
        '<col min="' +
        (i + 1) +
        '" max="' +
        (i + 1) +
        '" width="' +
        x +
        '" customWidth="1"/>';
    });
    var o =
      "<?" +
      HEAD +
      '?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0">' +
      (sh.freeze === false
        ? ""
        : '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>') +
      '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>' +
      (w ? "<cols>" + w + "</cols>" : "") +
      "<sheetData>";
    rows.forEach(function (r, ri) {
      o += '<row r="' + (ri + 1) + '">';
      r.forEach(function (v, ci) {
        if (v === null || v === undefined || v === "") {
          if (ri === 0)
            o +=
              '<c r="' +
              cn(ci) +
              '1" s="' +
              ((sh.fillCols || []).indexOf(ci) > -1 ? 2 : 1) +
              '"/>';
          return;
        }
        var ref = cn(ci) + (ri + 1),
          st =
            ri === 0
              ? (sh.fillCols || []).indexOf(ci) > -1
                ? 2
                : 1
              : sh.wrap
                ? 3
                : 0;
        if (typeof v === "number" && isFinite(v))
          o +=
            '<c r="' +
            ref +
            '"' +
            (st ? ' s="' + st + '"' : "") +
            "><v>" +
            v +
            "</v></c>";
        else
          o +=
            '<c r="' +
            ref +
            '" t="inlineStr"' +
            (st ? ' s="' + st + '"' : "") +
            '><is><t xml:space="preserve">' +
            xe(v) +
            "</t></is></c>";
      });
      o += "</row>";
    });
    o +=
      "</sheetData>" +
      (sh.filter && rows.length > 1
        ? '<autoFilter ref="A1:' + cn(rows[0].length - 1) + rows.length + '"/>'
        : "") +
      "</worksheet>";
    return o;
  }
  var files = [],
    ct = "",
    wb = "",
    rels = "";
  sheets.forEach(function (sh, i) {
    var n = i + 1;
    files.push(["xl/worksheets/sheet" + n + ".xml", sheetXml(sh)]);
    ct +=
      '<Override PartName="/xl/worksheets/sheet' +
      n +
      '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    wb +=
      '<sheet name="' +
      xe(sh.name || "Sheet" + n) +
      '" sheetId="' +
      n +
      '" r:id="rId' +
      n +
      '"/>';
    rels +=
      '<Relationship Id="rId' +
      n +
      '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' +
      n +
      '.xml"/>';
  });
  var n1 = sheets.length + 1;
  files.unshift([
    "[Content_Types].xml",
    "<?" +
      HEAD +
      '?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      ct +
      "</Types>",
  ]);
  files.push([
    "_rels/.rels",
    "<?" +
      HEAD +
      '?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  ]);
  files.push([
    "xl/workbook.xml",
    "<?" +
      HEAD +
      '?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      wb +
      "</sheets></workbook>",
  ]);
  files.push([
    "xl/_rels/workbook.xml.rels",
    "<?" +
      HEAD +
      '?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      rels +
      '<Relationship Id="rId' +
      n1 +
      '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  ]);
  files.push([
    "xl/styles.xml",
    "<?" +
      HEAD +
      '?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFE699"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
  ]);
  var parts = [],
    off = 0,
    cen = [];
  files.forEach(function (f) {
    var nm = enc.encode(f[0]),
      d = enc.encode(f[1]),
      c = crc(d),
      h = new Uint8Array(30 + nm.length),
      v = new DataView(h.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x0800, true);
    v.setUint16(8, 0, true);
    v.setUint16(10, 0, true);
    v.setUint16(12, 0x21, true);
    v.setUint32(14, c, true);
    v.setUint32(18, d.length, true);
    v.setUint32(22, d.length, true);
    v.setUint16(26, nm.length, true);
    v.setUint16(28, 0, true);
    h.set(nm, 30);
    parts.push(h, d);
    var ce = new Uint8Array(46 + nm.length),
      cv = new DataView(ce.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, c, true);
    cv.setUint32(20, d.length, true);
    cv.setUint32(24, d.length, true);
    cv.setUint16(28, nm.length, true);
    cv.setUint32(42, off, true);
    ce.set(nm, 46);
    cen.push(ce);
    off += h.length + d.length;
  });
  var cs = 0;
  cen.forEach(function (c) {
    cs += c.length;
  });
  var end = new Uint8Array(22),
    ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cs, true);
  ev.setUint32(16, off, true);
  return new Blob(parts.concat(cen, [end]), {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
};
/* Optech Sales Register (daily bills) -> one entry per bill. Returns null when the file is not a bill list. */
XLSXLite.bill = function (rows) {
  var hi = -1,
    i,
    H = {};
  for (i = 0; i < Math.min(rows.length, 30); i++) {
    var h = rows[i].map(function (v) {
      return String(v == null ? "" : v)
        .trim()
        .toLowerCase();
    });
    if (h.indexOf("bill no") > -1 && h.indexOf("party name") > -1) {
      hi = i;
      h.forEach(function (v, k) {
        if (v && H[v] == null) H[v] = k;
      });
      break;
    }
  }
  if (hi < 0) return null;
  function g(r, n) {
    var k = H[n];
    return k == null ? "" : String(r[k] == null ? "" : r[k]).trim();
  }
  function num(v) {
    var n = parseFloat(String(v).replace(/,/g, ""));
    return isNaN(n) ? 0 : n;
  }
  var bills = [],
    cur = null,
    total = 0;
  for (i = hi + 1; i < rows.length; i++) {
    var r = rows[i],
      no = g(r, "bill no");
    if (no) {
      cur = {
        inv: no,
        date: g(r, "date"),
        party: g(r, "party name")
          .replace(/^\s*-\s*/, "")
          .replace(/\s+/g, " ")
          .trim(),
        gstin: g(r, "gstin").toUpperCase().replace(/\s/g, ""),
        amount: 0,
        qty: 0,
        lines: 0,
        items: [],
      };
      bills.push(cur);
    }
    if (cur && g(r, "item name")) {
      var q = num(g(r, "qty")),
        a = 0,
        ri =
          num(g(r, "rate+tax")) ||
          num(g(r, "rate + tax")) ||
          num(g(r, "rate incl tax")) ||
          num(g(r, "rate")),
        nm = [
          "tot amt",
          "total amt",
          "tot amount",
          "total amount",
          "net amt",
          "net amount",
          "item amount",
          "line total",
          "amount",
          "amt",
        ];
      for (var z = 0; z < nm.length && !a; z++) a = num(g(r, nm[z]));
      if (!a && q && ri) a = q * ri; // no usable amount column (or its formulas have no saved result): quantity x rate with GST (the Rate+Tax column; plain Rate is before GST)
      cur.amount += a;
      cur.qty += q;
      cur.lines++;
      var mrp = num(
        g(r, "mrp") || g(r, "m.r.p") || g(r, "m.r.p.") || g(r, "mrp rate"),
      );
      var gp =
        num(g(r, "gst %")) || num(g(r, "igst %")) || num(g(r, "gst")) || 0;
      // Sheet's own before-GST amount (qty x plain Rate) so the delivery bill shows the same "without GST" figure as the sheet.
      var exr = num(g(r, "rate")),
        hasTaxCol = H["rate+tax"] != null || H["rate + tax"] != null;
      cur.items.push({
        name: g(r, "item name"),
        mrp: mrp,
        qty: q,
        gst: gp,
        ex: hasTaxCol && gp > 0 && exr && q ? Math.round(exr * q * 100) / 100 : undefined,
        rate: q && a ? Math.round((a / q) * 100) / 100 : ri,
        amt: Math.round(a * 100) / 100,
      });
    }
  }
  bills = bills.filter(function (b) {
    return b.party && b.lines;
  });
  bills.forEach(function (b) {
    b.amount = Math.round(b.amount * 100) / 100;
    b.qty = Math.round(b.qty * 100) / 100;
    total += b.amount;
  });
  return { bills: bills, total: Math.round(total * 100) / 100 };
};
if (typeof module !== "undefined") module.exports = XLSXLite;
