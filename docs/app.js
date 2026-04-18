(() => {
  // ========== Copy buttons ==========
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetSel = btn.getAttribute('data-copy');
      const target = targetSel && document.querySelector(targetSel);
      if (!target) return;
      const text = target.textContent.trim();
      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        // fallback
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (_) {}
        document.body.removeChild(ta);
      }
      const label = btn.querySelector('span');
      const orig = label ? label.textContent : btn.textContent;
      btn.classList.add('copied');
      if (label) label.textContent = 'Copied'; else btn.textContent = 'Copied';
      setTimeout(() => {
        btn.classList.remove('copied');
        if (label) label.textContent = orig; else btn.textContent = orig;
      }, 1400);
    });
  });

  // ========== Tabs ==========
  document.querySelectorAll('.tabs').forEach(group => {
    const tabs = group.querySelectorAll('.tab');
    const panels = group.querySelectorAll('.tab-panel');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const key = tab.getAttribute('data-tab');
        tabs.forEach(t => t.classList.toggle('active', t === tab));
        panels.forEach(p => p.classList.toggle('active', p.getAttribute('data-panel') === key));
      });
    });
  });

  // ========== Feature scroll-in ==========
  const io = new IntersectionObserver(entries => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        setTimeout(() => e.target.classList.add('in'), (i % 9) * 60);
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('.feature').forEach(f => io.observe(f));

  // ========== Parallax on hive logo ==========
  const hive = document.getElementById('hive-animated');
  const hiveImg = hive && hive.querySelector('img');
  let tick = false;
  window.addEventListener('scroll', () => {
    if (tick || !hiveImg) return;
    tick = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      if (y < 800) {
        hiveImg.style.transform = `translateY(${y * 0.08}px) rotate(${y * 0.04}deg)`;
      }
      tick = false;
    });
  });

  // ========== Live release info from GitHub ==========
  async function fetchLatestRelease() {
    try {
      const r = await fetch('https://api.github.com/repos/macokay/proxmox-hive/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) throw new Error('api ' + r.status);
      const data = await r.json();
      const tag = data.tag_name || data.name || '';
      const published = data.published_at ? new Date(data.published_at) : null;
      return { tag, published };
    } catch (e) { return null; }
  }
  function fmtDate(d) {
    if (!d) return '';
    try { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return d.toDateString(); }
  }
  (async () => {
    const release = await fetchLatestRelease();
    const v = release && release.tag ? (release.tag.startsWith('v') ? release.tag : 'v' + release.tag) : 'v1.0.4';
    const dateStr = release && release.published ? fmtDate(release.published) : '';
    document.querySelectorAll('[data-live-version]').forEach(el => { el.textContent = v; });
    document.querySelectorAll('[data-live-release]').forEach(el => {
      el.textContent = dateStr ? (v + ' · latest release · ' + dateStr) : (v + ' · latest release');
    });
    document.querySelectorAll('[data-live-footer]').forEach(el => { el.textContent = 'Proxmox Hive ' + v + ' · GitHub'; });
    document.querySelectorAll('[data-live-footer-small]').forEach(el => { el.textContent = v + ' · © 2026 Mac O Kay'; });
  })();

  // ========== Badge soft pulse ==========
  const badge = document.getElementById('version-badge');
  const statuses = [null];
  let si = 0;
  // Disable fake rotation; version is now live from GitHub
  if (false && badge) {
    setInterval(() => {
      si = (si + 1) % statuses.length;
      badge.textContent = statuses[si];
      badge.style.color = si === 1 ? '#34D399' : '';
    }, 3800);
  }

  // ========== TWEAKS ==========
  const tweaks = window.__TWEAKS__ || {};

  function applyTweaks(t) {
    const root = document.documentElement;
    root.style.setProperty('--accent', t.accent);
    // derive a lighter tint for gradient
    root.style.setProperty('--accent-2', t.accentGlow || lighten(t.accent, 10));
    document.body.classList.toggle('no-anim', t.animatedLogo === false);
    document.body.classList.toggle('hide-version', t.showVersionBadge === false);
    document.body.classList.toggle('no-grain', t.grain === false);
    document.body.setAttribute('data-density', t.density || 'comfortable');
    const hero = document.querySelector('.hero');
    if (hero) hero.setAttribute('data-layout', t.heroLayout || 'split');
  }
  function lighten(hex, pct) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) + Math.round(255 * pct / 100);
    let g = ((n >> 8) & 0xff) + Math.round(255 * pct / 100);
    let b = (n & 0xff) + Math.round(255 * pct / 100);
    r = Math.min(255, r); g = Math.min(255, g); b = Math.min(255, b);
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }
  applyTweaks(tweaks);

  function save(partial) {
    Object.assign(tweaks, partial);
    applyTweaks(tweaks);
    try {
      window.parent.postMessage({ type: '__edit_mode_set_keys', edits: partial }, '*');
    } catch (e) {}
  }

  // Hook up tweaks UI
  document.querySelectorAll('#tw-accent .sw').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#tw-accent .sw').forEach(b => b.classList.toggle('active', b === btn));
      const v = btn.dataset.val;
      save({ accent: v, accentGlow: lighten(v, 10) });
    });
  });
  document.querySelectorAll('#tw-hero button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#tw-hero button').forEach(b => b.classList.toggle('active', b === btn));
      save({ heroLayout: btn.dataset.val });
    });
  });
  document.querySelectorAll('#tw-density button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#tw-density button').forEach(b => b.classList.toggle('active', b === btn));
      save({ density: btn.dataset.val });
    });
  });
  const twAnim = document.getElementById('tw-anim');
  const twBadge = document.getElementById('tw-badge');
  const twGrain = document.getElementById('tw-grain');
  if (twAnim) { twAnim.checked = tweaks.animatedLogo !== false; twAnim.addEventListener('change', e => save({ animatedLogo: e.target.checked })); }
  if (twBadge) { twBadge.checked = tweaks.showVersionBadge !== false; twBadge.addEventListener('change', e => save({ showVersionBadge: e.target.checked })); }
  if (twGrain) { twGrain.checked = tweaks.grain !== false; twGrain.addEventListener('change', e => save({ grain: e.target.checked })); }

  // sync current state to UI
  function syncTweaksUI() {
    document.querySelectorAll('#tw-accent .sw').forEach(b => b.classList.toggle('active', b.dataset.val.toLowerCase() === (tweaks.accent || '').toLowerCase()));
    document.querySelectorAll('#tw-hero button').forEach(b => b.classList.toggle('active', b.dataset.val === (tweaks.heroLayout || 'split')));
    document.querySelectorAll('#tw-density button').forEach(b => b.classList.toggle('active', b.dataset.val === (tweaks.density || 'comfortable')));
  }
  syncTweaksUI();

  // ========== Host edit-mode protocol ==========
  const panel = document.getElementById('tweaks');
  const closeBtn = document.getElementById('tweaks-close');
  window.addEventListener('message', e => {
    const d = e.data || {};
    if (d.type === '__activate_edit_mode') panel.hidden = false;
    if (d.type === '__deactivate_edit_mode') panel.hidden = true;
  });
  closeBtn && closeBtn.addEventListener('click', () => {
    panel.hidden = true;
    try { window.parent.postMessage({ type: '__deactivate_edit_mode' }, '*'); } catch (e) {}
  });
  try { window.parent.postMessage({ type: '__edit_mode_available' }, '*'); } catch (e) {}
})();
