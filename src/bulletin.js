const API_BASE = process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io";
const TZ = process.env.API_FOOTBALL_TIMEZONE || "Europe/Istanbul";
const MAX_MATCHES = Math.max(1, Number(process.env.MAX_MATCHES || 15));
const DAYS_AHEAD = Math.max(0, Number(process.env.FIXTURE_DAYS || 3));
const CACHE_MS = Math.max(60_000, Number(process.env.BULLETIN_CACHE_MS || 3_600_000));

let cache = { at: 0, data: null };

function dateInTZ(offsetDays = 0) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const base = `${parts.find(p => p.type === "year").value}-${parts.find(p => p.type === "month").value}-${parts.find(p => p.type === "day").value}T12:00:00`;
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit"
  }).format(d);
}

async function api(path, params = {}) {
  if (!process.env.API_FOOTBALL_KEY) {
    throw new Error("API_FOOTBALL_KEY tanımlı değil. Render Environment'a gerçek API anahtarını ekleyin.");
  }

  const qs = new URLSearchParams(params);
  const url = `${API_BASE}${path}?${qs}`;
  const r = await fetch(url, {
    headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY }
  });

  const d = await r.json().catch(() => ({}));
  if (!r.ok || (Array.isArray(d.errors) && d.errors.length)) {
    throw new Error(`API-Football HTTP ${r.status}: ${JSON.stringify(d.errors || d.message || "Bilinmeyen hata")}`);
  }
  return d.response || [];
}

function parseOdd(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 1 ? n : null;
}

function findBet(bookmaker, matcher) {
  const bet = (bookmaker?.bets || []).find(b => matcher(String(b.name || "").toLowerCase()));
  return bet?.values || [];
}

function valueOdd(values, names) {
  const v = values.find(x => names.includes(String(x.value || "").toLowerCase()));
  return parseOdd(v?.odd);
}

function mapOdds(oddsResponse) {
  const bookmaker = process.env.API_FOOTBALL_BOOKMAKER_ID
    ? oddsResponse.flatMap(x => x.bookmakers || []).find(b => String(b.id) === String(process.env.API_FOOTBALL_BOOKMAKER_ID))
    : oddsResponse.flatMap(x => x.bookmakers || [])[0];

  if (!bookmaker) return { odds: {}, bookmaker: null };

  const winner = findBet(bookmaker, n => n.includes("match winner") || n === "1x2");
  const total = findBet(bookmaker, n => n.includes("over/under") || n.includes("goals over/under"));
  const btts = findBet(bookmaker, n => n.includes("both teams score") || n.includes("btts"));

  return {
    bookmaker: bookmaker.name || String(bookmaker.id),
    odds: {
      home: valueOdd(winner, ["home", "1"]),
      draw: valueOdd(winner, ["draw", "x"]),
      away: valueOdd(winner, ["away", "2"]),
      over25: valueOdd(total, ["over 2.5", "over2.5"]),
      under25: valueOdd(total, ["under 2.5", "under2.5"]),
      bttsYes: valueOdd(btts, ["yes"]),
      bttsNo: valueOdd(btts, ["no"])
    }
  };
}

function extractPrediction(pred) {
  const p = pred?.[0]?.predictions;
  const percent = p?.percent || {};
  const toNum = v => {
    const n = Number(String(v ?? "").replace("%", "").replace(",", "."));
    return Number.isFinite(n) ? n / 100 : null;
  };

  return {
    advice: p?.advice || null,
    winner: p?.winner?.name || null,
    underOver: p?.under_over || null,
    goalsHome: p?.goals?.home ?? null,
    goalsAway: p?.goals?.away ?? null,
    home: toNum(percent.home),
    draw: toNum(percent.draw),
    away: toNum(percent.away),
    comparison: p?.comparison || null
  };
}

export async function fetchBulletin() {
  if (cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;

  if (!process.env.API_FOOTBALL_KEY) {
    if (process.env.ALLOW_DEMO === "true") {
      return {
        source: "demo",
        provider: "demo",
        matches: []
      };
    }
    throw new Error("Gerçek veri için API_FOOTBALL_KEY gerekli.");
  }

  const from = dateInTZ(0);
  const to = dateInTZ(DAYS_AHEAD);
  let fixtures = await api("/fixtures", {
    from,
    to,
    timezone: TZ,
    status: "NS"
  });

  fixtures = fixtures
    .filter(x => x.fixture?.status?.short === "NS" && x.teams?.home?.name && x.teams?.away?.name)
    .sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date))
    .slice(0, MAX_MATCHES);

  const matches = [];
  for (const f of fixtures) {
    const [oddsRaw, predRaw] = await Promise.all([
      api("/odds", { fixture: f.fixture.id, page: 1 }),
      api("/predictions", { fixture: f.fixture.id })
    ]);

    const parsed = mapOdds(oddsRaw);
    const prediction = extractPrediction(predRaw);

    matches.push({
      id: String(f.fixture.id),
      fixtureId: f.fixture.id,
      home: f.teams.home.name,
      away: f.teams.away.name,
      homeTeamId: f.teams.home.id,
      awayTeamId: f.teams.away.id,
      league: f.league?.name || "Bilinmeyen Lig",
      country: f.league?.country || "",
      kickoff: f.fixture.date,
      status: f.fixture.status?.short || "NS",
      odds: parsed.odds,
      bookmaker: parsed.bookmaker,
      providerPrediction: prediction,
      source: "api-football"
    });
  }

  cache = {
    at: Date.now(),
    data: {
      source: "api-football",
      provider: "API-Football",
      updatedAt: new Date().toISOString(),
      fixtureWindow: { from, to },
      matches
    }
  };

  return cache.data;
}
