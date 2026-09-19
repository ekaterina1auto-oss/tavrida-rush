(() => {
  const app = document.getElementById('app');
  const one = (s) => app.querySelector(s);
  const all = (s) => Array.from(app.querySelectorAll(s));

  const cars = {
    'Lada Vesta Street Beast': { base: 138, max: 218, type: 'vesta' },
    'BMW M340i': { base: 154, max: 252, type: 'bmw' },
    'Mercedes-AMG C 63 S': { base: 158, max: 264, type: 'amg' },
    'Porsche 911 Carrera S': { base: 163, max: 280, type: 'porsche' }
  };

  const state = {
    screen: 'home',
    car: 'BMW M340i',
    type: 'bmw',
    track: 'Таврида',
    speed: 154,
    score: 0,
    combo: 1,
    lane: 1,
    playing: false,
    paused: false,
    gas: false,
    brake: false,
    traffic: [],
    last: 0,
    spawn: 0.5,
    raf: 0
  };

  const lanes = [28, 50, 72];
  const colors = ['#d6d8db','#616873','#9a2b31','#28547b','#b6aa8d','#262a30'];

  function toast(text) {
    const el = one('#toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 1100);
  }

  function stopRace() {
    state.playing = false;
    cancelAnimationFrame(state.raf);
    state.traffic.forEach((item) => item.el.remove());
    state.traffic = [];
    one('#roadsideLayer').textContent = '';
  }

  function openScreen(id) {
    all('.screen').forEach((s) => s.classList.remove('is-active'));
    one('#screen-' + id).classList.add('is-active');
    state.screen = id;
    if (id === 'race') startRace();
    else stopRace();
  }

  all('[data-screen]').forEach((el) => {
    el.addEventListener('click', () => openScreen(el.dataset.screen));
  });

  one('#recordsBtn').addEventListener('click', () => toast('Рекорды появятся после сохранений 🏆'));
  one('#settingsBtn').addEventListener('click', () => toast('Настройки — в следующем билде'));

  all('.track-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      all('.track-card').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.track = btn.dataset.track;
      one('#trackCaption').textContent = state.track;
      toast(state.track + ' выбрана');
    });
  });

  all('.car-card[data-car]').forEach((btn) => {
    btn.addEventListener('click', () => {
      all('.car-card').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.car = btn.dataset.car;
      state.type = btn.dataset.type;
      one('#garageName').textContent = state.car;
      one('#garageClass').textContent = btn.dataset.class;
      one('#garageSubtitle').textContent = state.car;
      one('#homeCar').textContent = state.car;
      one('#statSpeed').textContent = btn.dataset.speed;
      one('#statAccel').textContent = btn.dataset.accel;
      one('#statHandling').textContent = btn.dataset.handling;
      one('#barSpeed').style.width = Number(btn.dataset.speed) * 10 + '%';
      one('#barAccel').style.width = Number(btn.dataset.accel) * 10 + '%';
      one('#barHandling').style.width = Number(btn.dataset.handling) * 10 + '%';
      one('#garageCar').className = 'garage-car ' + state.type;
      toast(state.car + ' выбрана');
    });
  });

  all('.car-card.locked').forEach((btn) => {
    btn.addEventListener('click', () => toast('Эта машина пока заблокирована'));
  });

  one('#effectBtn').addEventListener('click', () => {
    const car = one('#garageCar');
    car.animate(
      [{ transform: 'scale(.96)' }, { transform: 'scale(1.07)' }, { transform: 'scale(1)' }],
      { duration: 520, easing: 'ease-out' }
    );
    toast(state.type === 'vesta' ? 'MAD CRIMEAN BUILD 🔥' : 'Спецэффект активирован');
  });

  function updateHud() {
    one('#hudSpeed').textContent = Math.round(state.speed);
    one('#hudScore').textContent = Math.floor(state.score).toLocaleString('ru-RU');
    one('#hudCombo').textContent = state.combo;
  }

  function startRace() {
    stopRace();
    const spec = cars[state.car];
    state.speed = spec.base;
    state.score = 0;
    state.combo = 1;
    state.lane = 1;
    state.spawn = 0.45;
    state.gas = false;
    state.brake = false;
    state.paused = false;
    state.playing = true;
    state.last = performance.now();

    const player = one('#playerCar');
    player.className = 'player-car ' + spec.type;
    player.style.left = lanes[1] + '%';

    one('#raceLabel').textContent = state.car + ' · ' + state.track;
    one('#pauseBtn').textContent = 'ПАУЗА';
    one('#gameOver').classList.add('hidden');
    updateHud();
    state.raf = requestAnimationFrame(loop);
  }

  function spawnTraffic() {
    const el = document.createElement('div');
    el.className = 'traffic-car';
    const body = document.createElement('div');
    body.className = 'body';
    el.appendChild(body);
    el.style.setProperty('--c', colors[Math.floor(Math.random() * colors.length)]);
    const item = { el, lane: Math.floor(Math.random() * 3), y: 0.16, near: false };
    one('#trafficLayer').appendChild(el);
    state.traffic.push(item);
  }

  function showEvent(text) {
    const banner = one('#eventBanner');
    banner.textContent = text;
    banner.classList.add('show');
    clearTimeout(banner._timer);
    banner._timer = setTimeout(() => banner.classList.remove('show'), 650);
  }

  function endRace() {
    state.playing = false;
    one('#gameOverResult').textContent = Math.floor(state.score).toLocaleString('ru-RU') + ' очков';
    one('#gameOver').classList.remove('hidden');
  }

  function moveLane(delta) {
    if (!state.playing || state.paused) return;
    state.lane = Math.max(0, Math.min(2, state.lane + delta));
    const player = one('#playerCar');
    player.style.left = lanes[state.lane] + '%';
    player.style.transform = 'translateX(-50%) rotate(' + (delta * 4) + 'deg)';
    setTimeout(() => { player.style.transform = 'translateX(-50%)'; }, 150);
  }

  function renderTraffic() {
    const h = one('#raceViewport').clientHeight;
    state.traffic.forEach((item) => {
      const scale = 0.42 + item.y * 0.95;
      item.el.style.left = lanes[item.lane] + '%';
      item.el.style.top = (item.y * h) + 'px';
      item.el.style.transform = 'translate(-50%,-50%) scale(' + scale + ')';
    });
  }

  function loop(now) {
    if (!state.playing) return;
    const dt = Math.min(0.034, (now - state.last) / 1000 || 0.016);
    state.last = now;

    if (!state.paused) {
      const spec = cars[state.car];
      const target = state.gas ? spec.max : (state.brake ? 82 : spec.base);
      state.speed += (target - state.speed) * Math.min(1, dt * (state.gas ? 2 : 2.8));
      state.score += state.speed * 0.11 * dt * state.combo;
      state.spawn -= dt;

      if (state.spawn <= 0) {
        spawnTraffic();
        state.spawn = Math.max(0.5, 1.25 - state.speed / 360) + Math.random() * 0.3;
      }

      state.traffic.forEach((item) => {
        item.y += dt * (0.19 + state.speed / 430);
        if (item.y > 0.73 && item.y < 0.90 && item.lane === state.lane) {
          endRace();
        } else if (!item.near && item.y > 0.76 && Math.abs(item.lane - state.lane) === 1) {
          item.near = true;
          state.combo = Math.min(9, state.combo + 1);
          state.score += 400 * state.combo;
          showEvent('NEAR MISS ×' + state.combo);
        }
      });

      state.traffic = state.traffic.filter((item) => {
        if (item.y > 1.1) {
          item.el.remove();
          return false;
        }
        return true;
      });

      renderTraffic();
      updateHud();
    }

    state.raf = requestAnimationFrame(loop);
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
    ['pointerup','pointercancel','pointerleave'].forEach((name) => {
      el.addEventListener(name, () => setter(false));
    });
  }

  hold(one('#gasBtn'), (v) => state.gas = v);
  hold(one('#brakeBtn'), (v) => state.brake = v);

  let startX = null;
  one('#raceViewport').addEventListener('pointerdown', (e) => { startX = e.clientX; });
  one('#raceViewport').addEventListener('pointerup', (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 34) moveLane(dx > 0 ? 1 : -1);
    startX = null;
  });
})();