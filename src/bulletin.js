const API_BASE = process.env.HIGHLIGHTLY_BASE_URL || "https://soccer.highlightly.net";
const TZ = process.env.HIGHLIGHTLY_TIMEZONE || "Europe/Istanbul";
const CACHE_MS = Math.max(60_000, Number(process.env.BULLETIN_CACHE_MS || 28_800_000));
const FORM_TEAM_LIMIT = Math.max(0, Math.min(40, Number(process.env.HIGHLIGHTLY_MAX_FORM_TEAMS || 20)));

let cache = { at: 0, data: null };
let refreshPromise = null;
const formCache = new Map();

function dateInTZ(offsetDays = 0) {
  const now = new Date();
  const local = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
  local.setDate(local.getDate() + offsetDays);
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, "0");
  const d = String(local.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function api(path, params = {}) {
  const key = process.env.HIGHLIGHTLY_API_KEY;
  if (!key) throw new Error("HIGHLIGHTLY_API_KEY tanımlı değil. Render Environment bölümüne Highlightly API anahtarını ekleyin.");
  const qs = new URLSearchParams(params);
  const response = await fetch(`${API_BASE}${path}?${qs}`, {
    headers: { "x-rapidapi-key": key },
    signal: AbortSignal.timeout(15_000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Highlightly HTTP ${response.status}: ${JSON.stringify(body.message || body.error || body)}`);
  }
  return {
    body,
    remaining: response.headers.get("x-ratelimit-requests-remaining"),
    limit: response.headers.get("x-ratelimit-requests-limit")
  };
}

function asArray(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.matches)) return body.matches;
  return [];
}

function parseScore(score) {
  const parts = String(score || "").match(/(\d+)\s*[-:]\s*(\d+)/);
  return parts ? [Number(parts[1]), Number(parts[2])] : null;
}

function formSummary(games, teamId) {
  const finished = (Array.isArray(games) ? games : [])
    .filter(g => /finished|awarded/i.test(g.state?.description || ""))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  if (finished.length < 3) return null;
  let points = 0, gf = 0, ga = 0, form = "";
  for (const game of finished) {
    const score = parseScore(game.state?.score?.current);
    if (!score) continue;
    const isHome = String(game.homeTeam?.id) === String(teamId);
    const scored = isHome ? score[0] : score[1];
    const conceded = isHome ? score[1] : score[0];
    gf += scored;
    ga += conceded;
    const result = scored > conceded ? "W" : scored === conceded ? "D" : "L";
    form += result;
    points += result === "W" ? 3 : result === "D" ? 1 : 0;
  }
  const count = form.length;
  if (count < 3) return null;
  return {
    form,
    points,
    played: count,
    goalsFor: Number((gf / count).toFixed(2)),
    goalsAgainst: Number((ga / count).toFixed(2))
  };
}

async function getTeamForm(teamId, usage) {
  if (!teamId) return null;
  const key = String(teamId);
  const cached = formCache.get(key);
  if (cached && Date.now() - cached.at < 21_600_000) return cached.data;
  if (usage.formsFetched >= FORM_TEAM_LIMIT) return null;

  usage.formsFetched += 1;
  usage.requests += 1;
  try {
    const result = await api("/last-five-games", { teamId: key });
    if (result.remaining !== null) usage.remaining = result.remaining;
    const summary = formSummary(asArray(result.body), teamId);
    formCache.set(key, { at: Date.now(), data: summary });
    return summary;
  } catch (error) {
    usage.formErrors.push({ teamId: key, message: error.message });
    return null;
  }
}

function normalizeMatch(match, forms) {
  const homeId = match.homeTeam?.id;
  const awayId = match.awayTeam?.id;
  const homeForm = forms.get(String(homeId)) || null;
  const awayForm = forms.get(String(awayId)) || null;
  const status = match.state?.description || "Unknown";
  return {
    id: String(match.id),
    fixtureId: match.id,
    home: match.homeTeam?.name || "Takım bilgisi yok",
    away: match.awayTeam?.name || "Takım bilgisi yok",
    homeTeamId: homeId,
    awayTeamId: awayId,
    homeLogo: match.homeTeam?.logo || null,
    awayLogo: match.awayTeam?.logo || null,
    league: match.league?.name || "Bilinmeyen Lig",
    leagueId: match.league?.id || null,
    country: match.country?.name || "",
    countryCode: match.country?.code || "",
    kickoff: match.date,
    status,
    odds: {},
    bookmaker: null,
    oddsAvailable: false,
    providerPrediction: null,
    form: {
      homeLast5: homeForm?.form || null,
      awayLast5: awayForm?.form || null,
      homeGF: homeForm?.goalsFor ?? null,
      homeGA: homeForm?.goalsAgainst ?? null,
      awayGF: awayForm?.goalsFor ?? null,
      awayGA: awayForm?.goalsAgainst ?? null
    },
    source: "highlightly"
  };
}

async function refreshBulletin() {
  const usage = { requests: 0, formsFetched: 0, formErrors: [], remaining: null };
  const dates = Array.from({ length: 7 }, (_, i) => dateInTZ(i));

  // Ücretsiz günlük kotayı korumak için 7 günlük fikstür yalnızca birer istekle alınır.
  const dayResults = await Promise.all(dates.map(async date => {
    usage.requests += 1;
    const result = await api("/matches", { date, timezone: TZ, limit: 100, offset: 0 });
    if (result.remaining !== null) usage.remaining = result.remaining;
    return { date, matches: asArray(result.body) };
  }));

  const rawMatches = dayResults.flatMap(x => x.matches);
  const seen = new Set();
  const upcoming = rawMatches.filter(match => {
    const id = String(match.id);
    if (!match.id || seen.has(id)) return false;
    seen.add(id);
    const state = String(match.state?.description || "").toLowerCase();
    return !["finished", "finished after penalties", "finished after extra time", "cancelled", "awarded"].includes(state);
  }).sort((a, b) => new Date(a.date) - new Date(b.date));

  // Önce listede görünen takımların formu alınır; ücretsiz kotada en fazla 20 takım.
  const teamIds = [...new Set(upcoming.flatMap(m => [m.homeTeam?.id, m.awayTeam?.id]).filter(Boolean))]
    .slice(0, FORM_TEAM_LIMIT);
  const formEntries = await Promise.all(teamIds.map(async id => [String(id), await getTeamForm(id, usage)]));
  const forms = new Map(formEntries);

  const matches = upcoming.map(m => normalizeMatch(m, forms))
    .filter(m => m.home !== "Takım bilgisi yok" && m.away !== "Takım bilgisi yok");

  cache = {
    at: Date.now(),
    data: {
      source: "highlightly",
      provider: "Highlightly Football API",
      updatedAt: new Date().toISOString(),
      fixtureDate: dates[0],
      fixtureWindow: { from: dates[0], to: dates[dates.length - 1] },
      apiRequestsUsed: usage.requests,
      apiRequestsRemaining: usage.remaining,
      fixturesReceived: rawMatches.length,
      matchesReceived: matches.length,
      formsFetched: usage.formsFetched,
      formErrors: usage.formErrors,
      oddsAvailable: false,
      oddsNotice: "Highlightly ücretsiz Basic planda bahis oranları sunulmuyor. Tahminler oran olmadan üretilir.",
      matches
    }
  };
  return cache.data;
}

export async function fetchBulletin() {
  if (cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;
  if (refreshPromise) return refreshPromise;

  if (!process.env.HIGHLIGHTLY_API_KEY) {
    if (cache.data) return { ...cache.data, stale: true, staleReason: "Highlightly API anahtarı bulunamadı; son başarılı fikstür gösteriliyor." };
    if (process.env.ALLOW_DEMO === "true") {
      return { source: "demo", provider: "demo", updatedAt: null, apiRequestsUsed: 0, matches: [] };
    }
    throw new Error("Gerçek veri için HIGHLIGHTLY_API_KEY gerekli.");
  }

  refreshPromise = refreshBulletin();
  try {
    return await refreshPromise;
  } catch (error) {
    if (cache.data) {
      return { ...cache.data, stale: true, staleReason: error.message, servedAt: new Date().toISOString() };
    }
    throw error;
  } finally {
    refreshPromise = null;
  }
}
