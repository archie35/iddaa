const API_BASE = process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io";
const TZ = process.env.API_FOOTBALL_TIMEZONE || "Europe/Istanbul";
const MAX_ODDS_PAGES = Math.max(1, Math.min(9, Number(process.env.MAX_ODDS_PAGES || 9)));
const MAX_MATCHES = MAX_ODDS_PAGES * 10;
const CACHE_MS = Math.max(60_000, Number(process.env.BULLETIN_CACHE_MS || 10_800_000));

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
  const hasErrors = body.errors && (
    Array.isArray(body.errors) ? body.errors.length > 0 :
    typeof body.errors === "object" ? Object.keys(body.errors).length > 0 :
    Boolean(body.errors)
  );
  if (!response.ok || hasErrors) {
    throw new Error(`API-Football HTTP ${response.status}: ${JSON.stringify(body.errors || body.message || body)}`);
  }
  if (!Array.isArray(body.response)) {
    throw new Error(`API-Football beklenmeyen yanıt verdi: ${JSON.stringify({ results: body.results, errors: body.errors, message: body.message })}`);
  }
  return body;
}

function parseOdd(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 1 ? n : null;
}

function normalize(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function findBet(bookmaker, matcher) {
  return (bookmaker?.bets || []).find(b => matcher(normalize(b.name)));
}

function findValue(values, wanted) {
  const names = wanted.map(normalize);
  return values?.find(x => names.includes(normalize(x.value)));
}

function findGoalLine(bet, side) {
  if (!bet) return null;
  const candidates = (bet.values || []).filter(x => normalize(x.value) === side);
  const line25 = candidates.find(x => Number(String(x.handicap ?? "").replace(",", ".")) === 2.5);
  return parseOdd((line25 || candidates[0])?.odd);
}

function pickBookmaker(bookmakers) {
  if (process.env.API_FOOTBALL_BOOKMAKER_ID) {
    return bookmakers.find(b => String(b.id) === String(process.env.API_FOOTBALL_BOOKMAKER_ID)) || null;
  }
  return bookmakers.find(b => (b.bets || []).some(x => {
    const name = normalize(x.name);
    return name.includes("match winner") || name === "1x2";
  })) || bookmakers[0] || null;
}

function mapOdds(oddsItem, fixture) {
  const bookmaker = pickBookmaker(oddsItem.bookmakers || []);
  const winner = findBet(bookmaker, n => n.includes("match winner") || n === "1x2");
  const total = findBet(bookmaker, n => n.includes("over/under") || n.includes("goals over/under"));
  const btts = findBet(bookmaker, n => n.includes("both teams score") || n.includes("btts"));

  return {
    id: String(fixture.fixture.id),
    fixtureId: fixture.fixture.id,
    home: fixture.teams?.home?.name || "Takım bilgisi yok",
    away: fixture.teams?.away?.name || "Takım bilgisi yok",
    homeTeamId: fixture.teams?.home?.id,
    awayTeamId: fixture.teams?.away?.id,
    league: fixture.league?.name || "Bilinmeyen Lig",
    country: fixture.league?.country || "",
    kickoff: fixture.fixture.date,
    status: fixture.fixture.status?.short || "NS",
    odds: {
      home: parseOdd(findValue(winner?.values, ["Home", "1"])?.odd),
      draw: parseOdd(findValue(winner?.values, ["Draw", "X"])?.odd),
      away: parseOdd(findValue(winner?.values, ["Away", "2"])?.odd),
      over25: findGoalLine(total, "over"),
      under25: findGoalLine(total, "under"),
      bttsYes: parseOdd(findValue(btts?.values, ["Yes"])?.odd),
      bttsNo: parseOdd(findValue(btts?.values, ["No"])?.odd)
    },
    bookmaker: bookmaker?.name || null,
    providerPrediction: null,
    source: "api-football"
  };
}

async function refreshBulletin() {
  const date = todayInTZ();

  // Takım/lig isimleri fixtures'tan, bookmaker oranları odds endpoint'inden alınır.
  const fixturesBody = await api("/fixtures", { date, timezone: TZ });
  const fixtureMap = new Map(
    (fixturesBody.response || []).map(f => [String(f.fixture?.id), f])
  );

  const firstOddsPage = await api("/odds", { date, timezone: TZ, page: 1 });
  const totalPages = Math.min(
    Number(firstOddsPage.paging?.total || 1),
    MAX_ODDS_PAGES
  );

  const remainingPages = await Promise.all(
    Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) =>
      api("/odds", { date, timezone: TZ, page: i + 2 })
    )
  );
  const oddsItems = [
    ...(firstOddsPage.response || []),
    ...remainingPages.flatMap(page => page.response || [])
  ];

  // Fikstür ana listedir; oranı olmayan maçları da göster.
  const oddsByFixture = new Map(oddsItems.map(item => [String(item.fixture?.id), item]));
  const matches = (fixturesBody.response || [])
    .filter(f => ["NS", "TBD"].includes(f.fixture?.status?.short))
    .map(f => {
      const oddsItem = oddsByFixture.get(String(f.fixture?.id));
      if (oddsItem) return mapOdds(oddsItem, f);
      return {
        id: String(f.fixture.id), fixtureId: f.fixture.id,
        home: f.teams?.home?.name || "Takım bilgisi yok",
        away: f.teams?.away?.name || "Takım bilgisi yok",
        homeTeamId: f.teams?.home?.id, awayTeamId: f.teams?.away?.id,
        league: f.league?.name || "Bilinmeyen Lig", country: f.league?.country || "",
        kickoff: f.fixture.date, status: f.fixture.status?.short || "NS",
        odds: {}, bookmaker: null, providerPrediction: null,
        source: "api-football", oddsAvailable: false
      };
    })
    .filter(m => m.home !== "Takım bilgisi yok" && m.away !== "Takım bilgisi yok")
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));

  cache = {
    at: Date.now(),
    data: {
      source: "api-football",
      provider: "API-Football",
      updatedAt: new Date().toISOString(),
      fixtureDate: date,
      apiRequestsUsed: 1 + totalPages,
      oddsPagesFetched: totalPages,
      oddsPagesAvailable: Number(firstOddsPage.paging?.total || 1),
      oddsPageLimitReached: Number(firstOddsPage.paging?.total || 1) > MAX_ODDS_PAGES,
      fixturesReceived: (fixturesBody.response || []).length,
      fixturesApiResults: fixturesBody.results ?? null,
      fixturesApiErrors: fixturesBody.errors ?? null,
      fixturesPaging: fixturesBody.paging ?? null,
      oddsReceived: oddsItems.length,
      oddsApiResults: firstOddsPage.results ?? null,
      oddsApiErrors: firstOddsPage.errors ?? null,
      matchedOdds: oddsByFixture.size,
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
