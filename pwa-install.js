/* pwa-install.js — ปุ่มติดตั้งปุ่มเดียวของหน้า Portal (index.html)
 * คลิกปุ่มที่มี data-pwa-install ปุ่มเดียว:
 *   • Chrome/Edge/Android → เปิดหน้าต่างติดตั้งของเบราว์เซอร์ทันที (ได้ไอคอนบน Desktop / หน้าจอมือถือ)
 *   • Windows ที่เบราว์เซอร์ไม่เปิดหน้าต่างให้ → ดาวน์โหลดตัวติดตั้ง .bat ให้อัตโนมัติ (ดับเบิลคลิกแล้วได้ไอคอนบน Desktop)
 *   • iPhone/iPad → แสดงขั้นตอนกดแชร์ (Apple ไม่ให้เว็บติดตั้งเอง)
 * ไม่มีหน้าเลือกวิธี ไม่ต้องกดซ้ำ */
(function (g) {
  'use strict';
  const NAME = 'Sawee Portal', ICO = 'icons/portal.ico';
  let deferred = null;
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && 'ontouchend' in document);
  const isWin = () => /windows/i.test(navigator.userAgent);
  const inApp = () => /line\/|fban|fbav|instagram/i.test(navigator.userAgent);
  const sync = () => document.querySelectorAll('[data-pwa-install]').forEach(b => { b.hidden = isStandalone(); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; sync(); });
  window.addEventListener('appinstalled', () => { deferred = null; sync(); });
  document.addEventListener('DOMContentLoaded', sync);

  function winInstaller() {
    const base = new URL('.', location.href).href;
    const bat = ['@echo off', 'chcp 65001 >nul', 'title Install ' + NAME, 'set "D=%LOCALAPPDATA%\\SaweeRxfill"', 'if not exist "%D%" mkdir "%D%"',
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Invoke-WebRequest '${base + ICO}' -OutFile '%D%\\portal.ico'; ` +
      `$b=@('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe')|Where-Object{Test-Path $_}|Select-Object -First 1; ` +
      `if(-not $b){throw 'ไม่พบ Chrome หรือ Edge'}; $s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\\${NAME}.lnk'); ` +
      `$s.TargetPath=$b; $s.Arguments='--app=${base}'; $s.IconLocation='%D%\\portal.ico'; $s.Save()"`,
      'if errorlevel 1 (echo ติดตั้งไม่สำเร็จ & pause & exit /b 1)', 'echo.', 'echo ติดตั้งเรียบร้อย - ดับเบิลคลิกไอคอน ' + NAME + ' บน Desktop', 'timeout /t 4 >nul'].join('\r\n');
    const u = URL.createObjectURL(new Blob([bat], { type: 'application/octet-stream' }));
    const a = document.createElement('a'); a.href = u; a.download = 'install-' + NAME.replace(/ /g, '-') + '.bat';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000);
  }

  function note(html) {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.72);color:#fff;font-family:Prompt,sans-serif;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:24px 20px;text-align:center;line-height:1.8';
    ov.innerHTML = html + '<div style="margin-top:22px;opacity:.7;font-size:.9rem">แตะที่ว่างเพื่อปิด</div>';
    ov.onclick = () => ov.remove(); document.body.appendChild(ov);
  }
  const waitPrompt = ms => new Promise(ok => {
    if (deferred) return ok();
    const t = setTimeout(ok, ms);
    window.addEventListener('beforeinstallprompt', () => { clearTimeout(t); setTimeout(ok, 0); }, { once: true });
  });

  g.PWA = {
    canInstall: () => !isStandalone(),
    winInstaller,
    async install() {
      if (isStandalone()) return note('<div style="font-size:1.2rem;font-weight:700">เปิดเป็นแอปอยู่แล้ว</div>');
      if (inApp()) return note('<div style="font-size:1.25rem;font-weight:700">เปิดในเบราว์เซอร์ก่อน</div><div>กดเมนู ⋯ / ⋮ แล้วเลือก "เปิดในเบราว์เซอร์" (Safari / Chrome)<br>จากนั้นกดปุ่มติดตั้งอีกครั้ง</div>');
      if (!deferred && !isIOS()) await waitPrompt(2000);          // รอเบราว์เซอร์พร้อม (เปิดหน้าครั้งแรก service worker ยังไม่เสร็จ)
      if (deferred) { deferred.prompt(); const r = await deferred.userChoice.catch(() => ({})); deferred = null; return r.outcome === 'accepted'; }
      if (isIOS()) return note('<div style="font-size:1.25rem;font-weight:700">เพิ่มเป็นแอปบน iPhone/iPad</div><div style="font-size:1.05rem">① กดปุ่ม <b style="background:#fff;color:#007aff;border-radius:6px;padding:0 8px">แชร์ ⬆︎</b><br>② เลือก <b style="background:#fff;color:#111;border-radius:6px;padding:0 8px">เพิ่มลงหน้าจอโฮม</b></div>');
      if (isWin()) {                                               // เบราว์เซอร์ไม่เปิดหน้าต่างติดตั้ง → ดาวน์โหลดตัวติดตั้ง Desktop ให้เลย
        winInstaller();
        return note('<div style="font-size:1.25rem;font-weight:700">ดาวน์โหลดตัวติดตั้งแล้ว</div><div>ดับเบิลคลิกไฟล์ <b>install-Sawee-Portal.bat</b> ที่ดาวน์โหลดมา<br>จะได้ไอคอน <b>Sawee Portal</b> บน Desktop ทันที<br><span style="opacity:.8;font-size:.9rem">(ถ้า Windows ถาม ให้เลือก "เรียกใช้อยู่ดี")</span></div>');
      }
      note('<div style="font-size:1.2rem;font-weight:700">เบราว์เซอร์นี้ยังไม่เปิดหน้าต่างติดตั้งให้</div><div>ใช้ Chrome หรือ Edge แล้วกดปุ่มติดตั้งอีกครั้ง<br>(หรือเมนู ⋮ → "ส่ง/บันทึกและแชร์" → "ติดตั้ง")</div>');
      return false;
    }
  };
})(window);
