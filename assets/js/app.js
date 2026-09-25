/* =========================================================================
   Talha Ayyaz — portfolio
   Orbit mode  : six slides mapped onto a rotating planet. Drag / swipe / flick
                 to spin between them. Wheel, arrow keys, nav and dial also work.
   Normal mode : an ordinary scrolling page, camera flies through the galaxy.
   ========================================================================= */

(function () {
  'use strict';

  /* ── tweak me ─────────────────────────────────────────────────────── */
  var CONFIG = {
    defaultMode:     'orbit',   // 'orbit' | 'normal'
    motionIntensity: 8,         // 1 – 10
    starDensity:     1,         // 0.3 – 1.6
    nebulaHue:       285        // 180 – 330
  };

  /* ── gesture feel ─────────────────────────────────────────────────── */
  var DEAD_ZONE   = 8;    // px before a gesture commits to an axis
  var PAGE_TRAVEL = 0.42; // fraction of the (capped) viewport width = one page
  var COAST_MS    = 160;  // how far a flick throws the planet
  var FLICK_SPEED = 0.5;  // px/ms that counts as a flick
  var DRIFT_RATIO = 0.28; // drag past 28% of a page to commit without a flick

  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var mod   = function (n, m) { return ((n % m) + m) % m; };
  var TAU   = Math.PI * 2;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ═══════════════════════════════════════════════════════════════════ */

  function Portfolio() {
    this.root     = document.documentElement;
    this.canvas   = document.getElementById('scene');
    this.stage    = document.getElementById('stage');
    this.sections = Array.prototype.slice.call(document.querySelectorAll('.chapter'));
    this.panels   = this.sections.map(function (s) { return s.querySelector('.panel'); });
    this.count    = this.sections.length;

    this.hudNum     = document.getElementById('hudNum');
    this.hudChapter = document.getElementById('hudChapter');
    this.hudFill    = document.getElementById('hudFill');
    this.dial       = document.getElementById('dial');
    this.cue        = document.getElementById('cue');
    this.cueText    = document.getElementById('cueText');
    this.toggle     = document.getElementById('modeToggle');
    this.modeLabel  = document.getElementById('modeLabel');
    this.nav        = document.getElementById('nav');
    this.navLinks   = Array.prototype.slice.call(document.querySelectorAll('[data-goto]'));

    this.mode      = CONFIG.defaultMode === 'normal' || reduceMotion ? 'normal' : 'orbit';
    this.page      = 0;
    this.rot       = 0;      // live planet rotation (radians)
    this.rotTarget = 0;      // where it is easing to
    this.pxVel     = 0;      // drag velocity, px/ms
    this.dragging  = false;
    this.scrollP   = 0;
    this.smoothP   = 0;
    this.mx = this.my = this.smx = this.smy = 0;
    this.touch = window.matchMedia('(hover: none)').matches;
  }

  Portfolio.prototype.step = function () { return TAU / this.count; };

  Portfolio.prototype.radPerPx = function () {
    return this.step() / (Math.min(window.innerWidth, 900) * PAGE_TRAVEL);
  };

  /* ── boot ─────────────────────────────────────────────────────────── */

  Portfolio.prototype.init = function () {
    var self = this;

    this.buildDial();

    this.io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) e.target.classList.add('is-revealed');
      });
    }, { threshold: 0.1 });

    this.toggle.addEventListener('click', function () {
      self.setMode(self.mode === 'orbit' ? 'normal' : 'orbit');
    });

    this.navLinks.forEach(function (a) {
      a.addEventListener('click', function (e) {
        var i = parseInt(a.dataset.goto, 10);
        if (self.mode !== 'orbit') return;          // let the anchor scroll
        e.preventDefault();
        self.goTo(i);
      });
    });

    this.onScroll = function () {
      if (self.mode !== 'orbit') self.trackScroll();
    };
    this.onPointerHover = function (e) {
      self.mx = e.clientX / window.innerWidth - 0.5;
      self.my = e.clientY / window.innerHeight - 0.5;
    };
    this.onResize = function () { self.resize(); };
    this.onKey = function (e) {
      if (self.mode !== 'orbit') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); self.goTo(self.page + 1); }
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); self.goTo(self.page - 1); }
    };

    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('pointermove', this.onPointerHover, { passive: true });
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKey);

    this.bindGestures();
    this.bindWheel();

    // deep link: /#skills opens on that slide
    var hash = window.location.hash.replace('#', '');
    if (hash) {
      this.sections.forEach(function (s, i) { if (s.id === hash) self.page = i; });
      this.rot = this.rotTarget = this.page * this.step();
    }

    this.applyMode();

    if (window.THREE) this.initGL();
    else window.addEventListener('three-ready', function () { self.initGL(); }, { once: true });

    // no WebGL / no CDN → drop to the flat gradient and the plain page
    setTimeout(function () {
      if (self.renderer) return;
      self.root.dataset.gl = 'off';
      if (self.mode === 'orbit') self.setMode('normal');
    }, 9000);

  };

  Portfolio.prototype.buildDial = function () {
    var self = this;
    this.dots = this.sections.map(function (s, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.title = s.dataset.chapter;
      b.setAttribute('aria-label', 'Go to ' + s.dataset.chapter);
      b.addEventListener('click', function () { self.goTo(i); });
      self.dial.appendChild(b);
      return b;
    });
  };

  /* ── modes ────────────────────────────────────────────────────────── */

  Portfolio.prototype.setMode = function (m) {
    var from = this.mode;
    this.mode = m;
    this.applyMode();

    // leaving orbit: land the scroll on the slide you were looking at
    if (from === 'orbit' && m === 'normal' && this.sections[this.page]) {
      this.sections[this.page].scrollIntoView({ behavior: 'auto' });
      this.trackScroll();
    }
  };

  Portfolio.prototype.applyMode = function () {
    var self = this;
    var orbit = this.mode === 'orbit';

    this.root.dataset.mode = orbit ? 'orbit' : 'normal';
    this.modeLabel.textContent = orbit ? 'ORBIT MODE' : 'NORMAL MODE';
    this.toggle.setAttribute('aria-pressed', String(orbit));
    this.cueText.textContent = this.touch ? 'SWIPE TO EXPLORE' : 'DRAG THE PLANET';
    this.pageInit = false;                 // force a full re-sync of the chrome

    if (orbit) {
      this.io.disconnect();
      window.scrollTo(0, 0);
      this.panels.forEach(function (p) { p.style.transform = ''; p.scrollTop = 0; });
      // land on a whole slide so the cross-fade starts clean
      var snapped = Math.round(this.rot / this.step());
      this.rot = this.rotTarget = snapped * this.step();
      this.setPage(mod(snapped, this.count));
    } else {
      this.sections.forEach(function (s) { s.style.opacity = ''; s.classList.remove('is-active'); });
      this.panels.forEach(function (p) { p.style.transform = ''; });
      this.panels.forEach(function (p) { self.io.observe(p); });
      this.trackScroll();
    }

    this.resize();
  };

  /* ── paging ───────────────────────────────────────────────────────── */

  Portfolio.prototype.goTo = function (i) {
    var n = this.count;
    var idx = mod(i, n);

    if (this.mode !== 'orbit') {
      if (this.sections[idx]) this.sections[idx].scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
      return;
    }

    var delta = idx - this.page;
    if (delta >  n / 2) delta -= n;
    if (delta < -n / 2) delta += n;
    this.rotTarget += delta * this.step();

    // normally the render loop derives the page from the planet's angle, so the
    // slide arrives with the marker. without WebGL there is no loop — set it here.
    if (!this.renderer) this.setPage(idx);
  };

  Portfolio.prototype.setPage = function (i) {
    if (i === this.page && this.pageInit) return;
    this.pageInit = true;
    this.page = i;

    var orbit = this.mode === 'orbit';
    this.sections.forEach(function (s, k) {
      var on = k === i;
      s.classList.toggle('is-active', on);
      // visible straight away, then the loop takes over the cross-fade
      if (orbit) s.style.opacity = on ? '1' : '';
    });

    if (orbit && this.panels[i]) this.panels[i].scrollTop = 0;
    this.syncChrome(i);
  };

  Portfolio.prototype.syncChrome = function (i) {
    var s = this.sections[i];
    if (!s) return;

    this.hudChapter.textContent = s.dataset.chapter;
    this.hudNum.textContent = String(i + 1).padStart(2, '0');
    this.hudFill.style.height = ((i / (this.count - 1)) * 100).toFixed(0) + '%';

    this.dots.forEach(function (d, k) { d.classList.toggle('is-current', k === i); });

    var orbit = this.mode === 'orbit';
    this.navLinks.forEach(function (a) {
      if (!a.classList.contains('nav__cta')) {
        a.classList.toggle('is-current', orbit && parseInt(a.dataset.goto, 10) === i);
      }
    });
  };

  Portfolio.prototype.trackScroll = function () {
    var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    this.scrollP = clamp(window.scrollY / max, 0, 1);

    var mid = window.innerHeight * 0.45, idx = 0;
    this.sections.forEach(function (s, i) {
      if (s.getBoundingClientRect().top <= mid) idx = i;
    });
    this.setPage(idx);
  };

  /* ── drag (mouse / pen) + swipe (touch) ───────────────────────────── */

  Portfolio.prototype.bindGestures = function () {
    var self = this;
    var id = null, startX = 0, startY = 0, lastX = 0, lastT = 0;
    var locked = false, travelled = 0;

    function inChrome(t) {
      return t && t.closest && t.closest('.dial, .nav, .mode-toggle');
    }

    function down(e) {
      if (self.mode !== 'orbit' || id !== null) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (inChrome(e.target)) return;

      id = e.pointerId;
      startX = lastX = e.clientX;
      startY = e.clientY;
      lastT = e.timeStamp || performance.now();
      travelled = 0;
      self.pxVel = 0;

      // Straight onto the planet (or empty space) → spin in any direction.
      // Starting on a text panel → wait and see if the gesture is horizontal,
      // so vertical drags still scroll the copy.
      locked = !(e.target && e.target.closest && e.target.closest('.panel'));
      if (locked) self.beginDrag();
    }

    function move(e) {
      if (e.pointerId !== id) return;

      var t = e.timeStamp || performance.now();
      var dt = Math.max(1, t - lastT);
      var dx = e.clientX - lastX;

      if (!locked) {
        var tx = e.clientX - startX, ty = e.clientY - startY;
        if (Math.abs(tx) < DEAD_ZONE && Math.abs(ty) < DEAD_ZONE) return;
        if (Math.abs(tx) <= Math.abs(ty)) { id = null; return; }  // vertical → panel scrolls
        locked = true;
        self.beginDrag();
      }

      var dRot = -dx * self.radPerPx();
      self.rot += dRot;
      self.rotTarget = self.rot;
      self.pxVel = self.pxVel * 0.6 + (dx / dt) * 0.4;
      travelled += Math.abs(dx);

      lastX = e.clientX;
      lastT = t;
      if (e.cancelable) e.preventDefault();
    }

    function up(e) {
      if (e.pointerId !== id) return;
      id = null;
      if (!locked) return;
      locked = false;
      self.endDrag(travelled);
    }

    window.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);

    // a drag that ends on a link must not also trigger that link
    document.addEventListener('click', function (e) {
      if (!self.suppressClick) return;
      self.suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    }, true);
  };

  Portfolio.prototype.beginDrag = function () {
    this.dragging = true;
    this.dragStartSnap = Math.round(this.rot / this.step());
    this.canvas.classList.add('is-held');
    document.body.classList.add('is-dragging');
    this.cue.style.opacity = '0.25';
  };

  Portfolio.prototype.endDrag = function (travelled) {
    var self = this;
    var step = this.step();

    this.dragging = false;
    this.canvas.classList.remove('is-held');
    document.body.classList.remove('is-dragging');
    this.cue.style.opacity = '';

    if (travelled > DEAD_ZONE) {
      this.suppressClick = true;
      setTimeout(function () { self.suppressClick = false; }, 350);
    }

    var coast = clamp(-this.pxVel * COAST_MS * this.radPerPx(), -2 * step, 2 * step);
    var snapped = Math.round((this.rot + coast) / step);

    if (snapped === this.dragStartSnap) {
      var drift = this.rot - this.dragStartSnap * step;
      if (Math.abs(this.pxVel) > FLICK_SPEED) snapped -= Math.sign(this.pxVel);
      else if (Math.abs(drift) > step * DRIFT_RATIO) snapped += Math.sign(drift);
    }

    this.rotTarget = snapped * step;
    if (!this.renderer) this.setPage(mod(snapped, this.count));
    this.pxVel = 0;
  };

  Portfolio.prototype.bindWheel = function () {
    var self = this;

    window.addEventListener('wheel', function (e) {
      if (self.mode !== 'orbit') return;

      // over a panel with more copy to read? let it scroll, and only turn the
      // page once the reader hits the end of it.
      var panel = e.target && e.target.closest ? e.target.closest('.panel') : null;
      if (panel && panel.scrollHeight - panel.clientHeight > 2) {
        var atTop = panel.scrollTop <= 0;
        var atEnd = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1;
        if (!((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atEnd))) return;
      }

      e.preventDefault();
      if (self.wheelLock || Math.abs(e.deltaY) < 2) return;
      self.wheelLock = true;
      setTimeout(function () { self.wheelLock = false; }, 520);
      self.goTo(self.page + (e.deltaY > 0 ? 1 : -1));
    }, { passive: false });
  };

  /* ── textures ─────────────────────────────────────────────────────── */

  Portfolio.prototype.softSprite = function (inner) {
    var s = 64, cv = document.createElement('canvas');
    cv.width = cv.height = s;
    var ctx = cv.getContext('2d');
    var g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(inner || 0.28, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    return new window.THREE.CanvasTexture(cv);
  };

  Portfolio.prototype.planetTexture = function (hue) {
    var w = 1024, h = 512, cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var ctx = cv.getContext('2d'), i, x, y, r, g, lh;

    var base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0,   'hsl(' + ((hue + 20) % 360) + ',42%,14%)');
    base.addColorStop(0.5, 'hsl(' + hue + ',48%,22%)');
    base.addColorStop(1,   'hsl(' + ((hue - 30 + 360) % 360) + ',40%,12%)');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    for (i = 0; i < 240; i++) {
      x = Math.random() * w; y = Math.random() * h;
      r = 20 + Math.random() * 130;
      g = ctx.createRadialGradient(x, y, 0, x, y, r);
      lh = (hue + (Math.random() - 0.5) * 90 + 360) % 360;
      g.addColorStop(0, 'hsla(' + lh + ',60%,' + (28 + Math.random() * 34) + '%,0.5)');
      g.addColorStop(1, 'hsla(' + lh + ',60%,20%,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    for (y = 0; y < h; y += 3) {
      ctx.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.022) + ')';
      ctx.fillRect(0, y, w, 1.4);
    }
    for (i = 0; i < 900; i++) {
      ctx.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.16) + ')';
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 3.2, 0, TAU);
      ctx.fill();
    }

    var tex = new window.THREE.CanvasTexture(cv);
    tex.colorSpace = window.THREE.SRGBColorSpace;
    return tex;
  };

  /* ── scene ────────────────────────────────────────────────────────── */

  Portfolio.prototype.initGL = function () {
    var THREE = window.THREE;
    if (!THREE || this.renderer || !this.canvas) return;

    var small = window.innerWidth < 820;
    var k = (small ? 0.4 : 1) * CONFIG.starDensity;
    var hue = CONFIG.nebulaHue;
    var i, tmp = new THREE.Color();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: !small, powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 2));
    this.renderer.setClearColor(0x04050d, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 1, 1, 12000);
    this.camera.position.set(0, 0, 900);

    var spriteSoft = this.softSprite(0.22);
    var spriteTight = this.softSprite(0.4);

    /* spiral galaxy */
    var gCount = Math.round(34000 * k);
    var R = 1900, arms = 4, spin = 1.35, rand = 0.42, randPow = 2.6;
    var gPos = new Float32Array(gCount * 3), gCol = new Float32Array(gCount * 3);
    var cIn  = new THREE.Color().setHSL(((hue + 40) % 360) / 360, 0.85, 0.86);
    var cMid = new THREE.Color().setHSL(hue / 360, 0.75, 0.60);
    var cOut = new THREE.Color().setHSL(((hue - 55 + 360) % 360) / 360, 0.70, 0.38);

    for (i = 0; i < gCount; i++) {
      var t = Math.pow(Math.random(), 0.62);
      var r = t * R;
      var branch = ((i % arms) / arms) * TAU;
      var spinA = (r * spin / R) * TAU;
      var jx = Math.pow(Math.random(), randPow) * (Math.random() < 0.5 ? 1 : -1) * rand * r;
      var jy = Math.pow(Math.random(), randPow) * (Math.random() < 0.5 ? 1 : -1) * rand * r * 0.16;
      var jz = Math.pow(Math.random(), randPow) * (Math.random() < 0.5 ? 1 : -1) * rand * r;

      gPos[i * 3]     = Math.cos(branch + spinA) * r + jx;
      gPos[i * 3 + 1] = jy + (Math.random() - 0.5) * 26;
      gPos[i * 3 + 2] = Math.sin(branch + spinA) * r + jz;

      tmp.copy(cIn);
      if (t < 0.42) tmp.lerp(cMid, t / 0.42);
      else tmp.copy(cMid).lerp(cOut, (t - 0.42) / 0.58);

      var flick = 0.75 + Math.random() * 0.45;
      gCol[i * 3] = tmp.r * flick; gCol[i * 3 + 1] = tmp.g * flick; gCol[i * 3 + 2] = tmp.b * flick;
    }

    var gGeo = new THREE.BufferGeometry();
    gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
    gGeo.setAttribute('color', new THREE.BufferAttribute(gCol, 3));
    var galaxy = new THREE.Points(gGeo, new THREE.PointsMaterial({
      size: 15, map: spriteSoft, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    }));

    /* glowing core */
    var cn = Math.round(2600 * k);
    var cp = new Float32Array(cn * 3), cc = new Float32Array(cn * 3);
    for (i = 0; i < cn; i++) {
      var cr = Math.pow(Math.random(), 2.4) * 290;
      var th = Math.random() * TAU, ph = Math.acos(2 * Math.random() - 1);
      cp[i * 3]     = Math.sin(ph) * Math.cos(th) * cr;
      cp[i * 3 + 1] = Math.cos(ph) * cr * 0.42;
      cp[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * cr;
      tmp.setHSL(((hue + 45 + Math.random() * 30) % 360) / 360, 0.5, 0.8 + Math.random() * 0.18);
      cc[i * 3] = tmp.r; cc[i * 3 + 1] = tmp.g; cc[i * 3 + 2] = tmp.b;
    }
    var coreGeo = new THREE.BufferGeometry();
    coreGeo.setAttribute('position', new THREE.BufferAttribute(cp, 3));
    coreGeo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    var core = new THREE.Points(coreGeo, new THREE.PointsMaterial({
      size: 26, map: spriteSoft, vertexColors: true, transparent: true, opacity: 0.5,
      depthWrite: false, blending: THREE.AdditiveBlending
    }));

    this.galaxyGroup = new THREE.Group();
    this.galaxyGroup.add(galaxy, core);
    this.galaxyGroup.rotation.set(-1.18, 0, 0.32);
    this.gx = -560; this.gy = 540; this.gz = -1000;
    this.galaxyGroup.position.set(this.gx, this.gy, this.gz);
    this.scene.add(this.galaxyGroup);

    /* background stars */
    var sn = Math.round(2400 * k);
    var sp = new Float32Array(sn * 3), sc = new Float32Array(sn * 3);
    for (i = 0; i < sn; i++) {
      sp[i * 3]     = (Math.random() - 0.5) * 8000;
      sp[i * 3 + 1] = (Math.random() - 0.5) * 5000;
      sp[i * 3 + 2] = -Math.random() * 7000 - 300;
      tmp.setHSL(((hue + (Math.random() - 0.5) * 120 + 360) % 360) / 360, 0.35, 0.75 + Math.random() * 0.25);
      sc[i * 3] = tmp.r; sc[i * 3 + 1] = tmp.g; sc[i * 3 + 2] = tmp.b;
    }
    var sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    this.stars = new THREE.Points(sGeo, new THREE.PointsMaterial({
      size: 9, map: spriteTight, vertexColors: true, transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending
    }));
    this.scene.add(this.stars);

    /* the planet — this is the thing you drag */
    var RP = 190;
    this.planetGroup = new THREE.Group();

    this.globe = new THREE.Mesh(
      new THREE.SphereGeometry(RP, 96, 96),
      new THREE.MeshStandardMaterial({ map: this.planetTexture(hue), roughness: 0.85, metalness: 0.06 })
    );

    var atmo = new THREE.Mesh(
      new THREE.SphereGeometry(RP * 1.16, 64, 64),
      new THREE.ShaderMaterial({
        transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
        uniforms: { uColor: { value: new THREE.Color().setHSL(((hue + 25) % 360) / 360, 0.8, 0.62) } },
        vertexShader: [
          'varying vec3 vN; varying vec3 vP;',
          'void main(){ vN = normalize(normalMatrix * normal);',
          'vec4 mv = modelViewMatrix * vec4(position,1.0); vP = mv.xyz;',
          'gl_Position = projectionMatrix * mv; }'
        ].join('\n'),
        fragmentShader: [
          'uniform vec3 uColor; varying vec3 vN; varying vec3 vP;',
          'void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(-vP))), 2.6);',
          'gl_FragColor = vec4(uColor, f * 0.85); }'
        ].join('\n')
      })
    );

    /* one marker per section, riding the equator */
    this.markerGroup = new THREE.Group();
    this.markers = [];
    for (i = 0; i < this.count; i++) {
      var a = (i / this.count) * TAU;
      var m = new THREE.Mesh(
        new THREE.SphereGeometry(7, 16, 16),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHSL(((hue + 40) % 360) / 360, 0.7, 0.75),
          transparent: true, opacity: 0.5
        })
      );
      m.position.set(Math.cos(a) * RP * 1.42, 0, Math.sin(a) * RP * 1.42);
      this.markerGroup.add(m);
      this.markers.push(m);
    }
    var orbitRing = new THREE.Mesh(
      new THREE.TorusGeometry(RP * 1.42, 0.9, 3, 180),
      new THREE.MeshBasicMaterial({ color: 0xa9b6ff, transparent: true, opacity: 0.22 })
    );
    orbitRing.rotation.x = Math.PI / 2;
    this.markerGroup.add(orbitRing);
    this.markerGroup.rotation.x = -0.34;

    this.dustRing = new THREE.Mesh(
      new THREE.TorusGeometry(RP * 1.85, 12, 2, 220),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(((hue - 20 + 360) % 360) / 360, 0.6, 0.55),
        transparent: true, opacity: 0.16, side: THREE.DoubleSide
      })
    );
    this.dustRing.rotation.set(Math.PI / 2 - 0.42, 0, 0.16);

    this.planetGroup.add(this.globe, atmo, this.markerGroup, this.dustRing);
    this.scene.add(this.planetGroup);

    this.keyLight = new THREE.DirectionalLight(0xdfe4ff, 2.4);
    this.rimLight = new THREE.DirectionalLight(
      new THREE.Color().setHSL(((hue + 30) % 360) / 360, 0.8, 0.6), 1.1
    );
    this.scene.add(this.keyLight, this.rimLight, new THREE.AmbientLight(0x2a3060, 0.9));

    this.canvas.classList.add('is-live');
    this.root.dataset.gl = 'on';
    this.resize();
    this.syncChrome(this.page);
    this.loop();
  };

  Portfolio.prototype.resize = function () {
    if (!this.renderer) return;

    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();

    // portrait phones stack the scene: planet up top, copy docked below it.
    // landscape/desktop puts the planet to the right of the copy.
    var narrow = window.innerWidth < 780;
    var squat = window.innerHeight <= 520 && window.innerWidth < 900;

    if (this.planetGroup) {
      var halfH = Math.tan((52 * Math.PI) / 360) * 900;
      var halfW = halfH * this.camera.aspect;

      if (narrow && !squat) {
        this.planetGroup.scale.setScalar(0.55);
        this.px = 0;
        this.py = halfH * 0.69;          // sits above the docked panel
      } else {
        this.planetGroup.scale.setScalar(clamp(halfW / 780, 0.52, 1.05));
        this.px = halfW * 0.47;
        this.py = -20;
      }
      this.planetGroup.position.set(this.px, this.py, 0);
    }

    // Light relative to the camera→planet axis instead of world space: parked
    // high in a portrait frame the planet is seen from below, and a fixed world
    // key would leave that visible face on the dark side of the terminator.
    if (this.keyLight) {
      var T = window.THREE;
      var view = new T.Vector3(0, 0, 900).sub(new T.Vector3(this.px, this.py, 0)).normalize();
      var side = new T.Vector3().crossVectors(view, new T.Vector3(0, 1, 0)).normalize();
      var up   = new T.Vector3().crossVectors(side, view).normalize();

      this.keyLight.position.copy(view).multiplyScalar(0.75)
        .addScaledVector(side, 0.55).addScaledVector(up, 0.35).normalize();
      this.rimLight.position.copy(view).multiplyScalar(-0.45)
        .addScaledVector(side, -0.85).addScaledVector(up, -0.30).normalize();

      // a small disc on a phone gets a touch more punch to read at that size
      this.keyLight.intensity = narrow && !squat ? 3.0 : 2.4;
    }
  };

  /* ── frame loop ───────────────────────────────────────────────────── */

  Portfolio.prototype.loop = function () {
    var self = this;
    this.raf = requestAnimationFrame(function () { self.loop(); });
    if (!this.renderer) return;

    var t = performance.now() * 0.001;
    var amp = CONFIG.motionIntensity / 8;
    var step = this.step();

    this.smx += (this.mx - this.smx) * 0.045;
    this.smy += (this.my - this.smy) * 0.045;

    if (this.mode === 'orbit') {
      if (!this.dragging) this.rot += (this.rotTarget - this.rot) * 0.1;

      // the slide follows the planet: fully lit on a marker, gone in between
      var frac = this.rot / step;
      var nearest = Math.round(frac);
      var dist = Math.min(0.5, Math.abs(frac - nearest));
      var vis = clamp(1 - dist * 2.2, 0, 1);

      this.setPage(mod(nearest, this.count));
      var active = this.sections[this.page];
      if (active) {
        active.style.opacity = vis.toFixed(3);
        if (this.panels[this.page]) {
          this.panels[this.page].style.transform = 'translateY(' + ((1 - vis) * 26).toFixed(1) + 'px)';
        }
      }

      this.camera.position.x += (this.smx * 90 - this.camera.position.x) * 0.05;
      this.camera.position.y += (-this.smy * 70 - this.camera.position.y) * 0.05;
      this.camera.position.z += (900 - this.camera.position.z) * 0.05;
      this.camera.rotation.z += (0 - this.camera.rotation.z) * 0.05;
      this.camera.lookAt(0, 0, -200);

      if (this.planetGroup) {
        this.planetGroup.rotation.y = this.rot;
        this.planetGroup.rotation.x = -0.12 + this.smy * 0.12;
        this.planetGroup.position.x += (this.px - this.planetGroup.position.x) * 0.08;
        this.planetGroup.position.y += (this.py - this.planetGroup.position.y) * 0.08;
        this.globe.rotation.y = t * 0.03;
        this.markerGroup.rotation.z = Math.sin(t * 0.3) * 0.04;

        for (var i = 0; i < this.markers.length; i++) {
          var m = this.markers[i], on = i === this.page;
          m.material.opacity += ((on ? 1 : 0.32) - m.material.opacity) * 0.12;
          m.scale.setScalar(on ? 1.6 + Math.sin(t * 3) * 0.16 : 1);
        }
        this.dustRing.rotation.z += 0.0009;
      }

      this.galaxyGroup.rotation.y = t * 0.012 * amp + this.rot * 0.1;
      this.galaxyGroup.rotation.x += (-1.18 - this.galaxyGroup.rotation.x) * 0.06;
      this.galaxyGroup.rotation.z = 0.32 + Math.sin(t * 0.05) * 0.02;
      this.galaxyGroup.position.x = this.gx - this.smx * 110;
      this.galaxyGroup.position.y = this.gy - this.smy * 70;
      this.galaxyGroup.position.z = this.gz + Math.sin(t * 0.08) * 50;

    } else {
      this.smoothP += (this.scrollP - this.smoothP) * 0.06;
      var s = this.smoothP;

      this.camera.position.z = 900 - s * 2400 * amp;
      this.camera.position.x = Math.sin(s * 3.0) * 220 * amp + this.smx * 110;
      this.camera.position.y = 60 + Math.sin(s * 2.1) * 130 * amp - this.smy * 80;
      this.camera.rotation.z = Math.sin(s * 3.4) * 0.06 * amp;
      this.camera.lookAt(this.camera.position.x * 0.3, this.camera.position.y * 0.3, -1400);

      this.galaxyGroup.rotation.y = t * 0.012 * amp + s * 1.4;
      this.galaxyGroup.rotation.x = -1.18 + s * 0.85;
      this.galaxyGroup.position.z = this.gz - 400 + s * 1500;

      if (this.planetGroup) {
        this.planetGroup.rotation.y = t * 0.05 + s * 4;
        this.planetGroup.position.x = this.px + s * 900;
        this.planetGroup.position.y = this.py - s * 300;
        for (var j = 0; j < this.markers.length; j++) {
          var mk = this.markers[j];
          mk.material.opacity += (0.25 - mk.material.opacity) * 0.1;
        }
      }
    }

    this.stars.rotation.y = t * 0.004;
    this.stars.rotation.z = t * 0.002;
    this.renderer.render(this.scene, this.camera);
  };

  /* ── go ───────────────────────────────────────────────────────────── */

  var app = new Portfolio();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { app.init(); });
  } else {
    app.init();
  }
  window.portfolio = app;
})();
