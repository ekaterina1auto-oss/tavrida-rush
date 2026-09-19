(async () => {
  const app = document.getElementById('app');
  const one = (s) => app.querySelector(s);
  const all = (s) => Array.from(app.querySelectorAll(s));

  let THREE, GLTFLoader;
  try {
    THREE = await import('https://esm.sh/three@0.180.0');
    ({ GLTFLoader } = await import('https://esm.sh/three@0.180.0/examples/jsm/loaders/GLTFLoader.js'));
  } catch (err) {
    console.error(err);
    const toast = one('#toast');
    toast.textContent = 'Не удалось загрузить 3D-движок. Обнови страницу.';
    toast.classList.add('show');
    return;
  }

  const carSpecs = {
    'Lada Vesta Street Beast': { base: 138, max: 218, type: 'vesta', color: 0xc3131b, label: 'C · 412 · MAD BUILD' },
    'BMW M340i': { base: 154, max: 252, type: 'bmw', color: 0x11161d, label: 'S · 642 · Premium' },
    'Mercedes-AMG C 63 S': { base: 158, max: 264, type: 'amg', color: 0x5b6068, label: 'S · 655 · V8 Power' },
    'Porsche 911 Carrera S': { base: 163, max: 280, type: 'porsche', color: 0xc51d22, label: 'S+ · 688 · Legendary' }
  };

  const state = {
    screen: 'home',
    car: 'BMW M340i',
    type: 'bmw',
    track: 'Таврида',
    speed: 154,
    score: 0,
    combo: 1,
    distance: 0,
    lane: 1,
    playing: false,
    paused: false,
    gas: false,
    brake: false,
    last: 0,
    raf: 0,
    comboTimer: 0,
    crashLock: false,
    maxSpeed: 0,
    nearMisses: 0
  };

  function toast(text) {
    const el = one('#toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 1200);
  }

  function openScreen(id) {
    all('.screen').forEach((s) => s.classList.remove('is-active'));
    one('#screen-' + id).classList.add('is-active');
    state.screen = id;
    if (id === 'race') startRace();
    else stopRace();
    if (id === 'garage') resizeGarage();
  }

  all('[data-screen]').forEach((el) => el.addEventListener('click', () => openScreen(el.dataset.screen)));
  one('#recordsBtn').addEventListener('click', () => toast('Рекорды подключим после сохранений 🏆'));
  one('#settingsBtn').addEventListener('click', () => toast('Настройки звука и управления — следующим билдом'));

  all('.track-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      all('.track-card').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.track = btn.dataset.track;
      one('#trackCaption').textContent = state.track;
      applyRaceTheme();
      toast(state.track + ' выбрана');
    });
  });

  function makeCar(type, color, scale = 1) {
    const group = new THREE.Group();
    group.name = 'car-' + type;

    const paint = new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0.72,
      roughness: 0.24,
      clearcoat: 1,
      clearcoatRoughness: 0.16
    });
    const dark = new THREE.MeshStandardMaterial({ color: 0x080a0e, metalness: 0.45, roughness: 0.32 });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x253846,
      metalness: 0.08,
      roughness: 0.12,
      transmission: 0.15,
      transparent: true,
      opacity: 0.82
    });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xaab0b7, metalness: 0.92, roughness: 0.16 });
    const red = new THREE.MeshStandardMaterial({ color: 0xff281f, emissive: 0xff160f, emissiveIntensity: 4 });
    const white = new THREE.MeshStandardMaterial({ color: 0xeefaff, emissive: 0xb9efff, emissiveIntensity: 2.5 });

    const bodyGeom = new THREE.CapsuleGeometry(0.74, 2.6, 7, 16);
    bodyGeom.rotateX(Math.PI / 2);
    const body = new THREE.Mesh(bodyGeom, paint);
    body.scale.set(type === 'vesta' ? 1.46 : 1.38, 0.45, type === 'porsche' ? 1.04 : 1.0);
    body.position.y = 0.74;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.28, 1.05), paint);
    hood.position.set(0, 0.76, -1.58);
    hood.rotation.x = -0.05;
    hood.castShadow = true;
    group.add(hood);

    const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.34, 0.82), paint);
    trunk.position.set(0, 0.79, 1.58);
    trunk.castShadow = true;
    group.add(trunk);

    const roofGeom = new THREE.CapsuleGeometry(0.58, 1.25, 6, 14);
    roofGeom.rotateX(Math.PI / 2);
    const roof = new THREE.Mesh(roofGeom, glass);
    roof.scale.set(1.22, 0.42, 0.92);
    roof.position.set(0, 1.19, 0.05);
    roof.castShadow = true;
    group.add(roof);

    const wheelGeom = new THREE.CylinderGeometry(0.39, 0.39, 0.25, 18);
    wheelGeom.rotateZ(Math.PI / 2);
    const rimGeom = new THREE.CylinderGeometry(0.23, 0.23, 0.27, 12);
    rimGeom.rotateZ(Math.PI / 2);
    const wheelZ = [-1.15, 1.18];
    const wheelX = [-1.05, 1.05];
    wheelZ.forEach((z) => wheelX.forEach((x) => {
      const wheel = new THREE.Mesh(wheelGeom, dark);
      wheel.position.set(x, 0.43, z);
      wheel.castShadow = true;
      group.add(wheel);
      const rim = new THREE.Mesh(rimGeom, chrome);
      rim.position.set(x + (x > 0 ? 0.012 : -0.012), 0.43, z);
      group.add(rim);
    }));

    const tailGeom = new THREE.BoxGeometry(0.5, 0.08, 0.05);
    [-0.62, 0.62].forEach((x) => {
      const tail = new THREE.Mesh(tailGeom, red);
      tail.position.set(x, 0.88, 2.0);
      group.add(tail);
    });

    const headGeom = new THREE.BoxGeometry(0.48, 0.07, 0.05);
    [-0.62, 0.62].forEach((x) => {
      const lamp = new THREE.Mesh(headGeom, white);
      lamp.position.set(x, 0.86, -2.0);
      group.add(lamp);
    });

    if (type === 'vesta') {
      const wingBar = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.12, 0.38), dark);
      wingBar.position.set(0, 1.34, 1.92);
      const post1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), dark);
      const post2 = post1.clone();
      post1.position.set(-0.72, 1.09, 1.72);
      post2.position.set(0.72, 1.09, 1.72);
      group.add(wingBar, post1, post2);

      const splitter = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.08, 0.48), dark);
      splitter.position.set(0, 0.39, -2.02);
      group.add(splitter);

      const underGlow = new THREE.PointLight(0xff2518, 9, 6, 2);
      underGlow.position.set(0, 0.22, 0);
      underGlow.name = 'underGlow';
      group.add(underGlow);

      const glowDisc = new THREE.Mesh(
        new THREE.CircleGeometry(1.65, 32),
        new THREE.MeshBasicMaterial({ color: 0xff2418, transparent: true, opacity: 0.18, depthWrite: false })
      );
      glowDisc.rotation.x = -Math.PI / 2;
      glowDisc.position.y = 0.04;
      group.add(glowDisc);
    }

    if (type === 'porsche') {
      body.scale.z = 0.94;
      roof.scale.set(1.18, 0.38, 0.86);
    }

    if (type === 'amg') {
      const grille = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.32, 0.08), dark);
      grille.position.set(0, 0.7, -2.12);
      group.add(grille);
    }

    group.scale.setScalar(scale);
    return group;
  }


  // ---------- HIGH DETAIL CAR ASSET ----------
  let detailedCarTemplate = null;

  function colorizeDetailedCar(root, color, type) {
    const blocked = /glass|window|tire|tyre|wheel|rim|chrome|light|lamp|interior|black|rubber/i;
    const preferred = /paint|body|exterior|carpaint|coat|shell|bodywork|mainbody/i;
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      if (!o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const cloned = mats.map((mat) => {
        const m = mat.clone();
        const n = (m.name || '') + ' ' + (o.name || '');
        const paintCandidate = preferred.test(n) || (!blocked.test(n) && m.color && (m.metalness ?? 0) > .15 && (m.roughness ?? .5) < .65);
        if (paintCandidate && m.color) {
          const target = new THREE.Color(color);
          m.color.lerp(target, type === 'bmw' ? .52 : .72);
          if ('clearcoat' in m) m.clearcoat = Math.max(m.clearcoat || 0, .8);
          m.roughness = Math.min(m.roughness ?? .4, .32);
        }
        return m;
      });
      o.material = Array.isArray(o.material) ? cloned : cloned[0];
    });
  }

  async function loadDetailedCarAsset() {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync('https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/CarConcept/GLB/CarConcept.glb');
    const root = gltf.scene;
    const remove = [];
    root.traverse((o) => {
      if (o.isCamera || o.isLight) remove.push(o);
    });
    remove.forEach((o) => o.parent?.remove(o));

    let box = new THREE.Box3().setFromObject(root);
    let size = box.getSize(new THREE.Vector3());

    // Keep the longest horizontal dimension along the road axis.
    if (size.x > size.z) {
      root.rotation.y = Math.PI / 2;
      root.updateMatrixWorld(true);
      box = new THREE.Box3().setFromObject(root);
      size = box.getSize(new THREE.Vector3());
    }

    const longest = Math.max(size.x, size.z);
    const s = 4.35 / Math.max(.001, longest);
    root.scale.multiplyScalar(s);
    root.updateMatrixWorld(true);

    box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= box.min.y;
    root.updateMatrixWorld(true);

    detailedCarTemplate = root;
    return root;
  }

  function makeDetailedCar(type, color, scale = 1) {
    const wrapper = new THREE.Group();
    const model = detailedCarTemplate.clone(true);
    colorizeDetailedCar(model, color, type);
    wrapper.add(model);

    if (type === 'vesta') {
      const dark = new THREE.MeshStandardMaterial({ color: 0x08090c, metalness: .35, roughness: .35 });
      const wing = new THREE.Mesh(new THREE.BoxGeometry(2.2, .10, .34), dark);
      wing.position.set(0, 1.42, 1.63);
      const p1 = new THREE.Mesh(new THREE.BoxGeometry(.08, .45, .08), dark);
      const p2 = p1.clone();
      p1.position.set(-.67, 1.20, 1.48);
      p2.position.set(.67, 1.20, 1.48);
      wrapper.add(wing, p1, p2);
      const glow = new THREE.PointLight(0xff2418, 12, 7, 2);
      glow.position.set(0, .18, 0);
      glow.name = 'underGlow';
      wrapper.add(glow);
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(1.6, 32),
        new THREE.MeshBasicMaterial({ color: 0xff2418, transparent: true, opacity: .18, depthWrite: false })
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = .03;
      wrapper.add(disc);
    }

    if (type === 'bmw') {
      const lip = new THREE.Mesh(
        new THREE.BoxGeometry(1.55, .06, .22),
        new THREE.MeshStandardMaterial({ color: 0x090b0f, metalness: .5, roughness: .28 })
      );
      lip.position.set(0, 1.02, 1.75);
      wrapper.add(lip);
    }

    if (type === 'amg') {
      const metal = new THREE.MeshStandardMaterial({ color: 0x717983, metalness: .9, roughness: .2 });
      [-.58, -.22, .22, .58].forEach((x) => {
        const tip = new THREE.Mesh(new THREE.CylinderGeometry(.10, .10, .24, 12), metal);
        tip.rotation.x = Math.PI / 2;
        tip.position.set(x, .34, 1.83);
        wrapper.add(tip);
      });
    }

    if (type === 'porsche') {
      wrapper.scale.set(1.03, .93, .98);
      const duck = new THREE.Mesh(
        new THREE.BoxGeometry(1.62, .055, .24),
        new THREE.MeshStandardMaterial({ color: 0x111318, metalness: .55, roughness: .26 })
      );
      duck.position.set(0, 1.02, 1.66);
      wrapper.add(duck);
    }

    wrapper.scale.multiplyScalar(scale);
    wrapper.name = 'hd-car-' + type;
    wrapper.userData.sharedGeometry = true;
    return wrapper;
  }

  function makeGameCar(type, color, scale = 1) {
    return detailedCarTemplate ? makeDetailedCar(type, color, scale) : makeCar(type, color, scale);
  }

  // ---------- GARAGE 3D ----------
  const garageCanvas = one('#garage3d');
  const garageRenderer = new THREE.WebGLRenderer({ canvas: garageCanvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  garageRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  garageRenderer.shadowMap.enabled = true;
  garageRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
  garageRenderer.outputColorSpace = THREE.SRGBColorSpace;
  garageRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  garageRenderer.toneMappingExposure = 1.28;

  const garageScene = new THREE.Scene();
  garageScene.fog = new THREE.Fog(0x0a0d12, 9, 24);
  const garageCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  garageCamera.position.set(5.35, 2.72, 7.15);
  garageCamera.lookAt(0, 0.8, 0);

  garageScene.add(new THREE.HemisphereLight(0xa8c9e7, 0x22110b, 2.0));
  const garageKey = new THREE.SpotLight(0xffddaa, 55, 35, Math.PI / 5, 0.45, 1.4);
  garageKey.position.set(4.5, 7.5, 4);
  garageKey.castShadow = true;
  garageScene.add(garageKey);
  const garageRim = new THREE.SpotLight(0x79bfff, 40, 30, Math.PI / 4, 0.6, 1.5);
  garageRim.position.set(-5, 4, -4);
  garageScene.add(garageRim);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(5.2, 64),
    new THREE.MeshPhysicalMaterial({
      color: 0x11151b,
      metalness: .82,
      roughness: .20,
      clearcoat: 1,
      clearcoatRoughness: .16
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  garageScene.add(floor);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.4, 0.035, 8, 80),
    new THREE.MeshBasicMaterial({ color: 0xffc400 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.025;
  garageScene.add(ring);

  const garageBackdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 10),
    new THREE.MeshStandardMaterial({ color: 0x11161e, roughness: 0.8 })
  );
  garageBackdrop.position.set(0, 4.2, -5.2);
  garageScene.add(garageBackdrop);

  const garageGrid = new THREE.GridHelper(9.2, 18, 0x4c5866, 0x252b33);
  garageGrid.position.y = .035;
  garageGrid.material.transparent = true;
  garageGrid.material.opacity = .40;
  garageScene.add(garageGrid);

  const lightBarMat = new THREE.MeshBasicMaterial({ color: 0xdff6ff });
  [-4.2, -3.0, -1.8, 1.8, 3.0, 4.2].forEach((x) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(.055, 3.5, .045), lightBarMat);
    bar.position.set(x, 2.55, -5.05);
    garageScene.add(bar);
  });

  const yellowBarMat = new THREE.MeshBasicMaterial({ color: 0xffc400 });
  [-3.6, 3.6].forEach((x) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(.045, 2.4, .04), yellowBarMat);
    bar.position.set(x, 2.0, -5.01);
    garageScene.add(bar);
  });

  const rearGlow = new THREE.PointLight(0x4aa6ff, 14, 12, 2);
  rearGlow.position.set(0, 1.2, -2.8);
  garageScene.add(rearGlow);

  let garageCar = makeGameCar('bmw', carSpecs['BMW M340i'].color, 1.0);
  garageCar.rotation.y = -0.6;
  garageScene.add(garageCar);
  let garageDrag = false;
  let garageLastX = 0;
  let garageSpinBoost = 0;

  function rebuildGarageCar() {
    garageScene.remove(garageCar);
    const sharedGarageGeometry = !!garageCar.userData.sharedGeometry;
    garageCar.traverse((o) => {
      if (o.geometry && !sharedGarageGeometry) o.geometry.dispose();
      if (o.material && o.material.dispose) o.material.dispose();
    });
    const spec = carSpecs[state.car];
    garageCar = makeGameCar(spec.type, spec.color, 1.0);
    garageCar.rotation.y = -0.6;
    garageScene.add(garageCar);
  }

  garageCanvas.addEventListener('pointerdown', (e) => {
    garageDrag = true;
    garageLastX = e.clientX;
    garageCanvas.setPointerCapture?.(e.pointerId);
  });
  garageCanvas.addEventListener('pointermove', (e) => {
    if (!garageDrag) return;
    const dx = e.clientX - garageLastX;
    garageLastX = e.clientX;
    garageCar.rotation.y += dx * 0.012;
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => garageCanvas.addEventListener(ev, () => { garageDrag = false; }));

  function resizeGarage() {
    const r = garageCanvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const w = Math.max(2, Math.floor(r.width));
    const h = Math.max(2, Math.floor(r.height));
    if (garageCanvas.width !== w || garageCanvas.height !== h) {
      garageRenderer.setSize(w, h, false);
      garageCamera.aspect = w / h;
      garageCamera.updateProjectionMatrix();
    }
  }

  function garageLoop(t) {
    requestAnimationFrame(garageLoop);
    if (state.screen !== 'garage') return;
    resizeGarage();
    if (!garageDrag) garageCar.rotation.y += 0.004 + garageSpinBoost;
    garageSpinBoost *= 0.96;
    const glow = garageCar.getObjectByName('underGlow');
    if (glow) glow.intensity = 7.5 + Math.sin(t * 0.008) * 2.5;
    garageRenderer.render(garageScene, garageCamera);
  }
  requestAnimationFrame(garageLoop);

  all('.car-card[data-car]').forEach((btn) => {
    btn.addEventListener('click', () => {
      all('.car-card').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.car = btn.dataset.car;
      state.type = btn.dataset.type;
      one('#garageName').textContent = state.car;
      one('#garageClass').textContent = carSpecs[state.car].label;
      one('#garageSubtitle').textContent = state.car;
      one('#statSpeed').textContent = btn.dataset.speed;
      one('#statAccel').textContent = btn.dataset.accel;
      one('#statHandling').textContent = btn.dataset.handling;
      one('#barSpeed').style.width = Number(btn.dataset.speed) * 10 + '%';
      one('#barAccel').style.width = Number(btn.dataset.accel) * 10 + '%';
      one('#barHandling').style.width = Number(btn.dataset.handling) * 10 + '%';
      rebuildGarageCar();
      if (state.type === 'vesta') vestaSparks();
      toast(state.car + ' выбрана');
    });
  });

  all('.car-card.locked').forEach((btn) => btn.addEventListener('click', () => toast('Эта машина пока заблокирована')));

  function vestaSparks() {
    const fx = one('#garageFx');
    fx.innerHTML = '';
    for (let i = 0; i < 22; i++) {
      const s = document.createElement('i');
      s.className = 'spark';
      s.style.left = (15 + Math.random() * 70) + '%';
      s.style.setProperty('--dx', (Math.random() * 110 - 55) + 'px');
      fx.appendChild(s);
    }
  }

  one('#effectBtn').addEventListener('click', () => {
    garageSpinBoost = 0.055;
    if (state.type === 'vesta') {
      vestaSparks();
      toast('MAD CRIMEAN BUILD 🔥');
    } else {
      toast('SHOWROOM REVEAL');
    }
  });

  // ---------- RACE 3D ----------
  const raceCanvas = one('#race3d');
  const renderer = new THREE.WebGLRenderer({ canvas: raceCanvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.30));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 450);
  camera.position.set(0, 4.0, 10.2);

  const hemi = new THREE.HemisphereLight(0xb9d7ef, 0x4b351d, 2.2);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xffd6a0, 3.7);
  sunLight.position.set(-6, 12, 7);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  scene.add(sunLight);

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xffd58b })
  );
  sun.position.set(38, 23, -180);
  scene.add(sun);

  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = haloCanvas.height = 128;
  const hctx = haloCanvas.getContext('2d');
  const hgrad = hctx.createRadialGradient(64,64,4,64,64,64);
  hgrad.addColorStop(0,'rgba(255,235,185,.92)');
  hgrad.addColorStop(.25,'rgba(255,194,105,.48)');
  hgrad.addColorStop(1,'rgba(255,168,80,0)');
  hctx.fillStyle = hgrad;
  hctx.fillRect(0,0,128,128);
  const haloTexture = new THREE.CanvasTexture(haloCanvas);
  const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTexture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  sunHalo.position.copy(sun.position);
  sunHalo.scale.set(25,25,1);
  scene.add(sunHalo);

  const groundMat = new THREE.MeshStandardMaterial({ color: 0xa38657, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 700), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, -280);
  ground.receiveShadow = true;
  scene.add(ground);

  const seaMat = new THREE.MeshStandardMaterial({ color: 0x2e6980, metalness: 0.1, roughness: 0.32 });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(90, 700), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(58, -0.12, -280);
  scene.add(sea);

  const mountains = new THREE.Group();
  for (let i = 0; i < 18; i++) {
    const g = new THREE.ConeGeometry(7 + Math.random() * 9, 8 + Math.random() * 17, 6);
    const m = new THREE.MeshStandardMaterial({ color: i % 2 ? 0x5d6258 : 0x6d695b, roughness: 1 });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set((Math.random() > .5 ? 1 : -1) * (22 + Math.random() * 45), 3.5, -45 - i * 25);
    mesh.scale.x = 1.5 + Math.random();
    mountains.add(mesh);
  }
  scene.add(mountains);

  function canvasTexture(lines, bg = '#175b44', fg = '#ffffff', w = 512, h = 220) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 10; ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = fg;
    ctx.font = '700 38px -apple-system, Arial, sans-serif';
    lines.forEach((line, i) => ctx.fillText(line, 30, 54 + i * 52));
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return tex;
  }


  function makeUpgradeBillboard(side = 1, variant = 0) {
    const cv = document.createElement('canvas');
    cv.width = 768;
    cv.height = 320;
    const ctx = cv.getContext('2d');

    const dark = variant % 2 === 0;
    const grad = ctx.createLinearGradient(0, 0, 768, 320);
    if (dark) {
      grad.addColorStop(0, '#0b1118');
      grad.addColorStop(1, '#202832');
    } else {
      grad.addColorStop(0, '#125a44');
      grad.addColorStop(1, '#0b3f32');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 768, 320);

    ctx.fillStyle = '#ffc400';
    ctx.fillRect(0, 0, 18, 320);
    ctx.fillRect(0, 300, 768, 20);

    ctx.fillStyle = '#ffc400';
    ctx.font = '900 48px -apple-system, Arial, sans-serif';
    ctx.fillText('ЦЕНТР', 46, 72);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 56px -apple-system, Arial, sans-serif';
    ctx.fillText('АВТОАПГРЕЙДА', 46, 135);

    ctx.fillStyle = '#e9edf2';
    ctx.font = '700 24px -apple-system, Arial, sans-serif';
    ctx.fillText('Симферополь • ул. Воровского, 19', 46, 194);

    ctx.fillStyle = '#ffc400';
    ctx.font = '900 34px -apple-system, Arial, sans-serif';
    ctx.fillText('+7 (978) 046-58-81', 46, 245);

    ctx.fillStyle = '#cbd2da';
    ctx.font = '700 18px -apple-system, Arial, sans-serif';
    ctx.fillText('ANDROID • АВТОЗВУК • КАМЕРЫ • ДОВОДЧИКИ', 46, 279);

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

    const group = new THREE.Group();
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(7.4, 3.05),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
    );
    board.position.y = 4.0;
    group.add(board);

    const postMat = new THREE.MeshStandardMaterial({ color: 0x8d9398, metalness: .65, roughness: .35 });
    [-2.65, 2.65].forEach((x) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(.14, 4.0, .14), postMat);
      post.position.set(x, 1.95, .05);
      group.add(post);
    });

    group.position.x = side * 10.1;
    return group;
  }

  function makeSign() {
    const group = new THREE.Group();
    const tex = canvasTexture(['A-291   СИМФЕРОПОЛЬ ↑', 'БЕЛОГОРСК 42', 'ФЕОДОСИЯ 126 →']);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(6.8, 2.8),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
    );
    board.position.set(0, 4.5, 0);
    group.add(board);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x8b9196, metalness: 0.7, roughness: 0.35 });
    [-2.7, 2.7].forEach((x) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(.16, 4.4, .16), postMat);
      p.position.set(x, 2.1, 0.05);
      group.add(p);
    });
    group.position.x = 3.6;
    return group;
  }

  function makeStation(name, side = 1) {
    const group = new THREE.Group();
    const brandColor = name === 'ATAN' ? 0xf2b519 : 0x652b8d;
    const accent = name === 'TES' ? 0x51b84b : 0x151515;
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, .42, 3.0),
      new THREE.MeshStandardMaterial({ color: brandColor, metalness: .22, roughness: .45 })
    );
    canopy.position.y = 2.7;
    group.add(canopy);
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(7.3, .13, 3.1),
      new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: name === 'TES' ? .5 : 0 })
    );
    strip.position.y = 2.5;
    group.add(strip);
    [-2.6, 2.6].forEach((x) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(.22, 2.6, .22), new THREE.MeshStandardMaterial({ color: 0xd1d4d6 }));
      post.position.set(x, 1.3, 0);
      group.add(post);
    });
    const tex = canvasTexture([name], name === 'ATAN' ? '#f2b519' : '#652b8d', '#ffffff', 320, 120);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.5, .95), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    sign.position.set(0, 3.5, 0);
    group.add(sign);
    group.position.x = side * 10.0;
    group.scale.setScalar(.9);
    return group;
  }


  function createRoadTexture() {
    const cv = document.createElement('canvas');
    cv.width = 192;
    cv.height = 192;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#25272a';
    ctx.fillRect(0, 0, 192, 192);

    ctx.globalAlpha = .18;
    for (let i = 0; i < 180; i++) {
      const v = 28 + ((Math.random() * 26) | 0);
      ctx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
      const s = Math.random() > .8 ? 2 : 1;
      ctx.fillRect(Math.random() * 192, Math.random() * 192, s, s);
    }
    ctx.globalAlpha = .15;
    ctx.strokeStyle = '#08090a';
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      const x = Math.random() * 192;
      const y = Math.random() * 192;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.random() * 24 - 12, y + 18 + Math.random() * 28);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1.25, 4.0);
    tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return tex;
  }

  const roadTexture = createRoadTexture();
  const roadMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: roadTexture,
    roughness: .94,
    metalness: .02
  });

  function makeCypress(height = 4.4) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(.10, .15, height * .35, 7),
      new THREE.MeshStandardMaterial({ color: 0x4a3324, roughness: 1 })
    );
    trunk.position.y = height * .175;
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(.52, height, 10),
      new THREE.MeshStandardMaterial({ color: 0x173a2b, roughness: 1 })
    );
    crown.scale.x = .72;
    crown.position.y = height * .55;
    group.add(trunk, crown);
    return group;
  }

  function makeRoadLamp(side = 1) {
    const group = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x777f86, metalness: .7, roughness: .3 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.055, .07, 5.4, 8), poleMat);
    pole.position.y = 2.7;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.05, .06, .06), poleMat);
    arm.position.set(-side * .48, 5.34, 0);
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(.46, .07, .18),
      new THREE.MeshBasicMaterial({ color: 0xffe1a8 })
    );
    lamp.position.set(-side * .96, 5.25, 0);
    group.add(pole, arm, lamp);
    group.position.x = side * 8.65;
    return group;
  }

  function makeBridge() {
    const group = new THREE.Group();
    const concrete = new THREE.MeshStandardMaterial({ color: 0x92969a, roughness: .80 });
    const darkConcrete = new THREE.MeshStandardMaterial({ color: 0x6f7479, roughness: .88 });

    const deck = new THREE.Mesh(new THREE.BoxGeometry(19, .68, 3.7), concrete);
    deck.position.y = 5.0;
    deck.castShadow = true;
    group.add(deck);

    const parapetA = new THREE.Mesh(new THREE.BoxGeometry(19, .42, .22), darkConcrete);
    parapetA.position.set(0, 5.48, -1.68);
    const parapetB = parapetA.clone();
    parapetB.position.z = 1.68;
    group.add(parapetA, parapetB);

    [-7.6, 0, 7.6].forEach((x) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(.72, 5.0, .72), concrete);
      p.position.set(x, 2.5, 0);
      p.castShadow = true;
      group.add(p);
    });

    const shadowBeam = new THREE.Mesh(new THREE.BoxGeometry(18.3, .20, .30), darkConcrete);
    shadowBeam.position.set(0, 4.52, 0);
    group.add(shadowBeam);
    return group;
  }

  function makeRoadSegment(index) {
    const group = new THREE.Group();
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(13.2, 28),
      roadMaterial
    );
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    group.add(road);

    const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x60656a, roughness: .86 });
    [-7.15, 7.15].forEach((x) => {
      const shoulder = new THREE.Mesh(new THREE.BoxGeometry(1.0, .08, 28), shoulderMat);
      shoulder.position.set(x, .03, 0);
      group.add(shoulder);

      const rail = new THREE.Mesh(new THREE.BoxGeometry(.12, .34, 28), new THREE.MeshStandardMaterial({ color: 0xa5a8ab, metalness: .7, roughness: .3 }));
      rail.position.set(x + (x < 0 ? -.55 : .55), .42, 0);
      group.add(rail);
    });

    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf4f4f0 });
    [-2.2, 2.2].forEach((x) => {
      for (let z = -11; z <= 11; z += 5.5) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(.12, 2.6), lineMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x, .025, z);
        group.add(dash);
      }
    });

    // Edge markings and reflective studs add speed cues without heavy post-processing.
    [-6.05, 6.05].forEach((x) => {
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(.10, 28), lineMat);
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(x, .027, 0);
      group.add(edge);
    });

    const reflectorMat = new THREE.MeshBasicMaterial({ color: 0xffe7a1 });
    [-6.42, 6.42].forEach((x) => {
      [-9, 0, 9].forEach((z) => {
        const stud = new THREE.Mesh(new THREE.BoxGeometry(.09, .045, .20), reflectorMat);
        stud.position.set(x, .075, z);
        group.add(stud);
      });
    });

    const railPostMat = new THREE.MeshStandardMaterial({ color: 0x8d949a, metalness: .62, roughness: .35 });
    [-7.72, 7.72].forEach((x) => {
      [-10, -3.3, 3.3, 10].forEach((z) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(.10, .72, .10), railPostMat);
        post.position.set(x, .34, z);
        group.add(post);
      });
    });

    if (index === 2) group.add(makeSign());
    if (index === 5) group.add(makeStation('ATAN', -1));
    if (index === 8) group.add(makeBridge());
    if (index === 10) group.add(makeStation('TES', 1));
    if (index === 1) group.add(makeUpgradeBillboard(-1, 0));
    if (index === 4) group.add(makeUpgradeBillboard(1, 1));
    if (index === 9) group.add(makeUpgradeBillboard(-1, 1));
    if (index === 12) group.add(makeUpgradeBillboard(1, 0));

    if (index % 2 === 0) {
      for (const side of [-1, 1]) {
        const tree = makeCypress(3.7 + Math.random() * 2.0);
        tree.position.set(side * (10 + Math.random() * 4), 0, -7 + Math.random() * 14);
        group.add(tree);
      }
    }
    if (index % 4 === 0) {
      group.add(makeRoadLamp(-1));
      group.add(makeRoadLamp(1));
    }
    return group;
  }

  const roadSegments = [];
  const segmentLength = 28;
  const segmentCount = 14;
  const totalRoad = segmentLength * segmentCount;
  for (let i = 0; i < segmentCount; i++) {
    const segment = makeRoadSegment(i);
    segment.position.z = -i * segmentLength;
    scene.add(segment);
    roadSegments.push(segment);
  }

  let player = makeGameCar('bmw', carSpecs['BMW M340i'].color, .72);
  player.position.set(0, .02, 3.4);
  player.rotation.y = 0;
  scene.add(player);
  let playerX = 0;
  let playerTargetX = 0;
  const laneX = [-3.55, 0, 3.55];

  const traffic = [];
  function spawnTrafficCar(z = -65 - Math.random() * 80) {
    const types = ['bmw', 'amg', 'porsche'];
    const type = types[(Math.random() * types.length) | 0];
    const colors = [0xc9c9c9, 0x37485a, 0x7f252b, 0x15181c, 0xa99d83, 0x2f5b76];
    const car = makeGameCar(type, colors[(Math.random() * colors.length) | 0], .67);
    const lane = (Math.random() * 3) | 0;
    car.position.set(laneX[lane], .02, z);
    car.rotation.y = 0;
    car.userData = {
      lane,
      speed: 65 + Math.random() * 70,
      counted: false,
      hit: false
    };
    scene.add(car);
    traffic.push(car);
  }
  for (let i = 0; i < 6; i++) spawnTrafficCar(-55 - i * 25 - Math.random() * 15);

  function respawnTraffic(car) {
    car.userData.lane = (Math.random() * 3) | 0;
    car.position.x = laneX[car.userData.lane];
    car.position.z = -110 - Math.random() * 100;
    car.userData.speed = 65 + Math.random() * 70;
    car.userData.counted = false;
    car.userData.hit = false;
  }

  function rebuildPlayer() {
    scene.remove(player);
    const sharedPlayerGeometry = !!player.userData.sharedGeometry;
    player.traverse((o) => {
      if (o.geometry && !sharedPlayerGeometry) o.geometry.dispose();
      if (o.material && o.material.dispose) o.material.dispose();
    });
    const spec = carSpecs[state.car];
    player = makeGameCar(spec.type, spec.color, .72);
    player.position.set(laneX[state.lane], .02, 3.4);
    player.rotation.y = 0;
    scene.add(player);
  }

  function applyRaceTheme() {
    if (state.track === 'Ночной Симферополь') {
      scene.background = new THREE.Color(0x07101b);
      scene.fog = new THREE.Fog(0x07101b, 22, 125);
      hemi.color.set(0x51627d);
      hemi.groundColor.set(0x12141b);
      hemi.intensity = 1.25;
      sunLight.intensity = .8;
      sun.visible = false;
      sunHalo.visible = false;
      sea.visible = false;
      ground.material.color.set(0x24272b);
    } else if (state.track === 'Южный берег' || state.track === 'Морской маршрут') {
      scene.background = new THREE.Color(0xd39168);
      scene.fog = new THREE.Fog(0xd39168, 35, 175);
      hemi.color.set(0xc8e1ef);
      hemi.groundColor.set(0x57452a);
      hemi.intensity = 2.2;
      sunLight.intensity = 3.8;
      sun.visible = true;
      sunHalo.visible = true;
      sea.visible = true;
      ground.material.color.set(0x8c754e);
    } else {
      scene.background = new THREE.Color(0xc38764);
      scene.fog = new THREE.Fog(0xb88768, 34, 165);
      hemi.color.set(0xb9d7ef);
      hemi.groundColor.set(0x4b351d);
      hemi.intensity = 2.2;
      sunLight.intensity = 3.7;
      sun.visible = true;
      sea.visible = true;
      ground.material.color.set(0xa38657);
    }
  }
  applyRaceTheme();

  function resizeRace() {
    const r = raceCanvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const w = Math.max(2, Math.floor(r.width));
    const h = Math.max(2, Math.floor(r.height));
    if (raceCanvas.width !== w || raceCanvas.height !== h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  function showEvent(text) {
    const banner = one('#eventBanner');
    banner.textContent = text;
    banner.classList.add('show');
    clearTimeout(banner._timer);
    banner._timer = setTimeout(() => banner.classList.remove('show'), 650);
  }

  function updateHud() {
    one('#hudSpeed').textContent = Math.round(state.speed);
    one('#hudScore').textContent = Math.floor(state.score).toLocaleString('ru-RU');
    one('#hudCombo').textContent = state.combo;
    one('#speedVignette').classList.toggle('fast', state.speed > 190);
  }

  function startRace() {
    stopRace();
    applyRaceTheme();
    state.speed = carSpecs[state.car].base;
    state.score = 0;
    state.combo = 1;
    state.distance = 0;
    state.lane = 1;
    state.gas = false;
    state.brake = false;
    state.paused = false;
    state.playing = true;
    state.crashLock = false;
    state.comboTimer = 0;
    state.maxSpeed = state.speed;
    state.nearMisses = 0;
    state.last = performance.now();
    playerTargetX = 0;
    playerX = 0;
    rebuildPlayer();
    traffic.forEach((car, i) => {
      car.position.z = -55 - i * 26 - Math.random() * 15;
      car.userData.counted = false;
      car.userData.hit = false;
    });
    one('#raceLabel').textContent = state.car + ' · ' + state.track;
    one('#pauseBtn').textContent = 'ПАУЗА';
    one('#gameOver').classList.add('hidden');
    resizeRace();
    updateHud();
    state.raf = requestAnimationFrame(raceLoop);
  }

  function stopRace() {
    state.playing = false;
    cancelAnimationFrame(state.raf);
  }

  function moveLane(delta) {
    if (!state.playing || state.paused) return;
    state.lane = Math.max(0, Math.min(2, state.lane + delta));
    playerTargetX = laneX[state.lane];
    player.rotation.z = -delta * .08;
    setTimeout(() => {
      if (player) player.rotation.z = 0;
    }, 170);
  }

  function nearMiss() {
    state.nearMisses += 1;
    state.combo = Math.min(9, state.combo + 1);
    state.comboTimer = 2.4;
    state.score += 420 * state.combo;
    showEvent((state.combo >= 5 ? 'THREAD THE NEEDLE ×' : 'NEAR MISS ×') + state.combo);
  }

  function crash() {
    if (state.crashLock) return;
    state.crashLock = true;
    state.playing = false;
    showEvent('CRASH!');
    player.rotation.z = .3;
    const km = (state.distance / 1000).toFixed(1);
    one('#gameOverResult').textContent =
      Math.floor(state.score).toLocaleString('ru-RU') + ' очков · ' + state.car + ' · ' + state.track;
    const resultSpeed = one('#resultSpeed');
    const resultNear = one('#resultNear');
    const resultDistance = one('#resultDistance');
    if (resultSpeed) resultSpeed.textContent = Math.round(state.maxSpeed);
    if (resultNear) resultNear.textContent = state.nearMisses;
    if (resultDistance) resultDistance.textContent = km;
    setTimeout(() => one('#gameOver').classList.remove('hidden'), 320);
  }

  function raceLoop(now) {
    if (!state.playing) return;
    const dt = Math.min(.034, (now - state.last) / 1000 || .016);
    state.last = now;
    resizeRace();

    if (!state.paused) {
      const spec = carSpecs[state.car];
      const target = state.gas ? spec.max : (state.brake ? 80 : spec.base);
      state.speed += (target - state.speed) * Math.min(1, dt * (state.gas ? 2.15 : 2.75));
      state.maxSpeed = Math.max(state.maxSpeed, state.speed);
      state.distance += state.speed / 3.6 * dt;
      state.score += state.speed * .10 * dt * state.combo;

      const roadDelta = state.speed * .115 * dt;
      for (const seg of roadSegments) {
        seg.position.z += roadDelta;
        if (seg.position.z > segmentLength) seg.position.z -= totalRoad;
      }

      playerX += (playerTargetX - playerX) * Math.min(1, dt * 8.5);
      player.position.x = playerX;
      player.position.y = .02 + Math.sin(now * .018) * .012;

      traffic.forEach((car) => {
        const rel = Math.max(5.5, (state.speed - car.userData.speed) * .19);
        car.position.z += rel * dt;
        car.rotation.z *= .92;

        const dz = Math.abs(car.position.z - player.position.z);
        const dx = Math.abs(car.position.x - player.position.x);

        if (!car.userData.hit && dz < 2.4 && dx < 1.45) {
          car.userData.hit = true;
          crash();
        }

        if (!car.userData.counted && car.position.z > player.position.z + 1.5) {
          car.userData.counted = true;
          if (dx > 1.65 && dx < 4.6) nearMiss();
          else if (dx >= 4.6) {
            state.comboTimer -= .35;
          }
        }

        if (car.position.z > 16) respawnTraffic(car);
      });

      state.comboTimer -= dt;
      if (state.comboTimer <= 0 && state.combo > 1) state.combo = 1;

      const speedRatio = Math.max(0, Math.min(1, (state.speed - 130) / 155));
      camera.fov = 58 + speedRatio * 10;
      camera.position.x += ((playerX * .18) - camera.position.x) * Math.min(1, dt * 3.5);
      camera.position.y = 4.0 + speedRatio * .25 + Math.sin(now * .012) * .018 * speedRatio;
      camera.position.z = 10.3 - speedRatio * .45;
      camera.rotation.z += (((playerTargetX - playerX) * -.006) - camera.rotation.z) * Math.min(1, dt * 4);
      camera.lookAt(playerX * .13, .8, -12);
      camera.updateProjectionMatrix();

      updateHud();
    }

    renderer.render(scene, camera);
    state.raf = requestAnimationFrame(raceLoop);
  }

  one('#leftBtn').addEventListener('click', () => moveLane(-1));
  one('#rightBtn').addEventListener('click', () => moveLane(1));
  one('#retryBtn').addEventListener('click', startRace);

  one('#pauseBtn').addEventListener('click', () => {
    if (!state.playing) return;
    state.paused = !state.paused;
    one('#pauseBtn').textContent = state.paused ? 'ПРОДОЛЖИТЬ' : 'ПАУЗА';
  });

  function hold(el, setter) {
    el.addEventListener('pointerdown', () => setter(true));
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => {
      el.addEventListener(ev, () => setter(false));
    });
  }
  hold(one('#gasBtn'), (v) => { state.gas = v; });
  hold(one('#brakeBtn'), (v) => { state.brake = v; });

  let swipeX = null;
  one('#raceViewport').addEventListener('pointerdown', (e) => { swipeX = e.clientX; });
  one('#raceViewport').addEventListener('pointerup', (e) => {
    if (swipeX === null) return;
    const dx = e.clientX - swipeX;
    if (Math.abs(dx) > 34) moveLane(dx > 0 ? 1 : -1);
    swipeX = null;
  });

  function syncVisualViewport() {
    const vv = window.visualViewport;
    const h = Math.max(320, Math.round(vv ? vv.height : window.innerHeight));
    document.documentElement.style.setProperty('--app-height', h + 'px');
    requestAnimationFrame(() => {
      resizeGarage();
      resizeRace();
    });
  }

  window.addEventListener('resize', syncVisualViewport, { passive: true });
  window.addEventListener('orientationchange', syncVisualViewport, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncVisualViewport, { passive: true });
    window.visualViewport.addEventListener('scroll', syncVisualViewport, { passive: true });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.playing) {
      state.paused = true;
      one('#pauseBtn').textContent = 'ПРОДОЛЖИТЬ';
    }
  });

  syncVisualViewport();
  resizeGarage();
  resizeRace();

  // Load the detailed model after the lightweight scene is already interactive.
  loadDetailedCarAsset().then(() => {
    rebuildGarageCar();
    rebuildPlayer();
    traffic.forEach((car) => scene.remove(car));
    traffic.length = 0;
    for (let i = 0; i < 6; i++) spawnTrafficCar(-55 - i * 25 - Math.random() * 15);
    toast('HD-модели автомобилей загружены');
  }).catch((err) => {
    console.warn('Detailed car model fallback:', err);
  });
})();