import { join } from 'node:path';
import { app, nativeImage, type NativeImage } from 'electron';

const ICON_SIZE = 1024;
const PADDING = 96;
const BADGE_COLOR = { r: 255, g: 204, b: 0 };

export function getDevDockIcon(): NativeImage | null {
  if (app.isPackaged) return null;
  const iconPath = join(__dirname, '../../build/icon.png');
  const base = nativeImage.createFromPath(iconPath);
  if (base.isEmpty()) return null;
  return composeDevIcon(base);
}

function composeDevIcon(base: NativeImage): NativeImage {
  const inner = ICON_SIZE - 2 * PADDING;
  const cornerRadius = Math.round(inner * 0.225);

  const sized = base.resize({ width: inner, height: inner, quality: 'best' });
  const innerBitmap = Buffer.from(sized.toBitmap());
  const out = Buffer.alloc(ICON_SIZE * ICON_SIZE * 4);

  for (let y = 0; y < inner; y++) {
    for (let x = 0; x < inner; x++) {
      const mask = roundedCornerAlpha(x, y, inner, inner, cornerRadius);
      if (mask <= 0) continue;
      const srcI = (y * inner + x) * 4;
      const dstI = ((y + PADDING) * ICON_SIZE + (x + PADDING)) * 4;
      out[dstI] = innerBitmap[srcI];
      out[dstI + 1] = innerBitmap[srcI + 1];
      out[dstI + 2] = innerBitmap[srcI + 2];
      out[dstI + 3] = Math.round(innerBitmap[srcI + 3] * mask);
    }
  }

  drawBadge(out);
  return nativeImage.createFromBitmap(out, {
    width: ICON_SIZE,
    height: ICON_SIZE,
  });
}

function drawBadge(out: Buffer) {
  const { r, g, b } = BADGE_COLOR;
  const radius = Math.round(ICON_SIZE * 0.11);
  const cx = ICON_SIZE - PADDING - Math.round(radius * 0.3);
  const cy = PADDING + Math.round(radius * 0.3);

  const minY = Math.max(0, cy - radius - 1);
  const maxY = Math.min(ICON_SIZE - 1, cy + radius + 1);
  const minX = Math.max(0, cx - radius - 1);
  const maxX = Math.min(ICON_SIZE - 1, cx + radius + 1);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let a = 0;
      if (dist <= radius - 1) a = 1;
      else if (dist < radius) a = radius - dist;
      if (a <= 0) continue;

      const i = (y * ICON_SIZE + x) * 4;
      const bgA = out[i + 3] / 255;
      const finalA = a + bgA * (1 - a);
      out[i] = Math.round((b * a + out[i] * bgA * (1 - a)) / finalA);
      out[i + 1] = Math.round((g * a + out[i + 1] * bgA * (1 - a)) / finalA);
      out[i + 2] = Math.round((r * a + out[i + 2] * bgA * (1 - a)) / finalA);
      out[i + 3] = Math.round(finalA * 255);
    }
  }
}

function roundedCornerAlpha(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): number {
  const dx = Math.min(x, w - 1 - x);
  const dy = Math.min(y, h - 1 - y);
  if (dx >= r || dy >= r) return 1;
  const distFromCorner = Math.sqrt((r - dx) ** 2 + (r - dy) ** 2);
  if (distFromCorner <= r - 1) return 1;
  if (distFromCorner < r) return r - distFromCorner;
  return 0;
}
