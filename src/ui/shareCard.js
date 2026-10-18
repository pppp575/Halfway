import { geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo';
import { bucketIndex } from '../lib/scoring.js';

const W = 1080;
const H = 1350;
const C = {
  bg: '#0F1D38',
  ocean: '#14264A',
  land: '#22365C',
  border: '#2F4772',
  grat: 'rgba(255,255,255,0.05)',
  flap: '#FFD24D',
  muted: '#A9BAD6',
  white: '#FFFFFF',
  red: '#E5483F',
  blue: '#2148A8',
  buckets: ['#2E8F57', '#D9A514', '#E2702A', '#C9302C'],
};
const DISPLAY = '"Big Shoulders Display", "Arial Narrow", Impact, sans-serif';
const BODY = 'Overpass, system-ui, sans-serif';

function stripe(ctx, y, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y, W, h);
  ctx.clip();
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, y, W, h);
  for (let x = -h * 2; x < W + h * 2; x += 84) {
    [
      [0, C.red],
      [42, C.blue],
    ].forEach(([dx, color]) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x + dx, y + h);
      ctx.lineTo(x + dx + 28, y + h);
      ctx.lineTo(x + dx + 28 + h, y);
      ctx.lineTo(x + dx + h, y);
      ctx.closePath();
      ctx.fill();
    });
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Draws a 1080×1350 result card.
 * data: { title, subtitle, total, max, scores, rankText, hard, routes: [{ a, b, m }], features, url }
 */
export async function renderShareCard(data) {
  if (document.fonts?.load) {
    await Promise.all([document.fonts.load(`900 100px ${DISPLAY}`), document.fonts.load(`600 40px ${BODY}`)]).catch(() => {});
  }
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  stripe(ctx, 0, 24);
  stripe(ctx, H - 24, 24);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.white;
  ctx.font = `900 112px ${DISPLAY}`;
  ctx.fillText('Halfway', 80, 158);
  ctx.fillStyle = C.muted;
  ctx.font = `600 38px ${BODY}`;
  ctx.fillText(data.subtitle, 84, 212);
  if (data.hard) {
    ctx.font = `800 30px ${BODY}`;
    const label = 'Hard mode';
    const w = ctx.measureText(label).width + 36;
    roundRect(ctx, W - 80 - w, 112, w, 50, 25);
    ctx.fillStyle = C.flap;
    ctx.fill();
    ctx.fillStyle = C.bg;
    ctx.fillText(label, W - 80 - w + 18, 148);
  }

  // Map with the day's five routes
  const mapTop = 252;
  const projection = geoNaturalEarth1().fitWidth(W - 120, { type: 'Sphere' });
  const mb = geoPath(projection).bounds({ type: 'Sphere' });
  projection.translate([projection.translate()[0] + 60 - mb[0][0], projection.translate()[1] + mapTop - mb[0][1]]);
  const path = geoPath(projection, ctx);
  ctx.beginPath();
  path({ type: 'Sphere' });
  ctx.fillStyle = C.ocean;
  ctx.fill();
  ctx.beginPath();
  path(geoGraticule10());
  ctx.strokeStyle = C.grat;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  data.features.forEach((f) => path(f));
  ctx.fillStyle = C.land;
  ctx.fill();
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.lineCap = 'round';
  data.routes.forEach((r) => {
    ctx.beginPath();
    path({ type: 'LineString', coordinates: [r.a, r.b] });
    ctx.strokeStyle = C.flap;
    ctx.lineWidth = 5;
    ctx.stroke();
  });
  data.routes.forEach((r) => {
    const [x, y] = projection(r.m);
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.strokeStyle = C.white;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = C.red;
    ctx.fill();
  });

  // Score
  ctx.fillStyle = C.flap;
  ctx.font = `900 230px ${DISPLAY}`;
  const scoreText = String(data.total);
  ctx.fillText(scoreText, 72, 985);
  const sw = ctx.measureText(scoreText).width;
  ctx.fillStyle = C.muted;
  ctx.font = `600 46px ${BODY}`;
  ctx.fillText(`out of ${data.max}`, 72 + sw + 26, 985);
  if (data.rankText) {
    ctx.fillStyle = C.white;
    ctx.font = `700 42px ${BODY}`;
    ctx.fillText(data.rankText, 80, 1060);
  }

  // One tile per round
  const size = 148;
  const gap = (W - 160 - size * 5) / 4;
  data.scores.forEach((s, i) => {
    const x = 80 + i * (size + gap);
    const y = 1096;
    roundRect(ctx, x, y, size, size, 18);
    ctx.fillStyle = C.buckets[bucketIndex(s)];
    ctx.fill();
    ctx.fillStyle = C.white;
    ctx.font = `900 72px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(s), x + size / 2, y + size / 2 + 26);
    ctx.textAlign = 'left';
  });

  if (data.url) {
    ctx.fillStyle = C.muted;
    ctx.font = `600 32px ${BODY}`;
    ctx.fillText(data.url.replace(/^https?:\/\//, ''), 80, H - 54);
  }

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
}

/** Shares the image where the browser supports it, otherwise downloads it. */
export async function shareImage(blob, filename, text) {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
