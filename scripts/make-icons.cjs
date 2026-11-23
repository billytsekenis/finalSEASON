// Δημιουργεί τα PNG εικονίδια της εφαρμογής από HTML/CSS μέσω Playwright.
const { chromium } = require('playwright');
const html = (pad) => `<html><body style="margin:0">
<div style="width:1024px;height:1024px;background:radial-gradient(120% 120% at 50% 0%, #1b1b22 0%, #060608 60%);position:relative;overflow:hidden">
  <div style="position:absolute;inset:${pad}px;display:grid;place-items:center">
    <div style="position:relative;width:62%;aspect-ratio:1">
      <div style="position:absolute;inset:-12%;border-radius:50%;background:conic-gradient(from 200deg,#ff6a5c,#ffc85c,#7df09a,#5cc9ff,#a77bff,#ff6a9e,#ff6a5c);filter:blur(70px);opacity:.75"></div>
      <div style="position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 200deg,#ff6a5c,#ffc85c,#7df09a,#5cc9ff,#a77bff,#ff6a9e,#ff6a5c)"></div>
      <div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle closest-side,#fff 0%,rgba(255,255,255,.85) 22%,rgba(255,255,255,0) 72%)"></div>
      <div style="position:absolute;inset:0;border-radius:50%;box-shadow:inset 0 0 0 6px rgba(255,255,255,.18)"></div>
    </div>
  </div>
</div></body></html>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
  const shots = [
    ['icon-512.png', 512, 120],
    ['icon-192.png', 192, 120],
    ['apple-touch-icon.png', 180, 120],
    ['icon-maskable-512.png', 512, 210],
  ];
  for (const [name, size, pad] of shots) {
    await p.setContent(html(pad));
    const buf = await p.screenshot({ clip: { x: 0, y: 0, width: 1024, height: 1024 } });
    const q = await b.newPage({ viewport: { width: size, height: size } });
    await q.setContent(`<body style="margin:0"><img src="data:image/png;base64,${buf.toString('base64')}" style="width:${size}px;height:${size}px;display:block"></body>`);
    await q.screenshot({ path: `public/icons/${name}`, clip: { x: 0, y: 0, width: size, height: size } });
    await q.close();
  }
  await b.close();
})();
