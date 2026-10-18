import { errorCode } from '../services/backend.js';
import { formatShort, weekRange } from '../lib/dates.js';
import { squares } from '../lib/scoring.js';

const fmt = new Intl.NumberFormat('en-US');

const LEAGUE_ERRORS = {
  bad_name: 'Give the league a name of up to 40 characters.',
  too_many_leagues: 'You can run up to 10 leagues.',
  no_league: 'No league has that code. Check it and try again.',
  too_many_memberships: 'You’re already in 30 leagues, the most allowed.',
  league_full: 'That league is full (500 players).',
  network: 'You’re offline. Try again when you’re connected.',
};

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/**
 * Renders leaderboards into a container. All text from the server is set with textContent.
 * ctx: { backend, today(), inviteUrl(code), toast(msg), onLeaguesChanged(count) }
 */
export function createBoardUI(ctx) {
  const views = new WeakMap();

  function rowsList(rows, extra) {
    const list = el('ol', 'lb-list');
    rows.forEach((r, i) => {
      const detached = r.is_me && i > 0 && i === rows.length - 1 && r.pos > rows[i - 1].pos + 1;
      if (detached) list.appendChild(el('li', 'gap', '⋯'));
      const li = el('li', r.is_me ? 'me' : '');
      li.appendChild(el('span', 'rk', String(r.pos)));
      li.appendChild(el('span', 'nm', r.callsign + (r.is_me ? ' (you)' : '')));
      li.appendChild(el('span', 'sq', extra(r)));
      li.appendChild(el('span', 'pt', fmt.format(r.total)));
      list.appendChild(li);
    });
    return list;
  }

  function note(text) {
    return el('p', 'lb-note', text);
  }

  async function renderDay(body, day) {
    const rows = await ctx.backend.dailyBoard(day, 10);
    if (!rows.length) {
      body.appendChild(
        note(
          day === ctx.today()
            ? 'No one has finished today’s five rounds yet. Finish yours to take the top spot.'
            : 'No one finished this day.',
        ),
      );
      return;
    }
    body.appendChild(rowsList(rows, (r) => squares(r.scores) + (r.hard ? ' Hard' : '')));
    const me = rows.find((r) => r.is_me);
    const n = rows[0].players;
    if (me) {
      const ahead = n > 2 ? Math.round((100 * (n - me.pos)) / (n - 1)) : null;
      body.appendChild(
        note(`You’re number ${me.pos} of ${fmt.format(n)} players${ahead !== null && me.pos < n ? `, ahead of ${ahead}% of them.` : '.'}`),
      );
    } else body.appendChild(note(`${fmt.format(n)} ${n === 1 ? 'player has' : 'players have'} finished.`));
  }

  async function renderAll(body) {
    const rows = await ctx.backend.allTimeBoard(10);
    if (!rows.length) {
      body.appendChild(note('No scores yet. Finish a day to get on the board.'));
      return;
    }
    body.appendChild(rowsList(rows, (r) => `${r.days} ${r.days === 1 ? 'day' : 'days'}`));
    const me = rows.find((r) => r.is_me);
    body.appendChild(
      note(
        me
          ? `You’re number ${me.pos} of ${fmt.format(rows[0].players)} players overall.`
          : `${fmt.format(rows[0].players)} players so far.`,
      ),
    );
  }

  async function renderLeagues(body, view, rerender) {
    if (view.league) {
      const { league } = view;
      const { from, to } = weekRange(ctx.today());
      const head = el('div', 'league-head');
      head.appendChild(el('h3', '', league.league_name));
      const meta = el('p', 'lb-note');
      meta.append('Code ', el('span', 'code', league.league_code), `. This week, ${formatShort(from)} to ${formatShort(to)}.`);
      head.appendChild(meta);
      body.appendChild(head);
      const rows = await ctx.backend.leagueBoard(league.league_code, from, to);
      body.appendChild(rowsList(rows, (r) => `${r.days} ${r.days === 1 ? 'day' : 'days'}`));
      const actions = el('div', 'lb-actions');
      const invite = el('button', 'secondary small', 'Copy invite link');
      invite.addEventListener('click', async () => {
        const link = ctx.inviteUrl(league.league_code);
        try {
          await navigator.clipboard.writeText(link);
          ctx.toast('Invite link copied.');
        } catch {
          window.prompt('Copy this invite link:', link);
        }
      });
      const back = el('button', 'secondary small', 'All leagues');
      back.addEventListener('click', () => {
        view.league = null;
        rerender();
      });
      const leave = el('button', 'link danger', 'Leave league');
      leave.addEventListener('click', async () => {
        if (!window.confirm(`Leave ${league.league_name}?`)) return;
        await ctx.backend.leaveLeague(league.league_code);
        view.league = null;
        rerender();
      });
      actions.append(invite, back, leave);
      body.appendChild(actions);
      return;
    }

    const leagues = await ctx.backend.myLeagues();
    ctx.onLeaguesChanged(leagues.length);
    if (leagues.length) {
      const list = el('ul', 'league-list');
      leagues.forEach((l) => {
        const li = el('li');
        const left = el('div');
        left.appendChild(el('b', '', l.league_name));
        left.appendChild(
          el('div', 'meta', `${l.members} ${Number(l.members) === 1 ? 'player' : 'players'}${l.is_owner ? ', you run it' : ''}`),
        );
        const open = el('button', 'secondary small', 'Standings');
        open.addEventListener('click', () => {
          view.league = l;
          rerender();
        });
        li.append(left, open);
        list.appendChild(li);
      });
      body.appendChild(list);
    } else body.appendChild(note('Leagues are private leaderboards for friends, family or coworkers. Scores reset every Monday.'));

    const err = el('p', 'lb-note', '');
    const create = el('form', 'lb-form');
    const nameIn = el('input');
    nameIn.placeholder = 'League name';
    nameIn.maxLength = 40;
    nameIn.setAttribute('aria-label', 'New league name');
    create.append(nameIn, el('button', 'primary small', 'Create league'));
    create.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const made = await ctx.backend.createLeague(nameIn.value);
        view.league = { league_code: made.league_code, league_name: made.league_name };
        ctx.toast(`League created. Share code ${made.league_code} with your crew.`);
        rerender();
      } catch (ex) {
        err.textContent = LEAGUE_ERRORS[errorCode(ex)] || 'Couldn’t create the league. Try again.';
      }
    });
    const join = el('form', 'lb-form');
    const codeIn = el('input');
    codeIn.placeholder = 'Code, like 6WJHUX';
    codeIn.maxLength = 6;
    codeIn.autocapitalize = 'characters';
    codeIn.setAttribute('aria-label', 'League code');
    join.append(codeIn, el('button', 'secondary small', 'Join'));
    join.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const name = await ctx.backend.joinLeague(codeIn.value);
        ctx.toast(`You joined ${name}.`);
        view.league = null;
        rerender();
      } catch (ex) {
        err.textContent = LEAGUE_ERRORS[errorCode(ex)] || 'Couldn’t join that league. Try again.';
      }
    });
    body.append(create, join, err);
  }

  async function render(container, { heading = false, day } = {}) {
    if (!ctx.backend) return;
    const view = views.get(container) || { tab: 'day', league: null };
    views.set(container, view);
    const theDay = day || ctx.today();
    const rerender = () => render(container, { heading, day: theDay });

    const frag = document.createDocumentFragment();
    if (heading) frag.appendChild(el('h3', '', 'Leaderboard'));
    const tabs = el('div', 'lb-tabs');
    tabs.setAttribute('role', 'tablist');
    [
      ['day', theDay === ctx.today() ? 'Today' : formatShort(theDay)],
      ['all', 'All time'],
      ['leagues', 'Leagues'],
    ].forEach(([id, label]) => {
      const b = el('button', '', label);
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(view.tab === id));
      b.addEventListener('click', () => {
        view.tab = id;
        rerender();
      });
      tabs.appendChild(b);
    });
    frag.appendChild(tabs);
    const body = el('div', 'lb-body');
    frag.appendChild(body);
    try {
      if (view.tab === 'day') await renderDay(body, theDay);
      else if (view.tab === 'all') await renderAll(body);
      else await renderLeagues(body, view, rerender);
    } catch (ex) {
      body.textContent = '';
      body.appendChild(
        note(
          errorCode(ex) === 'network'
            ? 'The leaderboard can’t load while you’re offline.'
            : 'The leaderboard couldn’t load. Try again in a moment.',
        ),
      );
    }
    container.textContent = '';
    container.appendChild(frag);
    container.hidden = false;
  }

  return { render };
}
