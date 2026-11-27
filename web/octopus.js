// 像素八爪鱼：实现与猫一致的 creature 接口，让 behavior.js 无需改动即可驱动。
// 外观沿用 octopus-preview.html 的定稿：低分段紫色球头 + 8 条摆动触手 + 深色方瞳 + 深浅斑纹。
  // 场景没有灯光（猫用 MeshBasicMaterial 平面着色），所以这里也只用 BasicMaterial，
  // 靠分层色块表现像素风的硬色阶；腿是纯色，不做表面深浅（用户 11/26 要求）。
'use strict';
(() => {
  const { V, mix, clamp, smooth } = K;

  // ---- 配色（与预览页一致）----
  const SKIN = 0xc77dff;        // 身体主色（亮紫）
  const SKIN_DARK = 0x9b4ee6;   // 触手深色（隔条交替）
  const BELLY = 0xdca8ff;       // 斑纹浅紫
  const SHADOW = 0x6d2fb5;      // 头与触手连接处的深紫阴影
  const PUPIL = 0x160b26;       // 瞳孔深色
  const basic = color => new THREE.MeshBasicMaterial({ color });

  // 腿用纯色：不要密集的深浅噪点（用户 11/26 明确否决）。
  // 8 条腿之间仍沿用原有的奇偶深浅交替，但每条腿自身是一整块纯色。
  const tentMat = basic;

  // 固定种子伪随机：花纹位置每次一致
  let _seed = 20261124;
  const rnd = () => { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; };
  const SPOT_COLORS = [0x7e3fc4, 0x8f4ad8, 0xa75ce8, BELLY, 0xe6c0ff];
  const spotColor = () => SPOT_COLORS[Math.floor(rnd() * SPOT_COLORS.length)];

  // ---- 身体层级：与猫一致 body → headPivot → head，behavior 直接操作它们 ----
  // HOME 与猫对齐，让八爪鱼坐在键盘后、相机取景内。
  const HOME = V(0.02, 0, 0.05);
  const body = new THREE.Group();
  body.position.copy(HOME);
  K.scene.add(body);

  const BODY_H = 1.2;           // 相当于猫的身高：头顶大致高度
  const bend = { x: 0, z: 0, squash: 0 };
  // 八爪鱼身体短，用轻量弯曲：越高越跟着 bend 走，模拟猫的脊柱弯曲接口。
  const spineWeight = y => smooth(0.2, BODY_H, y) ** 1.6;
  const sink = y => smooth(0.2, BODY_H, y);

  // 头颈枢轴：behavior 会设置 rotation（点头/转头/蹭头）并 += position.x
  const headPivot = new THREE.Group();
  headPivot.position.set(0, BODY_H - 0.22, 0.06);
  body.add(headPivot);

  // 头（真正的圆球）：behavior 会设置 head.rotation.z（歪头），并用 getWorldPosition 定位。
  const head = new THREE.Group();
  head.position.set(0, 0.34, 0.04);
  headPivot.add(head);
  const NECK = headPivot.position.clone();

  function placeHead() {
    const w = spineWeight(NECK.y);
    headPivot.position.set(NECK.x + bend.x * w, NECK.y * (1 - bend.squash), NECK.z + bend.z * w);
  }
  // 圆脑袋：低分段球，平面着色出硬边色块（像素感）
  const R = V(0.56, 0.5, 0.56);
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), basic(SKIN));
  headMesh.scale.copy(R);
  head.add(headMesh);
  // 脸与触手连接处的深紫阴影盘（定稿里头下方的"裙边"）
  const rootShade = new THREE.Mesh(new THREE.SphereGeometry(0.9, 9, 5), basic(SHADOW));
  rootShade.scale.set(0.62, 0.2, 0.62);
  rootShade.position.y = -0.34;
  head.add(rootShade);

  // 面部参数：PHI / EYE_X 定眼睛位置（黄金比例）
  const PHI = 1.618;
  const EYE_X = 1 - 1 / PHI;

  // 头部深浅斑纹：整体随机分布（额头/脸颊/两侧都有）；眼睛在最上层渲染，斑纹即使落在眼周也盖不住方瞳。
  // 采样集中在朝镜头一侧（dir.z<0 跳过），后脑勺看不见、不浪费采样。
  for (let i = 0; i < 65; i++) {
    const y = rnd() * 2 - 1, ang = rnd() * Math.PI * 2, ring = Math.sqrt(Math.max(0, 1 - y * y));
    const dir = V(Math.cos(ang) * ring, y, Math.sin(ang) * ring);
    if (dir.z < 0) continue;                                    // 只留朝镜头这面
    const spot = new THREE.Mesh(new THREE.BoxGeometry(0.09 + rnd() * 0.08, 0.09 + rnd() * 0.08, 0.02), basic(spotColor()));
    // 头球实际半径是 R（非 1），斑纹要按 R 贴面，否则会浮在头顶外圈
    spot.position.set(dir.x * R.x * 1.008, dir.y * R.y * 1.008, dir.z * R.z * 1.008);
    spot.lookAt(dir.clone().multiplyScalar(2));
    head.add(spot);
  }

  // ---- 眼睛：深色方瞳 + 一丢丢白高光，黄金比例定位 ----
  // behavior 需要 iris/pupil/shine/arc/group 等字段，形状与猫眼对齐。
  const EYE_W = 0.22 * PHI, EYE_H = 0.24 * PHI;
  // 眼睛材质关掉深度测试：无论斑纹/身体在哪个深度，眼睛永远画在最上层，不会被盖住。
  const eyeMat = color => new THREE.MeshBasicMaterial({ color, depthTest: false });
  const irisMat = eyeMat(0xd7a8ff);      // 淡紫眼白底（定稿：不要纯白，用淡紫让方瞳可读）
  const pupilMat = eyeMat(PUPIL);
  const glintMat = eyeMat(0xffffff);
  const lidMat = eyeMat(SHADOW);         // 闭眼时的横线
  // behavior 每帧把 pupil.scale 设为约 0.044*dilate × 0.11（猫的竖瞳尺寸）。
  // 八爪鱼要大方瞳：把基础几何按 φ 放大，使同样的 scale 值算出黄金比例的大方块。
  const PUPIL_BASE_W = 4.2, PUPIL_BASE_H = 2.6;
  const GLINT_BASE = 1;
  const eyes = [-1, 1].map(s => {
    const g = new THREE.Group();
    const lx = s * EYE_X * 0.52, ly = 0.12;
    const lz = R.z * Math.sqrt(Math.max(0, 1 - (lx / R.x) ** 2 - (ly / R.y) ** 2));
    g.position.set(lx, ly, lz + 0.01);
    const normal = V(lx / (R.x * R.x), ly / (R.y * R.y), lz / (R.z * R.z)).normalize();
    g.quaternion.setFromUnitVectors(V(0, 0, 1), normal);
    // iris：淡紫底片，behavior 会读 iris.scale.x 做瞳孔活动范围（需略大于瞳孔）
    const iris = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), irisMat);
    iris.scale.set(0.2, 0.2, 1);
    iris.renderOrder = 10;
    // pupil：深色大方瞳，基础几何放大 φ 倍
    const pupil = new THREE.Mesh(new THREE.PlaneGeometry(PUPIL_BASE_W, PUPIL_BASE_H), pupilMat);
    pupil.scale.set(0.044, 0.11, 1);
    pupil.position.z = 0.002;
    pupil.renderOrder = 11;
    // 一丢丢白：瞳孔上的小方点（材质用基础 1 的片，靠 scale 定尺寸）
    const shine = new THREE.Group();
    const glint = new THREE.Mesh(new THREE.PlaneGeometry(GLINT_BASE, GLINT_BASE), glintMat);
    glint.scale.set(0.022, 0.022, 1);
    glint.position.set(-0.035, 0.05, 0.004);
    glint.renderOrder = 12;
    shine.add(glint);
    // 闭眼横线（behavior 会在闭眼时显示 arc）
    const arc = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.022), lidMat);
    arc.position.z = 0.004;
    arc.visible = false;
    arc.renderOrder = 13;
    g.add(iris, pupil, shine, arc);
    head.add(g);
    return { s, group: g, iris, pupil, shine, arc };
  });

  // 腮红材质：behavior 会改 opacity（八爪鱼默认不显示，留接口）
  const blushMat = new THREE.MeshBasicMaterial({ color: '#f08a8a', transparent: true, opacity: 0, depthTest: false });
  const look = { blush: false };
  function setLook(o) {
    Object.assign(look, o);
    blushMat.opacity = look.blush ? 0.35 : 0;
  }

  // 假耳朵：八爪鱼没有耳朵，但 behavior 每帧读 cat.ears 做"好奇竖起/被摸放平"。
  // 用一个极小的、贴在头顶的深色小揪占位，让接口有意义又不破坏形象。
  const ears = [-1, 1].map(s => {
    const g = new THREE.Group();
    g.position.set(s * 0.24, 0.4, 0.02);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.1), basic(SHADOW));
    g.add(mesh);
    head.add(g);
    return { group: g, mesh, s, tilt: 0.12 };
  });

  // ---- 8 条触手 ----
  // 每条：一个可变粗细圆管，每帧重建；纯色腿面 + 明显的大方块像素点（粗糙像素画感）。
  const TENT = 8, SEG = 14, RAD = 6;
  const PIXEL_DOTS = 6;      // 每条腿的像素方块数：用户要「比较粗糙的像素画」，由 2 加回 6
  const DOT_SIZE = 0.13;     // 方块边长：原来 0.07 太细小，放大成看得清的像素点
  // 每环多一列重复顶点（原为噪点纹理的 uv 封口）。几何索引已按 RING 算好，
  // 现在纹理去掉了也保留，避免动已跑通的圆管构造。
  const RING = RAD + 1;
  // 第 2 条腿（a 手后方那条）稍微加深：用介于 SKIN 亮紫与 SKIN_DARK 之间的紫。
  // 其余腿仍按奇偶深浅交替。
  const LEG2 = 0xb266e6;
  const legColor = i => i === 2 ? LEG2 : (i % 2 ? SKIN_DARK : SKIN);
  const tentacles = [];
  for (let i = 0; i < TENT; i++) {
    const geo = new THREE.BufferGeometry();
    const count = (SEG + 1) * RING;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const uvs = new Float32Array(count * 2);
    for (let s = 0; s <= SEG; s++) for (let j = 0; j <= RAD; j++) {
      const k = s * RING + j;
      uvs[k * 2] = s / SEG;              // uv 现无贴图使用，仅保留几何结构不变
      uvs[k * 2 + 1] = j / RAD;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    const idx = [];
    for (let s = 0; s < SEG; s++) for (let r = 0; r < RAD; r++) {
      const a = s * RING + r, b = a + 1, c = a + RING, d = b + RING;
      idx.push(a, b, c, b, d, c);
    }
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, tentMat(legColor(i)));
    mesh.frustumCulled = false;
    // 触手挂在 body 上，跟随身体倾斜，但末端摆动在世界空间计算（下面用 body 逆变换）
    body.add(mesh);
    tentacles.push({ mesh, index: i, spots: [] });
    for (let k = 0; k < PIXEL_DOTS; k++) {
      const spot = new THREE.Mesh(new THREE.BoxGeometry(DOT_SIZE, DOT_SIZE, 0.03), basic(spotColor()));
      spot.userData = { at: 0.2 + rnd() * 0.6, angle: rnd() * Math.PI * 2 };
      body.add(spot);
      tentacles[tentacles.length - 1].spots.push(spot);
    }
  }

  // "手"触手：a 专职鼠标、b 与 d 各管一只键盘手，分按左右手区的键。
  // 每只手用 id(触手序号) 存自己的目标，避免同 s 的两只手目标互相覆盖。
  // channel 指定 behavior 里对应的爪：a→L(鼠标)、b→R(左半键盘)、d→M(右半键盘)。
  const armLimb = (i, s, channel) => {
    const tent = tentacles[i];
    return {
      id: i, s, channel, tent,
      shoulderLocal: V(s * 0.3, 0.5, 0.2),
      shoulder: V(0, 0, 0),
      c1: V(0, 0, 0), c2: V(0, 0, 0), hand: V(0, 0, 0),
      // 接口里 arms 需要有 limb/paw 供 dragMeshes 与 hitTest 使用；八爪鱼用触手网格本身。
      limb: { body: tent.mesh }, paw: tent.mesh, rim: tent.mesh,
    };
  };
  // a=鼠标手(第4条,正左,s=-1,channel L)、b=键盘手(第1条,右前,s=+1,channel R)、
  // d=键盘手(第3条,左前深色,s=-1,channel M)。三只手各有专属爪通道，互不挤占。
  const arms = [armLimb(4, -1, 'L'), armLimb(1, 1, 'R'), armLimb(3, -1, 'M')];

  // attach：把未弯曲身体坐标点随 bend 变形并放到世界（与猫同签名）
  function attach(local, out) {
    const w = spineWeight(local.y);
    body.updateMatrixWorld();
    return out.set(local.x + bend.x * w, local.y * (1 - bend.squash * sink(local.y)), local.z + bend.z * w)
      .applyMatrix4(body.matrixWorld);
  }
  function bendBody() { /* 八爪鱼圆身不做顶点弯曲，bend 通过 placeHead/attach 生效 */ }
  function placeCollar() { /* 没有项圈 */ }

  // ---- 触手几何：中心线随 t 外扩、下垂、末端上卷；随时间摆动 ----
  const TAIL_INDEX = 6;                 // 第 6 条作为"尾巴"，用于拍桌特效与空格
  const LEFT_INDEX = 2;                 // 第 2 条改成朝左侧伸展的装饰触手，不再压键盘
  const LEFT_ANG = Math.PI * 1.1;       // 朝左略偏后，避开正左的鼠标手 a
  const aP = V(), bP = V(), cP = V(), dP = V(), eP = V(), bezP = V();
  const pts = [], T = V(), N = V(), B = V(), tmp = V();

  // 触手局部中心线（相对 body）。pawTarget/pawBlend：当该触手是"手"时，向目标弯曲。
  function tentaclePoint(t, i, time, handWorld, handBlend, out) {
    const baseAng = i === LEFT_INDEX ? LEFT_ANG : i / TENT * Math.PI * 2;
    const sway = 0.2 * Math.sin(time * 1.7 + i * 0.9) * t;
    const ang = baseAng + sway;
    const reach = 0.34 + 1.05 * t;
    let y = BODY_H - 0.34 - 1.05 * t;
    const curl = Math.max(0, (t - 0.7) / 0.3);
    y += 0.55 * curl * curl;
    // 局部坐标（body 的原点在桌面）
    out.set(Math.cos(ang) * reach, y, Math.sin(ang) * reach);
    // "手"触手：像手臂一样弯曲够目标——肩(根部)固定、肘向外鼓、前臂从上方回落、末梢落到目标。
    // 用三次贝塞尔重建中心线，而不是把整段直线插值到目标（那样像一根棍子戳过去，很别扭）。
    if (handBlend > 0 && handWorld) {
      body.updateMatrixWorld();
      cP.copy(handWorld).applyMatrix4(body.matrixWorld.clone().invert()); // 目标点转到 body 局部
      // 末尾整条触手会叠加 bend 偏移，这里先把目标反向抵消，末梢才会精确落在真实键/鼠标上。
      cP.x -= bend.x * spineWeight(NECK.y);
      cP.z -= bend.z * spineWeight(NECK.y);
      const outX = Math.cos(baseAng), outZ = Math.sin(baseAng);          // 该触手朝外的水平方向
      const rootX = outX * 0.34, rootZ = outZ * 0.34, rootY = BODY_H - 0.34; // 肩部：根部原位置，不动
      // 肘控制点：从肩向外下方鼓出，形成上臂
      const p1x = rootX + outX * 0.30, p1y = rootY - 0.10, p1z = rootZ + outZ * 0.30;
      // 前臂控制点：从目标回撤并抬高，让末梢从上方落下够到键，而不是斜插过去
      const p2x = cP.x + (rootX - cP.x) * 0.30, p2y = cP.y + 0.34, p2z = cP.z + (rootZ - cP.z) * 0.30;
      const u = 1 - t, b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t;
      bezP.set(
        b0 * rootX + b1 * p1x + b2 * p2x + b3 * cP.x,
        b0 * rootY + b1 * p1y + b2 * p2y + b3 * cP.y,
        b0 * rootZ + b1 * p1z + b2 * p2z + b3 * cP.z,
      );
      // handBlend 参与混合：1=完全够向目标，0=回到自然下垂。鼠标手待机时靠它平滑收回。
      out.lerp(bezP, handBlend / 0.92);
    }
    // 整条触手跟随身体侧弯横移，权重与头部枢轴一致，根部就不会和头断开。
    // 用 spineWeight(NECK.y) 而非随 t 变化：整条一起平移，避免姿态僵硬失真。
    const bw = spineWeight(NECK.y);
    out.x += bend.x * bw;
    out.z += bend.z * bw;
    return out;
  }
  const tentacleRadius = t => 0.2 * (1 - t) + 0.03 + 0.045 * Math.sin(Math.PI * t);

  // 把某条触手按当前参数重建网格
  function updateOneTentacle(tent, time, handWorld, handBlend) {
    const pos = tent.mesh.geometry.attributes.position.array;
    const nrm = tent.mesh.geometry.attributes.normal.array;
    for (let s = 0; s <= SEG; s++) pts[s] = tentaclePoint(s / SEG, tent.index, time, handWorld, handBlend, pts[s] || V());
    for (let s = 0; s <= SEG; s++) {
      T.subVectors(pts[Math.min(SEG, s + 1)], pts[Math.max(0, s - 1)]).normalize();
      if (s === 0) {
        tmp.set(0, 1, 0);
        if (Math.abs(T.dot(tmp)) > 0.9) tmp.set(1, 0, 0);
        N.crossVectors(T, tmp).normalize();
      } else {
        B.crossVectors(N, T);
        N.crossVectors(T, B).normalize();
      }
      B.crossVectors(T, N).normalize();
      const r = tentacleRadius(s / SEG);
      for (let j = 0; j <= RAD; j++) {  // 最后一列复制第一列位置，保持环闭合
        const a = (j % RAD) / RAD * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), k = (s * RING + j) * 3;
        pos[k]     = pts[s].x + (N.x * ca + B.x * sa) * r;
        pos[k + 1] = pts[s].y + (N.y * ca + B.y * sa) * r;
        pos[k + 2] = pts[s].z + (N.z * ca + B.z * sa) * r;
        nrm[k]     = N.x * ca + B.x * sa;
        nrm[k + 1] = N.y * ca + B.y * sa;
        nrm[k + 2] = N.z * ca + B.z * sa;
      }
    }
    tent.mesh.geometry.attributes.position.needsUpdate = true;
    tent.mesh.geometry.attributes.normal.needsUpdate = true;
    // 斑纹贴到各自表面位置
    for (const sp of tent.spots) {
      const at = sp.userData.at, angle = sp.userData.angle;
      tentaclePoint(at, tent.index, time, handWorld, handBlend, aP);
      tentaclePoint(Math.min(1, at + 0.02), tent.index, time, handWorld, handBlend, bP);
      T.subVectors(bP, aP).normalize();
      tmp.set(0, 1, 0);
      if (Math.abs(T.dot(tmp)) > 0.9) tmp.set(1, 0, 0);
      cP.crossVectors(T, tmp).normalize();
      dP.crossVectors(T, cP).normalize();
      const rr = tentacleRadius(at) + 0.015;
      sp.position.copy(aP).addScaledVector(cP, Math.cos(angle) * rr).addScaledVector(dP, Math.sin(angle) * rr);
      sp.position.x += 0; // 保持与触手同一 body 坐标系
    }
  }

  // 每只手按 id 存目标；其余触手在 updateTail 里统一重建。
  const handTargets = {};
  const MOUSE_ID = 4;                            // a=鼠标手
  const mouseTop = V();                          // 鼠标顶部世界坐标
  const HAND_GRIP = 0.92;                        // 完全够向目标的混合权重
  let mouseGrip = 0;                             // a 的抓握强度：用鼠标→HAND_GRIP，待机→0(自然下垂)
  function updateArm(arm, pawPos) {
    let p = pawPos.clone ? pawPos.clone() : V(pawPos.x, pawPos.y, pawPos.z);
    K.mouseProp.top(mouseTop);                    // 鼠标顶部世界坐标（每帧最新）
    if (arm.id === MOUSE_ID) {
      // a 专职鼠标：鼠标在用就抓鼠标顶；不用则放松成自然触手待机，不再一直压在鼠标上。
      // behavior 传来的目标≈鼠标顶部代表正在 mousing，否则(按键/空闲)回待机。
      const usingMouse = p.distanceTo(mouseTop) < 0.25;
      const goal = usingMouse ? HAND_GRIP : 0;
      mouseGrip += (goal - mouseGrip) * (usingMouse ? 0.4 : 0.12); // 抓鼠标快、回待机缓
      p.copy(mouseTop);                           // 目标恒为鼠标顶，靠 mouseGrip 决定是否真去够
    }
    // b(R) 与 d(M) 各收到 behavior 按左右手区分流的键位目标，直接用即可，无需互相跟随。
    handTargets[arm.id] = p;
    arm.hand.copy(p);
  }

  // 尾巴尖世界坐标（供 behavior 的拍桌特效）；用第 6 条末端。
  function tailTip(out) {
    const tent = tentacles[TAIL_INDEX];
    tentaclePoint(1, tent.index, currentTime, null, 0, tmp);
    return out.copy(tmp).applyMatrix4(body.matrixWorld);
  }

  // 尾巴摆动/拍桌：接口与猫一致，八爪鱼把"尾巴"那条触手按参数加大摆动。
  let currentTime = 0, currentSway = 1, currentSleep = 0, currentLift = 0, currentLash = 0;
  function updateTail(time, sway, sleep, thump = 0, lift = 0, lash = 0, reach = 0, reachTip = null) {
    currentTime = time; currentSway = sway; currentSleep = sleep; currentLift = lift; currentLash = lash;
    body.updateMatrixWorld();
    // 重建每条"手"触手（用各自 behavior 写入的目标）
    for (const arm of arms) {
      const tgt = handTargets[arm.id] || null;
      // a 用 mouseGrip 混合：待机时 grip→0，触手自然下垂、离开鼠标；用鼠标时 grip→0.92 去抓。
      const blend = arm.id === MOUSE_ID ? (tgt ? mouseGrip : 0) : (tgt ? HAND_GRIP : 0);
      updateOneTentacle(arm.tent, time, tgt, blend);
    }
    // 重建其余触手，尾巴那条叠加 lift/lash 的拍桌动作
    const handTents = new Set(arms.map(a => a.tent));
    for (const tent of tentacles) {
      if (handTents.has(tent)) continue;
      updateOneTentacle(tent, time, null, 0);
      if (tent.index === TAIL_INDEX) {
        // 拍桌：把末端若干环抬起再放下，并左右甩动
        const pos = tent.mesh.geometry.attributes.position.array;
        for (let s = Math.floor(SEG * 0.72); s <= SEG; s++) {
          const w = (s / SEG - 0.72) / 0.28;
          for (let j = 0; j < RAD; j++) {
            const k = (s * RAD + j) * 3;
            pos[k + 1] += lift * 0.7 * w * w;
            pos[k]     += lash * 0.35 * w * w;
          }
        }
      }
    }
  }

  // petMeshes / dragMeshes：与猫一致的命中区接口
  const petMeshes = [headMesh, ...ears.map(e => e.mesh)];
  const dragMeshes = [headMesh, ...tentacles.map(t => t.mesh)];

  // 八爪鱼所有网格都挂在 body 下，切换时隐藏 body 即可全部隐藏。
  const setVisible = v => { body.visible = v; };

  // 以当前 id 注册；behavior.js 通过 K.creature 代理访问，无需改动。
  K.registerCreature('octopus', {
    body, home: HOME, headPivot, head, ears, eyes, whiskers: [], hind: [], arms, blushMat, setVisible,
    bend, bendBody, attach, placeHead, placeCollar,
    tailTip, petMeshes, dragMeshes,
    updateArm, updateTail, setLook, look,
    squintOnCurious: true,  // 好奇时眯眼（近视使劲看清），不沿用猫的瞪大圆眼
  });
})();
