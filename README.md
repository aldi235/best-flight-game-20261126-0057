# Meridian Courier

An original 3D flight game: you are a courier pilot flying a small prop plane
between the airstrips of the Meridian Isles. Take off from a runway, thread
glowing target rings along a route, deliver cargo, and land on the next strip
before the fuel runs out.

## Missions

- **Ring Run** — thread 6 rings from Meridian Field to Cape Lark and back, then land home. Fast and clean wins.
- **Island Delivery** — land at Gull Rock, Palm Cay and Tern Bluff in order, delivering cargo at each strip. Deliveries refuel you by 25%.
- **Storm Landing** — crosswind, only 55% fuel, one runway at Cape Lark. Thread two guide rings and put her down slow and straight.

## Flying

- **↑ / ↓ or W / S** — pitch nose down / up
- **← / → or A / D** — bank left / right (the plane turns toward the low wing)
- **Shift / Ctrl (or E / Q)** — throttle up / down
- **C** — toggle chase / cockpit camera (cockpit view has a lit six-dial gauge cluster)
- **Mouse drag** — look around
- **P** — pause · **R** — restart sortie · **M** — mute · **1 / 2 / 3** — pick a mission from the menu

The HUD always shows altitude, airspeed, heading and vertical speed, plus a
compass strip, an artificial horizon, throttle and fuel bars, a timer and the
current objective. A gold beacon pillar marks the next ring or runway from
anywhere in the sky.

Fuel burns faster at full throttle; empty tanks mean a glide. Below flying
speed the wing stalls — nose down, throttle up. Hard landings damage the
airframe; a very hard one ends the sortie.

## Tech

Real 3D with Three.js (vendored UMD build under `game/vendor/`), procedural
island terrain from a seeded heightmap, a low-poly prop plane built from
Three.js geometry, and synthesised WebAudio sound (engine hum, ring chime,
touchdown thud, stall alarm). No images, no network requests at runtime —
every file the game loads lives under `game/`.

Source is split into one-job files under `game/src/`: `config.js` (tuning and
world layout), `input.js`, `audio.js`, `terrain.js`, `aircraft.js`,
`flight.js` (physics: lift, drag, stall, throttle), `missions.js`, `hud.js`,
`render.js`, `shots.js` (deterministic staged screenshot scenes) and `main.js`
(the loop and screens).

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser.

Screenshot scenes (used for the entry's screenshots) are staged with
`?shot=cover`, `?shot=ring`, `?shot=cockpit` or `?shot=landing`.
