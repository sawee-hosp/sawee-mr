/* =====================================================================
 * rxfill-shared.js — ใช้ร่วมกัน: drug-inventory · kitbox-admin · slip · label-print · drug-photo
 * ทุกเอกสารพิมพ์ "สด" จากข้อมูล ไม่มีไฟล์ใน Drive
 *   RX.esc / RX.norm / RX.fuzzy(query, [{t,w}])
 *   RX.slipHtml(order, {sign, checker})    ใบเบิก 60x80 mm
 *   RX.labelHtml(items)                    ฉลากยา 80x60 mm + แถบตัดเก็บแนวตั้ง 5 มม.
 *   RX.docHtml({title,meta,body,sign})     เอกสาร A4 มีขอบทุกหน้า (TH Sarabun New)
 *   RX.miniLabelHtml(items)                ฉลากจิ๋ว 4x4 ช่องบนกระดาษ 80x60 mm
 *   RX.autoLabel(drug)                     ร่างฉลากอัตโนมัติจากชื่อ/หน่วย/คุณสมบัติ
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
  // ฟอนต์ TH Sarabun New ทุกเอกสาร: ใช้ที่ติดตั้งในเครื่องก่อน ถ้าไม่มีโหลดจาก fonts/ ของเว็บนี้
  const SRC = (document.currentScript && document.currentScript.src) || location.href;
  let FONT_BASE = 'fonts/'; try { FONT_BASE = new URL('fonts/', SRC).href; } catch (x) {}
  const FONT_CSS = `@font-face{font-family:'TH Sarabun New';font-weight:400;src:local('TH Sarabun New'),local('THSarabunNew'),url('${FONT_BASE}THSarabunNew.ttf') format('truetype')}
@font-face{font-family:'TH Sarabun New';font-weight:700;src:local('TH Sarabun New Bold'),local('THSarabunNew-Bold'),local('THSarabunNew Bold'),url('${FONT_BASE}THSarabunNew-Bold.ttf') format('truetype')}`;
  RX.FONT_CSS = FONT_CSS;
  // data-fit="ขนาดเล็กสุด(px)" → ลดขนาดตัวอักษรจนไม่ล้นกรอบ (ไม่ตัดวรรณยุกต์ · ถ้าเล็กสุดแล้วยังล้นจึงตัดท้าย)
  const FIT = `<script>window.RXFIT=function(){document.querySelectorAll('[data-fit]').forEach(function(el){var s=parseFloat(getComputedStyle(el).fontSize),m=+el.getAttribute('data-fit')||7;
    var over=function(){return el.scrollWidth>el.clientWidth+.5||el.scrollHeight>el.clientHeight+.5};
    while(over()&&s>m){s-=.5;el.style.fontSize=s+'px';} if(over())el.classList.add('clip');});};<\/script>`;
  const HEAD = (title, css) => `<!doctype html><html><head><meta charset="utf-8"><title>${e(title)}</title>
<style>${FONT_CSS}
*{box-sizing:border-box;margin:0;padding:0}html,body{color:#000;font-family:'TH Sarabun New','THSarabunNew',sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{page-break-after:always;overflow:hidden;position:relative}.page:last-child{page-break-after:auto}
.one{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.clip{overflow:hidden!important;text-overflow:ellipsis}${css}</style>${FIT}</head><body>`;
  RX.HEAD = HEAD;
  const TH_MONTH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const p2 = n => String(n).padStart(2, '0');
  const thDate = (d) => { d = d || new Date(); return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear(); };
  const thDateBE = (d) => { d = d || new Date(); return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + (d.getFullYear() + 543); };       // 05/10/2569
  const thLong = (d) => { d = d || new Date(); return p2(d.getDate()) + ' ' + TH_MONTH[d.getMonth()] + ' ' + (d.getFullYear() + 543); }; // 05 ตุลาคม 2569
  RX.thLong = thLong; RX.thDateBE = thDateBE;
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
      groups[b].map(i => `<tr><td class="nm"><div class="one" data-fit="14">${e(i.name)}</div></td><td class="q">${e(i.qty)}<span class="u">${i.unit ? ' ' + e(String(i.unit).slice(0, 4)) : ''}</span></td></tr>`).join('')).join('');
    const sign = opt.sign ? `<div class="sg"><img src="${opt.sign}"><div class="one">ผู้จัดยา: ${e(opt.checker || '')}</div></div>` : (o.checkedBy ? `<div class="sg"><div class="one">ผู้จัดยา: ${e(o.checkedBy)}</div></div>` : '');
    return HEAD(o.id, `@page{size:60mm 80mm;margin:0}
  body{font-weight:700;line-height:1.2}.w{width:60mm;padding:1.5mm 3.5mm}
  .h{font-size:21px;text-align:center;border-bottom:1.5px solid #000;margin-bottom:1mm}
  .i{font-size:17px;line-height:1.25;margin-bottom:1mm}
  table{width:100%;border-collapse:collapse;table-layout:auto}
  td{border-bottom:1px dotted #000;padding:.5mm 0;vertical-align:bottom}
  .nm{font-size:21px;width:100%;max-width:0}.q{font-size:23px;text-align:right;width:1%;white-space:nowrap;padding-left:1.5mm}
  .u{font-size:14px;font-weight:400}.bx{font-size:18px;border-bottom:1px solid #000;padding-top:1.2mm}
  .sg{text-align:center;font-size:16px;margin-top:1mm}.sg img{max-height:10mm;max-width:40mm;display:block;margin:0 auto}
  .f{font-size:14px;border-top:1px dashed #000;margin-top:1mm;padding-top:.5mm;display:flex;justify-content:space-between}`) +
      `<div class="w"><div class="h">ใบเบิกเวชภัณฑ์</div>
  <div class="i"><div class="one">ID: ${e(o.id)}</div><div class="one">ผู้เบิก: ${e(o.user)}</div>เวลา: ${e(o.time)}</div>
  <table>${rows}</table>${sign}
  <div class="f"><span>${(o.items || []).length} รายการ</span><span>${e(opt.status || o.status || '')}</span></div></div></body></html>`;
  };

  // ---------------- ฉลากยา 80x60 + แถบตัดเก็บแนวตั้งด้านขวา 5 มม. ----------------
  // item: {name, amount, unit, l1, l2, l3, ind, store(หน่วยเก็บยา), qty}
  // ไม่มี overflow:hidden แนวตั้งในบรรทัดข้อความ → วรรณยุกต์ (เช่น ไม้โทใน "ครั้ง") ไม่ถูกตัด · ล้นเมื่อไรใช้ data-fit ย่อแทน
  RX.labelHtml = function (items, opt) {
    opt = opt || {}; const now = new Date(), dShort = thDateBE(now), dLong = thLong(now);
    const pages = [];
    (items || []).forEach(it => { for (let k = 0; k < (Number(it.qty) || 1); k++) pages.push(it); });
    return HEAD('ฉลากยา', `@page{size:80mm 60mm;margin:0}
  .page{width:80mm;height:60mm;display:flex}
  .m{width:75mm;height:60mm;padding:1.6mm 2mm 1.2mm 2.6mm;display:flex;flex-direction:column}
  .t{display:flex;align-items:baseline;gap:2mm;border-bottom:1px solid #000;padding-bottom:.3mm}
  .t .n{flex:1;min-width:0;font-weight:700;font-size:21px;line-height:1.15;white-space:nowrap}
  .t .a{font-weight:700;font-size:19px;line-height:1.15;white-space:nowrap}
  .mid{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;align-items:stretch;padding:.4mm 0}
  .l{text-align:center;white-space:nowrap;font-weight:700;line-height:1.2}
  .l1{font-size:28px}.l2{font-size:25px}.l3{font-size:22px}
  .ind{font-size:16px;text-align:center;line-height:1.05;max-height:9.5mm;padding-top:.6mm;margin-bottom:.4mm}
  .ft{border-top:.6px solid #888;padding-top:.3mm;font-size:13.5px;line-height:1.15;white-space:nowrap;color:#333;height:5mm}
  .ft .s{color:#555}
  .stub{width:5mm;height:60mm;border-left:1px dashed #000;display:flex;align-items:center;justify-content:center;overflow:hidden}
  .stub .vn{writing-mode:vertical-rl;transform:rotate(180deg);font-size:15px;font-weight:700;white-space:nowrap;height:57mm;width:5mm;line-height:5mm;text-align:center}`) +
      pages.map(it => `<div class="page"><div class="m">
      <div class="t"><div class="n" data-fit="12">${e(it.name)}</div><div class="a">${e([it.amount, it.unit].filter(Boolean).join(' '))}</div></div>
      <div class="mid">${it.l1 ? `<div class="l l1" data-fit="14">${e(it.l1)}</div>` : ''}${it.l2 ? `<div class="l l2" data-fit="14">${e(it.l2)}</div>` : ''}${it.l3 ? `<div class="l l3" data-fit="13">${e(it.l3)}</div>` : ''}</div>
      ${it.ind ? `<div class="ind" data-fit="11">${e(it.ind)}</div>` : ''}
      <div class="ft" data-fit="10">วันที่จัด ${dLong}${it.store || opt.store ? ` <span class="s">| ${e(it.store || opt.store)}</span>` : ''}</div>
    </div><div class="stub"><div class="vn" data-fit="9">${e(it.name)} จัด ${dShort}</div></div></div>`).join('') + '</body></html>';
  };

  // ---------------- ฉลากจิ๋ว: กระดาษ 80x60 แบ่ง 4x4 ช่อง (20x15 มม.) มีรอยประสำหรับตัด ----------------
  // item: {name, loc|store, qty} · ชื่อยาขนาดคงที่ เกินช่องให้ "…" · บรรทัด 2 จุดเก็บยาตัวเล็ก
  RX.miniLabelHtml = function (items) {
    const cells = []; (items || []).forEach(it => { for (let k = 0; k < (Number(it.qty) || 1); k++) cells.push(it); });
    const pages = []; for (let i = 0; i < cells.length; i += 16) pages.push(cells.slice(i, i + 16));
    return HEAD('ฉลากจิ๋ว', `@page{size:80mm 60mm;margin:0}
  .page{width:80mm;height:60mm;display:grid;grid-template-columns:repeat(4,20mm);grid-template-rows:repeat(4,15mm)}
  .c{border-right:.3mm dashed #888;border-bottom:.3mm dashed #888;padding:1.2mm 1.1mm .6mm;display:flex;flex-direction:column;justify-content:center;min-width:0;overflow:hidden}
  .c:nth-child(4n){border-right:0}.c:nth-child(n+13){border-bottom:0}
  .n{font-size:17px;font-weight:700;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-top:.4mm}
  .w{font-size:12.5px;line-height:1.1;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`) +
      pages.map(pg => `<div class="page">${Array.from({ length: 16 }, (_, i) => { const it = pg[i];
        return it ? `<div class="c"><div class="n">${e(it.name)}</div><div class="w">${e(it.loc || it.store || '')}</div></div>` : '<div class="c"></div>'; }).join('')}</div>`).join('') + '</body></html>';
  };

  // ---------------- สร้างฉลากอัตโนมัติจากชื่อ/หน่วย/คุณสมบัติยา (แก้ต่อได้) ----------------
  // d: {n ชื่อ, u หน่วย, ha, c (2-8°C), l (กันแสง)}
  RX.autoLabel = function (d) {
    const n = String(d.n || ''), s = (n + ' ' + (d.u || '')).toLowerCase(), has = re => re.test(s);
    let L = { l1: '', l2: '', l3: '' }, unit = d.u || '';
    if (has(/inj|amp|vial|แอมป์|ไวแอล|ฉีด/)) L = { l1: 'ยาฉีด', l2: 'ใช้ตามแพทย์สั่ง', l3: '' };
    else if (has(/eye|ตา\b|ear drop|หยอด/)) L = { l1: 'หยอดครั้งละ 1–2 หยด', l2: 'วันละ 4 ครั้ง', l3: 'เช้า กลางวัน เย็น ก่อนนอน' };
    else if (has(/cream|oint|gel|lotion|ครีม|ขี้ผึ้ง|เจล/)) L = { l1: 'ทาบางๆ บริเวณที่เป็น', l2: 'วันละ 2 ครั้ง', l3: 'เช้า – เย็น' };
    else if (has(/inhal|mdi|evohaler|accuhaler|turbuhaler|พ่น/)) L = { l1: 'พ่นสูดครั้งละ 2 กด', l2: 'เมื่อมีอาการ', l3: 'ห่างกันอย่างน้อย 4 ชั่วโมง' };
    else if (has(/syr|susp|mixt|elixir|solution|น้ำ|ml\b|ขวด/)) L = { l1: 'รับประทานครั้งละ 1 ช้อนชา', l2: 'วันละ 3 ครั้ง', l3: 'หลังอาหาร เช้า กลางวัน เย็น' };
    else if (has(/supp|เหน็บ/)) L = { l1: 'เหน็บทวารครั้งละ 1 เม็ด', l2: 'เมื่อมีอาการ', l3: '' };
    else if (has(/tab|cap|เม็ด|แคปซูล|mg\b/)) L = { l1: 'รับประทานครั้งละ 1 เม็ด', l2: 'วันละ 3 ครั้ง', l3: 'หลังอาหาร เช้า กลางวัน เย็น' };
    const ind = [d.ha && 'ยาที่ต้องระมัดระวังสูง (High Alert)', d.c && 'เก็บในตู้เย็น 2–8 °C ห้ามแช่แข็ง', d.l && 'เก็บให้พ้นแสง'].filter(Boolean).join(' · ');
    return { name: n, amount: '', unit, l1: L.l1, l2: L.l2, l3: L.l3, ind };
  };

  // ---------------- ป้ายติดล็อกยา 50x30 + QR (Inventory ID) ----------------
  // item: {invId, location, name, amount}
  RX.shelfHtml = function (items) {
    return HEAD('ป้ายล็อกยา', `@page{size:50mm 30mm;margin:0}
  .page{width:50mm;height:30mm;padding:1.2mm 1.5mm;display:grid;grid-template-columns:1fr 15mm;grid-template-rows:5mm 1fr 7mm;column-gap:1mm}
  .loc{grid-column:1;font-size:16px;font-weight:800;height:5mm;line-height:5mm}
  .id{grid-column:2;font-size:12px;text-align:right;height:5mm;line-height:5mm}
  .nm{grid-column:1;grid-row:2;font-size:21px;font-weight:800;line-height:1.1;overflow:hidden;display:flex;align-items:center}
  .qr{grid-column:2;grid-row:2 / span 2;width:15mm;height:15mm;align-self:center}.qr svg{width:100%;height:100%}
  .am{grid-column:1;grid-row:3;font-size:16px;height:7mm;line-height:7mm}.am b{font-size:20px}`) +
      (items || []).map(i => `<div class="page"><div class="loc one" data-fit="10">${e(i.location || '-')}</div><div class="id one">${e(i.invId)}</div>
      <div class="nm" data-fit="10"><span>${e(i.name)}</span></div><div class="qr">${RX.qrSvg(i.invId)}</div>
      <div class="am one">จำนวน <b>${e(i.amount ?? '-')}</b></div></div>`).join('') + '</body></html>';
  };

  // ---------------- สติกเกอร์คู่ใช้ 50x30 ----------------
  RX.doubleHtml = function (name) {
    return HEAD('สติกเกอร์คู่ใช้', `@page{size:50mm 30mm;margin:0}.page{width:50mm;height:30mm;padding:2mm;display:flex;flex-direction:column;justify-content:center;text-align:center}
  .t{font-size:16px;border-bottom:1px solid #000;margin-bottom:1mm}.n{font-size:23px;font-weight:800;height:16mm;overflow:hidden;line-height:1.1;display:flex;align-items:center;justify-content:center}`) +
      `<div class="page"><div class="t">สติกเกอร์คู่ใช้</div><div class="n" data-fit="12"><span>${e(name)}</span></div></div></body></html>`;
  };

  // ---------------- ใบแปะกล่อง 60x80 (ลายเซ็นใช้ชั่วคราว ไม่เก็บ) ----------------
  RX.boxLabelHtml = function (d, sign) {
    return HEAD('ใบแปะกล่อง', `@page{size:60mm 80mm;margin:0}.page{width:60mm;height:80mm;padding:2.5mm;display:flex;flex-direction:column;border:1.5px solid #000}
  .t{font-size:17px;font-weight:700;text-align:center;border-bottom:1.5px solid #000;padding-bottom:.5mm}
  .x{background:#000;color:#fff;text-align:center;margin:1.5mm 0;padding:1.5mm 0}.x div:first-child{font-size:22px;font-weight:700}.x div:last-child{font-size:35px;font-weight:800;line-height:1.1}
  .b{font-size:18px;font-weight:700;height:6mm;line-height:6mm}.d{font-size:16px;height:5.5mm;line-height:5.5mm}
  .s{margin-top:auto;text-align:center;font-size:16px}.s img{max-height:14mm;max-width:45mm}
  .f{font-size:14px;border-top:1px solid #999;margin-top:1mm;padding-top:.5mm;line-height:1.3}`) +
      `<div class="page"><div class="t">ดูวันหมดอายุก่อนฉีกกล่องใช้</div>
  <div class="x"><div>กล่องหมดอายุ</div><div>${e(d.expStr || '-')}</div></div>
  <div class="b one" data-fit="12">ชื่อกล่อง: ${e(d.box)}</div><div class="d one" data-fit="10">ยาอายุสั้นสุด: ${e(d.earliestDrug || '-')}</div>
  <div class="s">${sign ? `<img src="${sign}"><br>` : ''}(${e(d.user || '')})</div>
  <div class="f">เติมยาล่าสุด: ${new Date().toLocaleString('th-TH')}${d.temp != null ? `<br>อุณหภูมิ ${e(d.temp)} °C เมื่อ ${e(d.tempTime || '')}` : ''}<br>จำนวนครั้ง: ${e(d.changeCount ?? '-')}</div></div></body></html>`;
  };

  // ---------------- เอกสาร A4 (ขอบกระดาษทุกหน้า แม้ตั้งค่าพิมพ์ "ไม่มีขอบ") ----------------
  // ใช้ตารางครอบ: thead/tfoot ว่างที่ซ้ำทุกหน้า = ขอบบน/ล่าง · padding ซ้าย/ขวา = ขอบข้าง
  // o: {title, subtitle, meta:[[label,value],...], body(html), sign:[{label,name,role}], landscape}
  RX.docHtml = function (o) {
    const printed = 'พิมพ์เมื่อ ' + thLong() + ' ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
    const meta = (o.meta || []).map(([k, v]) => `<div class="mi"><span>${e(k)}</span><b>${e(v)}</b></div>`).join('');
    const sign = (o.sign || []).map(x => `<div class="sg"><div class="ln"></div><div>(${e(x.name || '.................................................')})</div><div class="mut">${e(x.label || '')}${x.role ? ' · ' + e(x.role) : ''}</div></div>`).join('');
    return HEAD(o.title, `@page{size:A4 ${o.landscape ? 'landscape' : 'portrait'};margin:0}
  body{font-size:20px;line-height:1.25;padding:0 16mm 0 20mm}
  table.frame{width:100%;border-collapse:collapse}table.frame>thead td{height:14mm}table.frame>tfoot td{height:14mm;vertical-align:bottom}
  .pf{display:flex;justify-content:space-between;font-size:15px;color:#666;border-top:.5px solid #bbb;padding:1mm 0 5mm}
  .hdr{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2.5px solid #0f5132;padding-bottom:1.5mm;margin-bottom:3mm}
  .hdr .org{font-size:17px;color:#0f5132;font-weight:700;letter-spacing:.2px}.hdr h1{font-size:30px;font-weight:700;line-height:1.1}.hdr .sub{font-size:18px;color:#444}
  .meta{display:grid;grid-template-columns:repeat(${Math.min(3, (o.meta || []).length || 1)},1fr);gap:1mm 6mm;background:#f3f7f4;border:1px solid #d5e4da;border-radius:2mm;padding:2mm 4mm;margin-bottom:4mm}
  .mi{display:flex;flex-direction:column;line-height:1.1}.mi span{font-size:15px;color:#555}.mi b{font-size:20px}
  table.t{width:100%;border-collapse:collapse;font-size:18px}
  table.t th{background:#0f5132;color:#fff;font-weight:700;padding:1.2mm 1.6mm;border:1px solid #0f5132;line-height:1.1}
  table.t td{padding:.9mm 1.6mm;border:1px solid #c9d3cd;vertical-align:top}
  table.t tbody tr:nth-child(even) td{background:#f6f8f7}
  table.t tr{page-break-inside:avoid}
  .c{text-align:center}.r{text-align:right;white-space:nowrap}.mut{color:#666}.red{color:#b91c1c;font-weight:700}.small{font-size:15px}
  .tot td{background:#e8f1eb!important;font-weight:700;font-size:19px}
  .signs{display:flex;justify-content:space-around;gap:10mm;margin-top:12mm;page-break-inside:avoid}
  .sg{text-align:center;min-width:62mm;line-height:1.35}.sg .ln{border-bottom:1px dotted #000;height:12mm;margin-bottom:1mm}
  ${o.css || ''}`) +
      `<table class="frame"><thead><tr><td></td></tr></thead>
  <tfoot><tr><td><div class="pf"><span>${e(o.footer || 'ฝ่ายเภสัชกรรม โรงพยาบาลสวี')}</span><span>${printed}</span></div></td></tr></tfoot>
  <tbody><tr><td>
  <div class="hdr"><div><div class="org">ฝ่ายเภสัชกรรม โรงพยาบาลสวี จังหวัดชุมพร</div><h1>${e(o.title)}</h1>${o.subtitle ? `<div class="sub">${e(o.subtitle)}</div>` : ''}</div></div>
  ${meta ? `<div class="meta">${meta}</div>` : ''}
  ${o.body || ''}
  ${sign ? `<div class="signs">${sign}</div>` : ''}
  </td></tr></tbody></table></body></html>`;
  };

  // ---------------- แบบสำรวจคลังยาย่อย A4 ----------------
  // info {group, box, user} · rows [{name, max, actual, expire, price, note, danger}]
  RX.stockCheckHtml = function (info, rows) {
    let total = 0;
    const tr = rows.map((r, i) => { const v = (Number(r.actual) || 0) * (Number(r.price) || 0); total += v;
      return `<tr><td class="c">${i + 1}</td><td${r.danger ? ' class="red"' : ''}>${e(r.name)}</td><td class="c">${e(r.max)}</td><td class="c">${e(r.actual)}</td><td class="c${r.danger ? ' red' : ''}">${e(isoToTh(r.expire) || '-')}</td>
      <td class="r">${Number(r.price || 0).toFixed(2)}</td><td class="r">${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td class="small red">${e(r.note || '')}</td></tr>`; }).join('');
    const body = `<table class="t"><thead><tr><th style="width:8mm">ที่</th><th>ชื่อยา</th><th style="width:14mm">จำนวน</th><th style="width:14mm">มีจริง</th><th style="width:24mm">วันหมดอายุ</th><th style="width:20mm">ราคา/หน่วย</th><th style="width:24mm">มูลค่า</th><th style="width:26mm">หมายเหตุ</th></tr></thead>
      <tbody>${tr}<tr class="tot"><td colspan="6" class="r">รวมมูลค่าทั้งสิ้น</td><td class="r">฿${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td></td></tr></tbody></table>
      <div class="small mut" style="margin-top:2mm">ตัวอักษรสีแดง = ยาหมดอายุภายใน 30 วัน</div>`;
    return RX.docHtml({ title: 'แบบสำรวจคลังยาย่อยหน่วยงาน', subtitle: 'ตรวจนับจำนวนและวันหมดอายุยาสำรอง',
      meta: [['หน่วยงาน', info.group || '-'], ['หน่วยสำรองยา', info.box || '-'], ['วันที่ตรวจ', thLong()]],
      body, sign: [{ label: 'ผู้ตรวจ', name: info.user || '', role: 'เภสัชกร' }, { label: 'ผู้รับการตรวจ', name: '', role: 'หน่วยงาน' }] });
  };

  // ---------------- พิมพ์ทันที (iframe ซ่อน) ----------------
  function waitReady(f) {
    return new Promise(ok => {
      const done = () => { const w = f.contentWindow, d = w.document;
        const fl = d.fonts && d.fonts.load ? Promise.all(['400 16px "TH Sarabun New"', '700 16px "TH Sarabun New"'].map(f => d.fonts.load(f).catch(() => 0))) : Promise.resolve();
        fl.then(() => d.fonts && d.fonts.ready).then(() => setTimeout(() => { try { w.RXFIT && w.RXFIT(); } catch (x) {} ok(w); }, 120)); };
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
