/**
 * One-shot icon generator for the admin and portal PWA manifests.
 *
 * Outputs to public/icons/{admin,portal}-{192,512,maskable}.png. Source is
 * public/logo.png. Run with `node scripts/pwa/generate-icons.mjs` whenever
 * the source logo changes — the produced PNGs are committed to git.
 *
 * Maskable variants leave a 20% safe-zone pad so launcher rounded-square
 * masks don't crop the glyph. Background swatches:
 *   - portal: brand blue (#2563eb) — matches the marketing site theme
 *   - admin:  dark slate  (#0f172a) — matches the admin shell chrome
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..', '..');
const SRC = resolve(ROOT, 'public', 'logo.png');
const OUT = resolve(ROOT, 'public', 'icons');

const PALETTES = {
  portal: { bg: '#2563eb' },
  admin:  { bg: '#0f172a' },
};

await mkdir(OUT, { recursive: true });

async function compose({ size, padPct, bg, glyphTint }) {
  const inner = Math.round(size * (1 - padPct * 2));
  const offset = Math.round((size - inner) / 2);

  let glyph = sharp(SRC).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });

  if (glyphTint === 'white') {
    glyph = glyph.ensureAlpha().tint('#ffffff');
  }

  const glyphBuffer = await glyph.png().toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: bg,
    },
  })
    .composite([{ input: glyphBuffer, left: offset, top: offset }])
    .png();
}

async function emit(name, surface, opts) {
  const out = resolve(OUT, `${surface}-${name}.png`);
  const img = await compose(opts);
  await img.toFile(out);
  console.log(`wrote ${out}`);
}

for (const surface of Object.keys(PALETTES)) {
  const { bg } = PALETTES[surface];
  const glyphTint = surface === 'admin' ? 'white' : null;

  await emit('192', surface, { size: 192, padPct: 0.10, bg, glyphTint });
  await emit('512', surface, { size: 512, padPct: 0.10, bg, glyphTint });
  await emit('maskable', surface, { size: 512, padPct: 0.20, bg, glyphTint });
}

console.log('done');
