/* =====================================================================
 * rxfill-shared.js — ใช้ร่วมกัน: drug-inventory.html (หน้าเบิก) · slip.html · kitbox-admin.html (ห้องยา)
 *   RX.esc(s)                      escape HTML
 *   RX.fuzzy(query, fields)        คะแนนความเหมือน 0-100 (fields = [{t:'ข้อความ', w:1}, ...])
 *   RX.slipHtml(order)             HTML ใบเบิก 60x80mm (ไม่มีลายเซ็น/QR)
 *   RX.printSlip(order)            พิมพ์ใบเบิกทันที (iframe ซ่อน ไม่ต้องสร้างไฟล์)
 * order = { id, user, time, box, items:[{box, name, qty, unit, loc}], status, checkedBy }
 * ===================================================================== */
(function (g) {
  const RX = {};
  RX.esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------- fuzzy search ----------------
  const norm = s => String(s || '').toLowerCase().normalize('NFKC')
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}️‍]/gu, '')
    .replace(/[\s\-_.,()\[\]\/+*:;"']+/g, ' ').trim();
  RX.norm = norm;
  function lev(a, b) {                       // Levenshtein (สั้นๆ ใช้กับคำ)
    if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function tokenSim(tok, words) {            // คำค้น 1 คำ เทียบกับทุกคำในข้อความ → ดีที่สุด 0..1
    let best = 0;
    for (const w of words) {
      if (!w) continue;
      if (w === tok) return 1;
      if (w.startsWith(tok)) { best = Math.max(best, 0.95); continue; }
      if (w.includes(tok)) { best = Math.max(best, 0.85); continue; }
      if (tok.length >= 3) {
        const head = w.slice(0, tok.length + 1);
        const d = Math.min(lev(tok, head), lev(tok, w.slice(0, tok.length)));
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
    const avg = qt.reduce((s, k) => s + tokenSim(k, tw.concat([tc])), 0) / qt.length;
    let sc = avg * 82;
    if (qc.length >= 3 && subseq(qc, tc)) sc = Math.max(sc, 55);
    return sc;
  }
  /** fields: [{t, w}] — w = น้ำหนัก (ชื่อยา 1, ชื่อสามัญ/คำพ้อง 0.9, icode 1) */
  RX.fuzzy = function (query, fields) {
    const q = norm(query); if (!q) return 0;
    let best = 0;
    for (const f of fields) { if (!f || !f.t) continue; const s = scoreOne(q, f.t) * (f.w ?? 1); if (s > best) best = s; }
    return Math.round(best);
  };
  RX.FUZZY_MIN = 50;

  // ---------------- ใบเบิก (สร้างใหม่ทุกครั้ง ไม่เก็บไฟล์) ----------------
  RX.slipHtml = function (o) {
    const e = RX.esc, groups = {};
    (o.items || []).forEach(i => { (groups[i.box || '-'] = groups[i.box || '-'] || []).push(i); });
    const multi = Object.keys(groups).length > 1;
    const rows = Object.keys(groups).map(b =>
      (multi || b !== '-' ? `<tr><td colspan="2" class="bx">📦 ${e(b)}</td></tr>` : '') +
      groups[b].map(i => `<tr><td class="nm">${e(i.name)}${i.loc ? ` <span class="lc">${e(i.loc.split('/').slice(1).join('/'))}</span>` : ''}</td><td class="q">${e(i.qty)}${i.unit ? `<span class="u"> ${e(i.unit)}</span>` : ''}</td></tr>`).join('')
    ).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${e(o.id)}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box} @page{size:60mm 80mm;margin:0}
  html,body{margin:0;padding:0;color:#000;font-family:'Sarabun',sans-serif;font-weight:700}
  .w{width:60mm;padding:1.5mm 4mm}
  /* ขนาดตัวอักษรเดิม −0.5rem (ขั้นต่ำ 7pt ให้เครื่องพิมพ์ความร้อนยังอ่านได้) */
  .h{font-size:max(calc(14pt - .5rem),9pt);text-align:center;border-bottom:1.5px solid #000;margin-bottom:1mm}
  .i{font-size:max(calc(11pt - .5rem),7pt);line-height:1.2;margin-bottom:1mm}
  .i .id{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  td{border-bottom:1px dotted #000;padding:.4mm 0;vertical-align:bottom}
  .nm{font-size:max(calc(14pt - .5rem),8pt);width:78%;word-break:break-word}
  .q{font-size:max(calc(16pt - .5rem),9pt);text-align:right;width:22%;white-space:nowrap}
  .u,.lc{font-size:max(calc(8pt - .5rem),6pt);font-weight:400}
  .bx{font-size:max(calc(11pt - .5rem),7pt);border-bottom:1px solid #000;padding-top:1mm}
  .f{font-size:max(calc(8pt - .5rem),6pt);border-top:1px dashed #000;margin-top:1mm;padding-top:.5mm;display:flex;justify-content:space-between}
</style></head><body><div class="w">
  <div class="h">ใบเบิกเวชภัณฑ์</div>
  <div class="i"><div class="id">ID: ${e(o.id)}</div>ผู้เบิก: ${e(o.user)}<br>เวลา: ${e(o.time)}</div>
  <table>${rows}</table>
  <div class="f"><span>${(o.items || []).length} รายการ</span><span>${e(o.status || '')}</span></div>
</div></body></html>`;
  };
  RX.printSlip = function (o) {
    let f = document.getElementById('rx-print-frame');
    if (f) f.remove();
    f = document.createElement('iframe');
    f.id = 'rx-print-frame';
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    const d = f.contentWindow.document; d.open(); d.write(RX.slipHtml(o)); d.close();
    const go = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { const w = window.open('', '_blank'); w.document.write(RX.slipHtml(o)); w.document.close(); w.print(); } };
    (f.contentWindow.document.fonts && f.contentWindow.document.fonts.ready ? f.contentWindow.document.fonts.ready : Promise.resolve()).then(() => setTimeout(go, 150));
  };

  g.RX = RX;
})(window);
