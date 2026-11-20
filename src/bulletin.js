const API_BASE = process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io";
const TZ = process.env.API_FOOTBALL_TIMEZONE || "Europe/Istanbul";
const MAX_MATCHES = Math.max(1, Math.min(10, Number(process.env.MAX_MATCHES || 10)));
const CACHE_MS = Math.max(60_000, Number(process.env.BULLETIN_CACHE_MS || 3_600_000));

let cache = { at: 0, data: null };
let refreshPromise = null;

function todayInTZ() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  return `${parts.find(p => p.type === "year").value}-${parts.find(p => p.type === "month").value}-${parts.find(p => p.type === "day").value}`;
}

async function api(path, params = {}) {
  if (!process.env.API_FOOTBALL_KEY) {
    throw new Error("API_FOOTBALL_KEY tanımlı değil. Render Environment'a gerçek API anahtarını ekleyin.");
  }
  const qs = new URLSearchParams(params);
  const response = await fetch(`${API_BASE}${path}?${qs}`, {
    headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || (Array.isArray(body.errors) && body.errors.length)) {
    throw new Error(`API-Football HTTP ${response.status}: ${JSON.stringify(body.errors || body.message || "Bilinmeyen hata")}`);
  }
  return body;
}

function parseOdd(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 1 ? n : null;
}

function findBet(bookmaker, matcher) {
  return (bookmaker?.bets || []).find(b => matcher(String(b.name || "").toLowerCase()))?.values || [];
}

function valueOdd(values, names) {
  const item = values.find(x => names.includes(String(x.value || "").toLowerCase()));
  return parseOdd(item?.odd);
}

function mapMatch(item) {
  const bookmakers = item.bookmakers || [];
  const bookmaker = process.env.API_FOOTBALL_BOOKMAKER_ID
    ? bookmakers.find(b => String(b.id) === String(process.env.API_FOOTBALL_BOOKMAKER_ID))
    : bookmakers[0];

  const winner = findBet(bookmaker, n => n.includes("match winner") || n === "1x2");
  const total = findBet(bookmaker, n => n.includes("over/under") || n.includes("goals over/under"));
  const btts = findBet(bookmaker, n => n.includes("both teams score") || n.includes("btts"));
  const fixture = item.fixture || {};

  return {
    id: String(fixture.id),
    fixtureId: fixture.id,
    home: item.teams?.home?.name || "Ev Sahibi",
    away: item.teams?.away?.name || "Deplasman",
    homeTeamId: item.teams?.home?.id,
    awayTeamId: item.teams?.away?.id,
    league: item.league?.name || "Bilinmeyen Lig",
    country: item.league?.country || "",
    kickoff: fixture.date,
    status: fixture.status?.short || "NS",
    odds: {
      home: valueOdd(winner, ["home", "1"]),
      draw: valueOdd(winner, ["draw", "x"]),
      away: valueOdd(winner, ["away", "2"]),
      over25: valueOdd(total, ["over 2.5", "over2.5"]),
      under25: valueOdd(total, ["under 2.5", "under2.5"]),
      bttsYes: valueOdd(btts, ["yes"]),
      bttsNo: valueOdd(btts, ["no"])
    },
    bookmaker: bookmaker?.name || null,
    providerPrediction: null,
    source: "api-football"
  };
}

async function refreshBulletin() {
  const date = todayInTZ();
  // /odds?date=... toplu sonuç döndürür; sayfa başına 10 fixture.
  // Ücretsiz plan kotasını korumak için bilinçli olarak tek sayfa/tek istek kullanılır.
  const body = await api("/odds", { date, timezone: TZ, page: 1 });
  const matches = (body.response || [])
    .map(mapMatch)
    .filter(m => m.fixtureId && m.home && m.away && m.kickoff)
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))
    .slice(0, MAX_MATCHES);

  cache = {
    at: Date.now(),
    data: {
      source: "api-football",
      provider: "API-Football (toplu maç oranları)",
      updatedAt: new Date().toISOString(),
      fixtureDate: date,
      apiRequestsUsed: 1,
      matches
    }
  };
  return cache.data;
}

export async function fetchBulletin() {
  if (cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;
  if (refreshPromise) return refreshPromise;

  if (!process.env.API_FOOTBALL_KEY) {
    if (process.env.ALLOW_DEMO === "true") {
      return { source: "demo", provider: "demo", updatedAt: null, apiRequestsUsed: 0, matches: [] };
    }
    throw new Error("Gerçek veri için API_FOOTBALL_KEY gerekli.");
  }

  refreshPromise = refreshBulletin();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}
