// Meridian Courier — hand-in program (Node 22, standard library only). The
// game is this directory's game/ folder, plain static files a desktop browser
// loads offline (game/index.html, its ES modules and a vendored Three.js
// build under game/vendor/, no network request), and the program hands it in.
// It copies game/ and screenshots/ from beside this file to /output and
// writes /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library. Screenshots are guarded first: the scorer refuses an
// entry with fewer than 3 or more than 4 screenshots, or any one over 256 KiB,
// so a bad set fails loudly here instead of silently at the gate.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const MAX_SCREENSHOT_BYTES = 262144;

// Guard the screenshot set before anything is copied: 3 or 4 files, each a
// regular file of at most 256 KiB, matching the scorer's screenshots row.
function checkScreenshots() {
  const dir = join(here, 'screenshots');
  if (!existsSync(dir)) throw new Error('screenshots/ is missing: take 3 or 4 screenshots first');
  const names = readdirSync(dir)
    .filter((name) => !name.startsWith('.'))
    .sort();
  if (names.length < 3 || names.length > 4) {
    throw new Error(`screenshots/ must hold 3 or 4 images, found ${names.length}`);
  }
  for (const name of names) {
    const file = join(dir, name);
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error(`screenshots/${name} is not a regular file`);
    if (stats.size > MAX_SCREENSHOT_BYTES) {
      throw new Error(`screenshots/${name} is ${stats.size} bytes, over the 256 KiB cap`);
    }
  }
}

checkScreenshots();

// Guard the game folder too: index.html must exist and fit the scorer's 1 MiB
// cap, and game/ must stay inside its file and byte caps, before anything is
// copied — a build that grew past a cap should fail here, not at the gate.
function checkGame() {
  const index = join(here, 'game', 'index.html');
  if (!existsSync(index)) throw new Error('game/index.html is missing');
  const indexSize = statSync(index).size;
  if (indexSize > 1048576) throw new Error(`game/index.html is ${indexSize} bytes, over the 1 MiB cap`);
  let files = 0;
  let bytes = 0;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      const stats = statSync(file);
      if (stats.isDirectory()) walk(file);
      else {
        files += 1;
        bytes += stats.size;
      }
    }
  };
  walk(join(here, 'game'));
  if (files > 993) throw new Error(`game/ holds ${files} files, over the 993 cap`);
  if (bytes > 50331648) throw new Error(`game/ is ${bytes} bytes, over the 48 MiB cap`);
}

checkGame();

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// Report what was handed in, so a run's log shows the entry at a glance.
const dossierBytes = statSync(join(out, 'dossier.json')).size;
const shotCount = readdirSync(join(out, 'screenshots')).filter((name) => !name.startsWith('.')).length;
console.log(`Meridian Courier handed in: ${shotCount} screenshots, dossier.json ${dossierBytes} bytes -> ${out}`);
