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
    nearMisses: 0,
    nextTrafficWave: 650
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
    if (id === 'home') { resizeHome3D(); updateHome3DTheme(); }
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
      const ht=one('#homeTrackName'); if(ht) ht.textContent=state.track;
      const routeTitle=one('#homeRouteTitle'); if(routeTitle) routeTitle.textContent=state.track.toUpperCase();
      applyRaceTheme();
      updateHome3DTheme();
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


  // ---------- v0.5 CAR IDENTITY PASS ----------
  function makeIdentityCar(type, color, scale = 1) {
    const cfg = {
      vesta: { w: 2.04, l: 4.56, h: 1.48, roof: 1.94, hood: 1.20, trunk: .86, wheelbase: 2.68, wheel: .39, ride: .41 },
      bmw:   { w: 2.00, l: 4.72, h: 1.42, roof: 1.90, hood: 1.36, trunk: .82, wheelbase: 2.82, wheel: .40, ride: .40 },
      amg:   { w: 2.06, l: 4.74, h: 1.44, roof: 1.88, hood: 1.33, trunk: .80, wheelbase: 2.84, wheel: .41, ride: .40 },
      porsche:{ w: 1.96, l: 4.45, h: 1.28, roof: 1.72, hood: .94, trunk: .54, wheelbase: 2.45, wheel: .42, ride: .37 }
    }[type] || { w: 2, l: 4.6, h: 1.4, roof: 1.85, hood: 1.2, trunk: .8, wheelbase: 2.7, wheel: .4, ride: .4 };

    const detail = scale > .82 ? 2 : 1;
    const group = new THREE.Group();
    group.name = 'identity-' + type;

    const paint = new THREE.MeshPhysicalMaterial({
      color,
      metalness: .78,
      roughness: type === 'vesta' ? .22 : .19,
      clearcoat: 1,
      clearcoatRoughness: .11
    });
    const paintDark = paint.clone();
    paintDark.color = new THREE.Color(color).multiplyScalar(.60);

    const glass = new THREE.MeshPhysicalMaterial({
      color: type === 'porsche' ? 0x1c2d37 : 0x213640,
      metalness: .08,
      roughness: .10,
      transmission: .10,
      transparent: true,
      opacity: .88
    });
    const dark = new THREE.MeshStandardMaterial({ color: 0x07090c, metalness: .48, roughness: .27 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x9ca4ac, metalness: .94, roughness: .14 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: .70 });
    const rimMat = new THREE.MeshStandardMaterial({
      color: type === 'vesta' ? 0x24282e : 0xadb5bd,
      metalness: .95,
      roughness: .16
    });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xf5fcff, emissive: 0xc9f2ff, emissiveIntensity: 3.0 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2a20, emissive: 0xff160c, emissiveIntensity: 3.4 });
    const amberMat = new THREE.MeshStandardMaterial({ color: 0xffb000, emissive: 0xff8600, emissiveIntensity: 2.6 });

    const addBox=(w,h,l,mat,x=0,y=0,z=0,rx=0,ry=0,rz=0)=>{
      const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,l),mat);
      m.position.set(x,y,z); m.rotation.set(rx,ry,rz);
      m.castShadow=true; m.receiveShadow=true; group.add(m); return m;
    };
    const addPlane=(w,h,mat,x,y,z,ry=0,rz=0)=>{
      const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);
      m.position.set(x,y,z); m.rotation.set(0,ry,rz); group.add(m); return m;
    };

    // Lower body / rocker: gives each car a proper road-going mass instead of a capsule.
    addBox(cfg.w*.93, .42, cfg.l*.91, paintDark, 0, cfg.ride+.30, 0);

    // Main body shell.
    const bodyGeom = new THREE.CapsuleGeometry(.66, Math.max(.8,cfg.l-1.55), 7, 18);
    bodyGeom.rotateX(Math.PI/2);
    const body = new THREE.Mesh(bodyGeom, paint);
    body.scale.set(cfg.w/1.46, .48, 1);
    body.position.y = cfg.ride+.64;
    body.castShadow=true; body.receiveShadow=true; group.add(body);

    // Hood and trunk proportions are unique by model.
    const hoodZ = -cfg.l/2 + cfg.hood/2 + .07;
    addBox(cfg.w*.90, .25, cfg.hood, paint, 0, cfg.ride+.79, hoodZ, -.035);
    if(type!=='porsche'){
      const trunkZ = cfg.l/2 - cfg.trunk/2 - .05;
      addBox(cfg.w*.88, .27, cfg.trunk, paint, 0, cfg.ride+.80, trunkZ, .02);
    }

    // Cabin: Porsche is rear-biased and lower; sedans are longer and more upright.
    const cabinZ = type==='porsche' ? .25 : .03;
    const cabinLen = type==='porsche' ? 1.92 : (type==='vesta'?2.05:2.10);
    const roofGeom = new THREE.CapsuleGeometry(.53, cabinLen, 7, 16);
    roofGeom.rotateX(Math.PI/2);
    const cabin = new THREE.Mesh(roofGeom, glass);
    cabin.scale.set(cfg.roof/1.18, type==='porsche'?.41:.48, 1);
    cabin.position.set(0, cfg.ride+(type==='porsche'?1.05:1.12), cabinZ);
    cabin.castShadow=true; group.add(cabin);

    // Windscreens / rear glass accents.
    addBox(cfg.w*.68,.025,.72,glass,0,cfg.ride+1.13,-.73+cabinZ,-.55);
    addBox(cfg.w*.67,.025,.62,glass,0,cfg.ride+1.12,.78+cabinZ,.55);

    // Side glass / pillars.
    if(detail>1){
      [-1,1].forEach(side=>{
        addBox(.025,.48,1.45,glass,side*cfg.w*.39,cfg.ride+1.10,.02);
        addBox(.055,.52,.07,dark,side*cfg.w*.395,cfg.ride+1.11,-.08);
      });
    }

    // Wheels, brakes, rims.
    const frontZ=-cfg.wheelbase/2, rearZ=cfg.wheelbase/2;
    const wheelGeom=new THREE.CylinderGeometry(cfg.wheel,cfg.wheel,.27,20);
    wheelGeom.rotateZ(Math.PI/2);
    const rimGeom=new THREE.CylinderGeometry(cfg.wheel*.58,cfg.wheel*.58,.285,18);
    rimGeom.rotateZ(Math.PI/2);
    const brakeGeom=new THREE.CylinderGeometry(cfg.wheel*.34,cfg.wheel*.34,.29,18);
    brakeGeom.rotateZ(Math.PI/2);
    [frontZ,rearZ].forEach(z=>[-1,1].forEach(side=>{
      const x=side*(cfg.w/2+.03);
      const wheel=new THREE.Mesh(wheelGeom,rubber); wheel.position.set(x,cfg.ride,z); wheel.castShadow=true; group.add(wheel);
      const rim=new THREE.Mesh(rimGeom,rimMat); rim.position.set(x+side*.01,cfg.ride,z); group.add(rim);
      const brake=new THREE.Mesh(brakeGeom,type==='vesta'?amberMat:dark); brake.position.set(x+side*.018,cfg.ride,z); group.add(brake);
      if(detail>1){
        for(let a=0;a<5;a++){
          const spoke=addBox(.035,cfg.wheel*.92,.035,rimMat,x+side*.155,cfg.ride,z,Math.PI/2,0,a*Math.PI/5);
          spoke.rotation.x=Math.PI/2;
        }
      }
    }));

    // Mirrors.
    if(detail>1){
      [-1,1].forEach(side=>{
        addBox(.26,.12,.18,paint,side*(cfg.w/2+.12),cfg.ride+1.10,-.42,0,0,side*.10);
        addBox(.17,.035,.11,glass,side*(cfg.w/2+.135),cfg.ride+1.12,-.50,0,0,side*.10);
      });
    }

    const frontZPlane=-cfg.l/2-.03;
    const rearZPlane= cfg.l/2+.03;

    // MODEL-SPECIFIC FACES / SIGNATURES
    if(type==='bmw'){
      // Low, modern BMW-style nose with twin kidneys and slim light signature.
      const bumper=makeRoundedBumper(1.92,.42,.19,paintDark);
      bumper.position.set(0,.59,nose+.05);
      group.add(bumper);

      [-.235,.235].forEach(x=>{
        const outer=new THREE.Mesh(new THREE.CapsuleGeometry(.17,.17,4,12),chrome);
        outer.scale.set(1.0,1.25,.18);
        outer.position.set(x,.72,nose-.015);
        outer.rotation.x=Math.PI/2;
        group.add(outer);
        const inner=new THREE.Mesh(new THREE.CapsuleGeometry(.135,.135,4,12),black);
        inner.scale.set(1.0,1.20,.20);
        inner.position.set(x,.72,nose-.025);
        inner.rotation.x=Math.PI/2;
        group.add(inner);
      });

      [-1,1].forEach(side=>{
        addLampBar(group,.58,.092,nose,.89,side*.63,head,-side*.12);
        addLampBar(group,.26,.030,nose-.012,.875,side*.62,black,-side*.12);
      });
      addLampBar(group,1.62,.10,nose,.47,0,black);

      // Rear deck and G20-like L lamp graphic.
      const deck=new THREE.Mesh(new THREE.BoxGeometry(1.72,.12,.56),paint);
      deck.position.set(0,.89,tailZ-.28);
      deck.rotation.x=.015;
      deck.castShadow=true;
      group.add(deck);

      [-1,1].forEach(side=>{
        addLampBar(group,.61,.085,tailZ,.88,side*.59,tail,side*.055);
        addLampBar(group,.24,.075,tailZ-.012,.82,side*.82,tail,-side*.18);
        addLampBar(group,.18,.15,tailZ-.008,.77,side*.88,tail);
      });

      const rearBumper=makeRoundedBumper(1.88,.38,.18,paintDark);
      rearBumper.position.set(0,.49,tailZ-.05);
      group.add(rearBumper);
      addLampBar(group,1.50,.075,tailZ+.018,.40,0,black);

      // twin large exhaust outlets
      [-.62,.62].forEach(x=>{
        const tip=new THREE.Mesh(new THREE.CylinderGeometry(.10,.115,.24,16),chrome);
        tip.rotation.x=Math.PI/2;
        tip.position.set(x,.365,tailZ+.105);
        group.add(tip);
      });
    }

    if(type==='vesta'){
      // Distinct X-face and high shoulder line.
      const bumper=makeRoundedBumper(1.96,.44,.20,paintDark);
      bumper.position.set(0,.61,nose+.04);
      group.add(bumper);
      const grill=new THREE.Mesh(new THREE.BoxGeometry(1.05,.28,.065),black);
      grill.position.set(0,.68,nose-.015); group.add(grill);

      [-1,1].forEach(side=>{
        const slash1=new THREE.Mesh(new THREE.BoxGeometry(.085,.72,.050),chrome);
        slash1.position.set(side*.48,.77,nose-.025); slash1.rotation.z=side*.58; group.add(slash1);
        const slash2=slash1.clone(); slash2.rotation.z=-side*.58; group.add(slash2);
        addLampBar(group,.52,.105,nose,.96,side*.63,head,-side*.12);
      });

      // body-colour fender extensions + deep skirts
      [frontZ,rearZ].forEach(z=>[-1,1].forEach(side=>{
        const flare=new THREE.Mesh(new THREE.BoxGeometry(.18,.38,.94),paintDark);
        flare.position.set(side*(spec.halfW+.12),.52,z);
        flare.rotation.z=side*.03;
        group.add(flare);
      }));
      [-1,1].forEach(side=>{
        const skirt=new THREE.Mesh(new THREE.BoxGeometry(.16,.15,2.42),black);
        skirt.position.set(side*(spec.halfW+.09),.31,.04);
        group.add(skirt);
        // signature side crease as a slim diagonal accent
        const crease=new THREE.Mesh(new THREE.BoxGeometry(.045,.045,1.35),chrome);
        crease.position.set(side*(spec.halfW+.07),.77,.25);
        crease.rotation.x=.62;
        group.add(crease);
      });

      // rear trunk ledge / wing / angular tail lamps
      const trunkLid=new THREE.Mesh(new THREE.BoxGeometry(1.74,.11,.58),paint);
      trunkLid.position.set(0,.92,tailZ-.30);
      group.add(trunkLid);
      const wing=new THREE.Mesh(new THREE.BoxGeometry(2.16,.075,.29),black);
      wing.position.set(0,1.35,tailZ-.35); group.add(wing);
      [-.68,.68].forEach(x=>{
        const p=new THREE.Mesh(new THREE.BoxGeometry(.07,.46,.07),black);
        p.position.set(x,1.12,tailZ-.44); group.add(p);
      });

      [-1,1].forEach(side=>{
        addLampBar(group,.62,.095,tailZ,.90,side*.58,tail,side*.10);
        addLampBar(group,.19,.13,tailZ-.008,.82,side*.84,tail,-side*.10);
      });

      const diffuser=new THREE.Mesh(new THREE.BoxGeometry(1.72,.16,.22),black);
      diffuser.position.set(0,.34,tailZ-.08); group.add(diffuser);
      [-.58,.58].forEach(x=>{
        const tip=new THREE.Mesh(new THREE.CylinderGeometry(.10,.10,.24,14),chrome);
        tip.rotation.x=Math.PI/2; tip.position.set(x,.365,tailZ+.10); group.add(tip);
      });

      const glow=new THREE.PointLight(0xff2418,10,7,2);
      glow.position.set(0,.17,0); glow.name='underGlow'; group.add(glow);
      const disc=new THREE.Mesh(
        new THREE.CircleGeometry(1.72,32),
        new THREE.MeshBasicMaterial({color:0xff2418,transparent:true,opacity:.18,depthWrite:false})
      );
      disc.rotation.x=-Math.PI/2; disc.position.y=.025; group.add(disc);
    }

    if(type==='amg'){
      // Panamericana-inspired vertical grille.
      addBox(1.28,.46,.065,dark,0,cfg.ride+.73,frontZPlane);
      for(let x=-.48;x<=.48;x+=.16) addBox(.035,.39,.04,trim,x,cfg.ride+.73,frontZPlane-.035);
      [-.68,.68].forEach(side=>{
        addBox(.58,.11,.05,headMat,side*.62,cfg.ride+.94,frontZPlane,0,0,-side*.14);
      });
      addBox(1.80,.15,.06,dark,0,cfg.ride+.47,frontZPlane);
      // broad rear lamps + quad exhaust
      [-.64,.64].forEach(side=>addBox(.62,.11,.05,tailMat,side*.60,cfg.ride+.91,rearZPlane));
      [-.70,-.32,.32,.70].forEach(x=>{
        const tip=new THREE.Mesh(new THREE.CylinderGeometry(.085,.085,.20,12),trim);
        tip.rotation.x=Math.PI/2; tip.position.set(x,cfg.ride+.37,rearZPlane+.07); group.add(tip);
      });
      addBox(1.86,.16,.20,dark,0,cfg.ride+.34,rearZPlane-.07);
    }

    if(type==='porsche'){
      // Low rounded front and large round headlights.
      addBox(cfg.w*.84,.26,.66,paint,0,cfg.ride+.68,frontZPlane+.34,-.06);
      [-.60,.60].forEach(side=>{
        const lamp=new THREE.Mesh(new THREE.CircleGeometry(.22,24),headMat);
        lamp.rotation.y=Math.PI; lamp.position.set(side*.58,cfg.ride+.91,frontZPlane-.005); group.add(lamp);
        if(detail>1){
          const ring=new THREE.Mesh(new THREE.TorusGeometry(.225,.018,8,24),trim);
          ring.rotation.y=Math.PI/2; ring.position.copy(lamp.position); group.add(ring);
        }
      });
      // full-width rear light bar and centered dark diffuser.
      addBox(1.65,.075,.05,tailMat,0,cfg.ride+.83,rearZPlane);
      addBox(1.52,.15,.21,dark,0,cfg.ride+.34,rearZPlane-.08);
      [-.38,.38].forEach(x=>{
        const tip=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,.18,12),trim);
        tip.rotation.x=Math.PI/2; tip.position.set(x,cfg.ride+.36,rearZPlane+.06); group.add(tip);
      });
      // ducktail line
      addBox(1.55,.055,.23,dark,0,cfg.ride+1.02,rearZPlane-.22);
    }

    // subtle underbody / contact shadow
    const shadow=new THREE.Mesh(
      new THREE.CircleGeometry(type==='porsche'?1.48:1.62,28),
      new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.24,depthWrite:false})
    );
    shadow.rotation.x=-Math.PI/2; shadow.scale.z=1.55; shadow.position.y=.015; group.add(shadow);

    group.scale.setScalar(scale);
    group.userData.identityCar=true;
    return group;
  }



  // ---------- v0.8 BODY SILHOUETTE REFINEMENT ----------
  function loftShellRounded(stations, material, shoulder=.84) {
    const pos=[];
    const idx=[];
    const ringCount=6;
    for(const s of stations){
      const h=Math.max(.08,s.top-s.bot);
      const mid=s.bot+h*.56;
      const topW=s.w*shoulder;
      pos.push(
        -s.w, s.bot, s.z,
        -s.w, mid, s.z,
        -topW, s.top, s.z,
         topW, s.top, s.z,
         s.w, mid, s.z,
         s.w, s.bot, s.z
      );
    }
    for(let i=0;i<stations.length-1;i++){
      const a=i*ringCount,b=(i+1)*ringCount;
      for(let j=0;j<ringCount;j++){
        const j2=(j+1)%ringCount;
        idx.push(a+j,b+j,a+j2, a+j2,b+j,b+j2);
      }
    }
    const first=0,last=(stations.length-1)*ringCount;
    idx.push(first,first+1,first+2, first,first+2,first+3, first,first+3,first+4, first,first+4,first+5);
    idx.push(last,last+2,last+1, last,last+3,last+2, last,last+4,last+3, last,last+5,last+4);
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m=new THREE.Mesh(g,material);
    m.castShadow=true;
    m.receiveShadow=true;
    return m;
  }

  function addFenderArch(group, x, y, z, radius, material) {
    const arch=new THREE.Mesh(new THREE.TorusGeometry(radius+.08,.065,8,28),material);
    arch.rotation.y=Math.PI/2;
    arch.position.set(x,y,z);
    arch.scale.y=.92;
    group.add(arch);
    return arch;
  }

  function makeRoundedBumper(width,height,depth,material) {
    const g=new THREE.CapsuleGeometry(height*.48,Math.max(.08,width-height),5,14);
    g.rotateZ(Math.PI/2);
    const m=new THREE.Mesh(g,material);
    m.scale.set(1,1,depth/Math.max(.01,height));
    m.castShadow=true;
    return m;
  }

  // ---------- v0.6 REAL-SHAPE CAR PASS ----------
  function loftShell(stations, material) {
    const positions = [];
    const indices = [];
    for (const s of stations) {
      positions.push(
        -s.w, s.bot, s.z,
         s.w, s.bot, s.z,
        -s.w, s.top, s.z,
         s.w, s.top, s.z
      );
    }
    for (let i = 0; i < stations.length - 1; i++) {
      const a=i*4, b=(i+1)*4;
      // bottom
      indices.push(a,a+1,b+1, a,b+1,b);
      // roof / upper
      indices.push(a+2,b+3,a+3, a+2,b+2,b+3);
      // left side
      indices.push(a,b,a+2, a+2,b,b+2);
      // right side
      indices.push(a+1,a+3,b+1, a+3,b+3,b+1);
    }
    const last=(stations.length-1)*4;
    indices.push(0,2,1, 1,2,3);
    indices.push(last,last+1,last+2, last+1,last+3,last+2);
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setIndex(indices);
    g.computeVertexNormals();
    const mesh=new THREE.Mesh(g,material);
    mesh.castShadow=true;
    mesh.receiveShadow=true;
    return mesh;
  }

  function makeRealWheel(radius, width, rimColor, brakeColor) {
    const group=new THREE.Group();
    const tireMat=new THREE.MeshStandardMaterial({color:0x060708,roughness:.78,metalness:.06});
    const rimMat=new THREE.MeshStandardMaterial({color:rimColor,metalness:.95,roughness:.15});
    const discMat=new THREE.MeshStandardMaterial({color:0x747b82,metalness:.86,roughness:.28});
    const brakeMat=new THREE.MeshStandardMaterial({color:brakeColor,metalness:.45,roughness:.32});

    const tire=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,width,28),tireMat);
    tire.rotation.z=Math.PI/2;
    tire.castShadow=true;
    group.add(tire);

    const rim=new THREE.Mesh(new THREE.CylinderGeometry(radius*.62,radius*.62,width+.018,24),rimMat);
    rim.rotation.z=Math.PI/2;
    group.add(rim);

    const disc=new THREE.Mesh(new THREE.CylinderGeometry(radius*.43,radius*.43,width+.025,24),discMat);
    disc.rotation.z=Math.PI/2;
    group.add(disc);

    for(let a=0;a<5;a++){
      const spoke=new THREE.Mesh(new THREE.BoxGeometry(width+.035,radius*.08,radius*.92),rimMat);
      spoke.rotation.set(0,a*Math.PI/5,0);
      group.add(spoke);
    }

    const caliper=new THREE.Mesh(new THREE.BoxGeometry(width+.04,radius*.30,radius*.12),brakeMat);
    caliper.position.set(0,radius*.12,-radius*.34);
    group.add(caliper);
    return group;
  }

  function addLampBar(group, w, h, z, y, x, material, rz=0) {
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,.055),material);
    m.position.set(x,y,z);
    m.rotation.z=rz;
    group.add(m);
    return m;
  }

  function makeIdentityCarV2(type, color, scale=1) {
    const group=new THREE.Group();
    group.name='realshape-'+type;

    const paint=new THREE.MeshPhysicalMaterial({
      color,
      metalness:.74,
      roughness:type==='vesta'?.24:.18,
      clearcoat:1,
      clearcoatRoughness:.10
    });
    const paintDark=paint.clone();
    paintDark.color=new THREE.Color(color).multiplyScalar(.58);
    const glass=new THREE.MeshPhysicalMaterial({
      color:0x14242d,
      metalness:.10,
      roughness:.08,
      transmission:.08,
      transparent:true,
      opacity:.90
    });
    const black=new THREE.MeshStandardMaterial({color:0x06080b,metalness:.52,roughness:.28});
    const chrome=new THREE.MeshStandardMaterial({color:0xb7bec5,metalness:.95,roughness:.12});
    const head=new THREE.MeshStandardMaterial({color:0xeafcff,emissive:0xbceeff,emissiveIntensity:1.8});
    const tail=new THREE.MeshStandardMaterial({color:0xd90f18,emissive:0xff0712,emissiveIntensity:1.55});
    const amber=new THREE.MeshStandardMaterial({color:0xffa20a,emissive:0xff7b00,emissiveIntensity:1.4});

    const spec = {
      bmw:{
        halfW:1.00,wheelR:.405,wheelbase:2.84,ride:.39,
        body:[
          {z:-2.38,w:.76,bot:.38,top:.60},{z:-2.18,w:.87,bot:.38,top:.69},
          {z:-1.78,w:.97,bot:.38,top:.79},{z:-1.28,w:1.01,bot:.38,top:.84},
          {z:-.62,w:1.02,bot:.38,top:.88},{z:.18,w:1.02,bot:.38,top:.90},
          {z:.92,w:1.02,bot:.38,top:.89},{z:1.52,w:1.01,bot:.38,top:.83},
          {z:1.98,w:.96,bot:.39,top:.77},{z:2.34,w:.84,bot:.39,top:.69}
        ],
        cabin:[
          {z:-.82,w:.66,bot:.83,top:.91},{z:-.57,w:.74,bot:.84,top:1.15},
          {z:-.22,w:.80,bot:.85,top:1.31},{z:.35,w:.81,bot:.86,top:1.36},
          {z:.78,w:.76,bot:.86,top:1.28},{z:1.12,w:.63,bot:.83,top:1.02}
        ]
      },
      vesta:{
        halfW:1.03,wheelR:.405,wheelbase:2.64,ride:.415,
        body:[
          {z:-2.27,w:.78,bot:.40,top:.64},{z:-2.06,w:.91,bot:.40,top:.74},
          {z:-1.66,w:1.00,bot:.40,top:.84},{z:-1.18,w:1.04,bot:.40,top:.91},
          {z:-.52,w:1.05,bot:.40,top:.96},{z:.30,w:1.05,bot:.40,top:.99},
          {z:1.02,w:1.04,bot:.40,top:.96},{z:1.52,w:1.03,bot:.40,top:.90},
          {z:1.94,w:.98,bot:.41,top:.84},{z:2.23,w:.88,bot:.41,top:.76}
        ],
        cabin:[
          {z:-.84,w:.68,bot:.89,top:.98},{z:-.55,w:.77,bot:.90,top:1.18},
          {z:-.16,w:.84,bot:.91,top:1.37},{z:.46,w:.84,bot:.92,top:1.44},
          {z:.88,w:.78,bot:.91,top:1.34},{z:1.17,w:.66,bot:.88,top:1.09}
        ]
      },
      amg:{
        halfW:1.04,wheelR:.41,wheelbase:2.83,ride:.40,
        body:[
          {z:-2.32,w:.86,bot:.39,top:.67},{z:-2.02,w:.98,bot:.39,top:.79},
          {z:-1.40,w:1.04,bot:.39,top:.89},{z:-.48,w:1.05,bot:.39,top:.96},
          {z:.55,w:1.05,bot:.39,top:.97},{z:1.45,w:1.03,bot:.39,top:.89},
          {z:2.28,w:.91,bot:.40,top:.77}
        ],
        cabin:[
          {z:-.80,w:.72,bot:.88,top:1.00},{z:-.42,w:.80,bot:.88,top:1.34},
          {z:.55,w:.80,bot:.90,top:1.39},{z:1.00,w:.67,bot:.87,top:1.08}
        ]
      },
      porsche:{
        halfW:.99,wheelR:.42,wheelbase:2.45,ride:.37,
        body:[
          {z:-2.18,w:.70,bot:.36,top:.58},{z:-1.86,w:.91,bot:.36,top:.69},
          {z:-1.18,w:.98,bot:.36,top:.80},{z:-.40,w:.99,bot:.36,top:.91},
          {z:.42,w:1.00,bot:.36,top:.98},{z:1.22,w:1.01,bot:.36,top:.93},
          {z:2.16,w:.91,bot:.37,top:.72}
        ],
        cabin:[
          {z:-.55,w:.66,bot:.82,top:.91},{z:-.15,w:.77,bot:.84,top:1.20},
          {z:.53,w:.76,bot:.85,top:1.30},{z:1.10,w:.61,bot:.82,top:1.01}
        ]
      }
    }[type];

    const refined = type==='bmw' || type==='vesta';
    const body=refined ? loftShellRounded(spec.body,paint,type==='bmw'?.82:.84) : loftShell(spec.body,paint);
    group.add(body);
    const cabin=refined ? loftShellRounded(spec.cabin,glass,type==='bmw'?.78:.80) : loftShell(spec.cabin,glass);
    group.add(cabin);

    // roof cap and side sills
    const roofZ=type==='porsche'?.45:(type==='bmw'?.35:.34);
    const roofW=type==='porsche' ? .63 : (type==='bmw'?.66:.70);
    const roofY=type==='porsche' ? 1.28 : (type==='bmw'?1.355:1.43);
    const roof=new THREE.Mesh(new THREE.BoxGeometry(roofW*2,.050,type==='porsche'?.82:(type==='bmw'?.92:1.02)),paint);
    roof.position.set(0,roofY,roofZ);
    roof.castShadow=true;
    group.add(roof);

    [-1,1].forEach(side=>{
      const sill=new THREE.Mesh(new THREE.BoxGeometry(.12,.15,2.45),black);
      sill.position.set(side*(spec.halfW+.04),.34,.02);
      group.add(sill);
    });

    // wheels
    const frontZ=-spec.wheelbase/2;
    const rearZ= spec.wheelbase/2;
    const rimColor=type==='vesta'?0x2a2e34:0xb1b8bf;
    const brakeColor=type==='bmw'?0x3f8cff:(type==='vesta'?0xffa100:0xd11920);
    [frontZ,rearZ].forEach(z=>[-1,1].forEach(side=>{
      const wheel=makeRealWheel(spec.wheelR,.29,rimColor,brakeColor);
      wheel.position.set(side*(spec.halfW+.10),spec.ride,z);
      group.add(wheel);
      if(refined) addFenderArch(group,side*(spec.halfW+.055),spec.ride+.01,z,spec.wheelR,paintDark);
    }));

    // mirrors
    [-1,1].forEach(side=>{
      const mirror=new THREE.Mesh(new THREE.BoxGeometry(.28,.11,.18),paint);
      mirror.position.set(side*(spec.halfW+.16),1.04,-.45);
      mirror.rotation.z=side*.06;
      group.add(mirror);
    });

    const nose=spec.body[0].z-.035;
    const tailZ=spec.body[spec.body.length-1].z+.035;

    if(type==='bmw'){
      // kidney grille frame
      [-.22,.22].forEach(x=>{
        const outer=new THREE.Mesh(new THREE.BoxGeometry(.37,.43,.055),chrome);
        outer.position.set(x,.70,nose); group.add(outer);
        const inner=new THREE.Mesh(new THREE.BoxGeometry(.30,.36,.065),black);
        inner.position.set(x,.70,nose-.01); group.add(inner);
      });
      [-.66,.66].forEach(side=>{
        addLampBar(group,.52,.105,nose,.87,side*.62,head,-side*.08);
        addLampBar(group,.52,.09,tailZ,.86,side*.60,tail,side*.06);
        addLampBar(group,.11,.22,tailZ,.79,side*.82,tail);
      });
      addLampBar(group,1.58,.12,nose,.49,0,black);
      addLampBar(group,1.48,.10,tailZ,.42,0,black);
    }

    if(type==='vesta'){
      const grill=new THREE.Mesh(new THREE.BoxGeometry(1.04,.29,.06),black);
      grill.position.set(0,.67,nose); group.add(grill);
      [-1,1].forEach(side=>{
        const slash1=new THREE.Mesh(new THREE.BoxGeometry(.09,.72,.055),chrome);
        slash1.position.set(side*.49,.77,nose-.01); slash1.rotation.z=side*.57; group.add(slash1);
        const slash2=slash1.clone(); slash2.rotation.z=-side*.57; group.add(slash2);
        addLampBar(group,.48,.12,nose,.95,side*.62,head,-side*.10);
      });
      // widebody lips
      [frontZ,rearZ].forEach(z=>[-1,1].forEach(side=>{
        const flare=new THREE.Mesh(new THREE.BoxGeometry(.16,.34,.88),paintDark);
        flare.position.set(side*(spec.halfW+.13),.52,z); group.add(flare);
      }));
      // wing
      const wing=new THREE.Mesh(new THREE.BoxGeometry(2.18,.08,.30),black);
      wing.position.set(0,1.38,tailZ-.36); group.add(wing);
      [-.68,.68].forEach(x=>{
        const p=new THREE.Mesh(new THREE.BoxGeometry(.07,.50,.07),black);
        p.position.set(x,1.13,tailZ-.46); group.add(p);
      });
      [-.61,.61].forEach(side=>addLampBar(group,.60,.10,tailZ,.90,side*.59,tail,side*.10));
      const glow=new THREE.PointLight(0xff2418,10,7,2);
      glow.position.set(0,.17,0); glow.name='underGlow'; group.add(glow);
      const disc=new THREE.Mesh(
        new THREE.CircleGeometry(1.72,32),
        new THREE.MeshBasicMaterial({color:0xff2418,transparent:true,opacity:.18,depthWrite:false})
      );
      disc.rotation.x=-Math.PI/2; disc.position.y=.025; group.add(disc);
    }

    if(type==='amg'){
      const grille=new THREE.Mesh(new THREE.BoxGeometry(1.30,.46,.06),black);
      grille.position.set(0,.72,nose); group.add(grille);
      for(let x=-.48;x<=.48;x+=.16){
        const slat=new THREE.Mesh(new THREE.BoxGeometry(.028,.40,.065),chrome);
        slat.position.set(x,.72,nose-.01); group.add(slat);
      }
      [-.67,.67].forEach(side=>{
        addLampBar(group,.55,.10,nose,.91,side*.61,head,-side*.11);
        addLampBar(group,.58,.10,tailZ,.87,side*.60,tail);
      });
      [-.70,-.32,.32,.70].forEach(x=>{
        const tip=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,.18,12),chrome);
        tip.rotation.x=Math.PI/2; tip.position.set(x,.39,tailZ+.06); group.add(tip);
      });
    }

    if(type==='porsche'){
      // slightly domed hood
      const hood=new THREE.Mesh(new THREE.SphereGeometry(.95,20,10,0,Math.PI*2,0,Math.PI/2),paint);
      hood.scale.set(1.0,.28,.78);
      hood.rotation.x=Math.PI;
      hood.position.set(0,.78,-1.55);
      group.add(hood);
      [-.58,.58].forEach(side=>{
        const lamp=new THREE.Mesh(new THREE.CircleGeometry(.215,28),head);
        lamp.position.set(side*.58,.89,nose-.004); lamp.rotation.y=Math.PI; group.add(lamp);
        const ring=new THREE.Mesh(new THREE.TorusGeometry(.22,.014,8,28),chrome);
        ring.position.copy(lamp.position); ring.rotation.y=Math.PI/2; group.add(ring);
      });
      addLampBar(group,1.64,.075,tailZ,.84,0,tail);
      const duck=new THREE.Mesh(new THREE.BoxGeometry(1.52,.055,.22),black);
      duck.position.set(0,1.00,tailZ-.22); group.add(duck);
    }

    // license plate + lower diffuser help the rear read as a real car in chase/garage view.
    const plateMat=new THREE.MeshBasicMaterial({color:0xe8e8e3});
    const plate=new THREE.Mesh(new THREE.PlaneGeometry(.52,.14),plateMat);
    plate.position.set(0,.66,tailZ+.004); plate.rotation.y=Math.PI; group.add(plate);
    const diffuser=new THREE.Mesh(new THREE.BoxGeometry(type==='porsche'?1.45:1.62,.15,.20),black);
    diffuser.position.set(0,.33,tailZ-.08); group.add(diffuser);

    const shadow=new THREE.Mesh(
      new THREE.CircleGeometry(type==='porsche'?1.48:1.62,28),
      new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.22,depthWrite:false})
    );
    shadow.rotation.x=-Math.PI/2; shadow.scale.z=1.60; shadow.position.y=.018; group.add(shadow);

    group.scale.setScalar(scale);
    group.userData.identityCar=true;
    return group;
  }

  function makeGameCar(type, color, scale = 1) {
    return makeIdentityCarV2(type, color, scale);
  }


  // ---------- v1.1 LIVE HOME HERO ----------
  const homeCanvas=one('#home3d');
  let homeRenderer=null,homeScene=null,homeCamera=null,homeCar=null,homeRoad=null,homeRoadMarks=null,homeSun=null;
  let homeLast=0,homeAnim=0;

  function initHome3D(){
    if(!homeCanvas || homeRenderer) return;
    try{
      homeRenderer=new THREE.WebGLRenderer({canvas:homeCanvas,antialias:true,alpha:true,powerPreference:'high-performance'});
      homeRenderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.15));
      homeRenderer.outputColorSpace=THREE.SRGBColorSpace;
      homeRenderer.toneMapping=THREE.ACESFilmicToneMapping;
      homeRenderer.toneMappingExposure=1.18;

      homeScene=new THREE.Scene();
      homeScene.fog=new THREE.Fog(0xc68661,16,70);
      homeCamera=new THREE.PerspectiveCamera(44,1,.1,120);
      homeCamera.position.set(4.65,2.24,7.35);
      homeCamera.lookAt(0,.68,.10);

      homeScene.add(new THREE.HemisphereLight(0xcde1f0,0x34291f,2.15));
      const key=new THREE.DirectionalLight(0xffcf96,4.4);
      key.position.set(-5,9,6); homeScene.add(key);
      const rim=new THREE.DirectionalLight(0x74afff,1.45);
      rim.position.set(6,4,-7); homeScene.add(rim);

      const roadMat=new THREE.MeshStandardMaterial({color:0x24272b,roughness:.92,metalness:.02});
      homeRoad=new THREE.Mesh(new THREE.PlaneGeometry(12.5,55),roadMat);
      homeRoad.rotation.x=-Math.PI/2;
      homeRoad.position.set(0,-.03,-16);
      homeScene.add(homeRoad);

      homeRoadMarks=new THREE.Group();
      const white=new THREE.MeshBasicMaterial({color:0xf5f4ef});
      [-2.15,2.15].forEach((x)=>{
        for(let z=-39;z<7;z+=5.5){
          const d=new THREE.Mesh(new THREE.PlaneGeometry(.11,2.7),white);
          d.rotation.x=-Math.PI/2; d.position.set(x,.005,z);
          homeRoadMarks.add(d);
        }
      });
      homeScene.add(homeRoadMarks);

      const railMat=new THREE.MeshStandardMaterial({color:0x9da3a8,metalness:.7,roughness:.32});
      [-6.0,6.0].forEach((x)=>{
        const r=new THREE.Mesh(new THREE.BoxGeometry(.12,.28,50),railMat);
        r.position.set(x,.25,-15); homeScene.add(r);
      });

      // simple silhouette hills
      for(let n=0;n<10;n++){
        const hill=new THREE.Mesh(
          new THREE.ConeGeometry(4+Math.random()*7,5+Math.random()*9,7),
          new THREE.MeshStandardMaterial({color:n%2?0x5f5d54:0x696259,roughness:1})
        );
        hill.position.set((Math.random()>.5?1:-1)*(10+Math.random()*18),2.0,-18-Math.random()*38);
        hill.scale.x=1.4+Math.random();
        homeScene.add(hill);
      }

      homeSun=new THREE.Mesh(new THREE.SphereGeometry(1.15,18,12),new THREE.MeshBasicMaterial({color:0xffd590}));
      homeSun.position.set(13,8,-38); homeScene.add(homeSun);

      rebuildHomeCar();
      updateHome3DTheme();
      resizeHome3D();
      document.body.classList.add('home3d-ready');
      homeAnim=requestAnimationFrame(homeLoop);
    }catch(err){
      console.warn('Home3D fallback:',err);
    }
  }

  function rebuildHomeCar(){
    if(!homeScene) return;
    if(homeCar){
      homeScene.remove(homeCar);
      homeCar.traverse((o)=>{ if(o.material?.dispose) o.material.dispose(); });
    }
    const spec=carSpecs[state.car];
    homeCar=makeGameCar(spec.type,spec.color,1.10);
    homeCar.position.set(.3,.02,.8);
    homeCar.rotation.y=-.34;
    homeScene.add(homeCar);
  }

  function updateHome3DTheme(){
    if(!homeScene) return;
    const track=state.track;
    if(track==='Ночной Симферополь'){
      homeScene.background=new THREE.Color(0x07101b);
      homeScene.fog=new THREE.Fog(0x07101b,12,58);
      homeRenderer.toneMappingExposure=1.35;
      homeSun.visible=false;
      homeRoad.material.color.set(0x111418);
    } else if(track==='Южный берег'){
      homeScene.background=new THREE.Color(0xd48f6b);
      homeScene.fog=new THREE.Fog(0xd48f6b,18,72);
      homeRenderer.toneMappingExposure=1.18;
      homeSun.visible=true;
      homeRoad.material.color.set(0x28292b);
    } else if(track==='Морской маршрут'){
      homeScene.background=new THREE.Color(0xd98f67);
      homeScene.fog=new THREE.Fog(0xd98f67,18,74);
      homeRenderer.toneMappingExposure=1.20;
      homeSun.visible=true;
      homeRoad.material.color.set(0x292a2d);
    } else {
      homeScene.background=new THREE.Color(0xc88967);
      homeScene.fog=new THREE.Fog(0xc88967,18,70);
      homeRenderer.toneMappingExposure=1.18;
      homeSun.visible=true;
      homeRoad.material.color.set(0x282a2d);
    }
  }

  function resizeHome3D(){
    if(!homeRenderer||!homeCanvas) return;
    const r=homeCanvas.getBoundingClientRect();
    if(!r.width||!r.height) return;
    homeRenderer.setSize(Math.max(2,Math.floor(r.width)),Math.max(2,Math.floor(r.height)),false);
    homeCamera.aspect=r.width/r.height;
    homeCamera.updateProjectionMatrix();
  }

  function homeLoop(now){
    if(homeRenderer && state.screen==='home'){
      const dt=Math.min(.04,(now-homeLast)/1000||.016); homeLast=now;
      resizeHome3D();
      if(homeCar){
        homeCar.rotation.y += dt*.075;
        homeCar.position.y=.025+Math.sin(now*.0014)*.012;
      }
      if(homeRoadMarks){
        homeRoadMarks.position.z=(now*.006)%5.5;
      }
      homeRenderer.render(homeScene,homeCamera);
    }
    homeAnim=requestAnimationFrame(homeLoop);
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
  garageCamera.position.set(5.05, 2.48, 6.75);
  garageCamera.lookAt(0, 0.76, 0);

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

  let garageCar = makeGameCar('bmw', carSpecs['BMW M340i'].color, 1.20);
  garageCar.rotation.y = -0.78;
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
    const garageScale = (spec.type==='bmw'||spec.type==='vesta') ? 1.20 : 1.13;
    garageCar = makeGameCar(spec.type, spec.color, garageScale);
    garageCar.rotation.y = spec.type==='bmw' ? -0.78 : (spec.type==='vesta' ? -0.70 : -0.60);
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
      const hc=one('#homeCarName'); if(hc) hc.textContent=state.car;
      const hcc=one('#homeCarClass');
      if(hcc){
        const parts=(carSpecs[state.car]?.label||'S · 642').split('·').map((x)=>x.trim());
        const badge=hcc.querySelector('i');
        const score=hcc.querySelector('b');
        if(badge) badge.textContent=parts[0]||'S';
        if(score) score.textContent=parts[1]||'642';
      }
      rebuildHomeCar();
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

  function makeSoftLightTexture() {
    const cv=document.createElement('canvas');
    cv.width=cv.height=128;
    const ctx=cv.getContext('2d');
    const g=ctx.createRadialGradient(64,64,3,64,64,64);
    g.addColorStop(0,'rgba(255,231,175,.95)');
    g.addColorStop(.26,'rgba(255,205,120,.42)');
    g.addColorStop(1,'rgba(255,190,90,0)');
    ctx.fillStyle=g; ctx.fillRect(0,0,128,128);
    const tex=new THREE.CanvasTexture(cv);
    tex.colorSpace=THREE.SRGBColorSpace;
    return tex;
  }
  const nightLightTexture=makeSoftLightTexture();


  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 450);
  camera.position.set(0, 3.85, 11.75);

  const hemi = new THREE.HemisphereLight(0xb9d7ef, 0x4b351d, 2.2);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xffd6a0, 3.7);
  sunLight.position.set(-6, 12, 7);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  scene.add(sunLight);


  const moonLight=new THREE.DirectionalLight(0x7fa9df,1.55);
  moonLight.position.set(-8,12,4);
  moonLight.visible=false;
  scene.add(moonLight);

  const playerHeadlight=new THREE.SpotLight(0xd8efff,55,42,.42,.72,1.45);
  playerHeadlight.position.set(0,1.0,2.2);
  playerHeadlight.castShadow=false;
  playerHeadlight.visible=false;
  scene.add(playerHeadlight);
  scene.add(playerHeadlight.target);

  const playerRimLight=new THREE.PointLight(0x77aaff,9,9,2);
  playerRimLight.visible=false;
  scene.add(playerRimLight);

  const playerTailGlow=new THREE.PointLight(0xff2b18,5,5,2);
  playerTailGlow.visible=false;
  scene.add(playerTailGlow);

  const headlightPool=new THREE.Mesh(
    new THREE.PlaneGeometry(5.2,18),
    new THREE.MeshBasicMaterial({
      map:nightLightTexture,
      color:0xcfeaff,
      transparent:true,
      opacity:.28,
      depthWrite:false,
      blending:THREE.AdditiveBlending
    })
  );
  headlightPool.rotation.x=-Math.PI/2;
  headlightPool.position.y=.035;
  headlightPool.visible=false;
  scene.add(headlightPool);

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


  function makeSkyTexture() {
    const cv=document.createElement('canvas');
    cv.width=1024; cv.height=512;
    const ctx=cv.getContext('2d');
    const g=ctx.createLinearGradient(0,0,0,512);
    g.addColorStop(0,'#536d91');
    g.addColorStop(.34,'#d98667');
    g.addColorStop(.67,'#f0b57d');
    g.addColorStop(1,'#efd39e');
    ctx.fillStyle=g; ctx.fillRect(0,0,1024,512);

    // soft layered clouds, intentionally lightweight and generated once
    ctx.globalCompositeOperation='screen';
    for(let i=0;i<42;i++){
      const x=Math.random()*1024;
      const y=30+Math.random()*230;
      const w=50+Math.random()*190;
      const h=10+Math.random()*34;
      const cg=ctx.createRadialGradient(x,y,1,x,y,w*.55);
      cg.addColorStop(0,'rgba(255,230,214,'+(0.08+Math.random()*.12)+')');
      cg.addColorStop(.55,'rgba(255,188,164,.08)');
      cg.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=cg;
      ctx.beginPath();
      ctx.ellipse(x,y,w,h,0,0,Math.PI*2);
      ctx.fill();
    }
    ctx.globalCompositeOperation='source-over';
    // warm horizon band
    const hg=ctx.createLinearGradient(0,285,0,420);
    hg.addColorStop(0,'rgba(255,198,128,0)');
    hg.addColorStop(.55,'rgba(255,180,103,.20)');
    hg.addColorStop(1,'rgba(255,218,166,0)');
    ctx.fillStyle=hg; ctx.fillRect(0,285,1024,140);

    const tex=new THREE.CanvasTexture(cv);
    tex.colorSpace=THREE.SRGBColorSpace;
    return tex;
  }
  const heroSkyTexture=makeSkyTexture();

  function makeCoastalCity() {
    const group=new THREE.Group();
    const wallMat=new THREE.MeshStandardMaterial({color:0xe4d6ba,roughness:.88});
    const roofMat=new THREE.MeshStandardMaterial({color:0x7f5a42,roughness:.82});
    for(let i=0;i<46;i++){
      const w=.8+Math.random()*1.8, h=.55+Math.random()*2.5, d=.8+Math.random()*1.5;
      const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),wallMat);
      const side=Math.random()>.2?-1:1;
      b.position.set(side*(17+Math.random()*24),h/2+.2,-54-Math.random()*150);
      group.add(b);
      if(Math.random()>.35){
        const r=new THREE.Mesh(new THREE.ConeGeometry(Math.max(w,d)*.58,.32,4),roofMat);
        r.rotation.y=Math.PI/4;
        r.position.set(b.position.x,h+.36,b.position.z);
        group.add(r);
      }
    }
    return group;
  }
  const coastalCity=makeCoastalCity();
  scene.add(coastalCity);

  function makeSwallowsNest() {
    const group=new THREE.Group();
    const rockMat=new THREE.MeshStandardMaterial({color:0x625d55,roughness:1});
    const stoneMat=new THREE.MeshStandardMaterial({color:0xd9cbb0,roughness:.82});
    const roofMat=new THREE.MeshStandardMaterial({color:0x27303a,roughness:.65});

    const rock=new THREE.Mesh(new THREE.ConeGeometry(6.8,12,7),rockMat);
    rock.position.y=5.2; rock.scale.set(1.4,1,1.1); group.add(rock);
    const base=new THREE.Mesh(new THREE.BoxGeometry(5.6,2.1,3.4),stoneMat);
    base.position.set(0,11.0,0); group.add(base);
    const keep=new THREE.Mesh(new THREE.BoxGeometry(2.6,3.1,2.2),stoneMat);
    keep.position.set(-.8,13.1,0); group.add(keep);
    [-2.0,1.3].forEach((x,idx)=>{
      const tower=new THREE.Mesh(new THREE.CylinderGeometry(.75,.86,4.2,8),stoneMat);
      tower.position.set(x,13.6,idx?.45:-.35); group.add(tower);
      const roof=new THREE.Mesh(new THREE.ConeGeometry(.95,2.0,8),roofMat);
      roof.position.set(x,16.5,idx?.45:-.35); group.add(roof);
    });
    group.position.set(31,0,-112);
    group.scale.setScalar(.62);
    return group;
  }
  const swallowsNest=makeSwallowsNest();
  scene.add(swallowsNest);

  function makeBackgroundViaduct() {
    const group=new THREE.Group();
    const concrete=new THREE.MeshStandardMaterial({color:0x999c9c,roughness:.82});
    const deck=new THREE.Mesh(new THREE.BoxGeometry(54,.62,2.1),concrete);
    deck.position.set(-8,7.2,-92); deck.rotation.y=-.10; group.add(deck);
    [-28,-17,-6,5,16].forEach((x)=>{
      const p=new THREE.Mesh(new THREE.BoxGeometry(.65,7.0,.65),concrete);
      p.position.set(x,3.5,-92+(x+8)*.10); group.add(p);
    });
    return group;
  }
  const backgroundViaduct=makeBackgroundViaduct();
  scene.add(backgroundViaduct);

  function makeSeaGlints() {
    const group=new THREE.Group();
    const mat=new THREE.MeshBasicMaterial({color:0xffdeb1,transparent:true,opacity:.20,depthWrite:false});
    for(let i=0;i<14;i++){
      const strip=new THREE.Mesh(new THREE.PlaneGeometry(4+Math.random()*13,.06),mat);
      strip.rotation.x=-Math.PI/2;
      strip.position.set(37+Math.random()*28,-.105,-52-Math.random()*170);
      group.add(strip);
    }
    return group;
  }
  const seaGlints=makeSeaGlints();
  scene.add(seaGlints);

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

  const routeSignBoards = [];

  const TRACK_PROFILES = {
    'Таврида': {
      sign:['A-291   СИМФЕРОПОЛЬ 48','БЕЛОГОРСК 112      ↑','ФЕОДОСИЯ 189   КЕРЧЬ 304 →'],
      curveAmp:.28, curveFreq:.010, curve2:.12,
      sea:false, city:true, castle:false, viaduct:true,
      ground:0xa38657, fog:0xb88768
    },
    'Южный берег': {
      sign:['ЯЛТА 18          ↑','АЛУШТА 47','СЕВАСТОПОЛЬ 82   ↗'],
      curveAmp:2.05, curveFreq:.022, curve2:.72,
      sea:true, city:true, castle:true, viaduct:true,
      ground:0x756448, fog:0xc98768
    },
    'Ночной Симферополь': {
      sign:['СИМФЕРОПОЛЬ ЦЕНТР ↑','АЭРОПОРТ 16','ОБЪЕЗДНАЯ 7      →'],
      curveAmp:.82, curveFreq:.015, curve2:.24,
      sea:false, city:true, castle:false, viaduct:false,
      ground:0x24272b, fog:0x07101b
    },
    'Морской маршрут': {
      sign:['СУДАК 36          ↑','НОВЫЙ СВЕТ 43','ФЕОДОСИЯ 75      →'],
      curveAmp:1.25, curveFreq:.017, curve2:.46,
      sea:true, city:false, castle:true, viaduct:false,
      ground:0x806b4c, fog:0xd39168
    }
  };

  function trackProfile(){
    return TRACK_PROFILES[state.track] || TRACK_PROFILES['Таврида'];
  }

  function trackCurve(z, progress=state.distance){
    const p=trackProfile();
    const t=progress*.052 + z;
    return Math.sin(t*p.curveFreq)*p.curveAmp + Math.sin(t*p.curveFreq*.43 + 1.35)*p.curve2;
  }

  function trackCurveYaw(z, progress=state.distance){
    const a=trackCurve(z-4,progress), b=trackCurve(z+4,progress);
    return Math.atan2(a-b,8)*.72;
  }

  function updateRouteSigns(){
    const p=trackProfile();
    routeSignBoards.forEach((board)=>{
      const old=board.material.map;
      const tex=canvasTexture(p.sign,'#185c45','#ffffff',1024,300);
      board.material.map=tex;
      board.material.needsUpdate=true;
      if(old && old!==tex) old.dispose?.();
    });
  }


  function makeSign() {
    const group = new THREE.Group();
    const tex = canvasTexture([
      'A-291     СИМФЕРОПОЛЬ 48',
      'БЕЛОГОРСК 112      ↑',
      'ФЕОДОСИЯ 189   КЕРЧЬ 304 →'
    ], '#185c45', '#ffffff', 1024, 300);

    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(11.2, 3.25),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
    );
    board.position.set(0, 6.25, 0);
    board.userData.routeSign = true;
    routeSignBoards.push(board);
    group.add(board);

    const metal = new THREE.MeshStandardMaterial({ color: 0x6f777e, metalness: .72, roughness: .32 });
    [-6.3, 6.3].forEach((x) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(.20, 6.0, .20), metal);
      post.position.set(x, 3.0, .05);
      group.add(post);
    });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(13.0,.18,.18),metal);
    beam.position.set(0,7.0,.05); group.add(beam);

    // truss diagonals
    for(let x=-5.5;x<=5.5;x+=1.4){
      const d=new THREE.Mesh(new THREE.BoxGeometry(1.55,.08,.08),metal);
      d.position.set(x,6.96,.06);
      d.rotation.z=(Math.floor((x+6)/1.4)%2?1:-1)*.45;
      group.add(d);
    }
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
    const pylon = new THREE.Group();
    const pBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 4.4, .35),
      new THREE.MeshStandardMaterial({ color: 0x20242a, roughness:.55 })
    );
    pBody.position.y=2.2; pylon.add(pBody);
    const pTex = canvasTexture(
      [name, '95   55.90', '92   52.90', 'ДТ   58.90'],
      name === 'ATAN' ? '#eab118' : '#632b8b',
      '#ffffff', 360, 360
    );
    const pFace = new THREE.Mesh(new THREE.PlaneGeometry(1.0,3.8),new THREE.MeshBasicMaterial({map:pTex}));
    pFace.position.set(0,2.25,-.19); pylon.add(pFace);
    pylon.position.set(side*3.9,0,-.3);
    group.add(pylon);

    [-1.9,0,1.9].forEach((x)=>{
      const pump=new THREE.Mesh(
        new THREE.BoxGeometry(.42,1.15,.46),
        new THREE.MeshStandardMaterial({color:0xe6e7e8,roughness:.5})
      );
      pump.position.set(x,.58,.25);
      group.add(pump);
    });

    group.position.x = side * 10.0;
    group.scale.setScalar(.92);
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

    const bulbMat=new THREE.MeshStandardMaterial({
      color:0xffe7b4,
      emissive:0xffc66b,
      emissiveIntensity:3.8,
      roughness:.22
    });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(.50, .09, .20), bulbMat);
    lamp.position.set(-side * .96, 5.25, 0);

    const glow=new THREE.Sprite(new THREE.SpriteMaterial({
      map:nightLightTexture,
      transparent:true,
      depthWrite:false,
      blending:THREE.AdditiveBlending,
      opacity:.86
    }));
    glow.scale.set(1.35,1.35,1);
    glow.position.set(-side*.96,5.18,.03);
    glow.userData.nightOnly=true;

    const pool=new THREE.Mesh(
      new THREE.PlaneGeometry(4.2,8.0),
      new THREE.MeshBasicMaterial({
        map:nightLightTexture,
        transparent:true,
        opacity:.22,
        depthWrite:false,
        blending:THREE.AdditiveBlending,
        side:THREE.DoubleSide
      })
    );
    pool.rotation.x=-Math.PI/2;
    pool.position.set(-side*2.0,.045,0);
    pool.userData.nightOnly=true;

    group.add(pole, arm, lamp, glow, pool);
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

    [-7.6, 7.6].forEach((x) => {
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
      new THREE.PlaneGeometry(14.0, 28),
      roadMaterial
    );
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    group.add(road);

    const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x60656a, roughness: .86 });
    [-7.55, 7.55].forEach((x) => {
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
    [-6.35, 6.35].forEach((x) => {
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(.10, 28), lineMat);
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(x, .027, 0);
      group.add(edge);
    });

    const reflectorMat = new THREE.MeshBasicMaterial({ color: 0xffe7a1 });
    [-6.70, 6.70].forEach((x) => {
      [-9, 0, 9].forEach((z) => {
        const stud = new THREE.Mesh(new THREE.BoxGeometry(.09, .045, .20), reflectorMat);
        stud.position.set(x, .075, z);
        group.add(stud);
      });
    });

    const railPostMat = new THREE.MeshStandardMaterial({ color: 0x8d949a, metalness: .62, roughness: .35 });
    [-8.10, 8.10].forEach((x) => {
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
    if (index % 2 === 0) {
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

  let player = makeGameCar('bmw', carSpecs['BMW M340i'].color, .84);
  player.position.set(0, .02, 3.4);
  player.rotation.y = 0;
  scene.add(player);
  let playerX = 0;
  let playerTargetX = 0;
  const laneX = [-3.12, 0, 3.12];

  const traffic = [];
  function spawnTrafficCar(z = -65 - Math.random() * 80) {
    const types = ['bmw', 'amg', 'porsche', 'vesta'];
    const type = types[(Math.random() * types.length) | 0];
    const colors = [0xc9c9c9, 0x37485a, 0x7f252b, 0x15181c, 0xa99d83, 0x2f5b76, 0xd8d6cf, 0x5c2534];
    const scale = .58 + Math.random() * .12;
    const car = makeGameCar(type, colors[(Math.random() * colors.length) | 0], scale);
    const lane = (Math.random() * 3) | 0;
    car.position.set(laneX[lane] + trackCurve(z), .02, z);
    car.rotation.y = 0;
    car.userData = {
      lane,
      targetLane: lane,
      speed: 72 + Math.random() * 92,
      counted: false,
      hit: false,
      laneTimer: 1.6 + Math.random() * 4.5,
      aggression: .55 + Math.random() * 1.1,
      driftPhase: Math.random() * Math.PI * 2
    };
    scene.add(car);
    traffic.push(car);
  }

  for (let i = 0; i < 8; i++) {
    const clusterOffset = (i % 3) * 7;
    spawnTrafficCar(-48 - i * 18 - clusterOffset - Math.random() * 10);
  }

  function respawnTraffic(car, forcedZ = null, forcedLane = null, speedOverride = null) {
    const lane = forcedLane ?? ((Math.random() * 3) | 0);
    car.userData.lane = lane;
    car.userData.targetLane = lane;
    car.position.x = laneX[lane] + trackCurve(car.position.z);
    car.position.z = forcedZ ?? (-82 - Math.random() * 155);
    const difficulty = Math.min(34, state.distance / 1000 * 4.0);
    car.userData.speed = speedOverride ?? (66 + Math.random() * 98 + difficulty);
    car.userData.counted = false;
    car.userData.hit = false;
    car.userData.laneTimer = 1.4 + Math.random() * 4.8;
    car.userData.aggression = .55 + Math.random() * 1.15;
  }

  function launchTrafficWave() {
    const candidates = [...traffic].sort((a,b)=>a.position.z-b.position.z).slice(0,3);
    const pattern = Math.random() > .5 ? [0,2,1] : [2,0,1];
    candidates.forEach((car, i) => {
      respawnTraffic(car, -42 - i * 16, pattern[i], 78 + Math.random() * 48);
    });
    showEvent('ПЛОТНЫЙ ТРАФИК');
  }

  function rebuildPlayer() {
    scene.remove(player);
    const sharedPlayerGeometry = !!player.userData.sharedGeometry;
    player.traverse((o) => {
      if (o.geometry && !sharedPlayerGeometry) o.geometry.dispose();
      if (o.material && o.material.dispose) o.material.dispose();
    });
    const spec = carSpecs[state.car];
    player = makeGameCar(spec.type, spec.color, (spec.type==='bmw'||spec.type==='vesta') ? .88 : .84);
    player.position.set(laneX[state.lane] + trackCurve(3.4), .02, 3.4);
    player.rotation.y = 0;
    scene.add(player);
  }


  function applyTrackWorldVisibility(){
    const p=trackProfile();
    sea.visible=!!p.sea;
    seaGlints.visible=!!p.sea;
    coastalCity.visible=!!p.city;
    swallowsNest.visible=!!p.castle;
    backgroundViaduct.visible=!!p.viaduct;

    // Route-specific placement changes the skyline rather than merely recolouring it.
    if(state.track==='Южный берег'){
      swallowsNest.position.set(29,0,-105);
      mountains.position.x=-5;
      mountains.scale.set(1.15,1.18,1.15);
      sea.position.x=48;
    } else if(state.track==='Морской маршрут'){
      swallowsNest.position.set(34,0,-130);
      mountains.position.x=-18;
      mountains.scale.set(.88,.94,.88);
      sea.position.x=44;
    } else if(state.track==='Ночной Симферополь'){
      mountains.position.x=0;
      mountains.scale.set(.68,.68,.68);
    } else {
      mountains.position.x=0;
      mountains.scale.set(1,1,1);
    }
    updateRouteSigns();
  }

  function addNightWindows(){
    const group=new THREE.Group();
    const mat=new THREE.MeshBasicMaterial({color:0xffd37b,transparent:true,opacity:.78});
    for(let i=0;i<50;i++){
      const w=new THREE.Mesh(new THREE.PlaneGeometry(.16,.10),mat);
      const side=Math.random()>.5?1:-1;
      w.position.set(side*(12+Math.random()*22),1+Math.random()*7,-35-Math.random()*150);
      w.rotation.y=side>0?-Math.PI/2:Math.PI/2;
      group.add(w);
    }
    group.name='night-windows';
    scene.add(group);
    return group;
  }
  const nightWindows=addNightWindows();

  function applyRaceTheme() {
    const p=trackProfile();
    applyTrackWorldVisibility();
    const isNight = state.track === 'Ночной Симферополь';
    nightWindows.visible = isNight;
    moonLight.visible = isNight;
    playerHeadlight.visible = isNight;
    playerRimLight.visible = isNight;
    playerTailGlow.visible = isNight;
    headlightPool.visible = isNight;
    roadSegments?.forEach?.((seg)=>seg.traverse((o)=>{
      if(o.userData?.nightOnly) o.visible=isNight;
    }));

    if (state.track === 'Ночной Симферополь') {
      scene.background = new THREE.Color(0x07101b);
      scene.fog = new THREE.Fog(0x07101b, 20, 145);
      hemi.color.set(0x51627d);
      hemi.groundColor.set(0x11141b);
      hemi.intensity = 1.20;
      sunLight.intensity = .55;
      sun.visible = false;
      sunHalo.visible = false;
      ground.material.color.set(p.ground);
      renderer.toneMappingExposure = 1.34;
    } else if (state.track === 'Южный берег') {
      scene.background = heroSkyTexture;
      scene.fog = new THREE.Fog(p.fog, 50, 230);
      hemi.color.set(0xd6e4ef);
      hemi.groundColor.set(0x51432d);
      hemi.intensity = 2.35;
      sunLight.intensity = 4.05;
      sun.visible = true;
      sunHalo.visible = true;
      ground.material.color.set(p.ground);
      renderer.toneMappingExposure = 1.16;
    } else if (state.track === 'Морской маршрут') {
      scene.background = heroSkyTexture;
      scene.fog = new THREE.Fog(p.fog, 48, 220);
      hemi.color.set(0xcbe3ef);
      hemi.groundColor.set(0x57442b);
      hemi.intensity = 2.25;
      sunLight.intensity = 3.95;
      sun.visible = true;
      sunHalo.visible = true;
      ground.material.color.set(p.ground);
      renderer.toneMappingExposure = 1.14;
    } else {
      scene.background = heroSkyTexture;
      scene.fog = new THREE.Fog(p.fog, 44, 205);
      hemi.color.set(0xb9d7ef);
      hemi.groundColor.set(0x4b351d);
      hemi.intensity = 2.2;
      sunLight.intensity = 3.7;
      sun.visible = true;
      sunHalo.visible = true;
      ground.material.color.set(p.ground);
      renderer.toneMappingExposure = 1.16;
    }
    roadSegments?.forEach?.((seg)=>{
      seg.position.x=trackCurve(seg.position.z);
      seg.rotation.y=trackCurveYaw(seg.position.z);
    });
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
    const distance = one('#hudDistance');
    if (distance) distance.textContent = (state.distance / 1000).toFixed(1);
    const dial = one('#speedDial');
    if (dial) {
      const pct = Math.max(0, Math.min(1, state.speed / 300));
      dial.style.setProperty('--speed-angle', (42 + pct * 276).toFixed(1) + 'deg');
    }
    one('#speedVignette').classList.toggle('fast', state.speed > 190);
  }

  function startRace() {
    ensureMusic();
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
    state.nextTrafficWave = 650;
    state.last = performance.now();
    playerTargetX = trackCurve(3.4);
    playerX = playerTargetX;
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
    playerTargetX = laneX[state.lane] + trackCurve(player.position.z);
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
        seg.position.x = trackCurve(seg.position.z);
        seg.rotation.y = trackCurveYaw(seg.position.z);
      }

      playerTargetX = laneX[state.lane] + trackCurve(player.position.z);
      playerX += (playerTargetX - playerX) * Math.min(1, dt * 8.5);
      player.position.x = playerX;
      player.position.y = .02 + Math.sin(now * .018) * .012;

      traffic.forEach((car) => {
        car.userData.laneTimer -= dt;

        if (car.userData.laneTimer <= 0 && car.position.z < player.position.z - 7) {
          const dir = Math.random() > .5 ? 1 : -1;
          let nextLane = car.userData.targetLane + dir;
          if (nextLane < 0 || nextLane > 2) nextLane = car.userData.targetLane - dir;
          if (Math.random() < .68) car.userData.targetLane = Math.max(0, Math.min(2, nextLane));
          car.userData.laneTimer = 1.8 + Math.random() * (4.7 / car.userData.aggression);
        }

        const targetX = laneX[car.userData.targetLane] + trackCurve(car.position.z);
        const dxLane = targetX - car.position.x;
        car.position.x += dxLane * Math.min(1, dt * (1.8 + car.userData.aggression * 1.4));
        car.rotation.z += ((-dxLane * .045) - car.rotation.z) * Math.min(1, dt * 5.0);
        car.rotation.y += (trackCurveYaw(car.position.z) - car.rotation.y) * Math.min(1, dt*3.0);

        const rel = Math.max(-8.0, Math.min(31, (state.speed - car.userData.speed) * .19));
        car.position.z += rel * dt;

        const dz = Math.abs(car.position.z - player.position.z);
        const dx = Math.abs(car.position.x - player.position.x);

        if (!car.userData.hit && dz < 2.35 && dx < 1.40) {
          car.userData.hit = true;
          crash();
        }

        if (!car.userData.counted && car.position.z > player.position.z + 1.45) {
          car.userData.counted = true;
          if (dx > 1.48 && dx < 4.1) nearMiss();
          else if (dx >= 4.1) state.comboTimer -= .28;
        }

        if (car.position.z > 18 || car.position.z < -255) respawnTraffic(car);
      });

      if (state.distance >= state.nextTrafficWave) {
        launchTrafficWave();
        state.nextTrafficWave += 620 + Math.random() * 260;
      }

      state.comboTimer -= dt;
      if (state.comboTimer <= 0 && state.combo > 1) state.combo = 1;

      const speedRatio = Math.max(0, Math.min(1, (state.speed - 115) / 165));
      const nightNow = state.track === 'Ночной Симферополь';
      if(nightNow){
        playerHeadlight.position.set(playerX,.95,player.position.z-1.15);
        playerHeadlight.target.position.set(trackCurve(-18),.05,-18);
        playerHeadlight.target.updateMatrixWorld();
        playerRimLight.position.set(playerX,1.65,player.position.z+1.65);
        playerTailGlow.position.set(playerX,.62,player.position.z+2.05);
        headlightPool.position.set(playerX,.04,player.position.z-7.8);
        headlightPool.rotation.z=-trackCurveYaw(-7.8);
      }

      camera.fov = 58 + speedRatio * 8;
      camera.position.x += ((playerX * .42) - camera.position.x) * Math.min(1, dt * 5.0);
      camera.position.y = 3.82 + speedRatio * .20 + Math.sin(now * .012) * .015 * speedRatio;
      camera.position.z = 11.75 - speedRatio * .30;
      camera.rotation.z += (((playerTargetX - playerX) * -.006) - camera.rotation.z) * Math.min(1, dt * 4);
      camera.lookAt(playerX * .28, .64, -12.8);
      camera.updateProjectionMatrix();

      updateHud();
    }

    renderer.render(scene, camera);
    state.raf = requestAnimationFrame(raceLoop);
  }

  function steerPress(el, delta) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      moveLane(delta);
    });
  }
  steerPress(one('#leftBtn'), -1);
  steerPress(one('#rightBtn'), 1);
  one('#retryBtn').addEventListener('click', startRace);

  one('#pauseBtn').addEventListener('click', () => {
    if (!state.playing) return;
    state.paused = !state.paused;
    one('#pauseBtn').textContent = state.paused ? 'ПРОДОЛЖИТЬ' : 'ПАУЗА';
  });

  function hold(el, setter) {
    const release = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      setter(false);
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { el.setPointerCapture(e.pointerId); } catch {}
      setter(true);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => {
      el.addEventListener(ev, release);
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
  initHome3D();

  // v0.5: model-specific identity cars are built locally for stable mobile rendering.
})()
  // ---------- PROCEDURAL SOUNDTRACK ----------
  let audioCtx=null, musicMaster=null, musicTimer=null, musicStep=0, musicEnabled=true;
  const MUSIC_BPM=118;
  const bassSeq=[45,45,48,45,52,48,43,45];
  const leadSeq=[69,72,76,72,67,69,72,76];

  function midiHz(n){ return 440*Math.pow(2,(n-69)/12); }

  function tone(freq, when, dur, type='sawtooth', gain=.035, dest=musicMaster){
    if(!audioCtx||!dest) return;
    const osc=audioCtx.createOscillator();
    const g=audioCtx.createGain();
    osc.type=type; osc.frequency.setValueAtTime(freq,when);
    g.gain.setValueAtTime(.0001,when);
    g.gain.exponentialRampToValueAtTime(gain,when+.012);
    g.gain.exponentialRampToValueAtTime(.0001,when+dur);
    osc.connect(g); g.connect(dest);
    osc.start(when); osc.stop(when+dur+.03);
  }

  function drum(when, strong=false){
    if(!audioCtx||!musicMaster) return;
    const osc=audioCtx.createOscillator();
    const g=audioCtx.createGain();
    osc.type='sine';
    osc.frequency.setValueAtTime(strong?112:82,when);
    osc.frequency.exponentialRampToValueAtTime(42,when+.10);
    g.gain.setValueAtTime(strong?.10:.055,when);
    g.gain.exponentialRampToValueAtTime(.0001,when+.13);
    osc.connect(g); g.connect(musicMaster);
    osc.start(when); osc.stop(when+.15);
  }

  function noiseHat(when){
    if(!audioCtx||!musicMaster) return;
    const len=Math.floor(audioCtx.sampleRate*.045);
    const b=audioCtx.createBuffer(1,len,audioCtx.sampleRate);
    const d=b.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    const src=audioCtx.createBufferSource(); src.buffer=b;
    const hp=audioCtx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=6200;
    const g=audioCtx.createGain(); g.gain.setValueAtTime(.025,when); g.gain.exponentialRampToValueAtTime(.0001,when+.045);
    src.connect(hp); hp.connect(g); g.connect(musicMaster); src.start(when);
  }

  function musicTick(){
    if(!audioCtx||!musicMaster||!musicEnabled||audioCtx.state!=='running') return;
    const beat=60/MUSIC_BPM;
    const when=audioCtx.currentTime+.025;
    const step=musicStep++;
    const barStep=step%8;
    tone(midiHz(bassSeq[barStep]-12),when,beat*.75,'triangle',.040);
    if(step%2===0) drum(when,step%4===0);
    noiseHat(when+beat*.25);
    if(step%4===2) tone(midiHz(leadSeq[barStep]),when,beat*.72,'sawtooth',.014);
  }

  function ensureMusic(){
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) return;
    if(!audioCtx){
      audioCtx=new AC();
      musicMaster=audioCtx.createGain();
      musicMaster.gain.value=.36;
      const comp=audioCtx.createDynamicsCompressor();
      comp.threshold.value=-18; comp.knee.value=18; comp.ratio.value=4;
      musicMaster.connect(comp); comp.connect(audioCtx.destination);
      musicTimer=setInterval(musicTick,(60/MUSIC_BPM)*1000);
    }
    audioCtx.resume?.();
  }

  function updateMusicButtons(){
    all('.music-toggle').forEach((b)=>{
      b.classList.toggle('muted',!musicEnabled);
      b.setAttribute('aria-label',musicEnabled?'Выключить музыку':'Включить музыку');
      b.textContent=musicEnabled?'♫':'♪';
    });
  }

  function toggleMusic(e){
    e?.preventDefault?.(); e?.stopPropagation?.();
    ensureMusic();
    musicEnabled=!musicEnabled;
    if(musicMaster) musicMaster.gain.setTargetAtTime(musicEnabled?.36:.0001,audioCtx.currentTime,.04);
    updateMusicButtons();
    toast(musicEnabled?'Музыка включена ♫':'Музыка выключена');
  }

  all('.music-toggle').forEach((b)=>b.addEventListener('click',toggleMusic));
  updateMusicButtons();

;