// Three.js scene: sky, sun, fog, the terrain and the plane, two cameras
// (chase and cockpit) that never fight the pilot, and the beacon that marks
// the next objective from anywhere in the sky.
import { WORLD, clamp, lerp } from './config.js';
import { createTerrain, createRings } from './terrain.js';
import { createAircraft } from './aircraft.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

export function createRenderer(container) {
  const THREE = window.THREE;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.id = 'gl';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8ec3e8);
  scene.fog = new THREE.Fog(0xa8c8e0, 900, 3800);

  const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.5, 9000);

  // Sun + sky fill so the islands read in one warm daylight style.
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.15);
  sun.position.set(900, 1200, 400);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe0f5, 0x4a6b46, 0.75));

  // A low sun disc and a gradient sky dome for the horizon line.
  const skyGeo = new THREE.SphereGeometry(6000, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x3f8fd2) },
      mid: { value: new THREE.Color(0x8ec3e8) },
      low: { value: new THREE.Color(0xe8f0f2) },
    },
    vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader:
      'varying vec3 vPos; uniform vec3 top; uniform vec3 mid; uniform vec3 low;' +
      'void main(){ float h = normalize(vPos).y; vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.7, h)) : mix(low, mid, smoothstep(-0.08, 0.12, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyDome);
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(140, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false }),
  );
  sunDisc.position.set(2600, 1500, -4200);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);

  const terrain = createTerrain(scene);
  const aircraft = createAircraft(scene);

  // Beacon: a tall light pillar over the next objective, visible across the map.
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 6, 700, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc21c, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  beacon.visible = false;
  scene.add(beacon);
  const beaconTop = new THREE.Mesh(
    new THREE.SphereGeometry(10, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffc21c, transparent: true, opacity: 0.7 }),
  );
  beaconTop.visible = false;
  scene.add(beaconTop);

  let rings = null;
  const chasePos = new THREE.Vector3();
  let chaseInit = false;
  const chaseLook = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);

  return {
    renderer,
    scene,
    camera,
    aircraft,
    /** Replace the ring set when a mission starts. */
    setRings(ringDefs) {
      if (rings) rings.dispose();
      rings = ringDefs ? createRings(scene, ringDefs) : null;
      return rings;
    },
    get rings() {
      return rings;
    },
    /** One frame: move the plane, chase or cockpit camera, beacon, clouds. */
    draw(state, run, cameraMode, look, time, dt) {
      aircraft.pose(state);
      aircraft.spinProp(dt, state.throttle);
      terrain.update(dt);
      if (rings) rings.update(time);

      // Forward vector from heading and pitch.
      forward.set(
        -Math.sin(state.heading) * Math.cos(state.pitch),
        Math.sin(state.pitch),
        -Math.cos(state.heading) * Math.cos(state.pitch),
      );

      if (cameraMode === 'cockpit') {
        aircraft.setCockpitMode(true);
        // Eye point behind the canopy, high above the fuselage so the nose
        // is a strip at the bottom of the frame, gazing slightly up the
        // flight path; mouse drag looks around.
        const px = state.x - forward.x * 0.5;
        const py = state.y + 3.0 - forward.y * 0.5;
        const pz = state.z - forward.z * 0.5;
        camera.position.set(px, py, pz);
        const lookX = look.x * 0.002;
        const lookY = look.y * 0.002;
        const right = new THREE.Vector3().crossVectors(forward, up).normalize();
        const lookDir = forward.clone()
          .addScaledVector(right, -lookX)
          .addScaledVector(up, -lookY + 0.05)
          .normalize();
        camera.lookAt(px + lookDir.x * 40, py + lookDir.y * 40, pz + lookDir.z * 40);
        camera.rotateZ(state.roll * 0.9);
        camera.fov = 74;
      } else if (cameraMode === 'side') {
        // Hero shot: three-quarter view of the parked plane from the side,
        // far enough back that the whole plane and runway read.
        aircraft.setCockpitMode(false);
        const right = new THREE.Vector3().crossVectors(forward, up).normalize();
        camera.position.set(
          state.x + right.x * 42 - forward.x * 16,
          state.y + 14,
          state.z + right.z * 42 - forward.z * 16,
        );
        // Look past the plane so it sits right of centre, clear of the panel.
        camera.lookAt(state.x - right.x * 20, state.y + 1, state.z - right.z * 20);
        camera.fov = 55;
      } else {
        aircraft.setCockpitMode(false);
        // Chase: settle behind and above the plane, eased so it never snaps.
        const back = 20 + state.speed * 0.06;
        const height = 7 + state.speed * 0.02;
        const desired = new THREE.Vector3(
          state.x - forward.x * back,
          state.y + height,
          state.z - forward.z * back,
        );
        const groundClear = 4;
        if (desired.y < groundClear) desired.y = groundClear;
        if (!chaseInit) {
          chasePos.copy(desired);
          chaseInit = true;
        }
        chasePos.lerp(desired, 1 - Math.pow(0.001, dt));
        camera.position.copy(chasePos);
        chaseLook.set(
          state.x + forward.x * 26,
          state.y + forward.y * 26 + 1,
          state.z + forward.z * 26,
        );
        camera.lookAt(chaseLook);
        camera.rotateZ(clamp(state.roll * 0.22, -0.2, 0.2));
        camera.fov = 62;
      }
      camera.updateProjectionMatrix();
      skyDome.position.copy(camera.position);
      sunDisc.position.set(camera.position.x + 2600, 1500, camera.position.z - 4200);

      // Beacon over the next objective.
      if (run && run.objective) {
        const obj = run.objective;
        const bx = obj.kind === 'ring' ? obj.ring.x : obj.strip.x;
        const by = obj.kind === 'ring' ? obj.ring.y : obj.strip.y + 40;
        const bz = obj.kind === 'ring' ? obj.ring.z : obj.strip.z;
        beacon.visible = true;
        beaconTop.visible = true;
        beacon.position.set(bx, by + 300, bz);
        beaconTop.position.set(bx, by + 40 + Math.sin(time * 2) * 6, bz);
      } else {
        beacon.visible = false;
        beaconTop.visible = false;
      }

      renderer.render(scene, camera);
    },
    /** Paint once without advancing the game (screenshot staging). */
    renderOnce() {
      renderer.render(scene, camera);
    },
    dispose() {
      renderer.dispose();
    },
  };
}
