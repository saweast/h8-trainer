// Injected into every page of a demo recording (context.addInitScript).
// window.__demo.point(x, y)  — shows where the next tap lands
// window.__demo.title(t, s)  — full-screen title card; window.__demo.clearTitle()
// Taps also leave a short ripple. Captions are drawn by ffmpeg under the screen, not here.
;(() => {
  if (window.__demo) return
  const css = `
    #__demo-dot, .__demo-ripple { position: fixed; z-index: 2147483647; pointer-events: none; border-radius: 9999px; }
    #__demo-dot { width: 34px; height: 34px; margin: -17px 0 0 -17px; background: rgba(198,244,50,.35);
      border: 2px solid rgba(198,244,50,.95); box-shadow: 0 0 0 6px rgba(198,244,50,.15);
      opacity: 0; transition: opacity .15s, left .35s ease, top .35s ease; }
    .__demo-ripple { width: 20px; height: 20px; margin: -10px 0 0 -10px; background: rgba(198,244,50,.55);
      animation: __demo-ripple .55s ease-out forwards; }
    @keyframes __demo-ripple { to { transform: scale(3.4); opacity: 0; } }
    #__demo-title { position: fixed; inset: 0; z-index: 2147483646; display: flex; flex-direction: column;
      justify-content: center; gap: 14px; padding: 32px; background: #0b0b0c; color: #fafafa;
      font-family: Unbounded, Inter, system-ui, sans-serif; transition: opacity .4s; }
    #__demo-title .tag { align-self: flex-start; padding: 6px 12px; border-radius: 999px; background: #c6f432;
      color: #0a0a0a; font: 600 13px Inter, system-ui, sans-serif; letter-spacing: .02em; }
    #__demo-title h1 { margin: 0; font-size: clamp(28px, 7vw, 56px); line-height: 1.15; }
    #__demo-title p { margin: 0; color: #a1a1aa; font: 400 clamp(16px, 4vw, 24px)/1.4 Inter, system-ui, sans-serif; }
    #__demo-title .logo { font: 700 22px Unbounded, Inter, sans-serif; color: #fafafa; margin-bottom: 18px; }
    #__demo-title .logo b { color: #c6f432; }
  `
  let dot
  const ensure = () => {
    if (document.getElementById('__demo-style')) return
    const style = document.createElement('style')
    style.id = '__demo-style'
    style.textContent = css
    document.documentElement.appendChild(style)
    dot = document.createElement('div')
    dot.id = '__demo-dot'
    document.documentElement.appendChild(dot)
  }
  const ripple = (x, y) => {
    ensure()
    const r = document.createElement('div')
    r.className = '__demo-ripple'
    r.style.left = `${x}px`
    r.style.top = `${y}px`
    document.documentElement.appendChild(r)
    setTimeout(() => r.remove(), 700)
  }
  document.addEventListener('pointerdown', (e) => ripple(e.clientX, e.clientY), true)
  let hideTimer
  window.__demo = {
    point(x, y) {
      ensure()
      dot.style.left = `${x}px`
      dot.style.top = `${y}px`
      dot.style.opacity = '1'
      clearTimeout(hideTimer)
      hideTimer = setTimeout(() => (dot.style.opacity = '0'), 1100)
    },
    title(title, subtitle, tag) {
      ensure()
      const el = document.createElement('div')
      el.id = '__demo-title'
      el.innerHTML = '<div class="logo">h8<b>.</b> trainer</div>'
      if (tag) {
        const t = document.createElement('span')
        t.className = 'tag'
        t.textContent = tag
        el.appendChild(t)
      }
      const h = document.createElement('h1')
      h.textContent = title
      el.appendChild(h)
      if (subtitle) {
        const p = document.createElement('p')
        p.textContent = subtitle
        el.appendChild(p)
      }
      document.documentElement.appendChild(el)
    },
    clearTitle() {
      const el = document.getElementById('__demo-title')
      if (!el) return
      el.style.opacity = '0'
      setTimeout(() => el.remove(), 450)
    },
  }
})()
