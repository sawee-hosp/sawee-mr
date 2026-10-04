/* =====================================================================
 * rxfill-shared.js — ใช้ร่วมกัน: drug-inventory · kitbox-admin · slip · label-print · drug-photo
 * ทุกเอกสารพิมพ์ "สด" จากข้อมูล ไม่มีไฟล์ใน Drive
 *   RX.esc / RX.norm / RX.fuzzy(query, [{t,w}])
 *   RX.slipHtml(order, {sign, checker})    ใบเบิก 60x80 mm
 *   RX.labelHtml(items)                    ฉลากยา 80x60 mm + ต้นขั้วแนวตั้งด้านขวา
 *   RX.shelfHtml(items)                    ป้ายติดล็อกยา 50x30 mm + QR (Inventory ID)
 *   RX.doubleHtml(name)                    สติกเกอร์คู่ใช้ 50x30 mm
 *   RX.boxLabelHtml(data, sign)            ใบแปะกล่อง 60x80 mm
 *   RX.stockCheckHtml(info, rows)          แบบสำรวจคลังยาย่อย A4
 *   RX.printHtml(html) / RX.printSlip(order, opt) / RX.previewInto(iframe, html)
 * ===================================================================== */
(function (g) {
  const RX = {};
  RX.esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const e = RX.esc;

  // ---------------- fuzzy search ----------------
  const norm = s => String(s || '').toLowerCase().normalize('NFKC')
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}️‍]/gu, '')
    .replace(/[\s\-_.,()\[\]\/+*:;"']+/g, ' ').trim();
  RX.norm = norm;
  function lev(a, b) {
    if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function tokenSim(tok, words) {
    let best = 0;
    for (const w of words) {
      if (!w) continue;
      if (w === tok) return 1;
      if (w.startsWith(tok)) { best = Math.max(best, 0.95); continue; }
      if (w.includes(tok)) { best = Math.max(best, 0.85); continue; }
      if (tok.length >= 3) {
        const d = Math.min(lev(tok, w.slice(0, tok.length + 1)), lev(tok, w.slice(0, tok.length)));
        best = Math.max(best, 1 - d / Math.max(tok.length, 1) - 0.1);
      }
    }
    return best;
  }
  function subseq(q, t) { let i = 0; for (const ch of t) if (ch === q[i]) i++; return i === q.length; }
  function scoreOne(q, text) {
    const t = norm(text); if (!t) return 0;
    const qc = q.replace(/ /g, ''), tc = t.replace(/ /g, '');
    if (t === q || tc === qc) return 100;
    if (t.startsWith(q) || tc.startsWith(qc)) return 96;
    const i = tc.indexOf(qc); if (i > -1) return 90 - Math.min(i, 30) * 0.3;
    const qt = q.split(' ').filter(Boolean), tw = t.split(' ');
    let sc = qt.reduce((s, k) => s + tokenSim(k, tw.concat([tc])), 0) / qt.length * 82;
    if (qc.length >= 3 && subseq(qc, tc)) sc = Math.max(sc, 55);
    return sc;
  }
  RX.fuzzy = function (query, fields) {
    const q = norm(query); if (!q) return 0;
    let best = 0;
    for (const f of fields) {
      if (!f || !f.t) continue;
      // ช่อง Fuzzy (ชื่ออื่นคั่นด้วย ,) → เทียบทีละชื่อ
      const parts = f.split ? String(f.t).split(/[,;|\n]/) : [f.t];
      for (const p of parts) { const s = scoreOne(q, p) * (f.w ?? 1); if (s > best) best = s; }
    }
    return Math.round(best);
  };
  RX.FUZZY_MIN = 50;

  // ---------------- พื้นฐานเอกสารพิมพ์ ----------------
  // data-fit="ขนาดเล็กสุด(px)" → ลดขนาดตัวอักษรจนไม่ล้นกรอบ (ไม่ล้น ไม่ตกขอบ)
  const FIT = `<script>window.RXFIT=function(){document.querySelectorAll('[data-fit]').forEach(function(el){var s=parseFloat(getComputedStyle(el).fontSize),m=+el.getAttribute('data-fit')||7;
    while((el.scrollWidth>el.clientWidth+.5||el.scrollHeight>el.clientHeight+.5)&&s>m){s-=.5;el.style.fontSize=s+'px';}});};<\/script>`;
  const HEAD = (title, css) => `<!doctype html><html><head><meta charset="utf-8"><title>${e(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0}html,body{color:#000;font-family:'Sarabun',sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{page-break-after:always;overflow:hidden;position:relative}.page:last-child{page-break-after:auto}
.one{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}${css}</style>${FIT}</head><body>`;
  const thDate = (d) => { d = d || new Date(); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); };
  const isoToTh = s => { s = String(s || ''); const m = s.match(/^(\d{4})-(\d\d)-(\d\d)/); return m ? `${m[3]}/${m[2]}/${m[1]}` : s; };
  RX.isoToTh = isoToTh;

  // QR (qrcode-generator ถ้าโหลดไว้ · ถ้าไม่มีใช้รูปจาก quickchart)
  RX.qrSvg = function (text) {
    try {
      if (g.qrcode) { const q = g.qrcode(0, 'M'); q.addData(String(text)); q.make(); return q.createSvgTag(2, 0); }
    } catch (err) {}
    return `<img src="https://quickchart.io/qr?text=${encodeURIComponent(text)}&size=200&margin=0" style="width:100%;height:100%">`;
  };

  // ---------------- ใบเบิก 60x80 (ตัวใหญ่ขึ้น 1.5 เท่า · ชื่อยาบรรทัดเดียว) ----------------
  RX.slipHtml = function (o, opt) {
    opt = opt || {};
    const groups = {}; (o.items || []).forEach(i => (groups[i.box || '-'] = groups[i.box || '-'] || []).push(i));
    const multi = Object.keys(groups).length > 1;
    const rows = Object.keys(groups).map(b => (multi || b !== '-' ? `<tr><td colspan="2" class="bx one">📦 ${e(b)}</td></tr>` : '') +
      groups[b].map(i => `<tr><td class="nm"><div class="one" data-fit="11">${e(i.name)}</div></td><td class="q">${e(i.qty)}<span class="u">${i.unit ? ' ' + e(String(i.unit).slice(0, 4)) : ''}</span></td></tr>`).join('')).join('');
    const sign = opt.sign ? `<div class="sg"><img src="${opt.sign}"><div class="one">ผู้จัดยา: ${e(opt.checker || '')}</div></div>` : (o.checkedBy ? `<div class="sg"><div class="one">ผู้จัดยา: ${e(o.checkedBy)}</div></div>` : '');
    return HEAD(o.id, `@page{size:60mm 80mm;margin:0}
  body{font-weight:700}.w{width:60mm;padding:1.5mm 3.5mm}
  .h{font-size:16px;text-align:center;border-bottom:1.5px solid #000;margin-bottom:1mm}
  .i{font-size:13px;line-height:1.25;margin-bottom:1mm}
  table{width:100%;border-collapse:collapse;table-layout:auto}
  td{border-bottom:1px dotted #000;padding:.5mm 0;vertical-align:bottom}
  .nm{font-size:16px;width:100%;max-width:0}.q{font-size:18px;text-align:right;width:1%;white-space:nowrap;padding-left:1.5mm}
  .u{font-size:11px;font-weight:400}.bx{font-size:14px;border-bottom:1px solid #000;padding-top:1.2mm}
  .sg{text-align:center;font-size:12px;margin-top:1mm}.sg img{max-height:10mm;max-width:40mm;display:block;margin:0 auto}
  .f{font-size:11px;border-top:1px dashed #000;margin-top:1mm;padding-top:.5mm;display:flex;justify-content:space-between}`) +
      `<div class="w"><div class="h">ใบเบิกเวชภัณฑ์</div>
  <div class="i"><div class="one">ID: ${e(o.id)}</div><div class="one">ผู้เบิก: ${e(o.user)}</div>เวลา: ${e(o.time)}</div>
  <table>${rows}</table>${sign}
  <div class="f"><span>${(o.items || []).length} รายการ</span><span>${e(opt.status || o.status || '')}</span></div></div></body></html>`;
  };

  // ---------------- ฉลากยา 80x60 + ต้นขั้วแนวตั้ง (ตัดเก็บ) ----------------
  // item: {name, amount, unit, l1, l2, l3, ind, expire(dd/mm/yyyy หรือ yyyy-mm-dd), qty}
  RX.labelHtml = function (items, opt) {
    opt = opt || {}; const today = thDate();
    const pages = [];
    (items || []).forEach(it => { for (let k = 0; k < (Number(it.qty) || 1); k++) pages.push(it); });
    return HEAD('ฉลากยา', `@page{size:80mm 60mm;margin:0}
  .page{width:80mm;height:60mm;display:flex}
  .m{width:75mm;height:60mm;padding:1.8mm 2mm 1.2mm 2.5mm;display:flex;flex-direction:column}
  .t{display:flex;align-items:flex-end;gap:2mm;border-bottom:1.2px solid #000;padding-bottom:.5mm;height:7mm}
  .t .n{flex:1;min-width:0;font-weight:800;font-size:13px;height:6mm;line-height:6mm}
  .t .a{font-weight:700;font-size:12px;white-space:nowrap;height:6mm;line-height:6mm}
  .mid{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:.3mm;padding:.6mm 0;overflow:hidden}
  .l{text-align:center;white-space:nowrap;overflow:hidden;font-weight:800;line-height:1.15}
  .l1{font-size:19px;height:7.5mm}.l2{font-size:17px;height:6.8mm}.l3{font-size:15px;height:6mm}
  .ind{font-size:9.5px;font-weight:600;text-align:center;line-height:1.12;height:8.5mm;overflow:hidden;word-break:break-word}
  .ft{display:flex;justify-content:space-between;align-items:center;gap:2mm;border-top:.8px solid #999;padding-top:.4mm;height:5mm;white-space:nowrap}
  .ft .d{font-size:9px;font-weight:600;flex:1;min-width:0;height:4mm;line-height:4mm;overflow:hidden}.ft .x{font-size:10px;font-weight:800;white-space:nowrap}
  .stub{width:5mm;height:60mm;border-left:1.2px dashed #000;display:flex;align-items:center;justify-content:center}
  .stub .vn{writing-mode:vertical-rl;transform:rotate(180deg);font-size:9px;font-weight:700;white-space:nowrap;overflow:hidden;height:56mm;width:4.4mm;line-height:4.4mm;text-align:center}`) +
      pages.map(it => {
        const exp = isoToTh(it.expire);
        return `<div class="page"><div class="m">
      <div class="t"><div class="n one" data-fit="10">${e(it.name)}</div><div class="a">${e([it.amount, it.unit].filter(Boolean).join(' '))}</div></div>
      <div class="mid">${it.l1 ? `<div class="l l1" data-fit="8">${e(it.l1)}</div>` : ''}${it.l2 ? `<div class="l l2" data-fit="8">${e(it.l2)}</div>` : ''}${it.l3 ? `<div class="l l3" data-fit="8">${e(it.l3)}</div>` : ''}</div>
      ${it.ind ? `<div class="ind" data-fit="5">${e(it.ind)}</div>` : ''}
      <div class="ft"><div class="d" data-fit="6">วันที่จัด ${today}${opt.by ? ' · พิมพ์โดย ' + e(opt.by) : ''}</div><div class="x">${exp ? 'EXP ' + e(exp) : ''}</div></div>
    </div><div class="stub"><div class="vn" data-fit="5">${e(it.name)} · จัด ${today}</div></div></div>`;
      }).join('') + '</body></html>';
  };

  // ---------------- ป้ายติดล็อกยา 50x30 + QR (Inventory ID) ----------------
  // item: {invId, location, name, amount}
  RX.shelfHtml = function (items) {
    return HEAD('ป้ายล็อกยา', `@page{size:50mm 30mm;margin:0}
  .page{width:50mm;height:30mm;padding:1.2mm 1.5mm;display:grid;grid-template-columns:1fr 15mm;grid-template-rows:5mm 1fr 7mm;column-gap:1mm}
  .loc{grid-column:1;font-size:12px;font-weight:800;height:5mm;line-height:5mm}
  .id{grid-column:2;font-size:9px;text-align:right;height:5mm;line-height:5mm}
  .nm{grid-column:1;grid-row:2;font-size:16px;font-weight:800;line-height:1.1;overflow:hidden;display:flex;align-items:center}
  .qr{grid-column:2;grid-row:2 / span 2;width:15mm;height:15mm;align-self:center}.qr svg{width:100%;height:100%}
  .am{grid-column:1;grid-row:3;font-size:12px;height:7mm;line-height:7mm}.am b{font-size:15px}`) +
      (items || []).map(i => `<div class="page"><div class="loc one" data-fit="8">${e(i.location || '-')}</div><div class="id one">${e(i.invId)}</div>
      <div class="nm" data-fit="8"><span>${e(i.name)}</span></div><div class="qr">${RX.qrSvg(i.invId)}</div>
      <div class="am one">จำนวน <b>${e(i.amount ?? '-')}</b></div></div>`).join('') + '</body></html>';
  };

  // ---------------- สติกเกอร์คู่ใช้ 50x30 ----------------
  RX.doubleHtml = function (name) {
    return HEAD('สติกเกอร์คู่ใช้', `@page{size:50mm 30mm;margin:0}.page{width:50mm;height:30mm;padding:2mm;display:flex;flex-direction:column;justify-content:center;text-align:center}
  .t{font-size:12px;border-bottom:1px solid #000;margin-bottom:1mm}.n{font-size:18px;font-weight:800;height:16mm;overflow:hidden;line-height:1.1;display:flex;align-items:center;justify-content:center}`) +
      `<div class="page"><div class="t">สติกเกอร์คู่ใช้</div><div class="n" data-fit="9"><span>${e(name)}</span></div></div></body></html>`;
  };

  // ---------------- ใบแปะกล่อง 60x80 (ลายเซ็นใช้ชั่วคราว ไม่เก็บ) ----------------
  RX.boxLabelHtml = function (d, sign) {
    return HEAD('ใบแปะกล่อง', `@page{size:60mm 80mm;margin:0}.page{width:60mm;height:80mm;padding:2.5mm;display:flex;flex-direction:column;border:1.5px solid #000}
  .t{font-size:13px;font-weight:700;text-align:center;border-bottom:1.5px solid #000;padding-bottom:.5mm}
  .x{background:#000;color:#fff;text-align:center;margin:1.5mm 0;padding:1.5mm 0}.x div:first-child{font-size:17px;font-weight:700}.x div:last-child{font-size:27px;font-weight:800;line-height:1.1}
  .b{font-size:14px;font-weight:700;height:6mm;line-height:6mm}.d{font-size:12px;height:5.5mm;line-height:5.5mm}
  .s{margin-top:auto;text-align:center;font-size:12px}.s img{max-height:14mm;max-width:45mm}
  .f{font-size:11px;border-top:1px solid #999;margin-top:1mm;padding-top:.5mm;line-height:1.3}`) +
      `<div class="page"><div class="t">ดูวันหมดอายุก่อนฉีกกล่องใช้</div>
  <div class="x"><div>กล่องหมดอายุ</div><div>${e(d.expStr || '-')}</div></div>
  <div class="b one" data-fit="9">ชื่อกล่อง: ${e(d.box)}</div><div class="d one" data-fit="8">ยาอายุสั้นสุด: ${e(d.earliestDrug || '-')}</div>
  <div class="s">${sign ? `<img src="${sign}"><br>` : ''}(${e(d.user || '')})</div>
  <div class="f">เติมยาล่าสุด: ${new Date().toLocaleString('th-TH')}${d.temp != null ? `<br>อุณหภูมิ ${e(d.temp)} °C เมื่อ ${e(d.tempTime || '')}` : ''}<br>จำนวนครั้ง: ${e(d.changeCount ?? '-')}</div></div></body></html>`;
  };

  // ---------------- แบบสำรวจคลังยาย่อย A4 ----------------
  // info {group, box, user} · rows [{name, max, actual, expire, price, note, danger}]
  RX.stockCheckHtml = function (info, rows) {
    let total = 0;
    const tr = rows.map((r, i) => { const v = (Number(r.actual) || 0) * (Number(r.price) || 0); total += v;
      return `<tr style="${r.danger ? 'color:#c00' : ''}"><td class="c">${i + 1}</td><td>${e(r.name)}</td><td class="c">${e(r.max)}</td><td class="c">${e(r.actual)}</td><td class="c">${e(isoToTh(r.expire) || '-')}</td>
      <td class="r">${Number(r.price || 0).toFixed(2)}</td><td class="r">${v.toFixed(2)}</td><td style="color:#c00;font-size:11px">${e(r.note || '')}</td></tr>`; }).join('');
    return HEAD('แบบสำรวจ ' + info.box, `@page{size:A4;margin:12mm 10mm}body{font-size:13px}
  h1{font-size:20px;font-weight:600;text-align:center;margin-bottom:3mm}.hd{display:flex;justify-content:space-between;font-size:14px;margin-bottom:3mm}
  table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:1.2mm 1.5mm}th{background:#eee}.c{text-align:center}.r{text-align:right}
  .tot{text-align:right;font-weight:700;font-size:15px;margin:3mm 0 12mm}.sg{text-align:center;width:80mm;margin-left:auto;line-height:1.8}`) +
      `<h1>แบบสำรวจคลังยาย่อยหน่วยงาน รพ.สวี</h1><div class="hd"><span>หน่วยงาน : ${e(info.group || '-')}</span><span>หน่วยสำรองยา : ${e(info.box)}</span><span>วันที่ : ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
  <table><thead><tr><th>ที่</th><th>ชื่อยา</th><th>จำนวน</th><th>มีจริง</th><th>วันหมดอายุ</th><th>ราคา/หน่วย</th><th>มูลค่า</th><th>หมายเหตุ</th></tr></thead><tbody>${tr}</tbody></table>
  <div class="tot">รวมมูลค่าทั้งสิ้น ฿${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
  <div class="sg">ผู้ตรวจ .......................................................<br>(${e(info.user || '')})<br>ตำแหน่ง เภสัชกร</div></body></html>`;
  };

  // ---------------- พิมพ์ทันที (iframe ซ่อน) ----------------
  function waitReady(f) {
    return new Promise(ok => {
      const done = () => { const w = f.contentWindow, d = w.document;
        (d.fonts && d.fonts.ready ? d.fonts.ready : Promise.resolve()).then(() => setTimeout(() => { try { w.RXFIT && w.RXFIT(); } catch (x) {} ok(w); }, 120)); };
      if (f.contentWindow && f.contentWindow.document.readyState === 'complete') done(); else f.onload = done;
    });
  }
  RX.printHtml = function (html) {
    let f = document.getElementById('rx-print-frame'); if (f) f.remove();
    f = document.createElement('iframe'); f.id = 'rx-print-frame';
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    f.srcdoc = html;
    return waitReady(f).then(w => { try { w.focus(); w.print(); } catch (x) { const n = window.open('', '_blank'); n.document.write(html); n.document.close(); setTimeout(() => n.print(), 600); } });
  };
  RX.previewInto = function (iframe, html) { iframe.srcdoc = html; return waitReady(iframe); };
  RX.printSlip = (o, opt) => RX.printHtml(RX.slipHtml(o, opt));

  g.RX = RX;
})(window);
