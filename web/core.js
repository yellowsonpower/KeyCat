// Shared scene, materials and geometry helpers. Every other file adds to `K`.
'use strict';
const K = {};
(() => {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const approach = (rate, dt) => 1 - Math.exp(-rate * dt);
  Object.assign(K, { V, clamp, mix, smooth, approach });

  // A damped spring follower for poses: `hz` sets how fast it settles and `damping` below 1
  // lets it overshoot a little, which reads as weight. `kick` adds velocity for bounces.
  // Works on numbers or, with `vector`, on a THREE.Vector3 in place.
  class Spring {
    constructor(x = 0, hz = 2, damping = 0.7) {
      this.vector = typeof x === 'object';
      this.x = this.vector ? x.clone() : x;
      this.v = this.vector ? V(0, 0, 0) : 0;
      this.hz = hz;
      this.damping = damping;
    }
    step(target, dt) {
      const w = 2 * Math.PI * this.hz, n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
      for (let i = 0; i < n; i++) {
        if (this.vector) {
          for (const c of ['x', 'y', 'z']) {
            this.v[c] += (w * w * (target[c] - this.x[c]) - 2 * this.damping * w * this.v[c]) * h;
            this.x[c] += this.v[c] * h;
          }
        } else {
          this.v += (w * w * (target - this.x) - 2 * this.damping * w * this.v) * h;
          this.x += this.v * h;
        }
      }
      return this.x;
    }
    kick(v) { if (this.vector) this.v.add(v); else this.v += v; }
    set(x) {
      if (this.vector) { this.x.copy(x); this.v.set(0, 0, 0); } else { this.x = x; this.v = 0; }
    }
  }
  K.Spring = Spring;

  const params = new URLSearchParams(location.search);
  K.dev = params.has('dev');
  K.devPointer = K.dev && !params.has('nopointer');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  document.body.appendChild(renderer.domElement);
  if (params.get('bg')) document.body.style.background = '#' + params.get('bg');

  // The scene is composed on a 539×458 frame (the reference page's canvas, in CSS px): the
  // keyboard centre `ANCHOR` lands at pixel `AIM`, seen from `ELEV`° above with a narrow lens.
  // The app window shows only `CROP` of that frame; `?full` shows all of it.
  const FRAME = { w: 539, h: 458 };
  // `?crop=x,y,w,h` (frame px) magnifies any part of the frame, for close-up checks.
  const crop = params.get('crop') && params.get('crop').split(',').map(Number);
  const CROP = crop ? { x: crop[0], y: crop[1], w: crop[2], h: crop[3] }
    : params.has('full') ? { x: 0, y: 0, w: FRAME.w, h: FRAME.h } : { x: 95, y: 34, w: 360, h: 368 };
  const [FOV, ELEV, DIST] = (params.get('cam') || '16,28,15.65').split(',').map(Number);
  const ANCHOR = V(0.28, 0.1, 1.0), AIM = { x: 294, y: 355 };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, FRAME.w / FRAME.h, 0.1, 100);
  const e = ELEV * Math.PI / 180;
  camera.position.set(ANCHOR.x, ANCHOR.y + DIST * Math.sin(e), ANCHOR.z + DIST * Math.cos(e));
  camera.lookAt(ANCHOR);
  Object.assign(K, { renderer, scene, camera, FRAME, CROP });

  // ---- v1.0.5 改动：像素锯齿边缘 -------------------------------------------
  // 做法：先把场景画进 1/3 分辨率的 RenderTarget，再用最近邻(Nearest)放大铺满屏幕。
  // 只作用于渲染输出，不改任何生物 / 行为代码。'?nopixel' 或 K.setPixelEdges(false) 可关闭。
  const pxTarget = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true
  });
  const pxScene = new THREE.Scene();
  const pxCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  // transparent 保持 false：texture 的 alpha 会被原样写入，没物体的地方依旧透明（桌宠是透明窗口）。
  pxScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({ map: pxTarget.texture })));
  let pixelEdges = !params.has('nopixel');
  K.setPixelEdges = on => { pixelEdges = !!on; };
  K.getPixelEdges = () => pixelEdges;
  function sizePxTarget() {
    const dpr = renderer.getPixelRatio();
    pxTarget.setSize(Math.max(1, Math.round(innerWidth * dpr / 3)),
                     Math.max(1, Math.round(innerHeight * dpr / 3)));
  }
  // 只渲染主场景时走锯齿；渲染 pxScene 自己时走原路，避免递归。
  const origRender = renderer.render.bind(renderer);
  renderer.render = (s, c) => {
    if (!pixelEdges || s !== scene) return origRender(s, c);
    renderer.setRenderTarget(pxTarget);
    origRender(scene, camera);
    renderer.setRenderTarget(null);
    origRender(pxScene, pxCam);
  };

  K.resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.setViewOffset(FRAME.w, FRAME.h, CROP.x + FRAME.w / 2 - AIM.x, CROP.y + FRAME.h / 2 - AIM.y, CROP.w, CROP.h);
    sizePxTarget();
  };
  window.addEventListener('resize', K.resize);
  K.resize();

  // dev 专用控制面板：可视化切换「锯齿边缘」和「猫/八爪鱼」，正式发布（无 ?dev）不显示。
  // 放在渲染层，是因为锯齿开关就在这里；生物切换点击时才用到 window.cat（那时 behavior.js 已加载）。
  if (K.dev) {
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;left:10px;top:10px;z-index:9999;display:flex;gap:6px;font:13px "Microsoft YaHei";';
    const btnStyle = 'cursor:pointer;padding:5px 10px;border:1px solid #a75ce8;border-radius:5px;background:#6d2fb5;color:#fff;';

    // 锯齿边缘开关按钮：点一下切换，文字同步显示当前状态。
    const pxBtn = document.createElement('button');
    pxBtn.style.cssText = btnStyle;
    const syncPx = () => { pxBtn.textContent = '锯齿边缘：' + (K.getPixelEdges() ? '开' : '关'); };
    pxBtn.onclick = () => { K.setPixelEdges(!K.getPixelEdges()); syncPx(); };
    syncPx();

    // 生物切换按钮：猫 <-> 八爪鱼，方便直接看八爪鱼的锯齿效果。
    const crBtn = document.createElement('button');
    crBtn.style.cssText = btnStyle;
    const syncCr = () => { crBtn.textContent = '生物：' + (K.currentCreatureId() === 'octopus' ? '八爪鱼' : '猫'); };
    crBtn.onclick = () => {
      window.cat.setCreature(K.currentCreatureId() === 'octopus' ? 'cat' : 'octopus');
      syncCr();
    };

    bar.append(pxBtn, crBtn);
    document.body.appendChild(bar);

    // 启动完成后同步一次生物文字；若带 ?creature=octopus 则默认切到八爪鱼。
    // 延后到宏任务末尾，确保所有脚本（含 behavior.js）都已执行完。
    setTimeout(() => {
      const want = new URLSearchParams(location.search).get('creature');
      if (want === 'octopus' || want === 'cat') window.cat.setCreature(want);
      syncCr();
    }, 100);
  }

  // The top of an arm is pushed back in depth, fading out down the upper arm, so the shoulder sits
  // behind the chest and the collar and the arm seems to grow out of the body. The vertex keeps
  // its place on screen: scaling a view-space point towards the eye only changes its depth.
  // `mv` is the view-space position, `along` runs 0 (shoulder) to 1 (paw).
  K.ARM_ROOT_PUSH = `mv.xyz *= 1.0 + 0.13 * (1.0 - smoothstep(0.0, 0.22, along)) / max(-mv.z, 0.01);`;
  // Same idea for any basic material: `chunk` rewrites the view-space position `mv`.
  const depthShift = (material, key, chunk, attributes = '') => {
    material.onBeforeCompile = shader => {
      shader.vertexShader = attributes + shader.vertexShader.replace('#include <project_vertex>',
        `vec4 mv = modelViewMatrix * vec4(transformed, 1.0);\n${chunk}\ngl_Position = projectionMatrix * mv;\nvec4 mvPosition = mv;`);
    };
    material.customProgramCacheKey = () => key;
    return material;
  };
  K.withArmRootPush = material => depthShift(material, 'arm-root-push', K.ARM_ROOT_PUSH, 'attribute float along;\n');
  // Draws a material as if `amount` nearer the eye, so a collar sitting on the fur wins over the
  // round tops of the arms just below it without moving on screen.
  K.towardEye = (material, amount) =>
    depthShift(material, 'toward-eye-' + amount, `mv.xyz *= 1.0 - ${amount.toFixed(3)} / max(-mv.z, 0.01);`);

  K.flat = color => new THREE.MeshBasicMaterial({ color });
  K.back = color => new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });

  // A tube whose radius varies along its length, rebuilt in place every frame.
  // `point(t, out)` gives the centre line, `radius(t)` the thickness, t in [0, 1].
  class TaperTube {
    constructor(segments, radial, material, renderOrder = 0) {
      this.n = segments; this.m = radial;
      const geo = new THREE.BufferGeometry();
      const count = (segments + 1) * radial;
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      // How far along the tube each vertex is (0..1), for fur markings that follow it.
      geo.setAttribute('along', new THREE.BufferAttribute(Float32Array.from({ length: count }, (_, k) => Math.floor(k / radial) / segments), 1));
      const index = [];
      for (let i = 0; i < segments; i++) for (let j = 0; j < radial; j++) {
        const a = i * radial + j, b = i * radial + (j + 1) % radial, c = a + radial, d = b + radial;
        index.push(a, b, c, b, d, c);
      }
      geo.setIndex(index);
      this.mesh = new THREE.Mesh(geo, material);
      this.mesh.renderOrder = renderOrder;
      this.mesh.frustumCulled = false;
      this.pts = Array.from({ length: segments + 1 }, () => V(0, 0, 0));
    }

    update(point, radius, grow = 0) {
      const { n, m, pts } = this;
      for (let i = 0; i <= n; i++) point(i / n, pts[i]);
      const pos = this.mesh.geometry.attributes.position.array, nrm = this.mesh.geometry.attributes.normal.array;
      const T = V(0, 0, 0), N = V(0, 0, 0), B = V(0, 0, 0), tmp = V(0, 0, 0);
      for (let i = 0; i <= n; i++) {
        T.subVectors(pts[Math.min(n, i + 1)], pts[Math.max(0, i - 1)]).normalize();
        if (i === 0) {
          tmp.set(0, 1, 0);
          if (Math.abs(T.dot(tmp)) > 0.9) tmp.set(1, 0, 0);
          N.crossVectors(T, tmp).normalize();
        } else {
          B.crossVectors(N, T);
          N.crossVectors(T, B).normalize();
        }
        B.crossVectors(T, N).normalize();
        const r = radius(i / n) + (typeof grow === 'function' ? grow(i / n) : grow);
        for (let j = 0; j < m; j++) {
          const a = j / m * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), c = ca * r, s = sa * r, k = (i * m + j) * 3;
          pos[k] = pts[i].x + N.x * c + B.x * s;
          pos[k + 1] = pts[i].y + N.y * c + B.y * s;
          pos[k + 2] = pts[i].z + N.z * c + B.z * s;
          nrm[k] = N.x * ca + B.x * sa;
          nrm[k + 1] = N.y * ca + B.y * sa;
          nrm[k + 2] = N.z * ca + B.z * sa;
        }
      }
      this.mesh.geometry.attributes.position.needsUpdate = true;
      this.mesh.geometry.attributes.normal.needsUpdate = true;
      this.mesh.geometry.computeBoundingSphere();
    }
  }

  K.TaperTube = TaperTube;

  // A tapered limb with rounded ends and a sticker outline behind it. `edge` is the outline width,
  // or a function of t: a negative width sinks the outline inside the fill, so it does not show
  // there (an arm growing out of the chest has no line where it joins).
  K.limb = (parent, { segments = 18, radial = 14, fill, outline, edge, order = 0, capStart = true }) => {
    const edgeAt = typeof edge === 'function' ? edge : () => edge;
    const body = new TaperTube(segments, radial, fill, order);
    const rim = new TaperTube(segments, radial, outline, order - 1);
    const cap = along => {
      const g = new THREE.SphereGeometry(1, 20, 14);
      g.setAttribute('along', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(along), 1));
      return g;
    };
    const startGeo = cap(0), endGeo = cap(1);
    const caps = [];
    for (const [mat, ord] of [[fill, order], [outline, order - 1]]) {
      const end = new THREE.Mesh(endGeo, mat), start = new THREE.Mesh(startGeo, mat);
      end.renderOrder = start.renderOrder = ord;
      start.visible = capStart;
      parent.add(end, start);
      caps.push({ end, start, rim: mat === outline });
    }
    parent.add(rim.mesh, body.mesh);
    const a = V(0, 0, 0), b = V(0, 0, 0);
    return {
      body: body.mesh,
      update(point, radius) {
        body.update(point, radius);
        rim.update(point, radius, edgeAt);
        point(0, a); point(1, b);
        for (const c of caps) {
          c.start.position.copy(a); c.start.scale.setScalar(Math.max(0.001, radius(0) + (c.rim ? edgeAt(0) : 0)));
          c.end.position.copy(b); c.end.scale.setScalar(radius(1) + (c.rim ? edgeAt(1) : 0));
        }
      },
      meshes: [body.mesh, caps[0].end, caps[0].start],
    };
  };

  // Text on a rounded white keycap, used for the floating key labels and the sleep "Z".
  const labelCache = new Map();
  K.labelTexture = (text, style = 'cap') => {
    const key = style + ':' + text;
    if (labelCache.has(key)) return labelCache.get(key);
    const c = document.createElement('canvas');
    const wide = text.length > 1;
    c.width = wide ? 256 : 128; c.height = 128;
    const g = c.getContext('2d');
    if (style === 'cap') {
      const w = c.width - 16, h = 96, x = 8, y = 8, r = 26;
      g.fillStyle = 'rgba(40,40,40,0.55)';
      roundRect(g, x, y + 12, w, h, r); g.fill();
      g.fillStyle = '#fbfaf3';
      roundRect(g, x, y, w, h, r); g.fill();
      g.lineWidth = 5; g.strokeStyle = '#2a2a2a';
      roundRect(g, x, y, w, h, r); g.stroke();
      g.fillStyle = '#1b1b1b';
      g.font = `bold ${wide ? 46 : 62}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, c.width / 2, y + h / 2 + 3);
    } else {
      g.font = 'bold 84px "Chalkboard SE", "Comic Sans MS", -apple-system, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 12; g.strokeStyle = '#1b1b1b'; g.strokeText(text, 64, 66);
      g.fillStyle = '#fbfaf3'; g.fillText(text, 64, 66);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    const entry = { tex, aspect: c.width / c.height };
    labelCache.set(key, entry);
    return entry;
  };

  // Small sticker effects: 'anger' (manga cross-vein mark), 'bang' (impact burst), 'dust' (puff).
  K.fxTexture = kind => {
    const key = 'fx:' + kind;
    if (labelCache.has(key)) return labelCache.get(key).tex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.lineCap = g.lineJoin = 'round';
    if (kind === 'anger') {
      // Four bracket strokes around the centre, white edge under red.
      const arcs = () => {
        g.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          g.moveTo(64 + sx * 14, 64 + sy * 46);
          g.quadraticCurveTo(64 + sx * 14, 64 + sy * 14, 64 + sx * 46, 64 + sy * 14);
        }
      };
      g.strokeStyle = '#fbfaf3'; g.lineWidth = 30; arcs(); g.stroke();
      g.strokeStyle = '#e2483d'; g.lineWidth = 15; arcs(); g.stroke();
    } else if (kind === 'bang') {
      g.beginPath();
      for (let i = 0; i < 20; i++) {
        const a = i / 20 * Math.PI * 2, r = i % 2 ? 26 : 58;
        g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
      }
      g.closePath();
      g.fillStyle = '#fbfaf3'; g.fill();
      g.strokeStyle = '#1d1d1b'; g.lineWidth = 7; g.stroke();
    } else {
      g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2);
      g.fillStyle = '#f4f1e6'; g.fill();
      g.strokeStyle = '#c9c4b4'; g.lineWidth = 6; g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    labelCache.set(key, { tex, aspect: 1 });
    return tex;
  };

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
})();
