import countries from './data/countries.json';
import schedule from './data/schedule.json';
import { CITIES } from './data/cities.js';
import { geoContains } from 'd3-geo';
import { ACHIEVEMENTS, newlyUnlocked } from './lib/achievements.js';
import { isValidCallsign, newCallsign } from './lib/callsigns.js';
import { JET_KMH, LAUNCH_DATE, MAX_SCORE, ROUNDS } from './lib/constants.js';
import { dayNumber, daysBetween, formatLong, formatShort, isoAddDays, isoLocal, isoPrev } from './lib/dates.js';
import { kmBetween, nearestCity } from './lib/geo.js';
import { makeRounds, pairsFor, roundData } from './lib/puzzles.js';
import { mulberry32 } from './lib/random.js';
import { bucketIndex, scoreFor, squares, verdictFor } from './lib/scoring.js';
import { store } from './lib/storage.js';
import { APP_VERSION, SITE_URL } from './env.js';
import { showAd } from './services/ads.js';
import { createBackend, errorCode } from './services/backend.js';
import { createBoardUI } from './ui/board.js';
import { setFlaps } from './ui/flaps.js';
import { createMap } from './ui/map.js';
import { renderShareCard, shareImage } from './ui/shareCard.js';

const $ = (s) => document.querySelector(s);
const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const km = (x) => `${fmt.format(x)} km`;
const FEATURES = countries.map((c) => ({ type: 'Feature', properties: { name: c.n }, geometry: { type: c.t, coordinates: c.c } }));

function countryAt(p) {
  const f = FEATURES.find((x) => geoContains(x, p));
  return f ? f.properties.name : null;
}

export function startGame() {
  const today = isoLocal();
  const systemReduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const settings = { hard: false, motion: !systemReduce, theme: 'system', ...store.get('settings', {}) };
  const motion = () => settings.motion && !systemReduce;

  let S = null;
  let R = null;
  let backend = null;
  let board = null;
  let callsign = store.get('callsign');
  if (!isValidCallsign(callsign)) callsign = newCallsign();
  store.set('callsign', callsign);

  /* ---------------- settings & theme ---------------- */
  function applySettings() {
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    root.classList.toggle('no-motion', !motion());
    $('#setHard').setAttribute('aria-checked', String(settings.hard));
    $('#setMotion').setAttribute('aria-checked', String(settings.motion));
    document
      .querySelectorAll('[data-theme-choice]')
      .forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeChoice === settings.theme)));
    $('#callsignNow').textContent = `You’re ${callsign}.`;
  }
  function saveSettings() {
    store.set('settings', settings);
    applySettings();
  }
  $('#setHard').addEventListener('click', () => {
    settings.hard = !settings.hard;
    saveSettings();
  });
  $('#setMotion').addEventListener('click', () => {
    settings.motion = !settings.motion;
    saveSettings();
  });
  document.querySelectorAll('[data-theme-choice]').forEach((b) =>
    b.addEventListener('click', () => {
      settings.theme = b.dataset.themeChoice;
      saveSettings();
    }),
  );
  $('#version').textContent = `Version ${APP_VERSION}`;

  /* ---------------- dialogs & toast ---------------- */
  const open = (id) => {
    const d = $(id);
    if (d.showModal) d.showModal();
    else d.setAttribute('open', '');
  };
  const close = (d) => (d.close ? d.close() : d.removeAttribute('open'));
  document.querySelectorAll('dialog').forEach((d) => {
    d.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) close(d);
    });
  });
  $('#dlgHelp').addEventListener('close', () => store.set('help', 1));
  const toastQueue = [];
  let toastBusy = false;
  function toast(msg) {
    toastQueue.push(msg);
    if (toastBusy) return;
    const nextToast = () => {
      const m = toastQueue.shift();
      if (!m) {
        toastBusy = false;
        $('#toast').hidden = true;
        return;
      }
      toastBusy = true;
      const t = $('#toast');
      t.textContent = m;
      t.hidden = false;
      setTimeout(nextToast, 2600);
    };
    nextToast();
  }

  /* ---------------- map ---------------- */
  const map = createMap(
    {
      svg: $('#map'),
      wrap: $('#mapWrap'),
      toggle: $('#viewToggle'),
      vFlat: $('#vFlat'),
      vGlobe: $('#vGlobe'),
      zoomCtrl: $('#zoomCtrl'),
      globeNote: $('#globeNote'),
      zIn: $('#zIn'),
      zOut: $('#zOut'),
      zReset: $('#zReset'),
    },
    {
      features: FEATURES,
      motion,
      onPin: () => {
        $('#btnLock').disabled = false;
      },
      onSubmit: () => lock(),
      onNext: () => next(),
    },
  );

  /* ---------------- local history ---------------- */
  const dayKey = (iso) => `day:${iso}`;
  const readStats = () => store.get('stats', { played: 0, streak: 0, best: 0, lastDate: null, sum: 0, top: 0 });
  function savedDay(iso) {
    const d = store.get(dayKey(iso));
    return d && Array.isArray(d.results) ? d : null;
  }
  function allDays() {
    return store
      .keys()
      .filter((k) => k.startsWith('day:'))
      .map((k) => ({ iso: k.slice(4), ...store.get(k) }))
      .filter((d) => Array.isArray(d.results));
  }
  function recordDaily() {
    const st = readStats();
    if (st.lastDate === S.date) return;
    const total = sum(S.results);
    st.streak = st.lastDate === isoPrev(S.date) ? st.streak + 1 : 1;
    st.best = Math.max(st.best, st.streak);
    st.played += 1;
    st.sum += total;
    st.top = Math.max(st.top, total);
    st.lastDate = S.date;
    store.set('stats', st);
  }
  const sum = (rs) => rs.reduce((t, r) => t + (r ? r.s : 0), 0);

  function checkBadges() {
    const unlocked = store.get('badges', []);
    const ctx = {
      days: allDays().map((d) => ({
        iso: d.iso,
        archive: !!d.archive,
        hard: d.results.length === ROUNDS && d.results.every((r) => r.hard),
        rounds: d.results.map((r) => ({ s: r.s, km: r.km, d: r.d || 0 })),
      })),
      stats: readStats(),
      leagues: store.get('leagues', 0),
    };
    const fresh = newlyUnlocked(ctx, unlocked);
    if (!fresh.length) return;
    store.set('badges', unlocked.concat(fresh));
    fresh.forEach((id) => toast(`Badge unlocked: ${ACHIEVEMENTS.find((a) => a.id === id).title}`));
  }

  /* ---------------- game state ---------------- */
  function newGame(mode, date) {
    const saved = mode === 'practice' ? null : savedDay(date);
    const pairs = mode === 'practice' ? makeRounds(mulberry32((Date.now() ^ (Math.random() * 1e9)) >>> 0)) : pairsFor(date, schedule);
    const results = saved ? saved.results.filter(Boolean) : [];
    return { mode, date, pairs, results, idx: Math.min(results.length, ROUNDS), locked: false, hard: false };
  }
  function persist() {
    if (S.mode === 'practice') return;
    store.set(dayKey(S.date), { results: S.results, archive: S.mode === 'archive' });
  }
  function issueLabel() {
    if (S.mode === 'practice') return 'Practice';
    return S.mode === 'archive' ? `No. ${dayNumber(S.date)}, archive` : `No. ${dayNumber(S.date)}`;
  }

  function renderPips() {
    const ol = $('#pips');
    ol.textContent = '';
    for (let i = 0; i < ROUNDS; i++) {
      const li = document.createElement('li');
      const r = S.results[i];
      if (r) li.className = `b${bucketIndex(r.s)}`;
      else if (i === S.idx) li.className = 'now';
      ol.appendChild(li);
    }
  }

  function startRound() {
    R = roundData(S.pairs[S.idx]);
    S.locked = false;
    S.hard = settings.hard;
    $('#issue').textContent = issueLabel();
    $('#roundLabel').textContent = `Round ${S.idx + 1} of ${ROUNDS}`;
    $('#hardTag').hidden = !S.hard;
    $('#pairTitle').textContent = `${R.A.n} to ${R.B.n}`;
    setFlaps($('#flapA'), R.A.n, motion());
    setFlaps($('#flapB'), R.B.n, motion());
    $('#countryA').textContent = R.A.c;
    $('#countryB').textContent = R.B.c;
    $('#instruction').textContent = S.hard
      ? 'Hard mode: the cities aren’t marked. Tap the spot that’s halfway along the shortest route between them.'
      : 'Tap the spot that’s halfway along the shortest route between them, the way a plane would fly.';
    renderPips();
    $('#result').hidden = true;
    $('#actions').hidden = false;
    $('#btnLock').disabled = true;
    $('#play').hidden = false;
    $('#done').hidden = true;
    map.start(R, { hideCities: S.hard });
  }

  function lock() {
    if (S.locked || !map.pin) return;
    const pin = map.lock(true);
    if (!pin) return;
    S.locked = true;
    const off = kmBetween(pin, R.m);
    const s = scoreFor(off, R.dist);
    S.results[S.idx] = { s, km: Math.round(off), pin: [+pin[0].toFixed(3), +pin[1].toFixed(3)], d: Math.round(R.dist), hard: S.hard };
    persist();
    if (S.mode === 'daily') {
      if (S.results.length === ROUNDS) recordDaily();
      enqueue({ day: S.date, round: S.idx + 1, lon: S.results[S.idx].pin[0], lat: S.results[S.idx].pin[1], hard: S.hard });
    }
    renderPips();
    $('#actions').hidden = true;
    showResultText(off, s);
    $('#rCrowd').hidden = true;
    $('#result').hidden = false;
    $('#btnNext').textContent = S.idx === ROUNDS - 1 ? 'See my score' : 'Next round';
    if (S.mode !== 'practice') showAd($('#adRound'), 'round');
    checkBadges();
    setTimeout(() => {
      const r = $('#result').getBoundingClientRect();
      if (r.bottom > window.innerHeight) $('#result').scrollIntoView({ behavior: motion() ? 'smooth' : 'auto', block: 'nearest' });
    }, 80);
  }
  $('#btnLock').addEventListener('click', lock);

  function showResultText(off, s) {
    $('#rScore').textContent = s === 100 ? 'Bullseye +100' : `+${s}`;
    $('#rOff').textContent = off < 1 ? 'Right on the halfway point.' : `Your pin was ${km(off)} from halfway on a ${km(R.dist)} route.`;
    const land = countryAt(R.m);
    const near = nearestCity(R.m, CITIES, [R.A, R.B]);
    const mins = Math.round(((R.dist / 2 / JET_KMH) * 60) / 5) * 5;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const flight = `${h ? `${h} h ` : ''}${m || !h ? `${m} min` : ''}`.trim();
    $('#rPlace').textContent =
      `Halfway between ${R.A.n} and ${R.B.n} ${land ? `is in ${land}` : 'is over open water'}, about ${km(near.d)} from ${near.city.n}. ` +
      `A jet cruising at ${JET_KMH} km/h would pass it roughly ${flight} after takeoff.`;
    const ins = map.flatInsight();
    const el = $('#rInsight');
    el.hidden = !ins.show;
    el.textContent = ins.show
      ? `The dashed ring shows where halfway looks like it should be on a flat map. On a round Earth the shortest route bows ${ins.north ? 'north' : 'south'}, which puts the real middle ${km(ins.km)} away from there.`
      : '';
  }

  function next() {
    if (!S.locked) return;
    map.stop();
    if (S.idx < ROUNDS - 1) {
      S.idx += 1;
      startRound();
      const top = $('#play').getBoundingClientRect().top;
      if (top < 0) window.scrollBy({ top: top - 10, behavior: motion() ? 'smooth' : 'auto' });
    } else showDone(true);
  }
  $('#btnNext').addEventListener('click', next);

  /* ---------------- leaderboard sync ---------------- */
  let flushing = false;
  function enqueue(item) {
    store.set('pending', store.get('pending', []).concat({ ...item, tries: 0 }));
    flushQueue();
  }
  async function flushQueue() {
    if (!backend || flushing) return;
    flushing = true;
    let q = store.get('pending', []);
    while (q.length) {
      const item = q[0];
      try {
        await backend.submitRound(item);
        onSubmitted(item);
      } catch (err) {
        const code = errorCode(err);
        if (code === 'network') break; // keep it for later
        if (code === 'unknown' && (item.tries = (item.tries || 0) + 1) < 5) {
          store.set('pending', q);
          break;
        }
        // day_closed, no_puzzle, out_of_order, bad_pin, duplicate: the round can’t be posted, so drop it
      }
      q = store.get('pending', []).slice(1);
      store.set('pending', q);
    }
    flushing = false;
  }
  window.addEventListener('online', flushQueue);

  async function onSubmitted(item) {
    if (!S || S.mode !== 'daily' || S.date !== item.day || S.idx !== item.round - 1 || !S.locked || $('#play').hidden) return;
    try {
      const c = await backend.roundCrowd(item.day, item.round);
      if (S.idx !== item.round - 1 || !S.locked) return;
      map.setCrowd(c.pins || []);
      const n = Number(c.others) || 0;
      const beat = Number(c.beaten) || 0;
      const line = $('#rCrowd');
      if (!n) line.textContent = 'You’re the first to finish this round today.';
      else if (n >= 4) {
        const pct = Math.round((100 * beat) / n);
        line.textContent =
          pct >= 50
            ? `You beat ${pct}% of today’s players on this round (median score ${c.median}). The grey dots are their pins.`
            : `${100 - pct}% of today’s players got closer on this round (median score ${c.median}). The grey dots are their pins.`;
      } else
        line.textContent = `You beat ${beat} of the ${n} other ${n === 1 ? 'player' : 'players'} on this round so far. The grey dots are their pins.`;
      line.hidden = false;
    } catch {
      /* crowd stats are a bonus; ignore failures */
    }
  }

  async function initBackend() {
    try {
      backend = await createBackend();
    } catch {
      backend = null;
    }
    if (!backend) return;
    try {
      const prof = await backend.profile();
      if (prof?.callsign && isValidCallsign(prof.callsign)) {
        callsign = prof.callsign;
        store.set('callsign', callsign);
      } else await backend.setCallsign(callsign);
    } catch {
      backend = null;
      return;
    }
    board = createBoardUI({
      backend,
      today: () => today,
      inviteUrl: (code) => `${siteUrl()}?league=${code}`,
      toast,
      onLeaguesChanged: (n) => {
        store.set('leagues', n);
        checkBadges();
      },
    });
    $('#btnBoard').hidden = false;
    $('#callsignSetting').hidden = false;
    $('#btnDeleteData').hidden = false;
    applySettings();
    await flushQueue();
    if (!$('#done').hidden) renderDoneBoard();
    handleInvite();
  }

  function handleInvite() {
    const code = new URLSearchParams(location.search).get('league');
    if (!code || !/^[A-Za-z2-9]{6}$/.test(code)) return;
    const clean = new URL(location.href);
    clean.searchParams.delete('league');
    history.replaceState(null, '', clean);
    $('#joinText').textContent =
      `You’ve been invited to a private Halfway league (code ${code.toUpperCase()}). Your daily scores will show on its weekly leaderboard.`;
    $('#btnJoinYes').onclick = async () => {
      close($('#dlgJoin'));
      try {
        const name = await backend.joinLeague(code);
        toast(`You joined ${name}.`);
        store.set('leagues', Math.max(1, store.get('leagues', 0)));
        checkBadges();
      } catch (err) {
        toast(errorCode(err) === 'no_league' ? 'That invite link doesn’t match a league.' : 'Couldn’t join the league. Try again later.');
      }
    };
    open('#dlgJoin');
  }

  $('#btnRename').addEventListener('click', async () => {
    const name = newCallsign();
    try {
      await backend.setCallsign(name);
      callsign = name;
      store.set('callsign', name);
      applySettings();
    } catch {
      toast('Couldn’t change your callsign right now.');
    }
  });
  $('#btnDeleteData').addEventListener('click', async () => {
    if (!window.confirm('Delete your scores, callsign and league memberships from the leaderboard? Your stats on this device stay.'))
      return;
    try {
      await backend.deleteMyData();
      store.remove('pending');
      store.remove('callsign');
      toast('Your leaderboard data was deleted.');
      setTimeout(() => location.reload(), 1200);
    } catch {
      toast('Couldn’t delete your data right now. Try again later.');
    }
  });

  /* ---------------- end of day ---------------- */
  function siteUrl() {
    if (SITE_URL) return `${SITE_URL}/`;
    return new URL(import.meta.env.BASE_URL, location.origin).href;
  }
  let myRank = null;

  function postmark(title, dateText, score) {
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    let waves = '';
    for (let i = 0; i < 5; i++) waves += `<path d="M206,${62 + i * 19} q12,-9 24,0 t24,0 t24,0 t24,0 t24,0"/>`;
    return (
      `<g transform="rotate(-7 100 100)">` +
      `<circle class="pm-ring" cx="100" cy="100" r="88"/><circle class="pm-ring thin" cx="100" cy="100" r="62"/>` +
      `<path id="pmTop" d="M 30,100 A 70,70 0 0 1 170,100" fill="none"/>` +
      `<path id="pmBot" d="M 19,100 A 81,81 0 0 0 181,100" fill="none"/>` +
      `<text class="pm-arc"><textPath href="#pmTop" startOffset="50%" text-anchor="middle">${esc(title)}</textPath></text>` +
      `<text class="pm-arc"><textPath href="#pmBot" startOffset="50%" text-anchor="middle">${esc(dateText)}</textPath></text>` +
      `<text class="pm-score" x="100" y="111" text-anchor="middle">${score}</text>` +
      `<text class="pm-max" x="100" y="132" text-anchor="middle">out of ${MAX_SCORE}</text>` +
      `</g><g class="pm-waves">${waves}</g>`
    );
  }

  function showDone(animate) {
    map.stop();
    const total = sum(S.results);
    $('#play').hidden = true;
    $('#done').hidden = false;
    $('#issue').textContent = issueLabel();
    const pm = $('#postmark');
    const title = S.mode === 'practice' ? 'Halfway practice' : `Halfway No. ${dayNumber(S.date)}`;
    pm.innerHTML = postmark(title, formatLong(S.mode === 'practice' ? today : S.date), total);
    pm.setAttribute('aria-label', `Your score: ${total} out of ${MAX_SCORE}`);
    pm.classList.remove('stamp');
    if (animate && motion()) {
      void pm.getBoundingClientRect();
      pm.classList.add('stamp');
    }
    $('#doneTitle').textContent = verdictFor(total, MAX_SCORE);
    $('#doneSquares').textContent = squares(S.results.map((r) => r.s));
    const ol = $('#breakdown');
    ol.textContent = '';
    S.pairs.forEach((pair, i) => {
      const r = S.results[i];
      if (!r) return;
      const li = document.createElement('li');
      const a = document.createElement('span');
      const b = document.createElement('span');
      a.textContent = `${CITIES[pair[0]].n} ↔ ${CITIES[pair[1]].n}`;
      b.textContent = `${r.s} points, ${km(r.km)} off`;
      li.append(a, b);
      ol.appendChild(li);
    });
    $('#btnShare').hidden = S.mode === 'practice';
    $('#btnPractice').textContent = S.mode === 'practice' ? 'Play another practice game' : 'Play a practice game';
    $('#btnToday').hidden = S.mode === 'daily';
    $('#shareStatus').textContent = '';
    $('#shareBox').hidden = true;
    $('#doneRank').hidden = true;
    myRank = null;
    $('#lbInline').hidden = true;
    renderDoneBoard();
    updateCountdown();
    if (S.mode !== 'practice') showAd($('#adDone'), 'done');
    checkBadges();
    if (animate) window.scrollTo({ top: 0, behavior: motion() ? 'smooth' : 'auto' });
  }

  async function renderDoneBoard() {
    if (!board || $('#done').hidden || S.mode === 'practice') return;
    await board.render($('#lbInline'), { heading: true, day: S.date });
    if (S.mode !== 'daily') return;
    try {
      const rows = await backend.dailyBoard(S.date, 1);
      const me = rows.find((r) => r.is_me);
      if (me) {
        myRank = { pos: me.pos, of: me.players };
        $('#doneRank').textContent = `Number ${me.pos} of ${fmt.format(me.players)} players today.`;
        $('#doneRank').hidden = false;
      }
    } catch {
      /* offline */
    }
  }
  setInterval(() => {
    if (document.visibilityState === 'visible' && !$('#done').hidden) renderDoneBoard();
  }, 45000);

  let countdownTimer = null;
  function updateCountdown() {
    clearInterval(countdownTimer);
    const tick = () => {
      if (S.mode !== 'daily') {
        $('#nextIn').textContent = S.mode === 'archive' ? `Archive puzzle from ${formatLong(S.date)}.` : '';
        return;
      }
      if (isoLocal() !== today) {
        $('#nextIn').textContent = 'A new Halfway is ready. Reload the page to play.';
        return;
      }
      const n = new Date();
      const m = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1);
      const mins = Math.max(1, Math.ceil((m - n) / 60000));
      $('#nextIn').textContent = `Next Halfway in ${Math.floor(mins / 60) ? `${Math.floor(mins / 60)} h ` : ''}${mins % 60} min.`;
    };
    tick();
    countdownTimer = setInterval(tick, 30000);
  }

  function shareText() {
    const head = `Halfway No. ${dayNumber(S.date)}${S.mode === 'archive' ? ' (archive)' : ''}: ${sum(S.results)}/${MAX_SCORE}`;
    const rank = myRank && S.mode === 'daily' ? ` (#${myRank.pos} of ${fmt.format(myRank.of)})` : '';
    const hard = S.results.every((r) => r.hard) ? ', hard mode' : '';
    return `${head}${rank}${hard}\n${squares(S.results.map((r) => r.s))}\n${siteUrl()}`;
  }
  $('#btnShare').addEventListener('click', async () => {
    const text = shareText();
    const status = $('#shareStatus');
    const fallback = () => {
      const box = $('#shareBox');
      box.value = text;
      box.hidden = false;
      box.focus();
      box.select();
      status.textContent = 'Copy your result from the box below.';
    };
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(text);
        status.textContent = 'Result copied. Paste it anywhere.';
      } catch {
        fallback();
      }
    };
    if (window.matchMedia('(pointer: coarse)').matches && navigator.share) {
      try {
        await navigator.share({ text });
        status.textContent = 'Result shared.';
      } catch (err) {
        if (err?.name !== 'AbortError') copy();
      }
    } else copy();
  });
  $('#btnShareCard').addEventListener('click', async () => {
    const btn = $('#btnShareCard');
    btn.disabled = true;
    try {
      const blob = await renderShareCard({
        subtitle: S.mode === 'practice' ? `Practice, ${formatLong(today)}` : `No. ${dayNumber(S.date)}, ${formatLong(S.date)}`,
        total: sum(S.results),
        max: MAX_SCORE,
        scores: S.results.map((r) => r.s),
        rankText: myRank && S.mode === 'daily' ? `Number ${myRank.pos} of ${fmt.format(myRank.of)} players today` : '',
        hard: S.results.every((r) => r.hard),
        routes: S.pairs.map((p) => roundData(p)),
        features: FEATURES,
        url: siteUrl(),
      });
      const how = await shareImage(blob, `halfway-${S.mode === 'practice' ? 'practice' : dayNumber(S.date)}.png`, shareText());
      if (how === 'downloaded') $('#shareStatus').textContent = 'Image saved. Post it anywhere.';
    } catch {
      $('#shareStatus').textContent = 'Couldn’t make the image on this device.';
    } finally {
      btn.disabled = false;
    }
  });
  $('#btnPractice').addEventListener('click', () => {
    S = newGame('practice', today);
    startRound();
    window.scrollTo({ top: 0 });
  });
  $('#btnToday').addEventListener('click', () => resume(today));

  /* ---------------- archive ---------------- */
  function renderArchive() {
    const list = $('#archiveList');
    list.textContent = '';
    const span = Math.min(daysBetween(LAUNCH_DATE, today), 729);
    for (let i = 0; i <= span; i++) {
      const iso = isoAddDays(today, -i);
      const saved = savedDay(iso);
      const done = saved && saved.results.filter(Boolean).length >= ROUNDS;
      const li = document.createElement('li');
      const day = document.createElement('div');
      day.className = 'day';
      const b = document.createElement('b');
      b.textContent = `No. ${dayNumber(iso)}`;
      const d = document.createElement('span');
      d.textContent = i === 0 ? `Today, ${formatShort(iso)}` : formatShort(iso);
      day.append(b, d);
      const res = document.createElement('div');
      res.className = 'res';
      if (done) {
        const sq = document.createElement('span');
        sq.className = 'sq';
        sq.textContent = squares(saved.results.map((r) => r.s));
        const pts = document.createElement('b');
        pts.textContent = String(sum(saved.results));
        res.append(sq, pts);
      }
      const btn = document.createElement('button');
      btn.className = 'secondary small';
      btn.textContent = done ? 'View' : saved?.results.length ? 'Continue' : 'Play';
      btn.addEventListener('click', () => {
        close($('#dlgArchive'));
        resume(iso);
        window.scrollTo({ top: 0 });
      });
      res.appendChild(btn);
      li.append(day, res);
      list.appendChild(li);
    }
    if (span === 0) {
      const li = document.createElement('li');
      li.className = 'hint';
      li.textContent = 'Earlier puzzles show up here from tomorrow.';
      list.appendChild(li);
    }
  }

  /* ---------------- stats ---------------- */
  function renderStats() {
    const st = readStats();
    const live = st.lastDate === today || st.lastDate === isoPrev(today);
    const cells = [
      [st.played, 'Played'],
      [live ? st.streak : 0, 'Current streak'],
      [st.best, 'Best streak'],
      [st.played ? Math.round(st.sum / st.played) : 0, 'Average score'],
    ];
    const grid = $('#statsGrid');
    grid.textContent = '';
    cells.forEach(([v, label]) => {
      const d = document.createElement('div');
      const b = document.createElement('b');
      const s = document.createElement('span');
      b.textContent = String(v);
      s.textContent = label;
      d.append(b, s);
      grid.appendChild(d);
    });
    const got = store.get('badges', []);
    const ul = $('#badges');
    ul.textContent = '';
    ACHIEVEMENTS.forEach((a) => {
      const li = document.createElement('li');
      li.className = got.includes(a.id) ? 'got' : 'locked';
      const b = document.createElement('b');
      const s = document.createElement('span');
      b.textContent = a.title;
      s.textContent = a.desc;
      li.append(b, s);
      ul.appendChild(li);
    });
    $('#statsNote').textContent = st.played
      ? `Best day so far: ${st.top} out of ${MAX_SCORE}. Stats are saved on this device.`
      : 'Finish today’s five rounds to start your streak. Stats are saved on this device.';
  }

  /* ---------------- header buttons ---------------- */
  $('#btnArchive').addEventListener('click', () => {
    renderArchive();
    open('#dlgArchive');
  });
  $('#btnStats').addEventListener('click', () => {
    renderStats();
    open('#dlgStats');
  });
  $('#btnSettings').addEventListener('click', () => {
    applySettings();
    open('#dlgSettings');
  });
  $('#btnHowTo').addEventListener('click', () => {
    close($('#dlgSettings'));
    open('#dlgHelp');
  });
  $('#btnBoard').addEventListener('click', () => {
    open('#dlgBoard');
    board?.render($('#lbDialog'), { day: S && S.mode !== 'practice' ? S.date : today });
  });

  /* ---------------- start ---------------- */
  function resume(iso) {
    S = newGame(iso === today ? 'daily' : 'archive', iso);
    if (S.results.length >= ROUNDS) showDone(false);
    else startRound();
  }

  applySettings();
  resume(today);
  if (!store.get('help')) open('#dlgHelp');
  initBackend();
}
