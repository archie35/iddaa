function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

function pct(x) {
  return Math.round(x * 1000) / 10;
}

function normalizeProviderProb(value) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n > 1 ? n / 100 : n;
}

function normalizeProbabilities(values) {
  const safe = values.map(x => Math.max(0.01, Number(x) || 0));
  const sum = safe.reduce((a, b) => a + b, 0);
  return safe.map(x => x / sum);
}

function formPoints(value) {
  const results = String(value || "").toUpperCase().match(/[WDL]/g) || [];
  if (results.length < 3) return null;
  return results.reduce((sum, result) => sum + (result === "W" ? 3 : result === "D" ? 1 : 0), 0) / (results.length * 3);
}

function validStat(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : null;
}

export function analyzeMatches(ms = []) {
  return {
    generatedAt: new Date().toISOString(),
    matches: ms.map((m) => {
      const f = m.form || {};
      const o = m.odds || {};
      const pp = m.providerPrediction || {};

      const homeForm = formPoints(f.homeLast5);
      const awayForm = formPoints(f.awayLast5);
      const homeGF = validStat(f.homeGF);
      const homeGA = validStat(f.homeGA);
      const awayGF = validStat(f.awayGF);
      const awayGA = validStat(f.awayGA);
      const hasForm = homeForm !== null && awayForm !== null;
      const hasGoalStats = [homeGF, homeGA, awayGF, awayGA].every(x => x !== null);
      const hasTeamStats = hasForm || hasGoalStats;

      // Veri yokken tarafsız bir başlangıç olasılığı kullanılır; takım istatistiği uydurulmaz.
      let homeRaw = 0.44;
      let drawRaw = 0.28;
      let awayRaw = 0.28;

      if (hasForm) {
        const formEdge = homeForm - awayForm;
        homeRaw += formEdge * 0.20;
        awayRaw -= formEdge * 0.20;
        drawRaw -= Math.abs(formEdge) * 0.025;
      }

      if (hasGoalStats) {
        const homeStrength = (homeGF - awayGA) - (awayGF - homeGA);
        const goalEdge = clamp(homeStrength / 5, -1, 1);
        homeRaw += goalEdge * 0.10;
        awayRaw -= goalEdge * 0.10;
        drawRaw -= Math.abs(goalEdge) * 0.015;
      }

      const provider = [
        normalizeProviderProb(pp.home),
        normalizeProviderProb(pp.draw),
        normalizeProviderProb(pp.away)
      ];
      const hasProvider = provider.every(x => x !== null);
      let [homeP, drawP, awayP] = normalizeProbabilities([homeRaw, drawRaw, awayRaw]);

      if (hasProvider) {
        const [ph, pd, pa] = normalizeProbabilities(provider);
        [homeP, drawP, awayP] = normalizeProbabilities([
          homeP * 0.45 + ph * 0.55,
          drawP * 0.45 + pd * 0.55,
          awayP * 0.45 + pa * 0.55
        ]);
      }

      const markets = [
        { key: "1", label: "MS 1", p: homeP, odds: Number(o.home) > 1 ? Number(o.home) : null },
        { key: "X", label: "MS X", p: drawP, odds: Number(o.draw) > 1 ? Number(o.draw) : null },
        { key: "2", label: "MS 2", p: awayP, odds: Number(o.away) > 1 ? Number(o.away) : null }
      ].map(x => ({
        ...x,
        model: pct(x.p),
        implied: x.odds ? pct(1 / x.odds) : null,
        value: x.odds ? pct(x.p - 1 / x.odds) : null
      }));

      // Ek pazarlar yalnızca ilgili gerçek oran ve takım gol istatistikleri varsa eklenir.
      if (hasGoalStats && Number(o.over25) > 1) {
        const overP = clamp(0.48 + ((homeGF + awayGF) - (homeGA + awayGA)) * 0.035, 0.2, 0.8);
        markets.push({ key: "over25", label: "2.5 ÜST", p: overP, odds: Number(o.over25), model: pct(overP), implied: pct(1 / Number(o.over25)), value: pct(overP - 1 / Number(o.over25)) });
      }
      if (hasGoalStats && Number(o.under25) > 1) {
        const underP = clamp(0.52 - ((homeGF + awayGF) - (homeGA + awayGA)) * 0.035, 0.2, 0.8);
        markets.push({ key: "under25", label: "2.5 ALT", p: underP, odds: Number(o.under25), model: pct(underP), implied: pct(1 / Number(o.under25)), value: pct(underP - 1 / Number(o.under25)) });
      }

      const hasOdds = markets.some(x => x.odds !== null);
      const ranked = [...markets].sort((a, b) => {
        if (hasOdds && a.odds !== null && b.odds !== null) return (b.value + b.p * 0.1) - (a.value + a.p * 0.1);
        if (hasOdds && a.odds !== null) return -1;
        if (hasOdds && b.odds !== null) return 1;
        return b.p - a.p;
      });

      const best = ranked[0];
      const quality = hasProvider ? "provider" : hasTeamStats ? "team_stats" : "fixture_only";
      const confidenceBase = quality === "provider" ? 0.56 : quality === "team_stats" ? 0.49 : 0.38;
      const confidence = clamp(confidenceBase + Math.abs(best.p - 1 / 3) * 0.45, 0.38, quality === "fixture_only" ? 0.48 : 0.76);

      return {
        ...m,
        prediction: {
          key: best.key,
          label: best.label,
          odds: best.odds,
          p: best.p,
          implied: best.implied,
          model: best.model,
          value: best.value,
          oddsAvailable: best.odds !== null
        },
        alternatives: ranked.slice(1).map(x => ({
          key: x.key, label: x.label, odds: x.odds,
          implied: x.implied, model: x.model, value: x.value,
          p: x.p
        })),
        probabilities: { home: pct(homeP), draw: pct(drawP), away: pct(awayP) },
        confidence: pct(confidence),
        dataQuality: quality,
        modelSource: hasProvider ? "Sağlayıcı + yerel model" : hasTeamStats ? "Takım istatistikleri + yerel model" : "Sınırlı veriyle yerel model"
      };
    })
  };
}

export function generateCoupons(ms, opt = {}) {
  const count = clamp(Math.floor(Number(opt.count) || 8), 1, 20);
  const min = opt.risk === "low" ? 0.62 : opt.risk === "high" ? 0.38 : 0.52;

  // Oransız tahminler ekranda gösterilir; toplam oranlı kuponlara dahil edilmez.
  const pool = ms.flatMap(m =>
    [m.prediction, ...(m.alternatives || [])]
      .filter(x => x && Number.isFinite(Number(x.odds)) && Number(x.odds) > 1 && Number(x.p) >= min)
      .map(x => ({ ...x, match: m }))
  ).sort((a, b) => (Number(b.value) || -1) - (Number(a.value) || -1));

  const out = [];
  for (let c = 0; c < 3; c++) {
    const chosen = [];
    let total = 1;
    for (const x of pool) {
      if (chosen.length >= count) break;
      if (chosen.some(y => y.match.id === x.match.id)) continue;
      if (c === 0 && x.p < 0.62) continue;
      if (c === 2 && x.p > 0.86) continue;
      chosen.push(x);
      total *= Number(x.odds);
    }
    if (chosen.length === count) {
      out.push({
        name: ["Düşük Risk", "Dengeli", "Yüksek Risk"][c],
        totalOdds: Math.round(total * 100) / 100,
        targetOdds: Number(opt.targetOdds) > 0 ? Number(opt.targetOdds) : null,
        picks: chosen.map(x => ({
          match: x.match.home + " - " + x.match.away,
          market: x.label,
          odds: Number(x.odds),
          modelProbability: x.model,
          value: x.value
        }))
      });
    }
  }
  return {
    coupons: out,
    message: out.length ? null : "Yeterli sayıda oranlı ve eşik üstü tahmin bulunamadı. Oranı olmayan maçlar kupona eklenmedi."
  };
}
