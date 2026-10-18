import { drag as d3drag } from 'd3-drag';
import { easeCubicInOut, easeCubicOut } from 'd3-ease';
import {
  geoClipAntimeridian,
  geoClipCircle,
  geoDistance,
  geoGraticule10,
  geoInterpolate,
  geoNaturalEarth1,
  geoNaturalEarth1Raw,
  geoOrthographic,
  geoOrthographicRaw,
  geoPath,
  geoProjectionMutator,
} from 'd3-geo';
import { pointer, select } from 'd3-selection';
import { timer } from 'd3-timer';
import 'd3-transition';
import { zoom as d3zoom, zoomIdentity } from 'd3-zoom';
import { kmBetween, normLon } from '../lib/geo.js';

const GRAT = geoGraticule10();
const ORDER = { flat: 0, city: 1, mid: 2, pin: 3, plane: 4 };
const lerp = (a, b, u) => a + (b - a) * u;
const lerpT = (a, b, u) => zoomIdentity.translate(lerp(a.x, b.x, u), lerp(a.y, b.y, u)).scale(lerp(a.k, b.k, u));

/**
 * The game map. One instance lives for the whole page; call start() for each round.
 * els: { svg, wrap, toggle, vFlat, vGlobe, zoomCtrl, globeNote, zIn, zOut, zReset }
 * opts: { features, motion(): boolean, onPin(pin), onSubmit(), onNext() }
 */
export function createMap(els, opts) {
  const svg = select(els.svg);
  const svgNode = els.svg;
  const st = {
    R: null,
    pin: null,
    locked: false,
    hideCities: false,
    markers: [],
    crowd: [],
    mode: 'flat',
    token: 0,
    lastW: 0,
  };
  let W = 0;
  let H = 0;
  let worldH = 0;
  let EXT = null;
  let flatProj;
  let projection;
  let path;
  let zoom;
  let drag;
  let T = zoomIdentity;
  let Tfit = zoomIdentity;
  let zoomLayer;
  let oceanP;
  let shadeP;
  let gratP;
  let landSel;
  let routeP;
  let connP;
  let overlay;
  let crowdG;
  let morphMutate;
  let S0 = 1;
  let GR = 1;

  const motion = () => opts.motion();

  function build() {
    st.lastW = Math.round(els.wrap.clientWidth);
    W = Math.max(280, st.lastW);
    flatProj = geoNaturalEarth1().rotate([-st.R.center, 0]).precision(0.2);
    flatProj.fitWidth(W - 4, { type: 'Sphere' });
    const b = geoPath(flatProj).bounds({ type: 'Sphere' });
    worldH = b[1][1] - b[0][1];
    H = Math.round(W < 640 ? Math.max(worldH + 8, W * 0.92) : worldH + 8);
    const t = flatProj.translate();
    flatProj.translate([t[0] + 2 - b[0][0], t[1] + (H - worldH) / 2 - b[0][1]]);
    const top = (H - worldH) / 2;
    EXT = [
      [0, top],
      [W, top + worldH],
    ];
    S0 = flatProj.scale();
    // Globe size: short routes get a bigger globe so the route fills the view instead of shrinking to a dot.
    const base = Math.min(W, H) * 0.45;
    const chord = 2 * Math.sin(st.R.dist / 6371 / 2);
    GR = Math.max(base, Math.min(base * 3.5, (Math.min(W, H) * 0.7) / chord));
    morphMutate = geoProjectionMutator((u, s) => (x, y) => {
      const a = geoNaturalEarth1Raw(x, y);
      const g = geoOrthographicRaw(x, y);
      return [a[0] + u * (s * g[0] - a[0]), a[1] + u * (s * g[1] - a[1])];
    });
    projection = flatProj;
    path = geoPath(projection);
    st.mode = 'flat';

    svg.interrupt();
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);
    svg.selectAll('*').remove();
    svgNode.classList.remove('globe');
    const rg = svg.append('defs').append('radialGradient').attr('id', 'shade').attr('cx', '36%').attr('cy', '30%').attr('r', '78%');
    rg.append('stop').attr('offset', '0').attr('stop-color', '#fff').attr('stop-opacity', 0.22);
    rg.append('stop').attr('offset', '.55').attr('stop-color', '#fff').attr('stop-opacity', 0);
    rg.append('stop').attr('offset', '1').attr('stop-color', '#061230').attr('stop-opacity', 0.32);

    zoomLayer = svg.append('g');
    oceanP = zoomLayer.append('path').attr('class', 'ocean');
    gratP = zoomLayer.append('path').attr('class', 'grat');
    landSel = zoomLayer.append('g').selectAll('path').data(opts.features).join('path').attr('class', 'land');
    shadeP = zoomLayer.append('path').attr('fill', 'url(#shade)').attr('opacity', 0).attr('pointer-events', 'none');
    const routes = zoomLayer.append('g');
    connP = routes.append('path').attr('class', 'connector');
    routeP = routes.append('path').attr('class', 'route');
    overlay = svg.append('g');
    crowdG = overlay.append('g').attr('class', 'crowd');
    drawPaths();

    zoom = d3zoom()
      .scaleExtent([1, 14])
      .translateExtent(EXT)
      .on('zoom', (ev) => {
        T = ev.transform;
        zoomLayer.attr('transform', T);
        placeOverlay();
      });
    drag = d3drag().on('drag', (ev) => {
      if (st.mode !== 'globe') return;
      const r = projection.rotate();
      const k = 70 / GR;
      projection.rotate([r[0] + ev.dx * k, Math.max(-85, Math.min(85, r[1] - ev.dy * k)), r[2]]);
      drawPaths();
      placeOverlay();
    });
    svg.call(zoom).on('dblclick.zoom', null);
    T = zoomIdentity;
    setViewUI();
  }

  function drawPaths() {
    const sphere = path({ type: 'Sphere' });
    oceanP.attr('d', sphere);
    shadeP.attr('d', sphere);
    gratP.attr('d', path(GRAT));
    landSel.attr('d', path);
    connP.attr('d', connP.datum() ? path(connP.datum()) : null);
    if (routeP.datum()) routeP.attr('d', path(routeP.datum()));
  }

  // zoom.transform skips d3's own limits, so keep the map edges in view here.
  function clampAxis(t, k, size, e0, e1) {
    if ((e1 - e0) * k <= size) return size / 2 - (k * (e0 + e1)) / 2;
    return Math.min(-k * e0, Math.max(size - k * e1, t));
  }
  function viewAt(k, cx, cy) {
    const tx = clampAxis(W / 2 - k * cx, k, W, EXT[0][0], EXT[1][0]);
    const ty = clampAxis(H / 2 - k * cy, k, H, EXT[0][1], EXT[1][1]);
    return zoomIdentity.translate(tx, ty).scale(k);
  }
  function fitTransform(bounds, pad, kMax) {
    const [[x0, y0], [x1, y1]] = bounds;
    const k = Math.max(1, Math.min(kMax, Math.min((W - 2 * pad) / Math.max(1, x1 - x0), (H - 2 * pad) / Math.max(1, y1 - y0))));
    return viewAt(k, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  function startView() {
    const pa = flatProj(st.R.a);
    const pb = flatProj(st.R.b);
    if (st.hideCities) return viewAt(Math.max(1, Math.min(4, H / worldH)), W / 2, H / 2); // no hints in hard mode
    const x0 = Math.min(pa[0], pb[0]);
    const x1 = Math.max(pa[0], pb[0]);
    const y0 = Math.min(pa[1], pb[1]);
    const y1 = Math.max(pa[1], pb[1]);
    const m = Math.max(70, Math.max(x1 - x0, y1 - y0) * 0.5);
    const comfy = fitTransform(
      [
        [x0 - m, y0 - m],
        [x1 + m, y1 + m],
      ],
      10,
      4,
    ).k;
    const tight = Math.min((W - 20) / (x1 - x0 + 150), (H - 20) / (y1 - y0 + 90));
    const k = Math.max(1, Math.min(4, Math.max(comfy, Math.min(H / worldH, tight))));
    return viewAt(k, (x0 + x1) / 2, (y0 + y1) / 2);
  }

  /* ---------- markers: a fixed-size overlay that follows the map ---------- */
  function cityMarkers() {
    const aLeft = flatProj(st.R.a)[0] <= flatProj(st.R.b)[0];
    return [
      { id: 'A', cls: 'city', geo: st.R.a, label: st.R.A.n, side: aLeft ? -1 : 1 },
      { id: 'B', cls: 'city', geo: st.R.b, label: st.R.B.n, side: aLeft ? 1 : -1 },
    ];
  }
  function drawMarker(g, d) {
    if (d.cls === 'city') {
      g.append('circle').attr('r', 5.5);
      g.append('text').attr('y', 4.5).text(d.label);
    } else if (d.cls === 'pin') {
      g.append('path').attr('d', 'M0,0 C-1.8,-5.5 -9,-10 -9,-17.5 A9,9 0 1,1 9,-17.5 C9,-10 1.8,-5.5 0,0 Z');
      g.append('circle').attr('cy', -17.5).attr('r', 3.4);
    } else if (d.cls === 'mid') {
      g.append('circle').attr('class', 'pulse').attr('r', 13).attr('opacity', 0);
      g.append('circle').attr('class', 'ring').attr('r', 13);
      g.append('circle').attr('class', 'dot').attr('r', 6);
      g.append('text').attr('y', -19).attr('text-anchor', 'middle').text('Halfway');
    } else if (d.cls === 'flat') {
      g.append('circle').attr('r', 9);
    } else if (d.cls === 'plane') {
      g.append('path').attr(
        'd',
        'M13,0 L4,-1.6 L-3,-10 L-6.5,-10 L-2.5,-1.6 L-9,-1.4 L-11.5,-5 L-13.5,-5 L-12,0 L-13.5,5 L-11.5,5 L-9,1.4 L-2.5,1.6 L-6.5,10 L-3,10 L4,1.6 Z',
      );
    }
  }
  function viewState() {
    if (st.mode === 'flat') return null;
    const r = projection.rotate();
    return { c: [-r[0], -r[1]], lim: ((projection.clipDeg || 90) * Math.PI) / 180 };
  }
  function screenPos(p, vs) {
    if (vs && geoDistance(p, vs.c) > vs.lim - 0.005) return null;
    const q = projection(p);
    return q ? T.apply(q) : null;
  }
  function placeOverlay() {
    const vs = viewState();
    const sel = overlay.selectAll('g.mk').data(st.markers, (d) => d.id);
    sel.exit().remove();
    sel
      .enter()
      .append('g')
      .attr('class', (d) => `mk ${d.cls}${d.pop ? ' pop' : ''}`)
      .each(function enter(d) {
        drawMarker(select(this), d);
      });
    overlay
      .selectAll('g.mk')
      .sort((a, b) => ORDER[a.cls] - ORDER[b.cls])
      .each(function place(d) {
        const g = select(this);
        const q = screenPos(d.geo, vs);
        if (!q) {
          g.attr('display', 'none');
          return;
        }
        const rot = d.cls === 'plane' ? ` rotate(${(d.angle || 0).toFixed(1)})` : '';
        g.attr('display', null).attr('transform', `translate(${q[0].toFixed(1)},${q[1].toFixed(1)})${rot}`);
        if (d.cls !== 'city') return;
        const w = d.label.length * 7.8 + 14;
        let side = d.side;
        if (side < 0 && q[0] - w < 4) side = 1;
        else if (side > 0 && q[0] + w > W - 4) side = -1;
        g.select('text')
          .attr('x', side * 10)
          .attr('text-anchor', side < 0 ? 'end' : 'start');
      });
    const dots = crowdG.selectAll('circle').data(st.crowd);
    dots.exit().remove();
    dots
      .enter()
      .append('circle')
      .attr('r', 3)
      .merge(dots)
      .each(function dot(p) {
        const q = screenPos(p, vs);
        const c = select(this);
        if (!q) c.attr('display', 'none');
        else c.attr('display', null).attr('cx', q[0].toFixed(1)).attr('cy', q[1].toFixed(1));
      });
  }
  function setMarker(m) {
    st.markers = st.markers.filter((x) => x.id !== m.id).concat(m);
    placeOverlay();
  }
  function dropMarker(id) {
    st.markers = st.markers.filter((x) => x.id !== id);
    placeOverlay();
  }

  /* ---------- flat map <-> globe ---------- */
  function setViewUI() {
    els.toggle.hidden = !st.locked;
    els.vFlat.setAttribute('aria-pressed', String(st.mode === 'flat'));
    els.vGlobe.setAttribute('aria-pressed', String(st.mode !== 'flat'));
    els.zoomCtrl.hidden = st.mode !== 'flat';
    els.globeNote.hidden = st.mode !== 'globe';
  }
  function globeRotation() {
    const r0 = flatProj.rotate();
    return [r0[0] + normLon(-st.R.m[0] - r0[0]), -st.R.m[1], 0];
  }
  function applyMorph(u, rFlat, rGlobe) {
    const deg = 180 - 90 * u;
    const p = morphMutate(u, GR / S0);
    p.scale(S0)
      .translate(flatProj.translate())
      .rotate([lerp(rFlat[0], rGlobe[0], u), lerp(rFlat[1], rGlobe[1], u), 0])
      .precision(0.6);
    if (u < 0.002) {
      p.preclip(geoClipAntimeridian);
      p.clipDeg = 180;
    } else {
      // Cut along the back meridian first, then hide what is behind the globe.
      const circle = geoClipCircle((deg * Math.PI) / 180);
      p.preclip((stream) => geoClipAntimeridian(circle(stream)));
      p.clipDeg = deg;
    }
    projection = p;
    path = geoPath(p);
  }
  function setGlobeFinal(rot) {
    st.mode = 'globe';
    projection = geoOrthographic()
      .scale(GR)
      .translate(flatProj.translate())
      .rotate(rot || globeRotation())
      .clipAngle(90)
      .precision(0.4);
    projection.clipDeg = 90;
    path = geoPath(projection);
    T = zoomIdentity;
    zoomLayer.attr('transform', null);
    shadeP.attr('opacity', 1);
    svgNode.classList.add('globe');
    svg.on('.zoom', null).call(drag);
    drawPaths();
    placeOverlay();
    setViewUI();
  }
  function setFlatFinal() {
    st.mode = 'flat';
    projection = flatProj;
    path = geoPath(projection);
    shadeP.attr('opacity', 0);
    svgNode.classList.remove('globe');
    svg.on('.drag', null).call(zoom).on('dblclick.zoom', null);
    drawPaths();
    svg.call(zoom.transform, Tfit);
    placeOverlay();
    setViewUI();
  }
  function runTimer(dur, step, done) {
    const tok = st.token;
    const tm = timer((el) => {
      if (tok !== st.token) {
        tm.stop();
        return;
      }
      const u = Math.min(1, el / dur);
      step(easeCubicInOut(u));
      if (u >= 1) {
        tm.stop();
        if (done) done();
      }
    });
  }
  function toGlobe(animate, then) {
    if (st.mode !== 'flat') return;
    const rF = flatProj.rotate();
    const rG = globeRotation();
    const Ts = T;
    svg.interrupt();
    svg.on('.zoom', null);
    if (!animate || !motion()) {
      setGlobeFinal(rG);
      if (then) then();
      return;
    }
    st.mode = 'morph';
    setViewUI();
    runTimer(
      1500,
      (e) => {
        applyMorph(e, rF, rG);
        T = lerpT(Ts, zoomIdentity, e);
        zoomLayer.attr('transform', T);
        shadeP.attr('opacity', e);
        drawPaths();
        placeOverlay();
      },
      () => {
        setGlobeFinal(rG);
        if (then) then();
      },
    );
  }
  function toFlat(animate) {
    if (st.mode !== 'globe') return;
    const rF = flatProj.rotate();
    let rG = projection.rotate();
    rG = [rF[0] + normLon(rG[0] - rF[0]), rG[1], 0];
    if (!animate || !motion()) {
      setFlatFinal();
      return;
    }
    st.mode = 'morph';
    svg.on('.drag', null);
    svgNode.classList.remove('globe');
    setViewUI();
    runTimer(
      1200,
      (e) => {
        const u = 1 - e;
        applyMorph(u, rF, rG);
        T = lerpT(zoomIdentity, Tfit, e);
        zoomLayer.attr('transform', T);
        shadeP.attr('opacity', u);
        drawPaths();
        placeOverlay();
      },
      setFlatFinal,
    );
  }
  function flyPlane() {
    if (!motion() || st.mode !== 'globe') return;
    const R = st.R;
    const f = geoInterpolate(R.a, R.b);
    const dur = Math.min(3400, 1700 + R.dist / 7);
    let pulsed = false;
    const plane = { id: 'plane', cls: 'plane', geo: R.a, angle: 0 };
    st.markers.push(plane);
    runTimer(
      dur,
      (e) => {
        plane.geo = f(e);
        const vs = viewState();
        const a = screenPos(f(Math.max(0, e - 0.01)), vs);
        const b = screenPos(f(Math.min(1, e + 0.01)), vs);
        if (a && b) plane.angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
        if (!pulsed && e >= 0.5) {
          pulsed = true;
          pulseMid();
        }
        placeOverlay();
      },
      () => {
        overlay
          .selectAll('g.mk.plane')
          .transition()
          .duration(500)
          .style('opacity', 0)
          .on('end', () => dropMarker('plane'));
      },
    );
  }
  function pulseMid() {
    overlay
      .selectAll('g.mk.mid .pulse')
      .interrupt()
      .attr('r', 13)
      .attr('opacity', 1)
      .transition()
      .duration(900)
      .ease(easeCubicOut)
      .attr('r', 34)
      .attr('opacity', 0);
  }
  els.vGlobe.addEventListener('click', () => {
    if (st.mode !== 'flat') return;
    st.token += 1;
    toGlobe(true, flyPlane);
  });
  els.vFlat.addEventListener('click', () => {
    if (st.mode !== 'globe') return;
    st.token += 1;
    dropMarker('plane');
    toFlat(true);
  });

  /* ---------- input ---------- */
  let gesture = null;
  svgNode.addEventListener('pointerdown', (e) => {
    if (!gesture) gesture = { x: e.clientX, y: e.clientY, t: performance.now(), ids: new Set(), max: 0, moved: false };
    gesture.ids.add(e.pointerId);
    gesture.max = Math.max(gesture.max, gesture.ids.size);
  });
  svgNode.addEventListener('pointermove', (e) => {
    if (gesture && gesture.ids.has(e.pointerId) && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 8) gesture.moved = true;
  });
  function endPointer(e, cancelled) {
    if (!gesture || !gesture.ids.has(e.pointerId)) return;
    gesture.ids.delete(e.pointerId);
    if (gesture.ids.size > 0) return;
    const g = gesture;
    gesture = null;
    if (!cancelled && !g.moved && g.max === 1 && performance.now() - g.t < 700) tapAt(e);
  }
  svgNode.addEventListener('pointerup', (e) => endPointer(e, false));
  svgNode.addEventListener('pointercancel', (e) => endPointer(e, true));

  function tapAt(e) {
    if (!st.R || st.locked || st.mode !== 'flat') return;
    const p = pointer(e, zoomLayer.node());
    const g = flatProj.invert(p);
    if (!g || !Number.isFinite(g[0]) || !Number.isFinite(g[1])) return;
    const back = flatProj(g);
    if (!back || Math.hypot(back[0] - p[0], back[1] - p[1]) > 1) return; // outside the globe outline
    setPin(g);
  }
  function setPin(g) {
    st.pin = [normLon(g[0]), Math.max(-89.9, Math.min(89.9, g[1]))];
    setMarker({ id: 'pin', cls: 'pin', geo: st.pin });
    opts.onPin(st.pin);
  }
  svgNode.addEventListener('keydown', (e) => {
    if (!st.R) return;
    if (st.locked) {
      if (e.key === 'Enter') {
        e.preventDefault();
        opts.onNext();
      }
      return;
    }
    const s = e.shiftKey ? 5 : 1;
    const d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] }[e.key];
    if (d) {
      e.preventDefault();
      const p = st.pin || flatProj.invert(T.invert([W / 2, H / 2])) || st.R.a;
      setPin([p[0] + d[0], p[1] + d[1]]);
    } else if (e.key === 'Enter' && st.pin) {
      e.preventDefault();
      opts.onSubmit();
    } else if (e.key === '+' || e.key === '=') zoomBy(1.6);
    else if (e.key === '-') zoomBy(1 / 1.6);
  });
  function zoomBy(f) {
    if (st.mode === 'flat')
      svg
        .transition()
        .duration(motion() ? 250 : 0)
        .call(zoom.scaleBy, f);
  }
  els.zIn.addEventListener('click', () => zoomBy(1.6));
  els.zOut.addEventListener('click', () => zoomBy(1 / 1.6));
  els.zReset.addEventListener('click', () => {
    if (st.mode === 'flat')
      svg
        .transition()
        .duration(motion() ? 350 : 0)
        .call(zoom.transform, viewAt(1, W / 2, H / 2));
  });

  /* ---------- round lifecycle ---------- */
  function flatMidpoint() {
    const pa = flatProj(st.R.a);
    const pb = flatProj(st.R.b);
    return flatProj.invert([(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2]);
  }
  function flatInsight() {
    const fm = flatMidpoint();
    const off = kmBetween(fm, st.R.m);
    return { point: fm, km: off, show: off > 300 && off > st.R.dist * 0.06, north: st.R.m[1] > fm[1] };
  }

  function reveal(animate) {
    const tok = st.token;
    const R = st.R;
    const ins = flatInsight();
    const full = { type: 'LineString', coordinates: [R.a, R.b] };
    if (st.hideCities) st.markers = st.markers.concat(cityMarkers().map((m) => ({ ...m, pop: animate })));
    connP.datum({ type: 'LineString', coordinates: [st.pin, R.m] }).attr('d', null);
    routeP.datum(null).attr('d', null);
    const interp = geoInterpolate(R.a, R.b);
    let shown = false;
    const addMid = () => {
      if (shown) return;
      shown = true;
      connP.attr('d', path(connP.datum()));
      if (ins.show) setMarker({ id: 'flat', cls: 'flat', geo: ins.point, pop: animate });
      setMarker({ id: 'mid', cls: 'mid', geo: R.m, pop: animate });
    };
    const geoms = [full, { type: 'Point', coordinates: st.pin }];
    if (ins.show) geoms.push({ type: 'Point', coordinates: ins.point });
    Tfit = fitTransform(geoPath(flatProj).bounds({ type: 'GeometryCollection', geometries: geoms }), 46, 5);
    setViewUI();
    if (!animate || !motion()) {
      routeP.datum(full).attr('d', path(full));
      addMid();
      svg.call(zoom.transform, Tfit);
      return;
    }
    svg.transition().duration(600).call(zoom.transform, Tfit);
    routeP
      .transition()
      .delay(250)
      .duration(1100)
      .ease(easeCubicInOut)
      .attrTween('d', () => (t) => {
        if (t >= 0.5) addMid();
        return path({ type: 'LineString', coordinates: [R.a, interp(Math.max(0.001, t))] }) || '';
      })
      .on('end', () => {
        routeP.datum(full);
        addMid();
        setTimeout(() => {
          if (tok === st.token && st.mode === 'flat') toGlobe(true, flyPlane);
        }, 900);
      });
  }

  function onResize() {
    if (!st.R || els.wrap.offsetParent === null) return;
    const w = Math.round(els.wrap.clientWidth);
    if (Math.abs(w - st.lastW) < 3) return;
    st.lastW = w;
    clearTimeout(onResize.t);
    onResize.t = setTimeout(() => {
      const wasGlobe = st.mode !== 'flat';
      st.token += 1;
      build();
      st.markers = st.hideCities && !st.locked ? [] : cityMarkers();
      if (st.pin) st.markers.push({ id: 'pin', cls: 'pin', geo: st.pin });
      if (st.locked) {
        const hidden = st.hideCities;
        st.hideCities = false; // cities are already in the marker list
        reveal(false);
        st.hideCities = hidden;
        if (wasGlobe) toGlobe(false);
      } else {
        svg.call(zoom.transform, startView());
        placeOverlay();
      }
    }, 150);
  }
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(els.wrap);
  else window.addEventListener('resize', onResize);

  return {
    start(R, { hideCities = false } = {}) {
      st.token += 1;
      st.R = R;
      st.pin = null;
      st.locked = false;
      st.hideCities = hideCities;
      st.crowd = [];
      svgNode.classList.remove('locked');
      build();
      st.markers = hideCities ? [] : cityMarkers();
      svg.call(zoom.transform, startView());
      placeOverlay();
    },
    lock(animate) {
      if (!st.pin || st.locked) return null;
      st.locked = true;
      svgNode.classList.add('locked');
      reveal(animate);
      return st.pin;
    },
    setCrowd(points) {
      st.crowd = points || [];
      if (overlay) placeOverlay();
    },
    stop() {
      st.token += 1;
    },
    flatInsight,
    get pin() {
      return st.pin;
    },
    get locked() {
      return st.locked;
    },
  };
}
