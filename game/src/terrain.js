// Procedural terrain: seeded value-noise islands rising out of a sea, plus the
// sky, sun, clouds, runways and the glowing target rings. The same
// groundHeight() the mesh is built from is what the flight model collides with,
// so a hill you see is a hill you can hit.
import { AIRSTRIPS, ISLANDS, WORLD } from './config.js';

// --- deterministic noise (mulberry32 + value noise) -------------------------
function mulberry32(seed) {
  let a = seed | 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(seed) {
  const rand = mulberry32(seed);
  const grid = new Float32Array(64 * 64);
  for (let i = 0; i < grid.length; i += 1) grid[i] = rand();
  function sample(ix, iz) {
    const x = ((ix % 64) + 64) % 64;
    const z = ((iz % 64) + 64) % 64;
    return grid[z * 64 + x];
  }
  return function noise(x, z) {
    // Smooth value noise at two octaves, in world metres.
    let total = 0;
    let amp = 1;
    let freq = 1 / 260;
    for (let octave = 0; octave < 2; octave += 1) {
      const fx = x * freq;
      const fz = z * freq;
      const ix = Math.floor(fx);
      const iz = Math.floor(fz);
      const tx = fx - ix;
      const tz = fz - iz;
      const sx = tx * tx * (3 - 2 * tx);
      const sz = tz * tz * (3 - 2 * tz);
      const v =
        sample(ix, iz) * (1 - sx) * (1 - sz) +
        sample(ix + 1, iz) * sx * (1 - sz) +
        sample(ix, iz + 1) * (1 - sx) * sz +
        sample(ix + 1, iz + 1) * sx * sz;
      total += v * amp;
      amp *= 0.5;
      freq *= 2.3;
    }
    return total / 1.5; // 0..~1
  };
}

const noise = makeNoise(20261126);

/** Height of the ground in metres at (x, z); 0 over open sea. */
export function groundHeight(x, z) {
  let height = 0;
  for (const island of ISLANDS) {
    const dx = x - island.x;
    const dz = z - island.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist >= island.radius) continue;
    const falloff = 1 - dist / island.radius;
    const dome = Math.pow(falloff, 1.6);
    height = Math.max(height, dome * island.peak * (0.55 + 0.45 * noise(x, z)));
  }
  // Flatten the ground under every runway so landings are fair: a flat pad
  // exactly the runway's size, feathering out over a 40 m margin. (A radial
  // blend lets the island dome poke through the strip itself.)
  for (const strip of AIRSTRIPS) {
    const rad = (strip.heading * Math.PI) / 180;
    const dx = x - strip.x;
    const dz = z - strip.z;
    const along = Math.abs(Math.sin(rad) * dx + Math.cos(rad) * dz);
    const across = Math.abs(Math.cos(rad) * dx - Math.sin(rad) * dz);
    const margin = 40;
    const over = Math.max(0, along - strip.length / 2, across - strip.width / 2);
    if (over < margin) {
      const flat = 1 - over / margin;
      const smooth = flat * flat * (3 - 2 * flat);
      height = height * (1 - smooth) + 6 * smooth;
    }
  }
  return height;
}

/** A runway's world position, flattened height included. */
export function stripPosition(strip) {
  return { x: strip.x, y: groundHeight(strip.x, strip.z), z: strip.z };
}

export function createTerrain(scene) {
  const THREE = window.THREE;
  const group = new THREE.Group();
  group.name = 'terrain';

  // Sea: one big plane with a gentle normal ripple baked into the colour.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.size * 2.4, WORLD.size * 2.4, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0x1e6f8e }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = WORLD.seaLevel + 0.6; // above the land plane's flat seabed: no z-fighting
  group.add(sea);

  // Islands: a displaced plane, coloured by height (sand -> grass -> rock).
  const segments = 180;
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color(0xc9a95e);
  const grass = new THREE.Color(0x3e7d32);
  const forest = new THREE.Color(0x27632a);
  const rock = new THREE.Color(0x8a7f74);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, h);
    if (h < 3) tmp.copy(sand);
    else if (h < 55) tmp.copy(grass).lerp(forest, Math.min(1, h / 55));
    else tmp.copy(forest).lerp(rock, Math.min(1, (h - 55) / 70));
    // Speckle so the ground reads as terrain, not a flat wash.
    const speckle = 0.95 + 0.1 * noise(x * 3.1, z * 3.1);
    colors[i * 3] = tmp.r * speckle;
    colors[i * 3 + 1] = tmp.g * speckle;
    colors[i * 3 + 2] = tmp.b * speckle;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const land = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  group.add(land);

  // Runways: dark strips with white centre dashes and a windsock mast.
  const runwayMat = new THREE.MeshLambertMaterial({ color: 0x33363d });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5f2e8 });
  const sockMat = new THREE.MeshLambertMaterial({ color: 0xff7a1a });
  for (const strip of AIRSTRIPS) {
    const p = stripPosition(strip);
    const runway = new THREE.Mesh(new THREE.PlaneGeometry(strip.length, strip.width), runwayMat);
    runway.rotation.x = -Math.PI / 2;
    runway.rotation.z = -((strip.heading * Math.PI) / 180);
    runway.position.set(p.x, p.y + 0.4, p.z);
    group.add(runway);
    for (let d = -strip.length / 2 + 24; d < strip.length / 2 - 10; d += 40) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.2), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.rotation.z = -((strip.heading * Math.PI) / 180);
      const rad = (strip.heading * Math.PI) / 180;
      dash.position.set(
        p.x + Math.sin(rad) * d,
        p.y + 0.6,
        p.z + Math.cos(rad) * d,
      );
      group.add(dash);
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 14, 6), sockMat);
    mast.position.set(p.x + 22, p.y + 7, p.z + strip.width);
    group.add(mast);
    const sock = new THREE.Mesh(new THREE.ConeGeometry(1.6, 7, 8), sockMat);
    sock.rotation.z = Math.PI / 2;
    sock.position.set(p.x + 26, p.y + 13.5, p.z + strip.width);
    group.add(sock);
  }

  // Clouds: clusters of flattened white spheres drifting slowly.
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 });
  const clouds = [];
  const cloudRand = mulberry32(77);
  for (let c = 0; c < 26; c += 1) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(cloudRand() * 3);
    for (let k = 0; k < puffs; k += 1) {
      const r = 18 + cloudRand() * 26;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), cloudMat);
      puff.scale.y = 0.42;
      puff.position.set((cloudRand() - 0.5) * 70, (cloudRand() - 0.5) * 8, (cloudRand() - 0.5) * 40);
      cloud.add(puff);
    }
    cloud.position.set(
      (cloudRand() - 0.5) * WORLD.size * 1.6,
      230 + cloudRand() * 160,
      (cloudRand() - 0.5) * WORLD.size * 1.6,
    );
    cloud.userData.speed = 2 + cloudRand() * 3;
    clouds.push(cloud);
    group.add(cloud);
  }

  // A few pine trees on the home island for scale.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e6b2e });
  const treeRand = mulberry32(5150);
  for (let t = 0; t < 60; t += 1) {
    const angle = treeRand() * Math.PI * 2;
    const dist = 120 + treeRand() * 380;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const h = groundHeight(x, z);
    if (h < 8) continue;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 6, 6), trunkMat);
    trunk.position.y = 3;
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(5, 14, 8), leafMat);
    leaves.position.y = 12;
    tree.add(trunk);
    tree.add(leaves);
    tree.position.set(x, h, z);
    group.add(tree);
  }

  scene.add(group);
  return {
    group,
    clouds,
    update(dt) {
      for (const cloud of clouds) {
        cloud.position.x += cloud.userData.speed * dt;
        if (cloud.position.x > WORLD.size) cloud.position.x = -WORLD.size;
      }
    },
  };
}

/** Build the glowing target rings for a route; returns meshes + per-ring state. */
export function createRings(scene, ringDefs) {
  const THREE = window.THREE;
  const group = new THREE.Group();
  group.name = 'rings';
  const rings = ringDefs.map((def) => {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(def.radius, 1.6, 12, 40),
      new THREE.MeshBasicMaterial({ color: 0xffc21c }),
    );
    mesh.position.set(def.x, def.y, def.z);
    mesh.rotation.y = def.facing;
    const inner = new THREE.Mesh(
      new THREE.TorusGeometry(def.radius * 0.82, 0.5, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffe98a, transparent: true, opacity: 0.7 }),
    );
    mesh.add(inner);
    group.add(mesh);
    return { ...def, mesh, passed: false };
  });
  scene.add(group);
  return {
    group,
    rings,
    setPassed(index) {
      rings[index].mesh.material.color.setHex(0x37d67a);
      rings[index].passed = true;
    },
    highlight(index) {
      rings.forEach((ring, i) => {
        if (!ring.passed) ring.mesh.material.color.setHex(i === index ? 0xffc21c : 0x8a6d1f);
      });
    },
    update(time) {
      for (const ring of rings) {
        if (ring.passed) continue;
        const pulse = 1 + Math.sin(time * 3 + ring.x) * 0.05;
        ring.mesh.scale.set(pulse, pulse, pulse);
      }
    },
    dispose() {
      scene.remove(group);
    },
  };
}
