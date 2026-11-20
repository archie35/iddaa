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
      const homePlayed = Number(f.homePlayed) || (homeForm !== null ? 5 : 0);
      const awayPlayed = Number(f.awayPlayed) || (awayForm !== null ? 5 : 0);

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
        { key: "1", group: "side", label: "MS 1", p: homeP, odds: Number(o.home) > 1 ? Number(o.home) : null },
        { key: "X", group: "side", label: "MS X", p: drawP, odds: Number(o.draw) > 1 ? Number(o.draw) : null },
        { key: "2", group: "side", label: "MS 2", p: awayP, odds: Number(o.away) > 1 ? Number(o.away) : null }
      ];

      // Son 5 maçın gol ortalamalarından bağımsız Poisson gol olasılıkları hesaplanır.
      function poisson(lambda, goals) {
        let p = Math.exp(-lambda);
        for (let i = 1; i <= goals; i++) p *= lambda / i;
        return p;
      }
      if (hasGoalStats) {
        const homeLambda = clamp((homeGF + awayGA) / 2, 0.15, 4.5);
        const awayLambda = clamp((awayGF + homeGA) / 2, 0.15, 4.5);
        let under25P = 0;
        let bttsYesP = 0;
        for (let h = 0; h <= 10; h++) {
          for (let a = 0; a <= 10; a++) {
            const probability = poisson(homeLambda, h) * poisson(awayLambda, a);
            if (h + a <= 2) under25P += probability;
            if (h > 0 && a > 0) bttsYesP += probability;
          }
        }
        markets.push(
          { key: "under25", group: "goals", label: "2.5 ALT", p: under25P, odds: Number(o.under25) > 1 ? Number(o.under25) : null },
          { key: "over25", group: "goals", label: "2.5 ÜST", p: 1 - under25P, odds: Number(o.over25) > 1 ? Number(o.over25) : null },
          { key: "bttsYes", group: "btts", label: "KG VAR", p: bttsYesP, odds: Number(o.bttsYes) > 1 ? Number(o.bttsYes) : null },
          { key: "bttsNo", group: "btts", label: "KG YOK", p: 1 - bttsYesP, odds: Number(o.bttsNo) > 1 ? Number(o.bttsNo) : null }
        );
      }

      for (const market of markets) {
        market.model = pct(market.p);
        market.implied = market.odds ? pct(1 / market.odds) : null;
        market.value = market.odds ? pct(market.p - 1 / market.odds) : null;
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

      const analysisNotes = [];
      if (hasForm) {
        if (homeForm - awayForm > 0.15) analysisNotes.push(m.home + " son maç formunda daha iyi");
        else if (awayForm - homeForm > 0.15) analysisNotes.push(m.away + " son maç formunda daha iyi");
        else analysisNotes.push("İki takımın son maç formu birbirine yakın");
      }
      if (hasGoalStats) {
        if (homeGF > awayGF + 0.35) analysisNotes.push(m.home + " gol üretiminde önde");
        else if (awayGF > homeGF + 0.35) analysisNotes.push(m.away + " gol üretiminde önde");
        if (homeGA > awayGA + 0.35) analysisNotes.push(m.home + " daha fazla gol yiyor");
        else if (awayGA > homeGA + 0.35) analysisNotes.push(m.away + " daha fazla gol yiyor");
      }
      if (!hasForm && !hasGoalStats) analysisNotes.push("Son 5 maç verisi alınamadı; takım formuna dayalı yorum yapılamıyor");

      return {
        ...m,
        formAnalysis: { homeLast5: f.homeLast5 || null, awayLast5: f.awayLast5 || null, homePlayed, awayPlayed, homePoints: f.homePoints ?? null, awayPoints: f.awayPoints ?? null, homeGF, homeGA, awayGF, awayGA, notes: analysisNotes },
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
        marketPredictions: markets.map(x => ({
          key: x.key, group: x.group, label: x.label,
          odds: x.odds, oddsAvailable: x.odds !== null,
          p: x.p, model: x.model, implied: x.implied, value: x.value,
          confidence: pct(clamp(confidenceBase + Math.max(0, x.p - 0.35) * 0.45, 0.30, quality === "fixture_only" ? 0.48 : 0.76))
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
