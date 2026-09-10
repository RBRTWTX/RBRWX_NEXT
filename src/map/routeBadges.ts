import type { Map as MapLibreMap } from 'maplibre-gl';
import { BROADCAST_IMAGE_IDS } from './broadcastMapContract';

export const TEXAS_ROUTE_BADGE_IMAGE_ID = BROADCAST_IMAGE_IDS.texasRouteBadge;

const WIDTH = 48;
const HEIGHT = 36;
const BORDER = 3;

function writePixel(data: Uint8Array, x: number, y: number, red: number, green: number, blue: number, alpha = 255): void {
  const offset = (y * WIDTH + x) * 4;
  data[offset] = red;
  data[offset + 1] = green;
  data[offset + 2] = blue;
  data[offset + 3] = alpha;
}

function createTexasGuideRouteBadge(): { width: number; height: number; data: Uint8Array } {
  const data = new Uint8Array(WIDTH * HEIGHT * 4);

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const border = x < BORDER || x >= WIDTH - BORDER || y < BORDER || y >= HEIGHT - BORDER;
      if (border) writePixel(data, x, y, 18, 18, 18);
      else writePixel(data, x, y, 250, 250, 247);
    }
  }

  return { width: WIDTH, height: HEIGHT, data };
}


/** Full-color artwork; never SDF/tinted. Render at 3x for high-DPI WebViews. */
export function createInterstateShield(digits: number): ImageData {
  const canvas = document.createElement('canvas');
  const width = digits === 3 ? 34 : 28;
  canvas.width = width * 3;
  canvas.height = 32 * 3;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot create Interstate shield canvas.');
  ctx.scale(3, 3);
  ctx.scale(width / 28, 1);
  const outline = new Path2D('M 2 2 Q 8 4 14 2 Q 20 4 26 2 L 26 15 C 26 23 21 28 14 30 C 7 28 2 23 2 15 Z');
  ctx.fillStyle = '#ffffff';
  ctx.fill(outline);
  ctx.save();
  ctx.clip(outline);
  ctx.fillStyle = '#003f87';
  ctx.fillRect(1, 10, 26, 21);
  ctx.fillStyle = '#bf0a30';
  ctx.fillRect(1, 1, 26, 9);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(1, 9, 26, 1.2);
  ctx.font = 'bold 4px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('INTERSTATE', 14, 6.3, 23);
  ctx.restore();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.6;
  ctx.stroke(outline);
  ctx.strokeStyle = '#263341';
  ctx.lineWidth = 0.55;
  ctx.stroke(outline);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * MapLibre 6 no longer allows styleimagemissing listeners to satisfy the
 * current image request. This resolver is installed before the broadcast
 * style is consumed so locally owned guide-route badges are always available.
 */
export function installBroadcastRouteImageResolver(map: MapLibreMap): void {
  map.setMissingStyleImageResolver((id) => {
    const interstate = /^rbrwx-us-interstate_([123])$/.exec(id);
    if (interstate) {
      map.addImage(id, createInterstateShield(Number(interstate[1])), { pixelRatio: 3, sdf: false });
      return;
    }
    if (id !== TEXAS_ROUTE_BADGE_IMAGE_ID) return;

    map.addImage(id, createTexasGuideRouteBadge(), {
      pixelRatio: 2,
      stretchX: [[10, 38]],
      stretchY: [[10, 26]],
      content: [7, 6, 41, 30],
    });
  });
}
