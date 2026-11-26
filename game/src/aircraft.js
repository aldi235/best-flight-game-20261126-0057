// The courier plane, built from Three.js geometry: fuselage, wings, tail,
// spinning prop, landing gear and a lit cockpit panel. No model files.
export function createAircraft(scene) {
  const THREE = window.THREE;
  const plane = new THREE.Group();
  plane.name = 'courier-plane';

  const orange = new THREE.MeshLambertMaterial({ color: 0xe86a1c });
  const cream = new THREE.MeshLambertMaterial({ color: 0xf5efe0 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2c313a });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fd8ef, emissive: 0x2a5a70 });
  const metal = new THREE.MeshLambertMaterial({ color: 0x8b939e });

  // Fuselage: a tapered cylinder along +Z (nose forward is -Z in three.js
  // forward terms, so the nose cone points to -Z).
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 7.2, 12), orange);
  body.rotation.x = Math.PI / 2;
  plane.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.2, 12), cream);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -4.6;
  plane.add(nose);
  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.4, 12), orange);
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.z = 4.6;
  plane.add(tailCone);

  // Canopy: a flattened glass dome the pilot sits under.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.05, 14, 10), glass);
  canopy.scale.set(0.85, 0.62, 1.7);
  canopy.position.set(0, 1.05, -1.2);
  plane.add(canopy);

  // Main wings, low-wing, with cream tips.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.28, 2.3), cream);
  wing.position.set(0, -0.25, -0.4);
  plane.add(wing);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 2.3), orange);
    tip.position.set(side * 6.4, -0.25, -0.4);
    plane.add(tip);
    // Navigation lights: red port, green starboard.
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff2a2a : 0x2aff5a }),
    );
    light.position.set(side * 6.9, -0.2, -0.4);
    plane.add(light);
  }

  // Tail: horizontal stabiliser + vertical fin with a courier stripe.
  const stab = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.22, 1.5), cream);
  stab.position.set(0, 0.25, 4.6);
  plane.add(stab);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.6, 2.0), orange);
  fin.position.set(0, 1.3, 4.7);
  plane.add(fin);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 2.05), cream);
  stripe.position.set(0, 1.9, 4.7);
  plane.add(stripe);

  // Propeller: hub + two blades + a translucent spin disc.
  const prop = new THREE.Group();
  prop.position.set(0, 0, -5.9);
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.0, 10), metal);
  hub.rotation.x = -Math.PI / 2;
  prop.add(hub);
  for (const angle of [0, Math.PI]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.8, 0.16), dark);
    blade.rotation.z = angle;
    prop.add(blade);
  }
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(2.3, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, side: THREE.DoubleSide }),
  );
  prop.add(disc);
  plane.add(prop);

  // Fixed landing gear: two wheels and a tail wheel.
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 6), metal);
    strut.position.set(side * 1.1, -1.5, -0.6);
    plane.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.35, 12), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.1, -2.3, -0.6);
    plane.add(wheel);
  }

  // Cockpit dashboard: a dark panel with glowing dial faces, visible in cockpit view.
  const dash = new THREE.Group();
  dash.position.set(0, 0.35, -2.6);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 0.25), dark);
  dash.add(panel);
  const dialColors = [0x37d67a, 0xffc21c, 0x4fc3f7, 0xff7a1a, 0x37d67a, 0x4fc3f7];
  dialColors.forEach((color, i) => {
    const dial = new THREE.Mesh(
      new THREE.CircleGeometry(0.16, 16),
      new THREE.MeshBasicMaterial({ color }),
    );
    dial.position.set(-0.85 + (i % 3) * 0.85, i < 3 ? 0.22 : -0.25, 0.14);
    dash.add(dial);
  });
  plane.add(dash);

  scene.add(plane);
  return {
    group: plane,
    prop,
    /** In cockpit view the canopy glass and the 3D dash would fill the lens,
     *  so hide them there — the DOM gauge cluster is the cockpit's instruments. */
    setCockpitMode(on) {
      canopy.visible = !on;
      dash.visible = !on;
    },
    /** Apply the flight state to the mesh: position, heading, pitch, bank. */
    pose(state) {
      plane.position.set(state.x, state.y, state.z);
      plane.rotation.order = 'YXZ';
      plane.rotation.y = state.heading;
      plane.rotation.x = state.pitch;
      plane.rotation.z = state.roll;
    },
    spinProp(dt, throttle) {
      prop.rotation.z += dt * (6 + throttle * 90);
    },
  };
}
