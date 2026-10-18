import { SUPABASE_KEY, SUPABASE_URL } from '../env.js';

/** Turns "halfway:no_league" style database errors into a short code. */
export function errorCode(err) {
  const m = /halfway:([a-z_]+)/.exec(err?.message || '');
  if (m) return m[1];
  if (err?.code === '23505') return 'duplicate';
  if (err?.name === 'TypeError' || /fetch|network/i.test(err?.message || '')) return 'network';
  return 'unknown';
}

/**
 * Supabase-backed leaderboard. Returns null when the site is built without
 * Supabase settings, so the game keeps working offline-only.
 */
export async function createBackend() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'halfway-auth' },
  });

  let {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) {
    const { data, error } = await sb.auth.signInAnonymously();
    if (error) throw error;
    session = data.session;
  }

  const rpc = async (fn, args) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw error;
    return data;
  };
  const one = (rows) => (Array.isArray(rows) ? rows[0] : rows);

  return {
    uid: session.user.id,
    profile: async () => one(await rpc('my_profile')) || null,
    setCallsign: (callsign) => rpc('set_callsign', { p_callsign: callsign }),
    submitRound: async ({ day, round, lon, lat, hard }) =>
      one(await rpc('submit_round', { p_day: day, p_round: round, p_lon: lon, p_lat: lat, p_hard: !!hard })),
    dailyBoard: (day, limit = 10) => rpc('daily_board', { p_day: day, p_limit: limit }),
    allTimeBoard: (limit = 10) => rpc('alltime_board', { p_limit: limit }),
    roundCrowd: (day, round) => rpc('round_crowd', { p_day: day, p_round: round }),
    createLeague: async (name) => one(await rpc('create_league', { p_name: name })),
    joinLeague: (code) => rpc('join_league', { p_code: code }),
    leaveLeague: (code) => rpc('leave_league', { p_code: code }),
    myLeagues: () => rpc('my_leagues'),
    leagueBoard: (code, from, to) => rpc('league_board', { p_code: code, p_from: from, p_to: to }),
    async deleteMyData() {
      await rpc('delete_my_data');
      await sb.auth.signOut();
    },
  };
}
