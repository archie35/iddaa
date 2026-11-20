function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function imp(o) {
  return o > 1 ? 1 / o : 0;
}

function pct(x) {
  return Math.round(x * 1000) / 10;
}

function normalizeProviderProb(x) {
  if (x == null) return null;
  const n = Number(x);
  if (!Number.isFinite(n)) return null;
  return n > 1 ? n / 100 : n;
}

export function analyzeMatches(ms) {
  return {
    generatedAt: new Date().toISOString(),
    matches: ms.map((m) => {
      const f = m.form || {};
      const o = m.odds || {};
      const pp = m.providerPrediction || {};

      const hf = ((f.homeLast5 || "").match(/W/g) || []).length / 5;
      const af = ((f.awayLast5 || "").match(/W/g) || []).length / 5;

      const ha = Number(f.homeGF || 1.3);
      const hd = Number(f.homeGA || 1.3);
      const aa = Number(f.awayGF || 1.2);
      const ad = Number(f.awayGA || 1.3);

      const hpRaw = clamp(
        0.5 + 0.18 * (hf - af) + 0.08 * (ha - aa) + 0.08 * (ad - hd),
        0.08,
        0.92
      );

      const dpRaw = clamp(
        0.27 - 0.1 * Math.abs(hpRaw - 0.5),
        0.12,
        0.34
      );

      const apRaw = clamp(1 - hpRaw - dpRaw, 0.08, 0.82);

      const ph = normalizeProviderProb(pp.home);
      const pd = normalizeProviderProb(pp.draw);
      const pa = normalizeProviderProb(pp.away);

      let hp = hpRaw;
      let dp = dpRaw;
      let ap = apRaw;

      if (ph != null && pd != null && pa != null) {
        hp = clamp(hpRaw * 0.45 + ph * 0.55, 0.05, 0.94);
        dp = clamp(dpRaw * 0.45 + pd * 0.55, 0.03, 0.5);
        ap = clamp(apRaw * 0.45 + pa * 0.55, 0.05, 0.94);
        const sum = hp + dp + ap;
        hp /= sum;
        dp /= sum;
        ap /= sum;
      }

      const z = [
        ["1", "MS 1", hp, o.home],
        ["X", "MS X", dp, o.draw],
        ["2", "MS 2", ap, o.away]
      ];

      if (o.over25) {
        z.push([
          "over25",
          "2.5 ÜST",
          clamp(
            pp.underOver === "Over 2.5"
              ? 0.62
              : 0.48 + 0.13 * (ha + aa - 2.5),
            0.18,
            0.82
          ),
          o.over25
        ]);
      }

      if (o.under25) {
        z.push([
          "under25",
          "2.5 ALT",
          clamp(
            pp.underOver === "Under 2.5"
              ? 0.62
              : 0.52 - 0.1 * (ha + aa - 2.5),
            0.18,
            0.82
          ),
          o.under25
        ]);
      }

      if (o.bttsYes) {
        z.push([
          "bttsYes",
          "KG VAR",
          clamp(0.48 + 0.12 * (ha + aa - 2.4), 0.2, 0.8),
          o.bttsYes
        ]);
      }

      if (o.bttsNo) {
        z.push([
          "bttsNo",
          "KG YOK",
          clamp(0.52 - 0.12 * (ha + aa - 2.4), 0.2, 0.8),
          o.bttsNo
        ]);
      }

      const ranked = z
        .filter(q => Number.isFinite(q[3]) && q[3] > 1)
        .map((q) => ({
          key: q[0],
          label: q[1],
          p: q[2],
          odds: q[3],
          implied: pct(imp(q[3])),
          model: pct(q[2]),
          value: pct(q[2] - imp(q[3]))
        }))
        .sort((a, b) => (b.value + b.p * 0.2) - (a.value + a.p * 0.2));

      return {
        ...m,
        prediction: ranked[0] || null,
        alternatives: ranked.slice(1, 4),
        confidence: pct(clamp(
          0.45 + Math.abs(hp - 0.5) * 0.8 + (ph != null ? 0.08 : 0),
          0.45,
          0.92
        )),
        modelSource: ph != null ? "API-Football + yerel model" : "yerel model"
      };
    }).filter(m => m.prediction)
  };
}

export function generateCoupons(ms, opt) {
  const min = opt.risk === "low"
    ? 0.62
    : opt.risk === "high"
      ? 0.38
      : 0.52;

  const pool = ms
    .flatMap((m) =>
      [m.prediction, ...m.alternatives]
        .filter((x) => x && x.p >= min)
        .map((x) => ({ ...x, match: m }))
    )
    .sort((a, b) => b.value - a.value);

  const out = [];

  for (let c = 0; c < 3; c++) {
    const chosen = [];
    let total = 1;

    for (const x of pool) {
      if (chosen.length >= opt.count) break;
      if (chosen.some((y) => y.match.id === x.match.id)) continue;
      if (c === 0 && x.p < 0.62) continue;
      if (c === 2 && x.p > 0.86) continue;

      chosen.push(x);
      total *= x.odds;
    }

    if (chosen.length === opt.count) {
      out.push({
        name: ["Düşük Risk", "Dengeli", "Yüksek Risk"][c],
        totalOdds: Math.round(total * 100) / 100,
        targetOdds: opt.targetOdds || null,
        picks: chosen.map((x) => ({
          match: x.match.home + " - " + x.match.away,
          market: x.label,
          odds: x.odds,
          modelProbability: x.model,
          value: x.value
        }))
      });
    }
  }

  return { coupons: out };
}
