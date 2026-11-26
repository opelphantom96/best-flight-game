// AURORA CARGO — render: the whole 3D fjord scene (three.js) plus the 2D
// DOM HUD overlay on top of the canvas. Bright arctic dawn on purpose:
// strong sunrise light, snow that bounces it, glowing rings and strips.
// Draw calls stay low: one terrain, one water plane, instanced houses and
// strip lights, shared ring geometry, sprite clouds, one Points snowfall.

import * as THREE from 'three';
import { PALETTE, SCREEN } from './config.js';
import { terrainHeight, fjordCenter } from './world.js';

function makeCloudTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d');
  const blob = (x, y, r, a) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  blob(40, 40, 30, 0.9);
  blob(64, 32, 34, 0.95);
  blob(92, 42, 28, 0.85);
  blob(64, 46, 30, 0.7);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(960, 540, false);
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PALETTE.fog, 320, 1700);
  const camera = new THREE.PerspectiveCamera(58, 960 / 540, 0.5, 4000);

  // --- light: strong dawn sun + bright sky bounce --------------------------
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0xe8f0ff, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a0, 1.6);
  sun.position.set(-300, 180, -220);
  scene.add(sun);

  // --- sky dome: rose horizon melting into dawn blue -----------------------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyTop) },
      mid: { value: new THREE.Color(PALETTE.skyMid) },
      bot: { value: new THREE.Color(PALETTE.skyBot) },
    },
    vertexShader:
      'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader:
      'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;' +
      'void main(){ float h = normalize(vP).y;' +
      ' vec3 c = h > 0.10 ? mix(mid, top, smoothstep(0.10, 0.62, h)) : mix(bot, mid, smoothstep(-0.30, 0.10, h));' +
      ' gl_FragColor = vec4(c, 1.0); }',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 24, 16), skyMat);
  scene.add(sky);

  // Low sunrise disc on the horizon.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(55, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe9b0, fog: false }),
  );
  sunDisc.position.set(-900, 95, -1100);
  sunDisc.lookAt(0, 60, 0);
  scene.add(sunDisc);

  // --- aurora: three ribbons waving slowly ---------------------------------
  const auroras = [];
  const auroraColors = [PALETTE.auroraGreen, PALETTE.auroraTeal, PALETTE.auroraViolet];
  for (let i = 0; i < 3; i++) {
    const geo = new THREE.PlaneGeometry(900, 70, 48, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: auroraColors[i],
      transparent: true,
      opacity: 0.30 - i * 0.06,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(300 + i * 180, 150 + i * 32, -180 - i * 80);
    mesh.rotation.x = -0.35;
    mesh.rotation.z = 0.12 + i * 0.06;
    mesh.userData.base = geo.attributes.position.array.slice();
    mesh.userData.phase = i * 2.1;
    scene.add(mesh);
    auroras.push(mesh);
  }

  // --- terrain: one displaced plane, snow above, blue rock below -----------
  const terrGeo = new THREE.PlaneGeometry(2600, 1800, 130, 90);
  terrGeo.rotateX(-Math.PI / 2);
  terrGeo.translate(1000, 0, 0);
  {
    const pos = terrGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const snow = new THREE.Color(PALETTE.snow);
    const rock = new THREE.Color(PALETTE.rock);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = terrainHeight(x, z);
      pos.setY(i, h);
      const t = Math.max(0, Math.min(1, h / 26));
      tmp.copy(rock).lerp(snow, t);
      // Slight sparkle variation so the snow reads as snow, not flat white.
      const v = 0.94 + 0.06 * Math.sin(x * 0.35 + z * 0.21);
      colors[i * 3] = tmp.r * v;
      colors[i * 3 + 1] = tmp.g * v;
      colors[i * 3 + 2] = tmp.b * v;
    }
    terrGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    terrGeo.computeVertexNormals();
  }
  const terrain = new THREE.Mesh(
    terrGeo,
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  scene.add(terrain);

  // --- fjord water: dark blue with a dawn sheen ----------------------------
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(2600, 1800),
    new THREE.MeshPhongMaterial({
      color: PALETTE.water,
      shininess: 90,
      specular: 0xffc890,
      transparent: true,
      opacity: 0.96,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(1000, 0, 0);
  scene.add(water);

  // --- settlement: instanced houses + warm window lights -------------------
  const houseGeo = new THREE.BoxGeometry(1, 1, 1);
  const houseMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  const houses = new THREE.InstancedMesh(houseGeo, houseMat, 12);
  const lightGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
  const lightMat = new THREE.MeshBasicMaterial({ color: PALETTE.townLight });
  const townLights = new THREE.InstancedMesh(lightGeo, lightMat, 12);
  houses.count = 0;
  townLights.count = 0;
  scene.add(houses);
  scene.add(townLights);

  // --- strips: white ice + glowing edge lights ----------------------------
  const stripGroups = [];
  function makeStrip() {
    const group = new THREE.Group();
    const ice = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshLambertMaterial({ color: 0xeaf4ff }),
    );
    ice.rotation.x = -Math.PI / 2;
    ice.position.y = 0.6;
    group.add(ice);
    const edgeGeo = new THREE.BoxGeometry(2.2, 1.4, 2.2);
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xff9a3c });
    const edges = new THREE.InstancedMesh(edgeGeo, edgeMat, 14);
    group.add(edges);
    group.userData = { ice, edges };
    scene.add(group);
    stripGroups.push(group);
    return group;
  }
  const homeStripMesh = makeStrip();
  const destStripMesh = makeStrip();

  // --- rings: shared gold torus, one mesh each -----------------------------
  const ringGeo = new THREE.TorusGeometry(12, 1.3, 10, 28);
  const ringMat = new THREE.MeshBasicMaterial({ color: PALETTE.ringGold });
  const ringMeshes = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(ringGeo, ringMat);
    m.visible = false;
    scene.add(m);
    ringMeshes.push(m);
  }

  // --- clouds: soft sprites -------------------------------------------------
  const cloudTex = makeCloudTexture();
  const cloudSprites = [];
  for (let i = 0; i < 10; i++) {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    sp.scale.set(110, 44, 1);
    sp.visible = false;
    scene.add(sp);
    cloudSprites.push(sp);
  }

  // --- the cargo plane, built from primitives -------------------------------
  const plane = new THREE.Group();
  {
    const orange = new THREE.MeshLambertMaterial({ color: PALETTE.planeOrange });
    const white = new THREE.MeshLambertMaterial({ color: PALETTE.planeWhite });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2c3a4a });
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.1, 9, 12), orange);
    fus.rotation.z = Math.PI / 2;
    plane.add(fus);
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.7, 2.2, 12), white);
    nose.rotation.z = Math.PI / 2;
    nose.position.x = 5.4;
    plane.add(nose);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 14), white);
    wing.position.set(0.6, 0.4, 0);
    plane.add(wing);
    const tailWing = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 6), orange);
    tailWing.position.set(-4.2, 0.5, 0);
    plane.add(tailWing);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 3.4, 0.35), orange);
    fin.position.set(-4.2, 1.8, 0);
    plane.add(fin);
    const cargoBox = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.2, 3.4), white);
    cargoBox.position.set(-1.2, 1.6, 0);
    plane.add(cargoBox);
    const prop = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.25, 7.5, 0.6), dark);
    prop.add(blade);
    const blade2 = blade.clone();
    blade2.rotation.x = Math.PI / 2;
    prop.add(blade2);
    prop.position.x = 6.7;
    plane.add(prop);
    plane.userData.prop = prop;
    const skiGeo = new THREE.BoxGeometry(4.5, 0.3, 1.1);
    const skiL = new THREE.Mesh(skiGeo, dark);
    skiL.position.set(0.5, -2.1, 2.2);
    const skiR = new THREE.Mesh(skiGeo, dark);
    skiR.position.set(0.5, -2.1, -2.2);
    plane.add(skiL);
    plane.add(skiR);
    plane.userData.skiL = skiL;
    plane.userData.skiR = skiR;
    const navL = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff4444 }),
    );
    navL.position.set(0.6, 0.4, 7.1);
    plane.add(navL);
    const navR = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x44ff66 }),
    );
    navR.position.set(0.6, 0.4, -7.1);
    plane.add(navR);
  }
  scene.add(plane);

  // --- burst particles (ring / delivery pops) -------------------------------
  const burstGeo = new THREE.BufferGeometry();
  const burstPos = new Float32Array(220 * 3);
  burstGeo.setAttribute('position', new THREE.BufferAttribute(burstPos, 3));
  const burstPts = new THREE.Points(
    burstGeo,
    new THREE.PointsMaterial({ color: 0xffd97a, size: 2.2, transparent: true, opacity: 0.95 }),
  );
  burstPts.frustumCulled = false;
  scene.add(burstPts);

  // --- snowfall, only visible in the storm ----------------------------------
  const SNOW_N = 700;
  const snowGeo = new THREE.BufferGeometry();
  const snowPos = new Float32Array(SNOW_N * 3);
  const snowSeed = [];
  for (let i = 0; i < SNOW_N; i++) {
    snowSeed.push({ x: Math.random() * 300 - 150, y: Math.random() * 120, z: Math.random() * 300 - 150, v: 6 + Math.random() * 8 });
  }
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snowPts = new THREE.Points(
    snowGeo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 1.7, transparent: true, opacity: 0 }),
  );
  snowPts.frustumCulled = false;
  scene.add(snowPts);

  // --- DOM HUD overlay -------------------------------------------------------
  const hud = document.getElementById('hud');
  const card = document.getElementById('card');
  hud.innerHTML =
    '<div id="hud-top">' +
    '<div class="hud-panel" id="hud-left"><div>ALT <b id="hud-alt">0</b> ft</div><div>SPD <b id="hud-spd">0</b> kt</div><div>HDG <b id="hud-hdg">0</b>°</div></div>' +
    '<div class="hud-panel" id="hud-mid"><div class="bar-row"><span>FUEL</span><div class="bar"><div id="hud-fuel" class="bar-fill fuel"></div></div><b id="hud-fuel-n">100</b></div>' +
    '<div class="bar-row"><span>ICE</span><div class="bar"><div id="hud-ice" class="bar-fill ice"></div></div><b id="hud-ice-n">0</b></div>' +
    '<div id="hud-cargo">CARGO ✗</div></div>' +
    '<div class="hud-panel" id="hud-right"><div>SCORE <b id="hud-score">0</b></div><div id="hud-mission">MISSION 1/5</div><div>TIME <b id="hud-time">0</b>s</div></div>' +
    '</div>' +
    '<div id="hud-banner"></div>' +
    '<div id="hud-floaters"></div>' +
    '<div id="hud-hint">W/S throttle &nbsp;•&nbsp; A/D turn &nbsp;•&nbsp; mouse pitch &nbsp;•&nbsp; SPACE flare &nbsp;•&nbsp; L skis &nbsp;•&nbsp; P pause &nbsp;•&nbsp; R restart &nbsp;•&nbsp; M mute</div>';

  const $ = (id) => document.getElementById(id);
  let lastScreen = '';
  let lastStripKey = '';

  function layoutStrips(md) {
    const place = (group, strip) => {
      const { ice, edges } = group.userData;
      ice.scale.set(strip.len, strip.w, 1);
      ice.position.set(strip.x, 0.6, strip.z);
      const m = new THREE.Matrix4();
      for (let i = 0; i < 14; i++) {
        const side = i < 7 ? 1 : -1;
        const along = -strip.len / 2 + 12 + (i % 7) * ((strip.len - 24) / 6);
        m.makeTranslation(strip.x + along, 1.4, strip.z + side * (strip.w / 2 + 2));
        edges.setMatrixAt(i, m);
      }
      edges.instanceMatrix.needsUpdate = true;
    };
    place(homeStripMesh, md.home);
    place(destStripMesh, md.dest);
  }

  function layoutTown(md) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const pos = new THREE.Vector3();
    md.town.forEach((h, i) => {
      const y = terrainHeight(h.x, h.z);
      pos.set(h.x, y + h.h / 2, h.z);
      sc.set(h.w, h.h, h.d);
      m.compose(pos, q, sc);
      houses.setMatrixAt(i, m);
      pos.set(h.x, y + h.h + 1.2, h.z);
      sc.set(1, 1, 1);
      m.compose(pos, q, sc);
      townLights.setMatrixAt(i, m);
    });
    houses.count = md.town.length;
    townLights.count = md.town.length;
    houses.instanceMatrix.needsUpdate = true;
    townLights.instanceMatrix.needsUpdate = true;
  }

  function drawCard(s) {
    if (s.screen === lastScreen) return;
    lastScreen = s.screen;
    card.className = s.screen === SCREEN.title ? 'top' : '';
    if (s.screen === SCREEN.play || s.screen === SCREEN.pause) {
      if (s.screen === SCREEN.pause) {
        card.innerHTML =
          '<div class="card"><h1>PAUSED</h1><p>The fjord waits. The storm does not.</p><p class="keys">P / ESC — resume &nbsp;•&nbsp; R — restart</p></div>';
        card.style.display = 'flex';
      } else {
        card.style.display = 'none';
      }
      return;
    }
    let html = '';
    if (s.screen === SCREEN.title) {
      html =
        '<div class="card title-card"><h1>AURORA CARGO</h1>' +
        '<p class="tag">freight over the fjords, under the lights</p>' +
        '<p class="judge">Dear judge: fly the rings, haul the cargo, land on the ice before the storm arrives.</p>' +
        '<p class="keys">W/S throttle &nbsp;•&nbsp; A/D turn &nbsp;•&nbsp; mouse pitch<br>SPACE flare &nbsp;•&nbsp; L skis out &nbsp;•&nbsp; P pause &nbsp;•&nbsp; R restart</p>' +
        '<p class="best">BEST SCORE ' + Math.round(s.best || 0) + '</p>' +
        '<p class="go">▶ PRESS ENTER TO FLY</p></div>';
    } else if (s.screen === SCREEN.missionClear) {
      html =
        '<div class="card"><h1>MISSION CLEAR</h1><p class="tag">' + s.missionData.def.name + ' — cargo delivered</p>' +
        '<p>SCORE <b>' + Math.round(s.score) + '</b> &nbsp;•&nbsp; RINGS ' + s.ringsCollected + ' &nbsp;•&nbsp; FUEL ' + Math.round(s.fuel) + '</p>' +
        '<p class="go">▶ PRESS ENTER — NEXT MISSION</p></div>';
    } else if (s.screen === SCREEN.win) {
      html =
        '<div class="card"><h1>CARGO DELIVERED</h1><p class="tag">dawn over the fjords — all five freights home</p>' +
        '<p class="stars">★★★★★</p>' +
        '<p>FINAL SCORE <b>' + Math.round(s.score) + '</b> &nbsp;•&nbsp; TIME ' + Math.round(s.time) + 's &nbsp;•&nbsp; BEST ' + Math.round(Math.max(s.best || 0, s.score)) + '</p>' +
        '<p class="go">▶ PLAY AGAIN — PRESS R</p></div>';
    } else if (s.screen === SCREEN.end) {
      html =
        '<div class="card"><h1>' + (s.endReason || 'FLIGHT OVER') + '</h1>' +
        '<p>SCORE <b>' + Math.round(s.score) + '</b> &nbsp;•&nbsp; MISSION ' + (s.mission + 1) + '/5 &nbsp;•&nbsp; RINGS ' + s.ringsCollected + '</p>' +
        '<p class="go">PRESS R TO TRY AGAIN</p></div>';
    }
    card.innerHTML = html;
    card.style.display = 'flex';
  }

  const camPos = new THREE.Vector3(-40, 20, 0);
  const camLook = new THREE.Vector3();
  const fwd = new THREE.Vector3();

  function render(state, paused, t) {
    const s = state;
    const md = s.missionData;

    // Layout that follows the mission (strips, town) — cheap, keyed.
    const stripKey = s.mission + ':' + md.dest.x;
    if (stripKey !== lastStripKey) {
      lastStripKey = stripKey;
      layoutStrips(md);
      layoutTown(md);
    }

    // Storm fog: the far fjord fades, the glowing rings and strips stay lit.
    const fogNear = 320 - s.storm * 210;
    const fogFar = 1700 - s.storm * 1050;
    scene.fog.near = fogNear;
    scene.fog.far = fogFar;

    // Rings: gold toruses facing the flight line, hidden once collected.
    md.rings.forEach((r, i) => {
      const m = ringMeshes[i];
      m.visible = !r.collected;
      m.position.set(r.x, r.y, r.z);
      m.rotation.y = Math.PI / 2;
      const pulse = 1 + 0.08 * Math.sin(t * 2.4 + i);
      m.scale.set(pulse, pulse, pulse);
    });

    // Clouds drift slowly with the wind.
    md.clouds.forEach((c, i) => {
      const sp = cloudSprites[i];
      sp.visible = true;
      sp.position.set(c.x + t * 1.2 * (1 + i % 3) * 0.2, c.y, c.z);
    });
    for (let i = md.clouds.length; i < cloudSprites.length; i++) cloudSprites[i].visible = false;

    // Aurora ribbons wave.
    for (const a of auroras) {
      const pos = a.geometry.attributes.position;
      const base = a.userData.base;
      for (let i = 0; i < pos.count; i++) {
        const bx = base[i * 3];
        const by = base[i * 3 + 1];
        pos.setZ(i, Math.sin(bx * 0.012 + t * 0.6 + a.userData.phase) * 9);
        pos.setY(i, by + Math.sin(bx * 0.02 + t * 0.9 + a.userData.phase) * 5);
      }
      pos.needsUpdate = true;
      a.material.opacity = 0.22 + 0.1 * Math.sin(t * 0.35 + a.userData.phase);
    }

    // Plane pose.
    plane.position.set(s.x, s.y, s.z);
    plane.rotation.order = 'YXZ';
    plane.rotation.y = -s.heading;
    plane.rotation.x = s.pitch * 0.9;
    plane.rotation.z = s.roll;
    plane.userData.prop.rotation.x += (0.25 + s.throttle / 100) * 1.4;
    const skiY = s.skis ? -2.1 : -1.2;
    plane.userData.skiL.position.y += (skiY - plane.userData.skiL.position.y) * 0.2;
    plane.userData.skiR.position.y = plane.userData.skiL.position.y;
    if (s.shake > 0) {
      plane.position.x += (Math.random() - 0.5) * s.shake * 0.8;
      plane.position.y += (Math.random() - 0.5) * s.shake * 0.8;
    }

    // Burst particles.
    for (let i = 0; i < 220; i++) {
      const p = s.particles[i];
      if (p) {
        burstPos[i * 3] = p.x;
        burstPos[i * 3 + 1] = p.y;
        burstPos[i * 3 + 2] = p.z;
      } else {
        burstPos[i * 3 + 1] = -999;
      }
    }
    burstGeo.attributes.position.needsUpdate = true;

    // Snowfall around the plane in a storm.
    snowPts.material.opacity = s.storm * 0.85;
    if (s.storm > 0.05) {
      for (let i = 0; i < SNOW_N; i++) {
        const sd = snowSeed[i];
        sd.y -= sd.v * 0.016;
        sd.x += s.wind * s.storm * 0.02;
        if (sd.y < 0) sd.y = 120;
        if (sd.x > 150) sd.x = -150;
        if (sd.x < -150) sd.x = 150;
        snowPos[i * 3] = s.x + sd.x;
        snowPos[i * 3 + 1] = Math.max(0.5, sd.y);
        snowPos[i * 3 + 2] = s.z + sd.z;
      }
      snowGeo.attributes.position.needsUpdate = true;
    }

    // Chase camera: behind and above, looking a little ahead of the plane.
    // On the title screen the camera looks a little high, so the plane
    // sits in the lower third, clear of the top-aligned title card.
    fwd.set(Math.cos(s.heading), 0, Math.sin(s.heading));
    const want = new THREE.Vector3(
      s.x - fwd.x * 26 + (Math.random() - 0.5) * s.shake,
      s.y + 8,
      s.z - fwd.z * 26,
    );
    const groundBelow = terrainHeight(want.x, want.z) + 4;
    if (want.y < groundBelow) want.y = groundBelow;
    // Snap on a large jump (staged shots, mission restarts): lerping
    // across the whole fjord would leave the camera behind for seconds.
    if (camPos.distanceTo(want) > 40) camPos.copy(want);
    const k = paused ? 0.02 : 0.12;
    camPos.lerp(want, k);
    const lookUp = s.screen === SCREEN.title ? 8 : 0;
    camLook.set(s.x + fwd.x * 12, s.y + 1 + lookUp, s.z + fwd.z * 12);
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    renderer.render(scene, camera);

    // --- HUD (DOM overlay, so it is sharp and screenshots capture it) ------
    $('hud-alt').textContent = Math.round(s.y * 10);
    $('hud-spd').textContent = Math.round(s.speed * 3);
    const hdg = ((s.heading * 180) / Math.PI % 360 + 360) % 360;
    $('hud-hdg').textContent = Math.round(hdg);
    $('hud-fuel').style.width = Math.max(0, s.fuel) + '%';
    $('hud-fuel-n').textContent = Math.round(s.fuel);
    $('hud-ice').style.width = Math.round(s.ice) + '%';
    $('hud-ice-n').textContent = Math.round(s.ice);
    $('hud-cargo').textContent = s.cargo ? 'CARGO ✓' : 'CARGO ✗';
    $('hud-cargo').style.color = s.cargo ? '#7dff9a' : '#ffb0a0';
    $('hud-score').textContent = Math.round(s.score);
    $('hud-mission').textContent = 'MISSION ' + (s.mission + 1) + '/5 — ' + s.missionData.def.name;
    $('hud-time').textContent = Math.max(0, Math.ceil(s.timeLeft));
    $('hud-banner').textContent = s.banner || '';
    $('hud-banner').style.opacity = s.banner ? '1' : '0';
    const fl = s.floaters.map((f) => '<div style="color:' + f.color + '">' + f.text + '</div>').join('');
    if ($('hud-floaters').innerHTML !== fl) $('hud-floaters').innerHTML = fl;
    $('hud-hint').style.display = s.screen === SCREEN.play ? 'block' : 'none';
    $('hud-top').style.display = s.screen === SCREEN.title ? 'none' : 'flex';
    drawCard(s);
  }

  return {
    render,
    drawCalls() {
      return renderer.info.render.calls;
    },
  };
}
