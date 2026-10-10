// Sawee Rxfill service worker — จำเป็นเพื่อให้ Chrome/Edge แสดงปุ่ม "ติดตั้งแอป"
// ไม่เก็บ cache ข้อมูล (ข้อมูลยาต้องสดเสมอ) — ส่งต่อทุก request ไปที่เครือข่ายตรงๆ
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(() => new Response(
    '<meta charset="utf-8"><body style="font-family:sans-serif;text-align:center;padding:40px">ไม่มีอินเทอร์เน็ต — เชื่อมต่อแล้วลองใหม่</body>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
