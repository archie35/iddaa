let matches = [];
const $ = selector => document.querySelector(selector);

async function j(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "İstek başarısız");
  return data;
}

function render(data) {
  matches = data.matches || [];
  $("#matches").innerHTML = matches.map(match => {
    const prediction = match.prediction;
    const oddsText = prediction?.oddsAvailable
      ? `<span class="pill">Oran ${prediction.odds}</span><span class="pill">Değer ${prediction.value > 0 ? "+" : ""}${prediction.value}</span>`
      : '<span class="pill">Oran yok</span>';
    const predictionText = prediction
      ? `<span class="pill">${prediction.label}</span>${oddsText}<span class="pill">Model %${prediction.model}</span><div class="value">Tahmin güveni: %${match.confidence}</div>`
      : '<div class="muted">Tahmin üretmek için yeterli veri yok.</div>';
    const probabilities = match.probabilities
      ? `<div class="muted">MS olasılıkları: 1 %${match.probabilities.home} · X %${match.probabilities.draw} · 2 %${match.probabilities.away}</div>`
      : "";
    return `<article class="card">
      <div class="muted">${match.league} · ${new Date(match.kickoff).toLocaleString("tr-TR")}</div>
      <b>${match.home} — ${match.away}</b>
      <div class="pick">${predictionText}${probabilities}
        <div class="muted">Veri: ${match.modelSource || "yerel model"} · Oran kaynağı: ${match.bookmaker || "yok"}</div>
      </div>
    </article>`;
  }).join("");
}

async function load() {
  $("#status").textContent = "Gerçek maç verileri yükleniyor...";
  try {
    const bulletin = await j("/api/bulletin");
    const analysis = await j("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ matches: bulletin.matches })
    });
    render(analysis);
    const staleNote = bulletin.stale ? " · Son başarılı veri gösteriliyor (API yenilenemedi)" : "";
    $("#status").textContent =
      `${analysis.matches.length} maç analiz edildi · kaynak: ${bulletin.provider || bulletin.source} · güncelleme: ${bulletin.updatedAt ? new Date(bulletin.updatedAt).toLocaleTimeString("tr-TR") : "şimdi"}${staleNote}`;
  } catch (error) {
    $("#status").textContent = error.message;
  }
}

async function coupon() {
  if (!matches.length) await load();
  try {
    const data = await j("/api/coupons", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        matches,
        count: Number($("#count").value),
        targetOdds: Number($("#target").value || 0),
        risk: $("#risk").value
      })
    });
    $("#coupons").innerHTML = data.coupons.length
      ? data.coupons.map(coupon => `<div class="coupon">
          <h3>${coupon.name}</h3>
          <div>Toplam oran: <b>${coupon.totalOdds}</b>${coupon.targetOdds ? ` · Hedef: ${coupon.targetOdds}` : ""}</div>
          ${coupon.picks.map(pick => `<div class="row">
            <span>${pick.match}<br><span class="muted">${pick.market} · Model %${pick.modelProbability}</span></span>
            <span class="odds">${pick.odds}</span>
          </div>`).join("")}
        </div>`).join("")
      : `<div class="muted">${data.message || "Kupon oluşturulamadı."}</div>`;
  } catch (error) {
    $("#status").textContent = error.message;
  }
}

$("#load").onclick = load;
$("#coupon").onclick = coupon;
load();
