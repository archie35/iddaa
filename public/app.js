let matches = [];
const $ = selector => document.querySelector(selector);

async function j(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "İstek başarısız");
  return data;
}

async function analyzeInChunks(allMatches, chunkSize = 15) {
  const analyzed = [];
  const totalChunks = Math.ceil(allMatches.length / chunkSize);
  for (let index = 0; index < allMatches.length; index += chunkSize) {
    const chunk = allMatches.slice(index, index + chunkSize);
    $("#status").textContent = `Maçlar analiz ediliyor... ${Math.min(index + chunk.length, allMatches.length)}/${allMatches.length} (${Math.floor(index / chunkSize) + 1}/${totalChunks})`;
    const result = await j("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ matches: chunk })
    });
    analyzed.push(...(result.matches || []));
  }
  return analyzed;
}

function render(items) {
  const selectedGroup = $("#marketType").value;
  const cards = items.map(match => {
    const options = (match.marketPredictions || []).filter(x => x.group === selectedGroup);
    if (!options.length) return { match, pick: null };
    const pick = options.sort((a, b) => b.confidence - a.confidence || b.p - a.p)[0];
    return { match, pick };
  }).sort((a, b) => (b.pick?.confidence ?? -1) - (a.pick?.confidence ?? -1));

  $("#matches").innerHTML = cards.map(({ match, pick }, index) => {
    const date = match.kickoff ? new Date(match.kickoff).toLocaleString("tr-TR") : "Saat bilgisi yok";
    const rank = pick ? `<span class="rank">#${index + 1}</span>` : "";
    const pickHtml = pick
      ? `<div class="pick">
          <span class="pill">${pick.label}</span>
          <span class="pill">Model olasılığı %${pick.model}</span>
          <div class="value">Model güveni: %${pick.confidence}</div>
          ${pick.oddsAvailable ? `<div class="muted">Oran: ${pick.odds}</div>` : '<div class="muted">Oran verisi bulunmuyor</div>'}
        </div>`
      : '<div class="pick muted">Bu analiz türü için yeterli takım gol verisi bulunamadı. Son 5 maç verisi gerektiğinden tahmin uydurulmadı.</div>';
    const dataQuality = match.dataQuality === "team_stats" || match.dataQuality === "provider"
      ? "Takım verisi mevcut"
      : "Sınırlı veri";
    const form = match.formAnalysis || {};
    const formLine = (team, sequence, played, gf, ga) => {
      const score = gf !== null && gf !== undefined && ga !== null && ga !== undefined ? " · Gol ort.: " + gf + " attı / " + ga + " yedi" : "";
      return `<div class="formline"><b>${team}:</b> <span class="form-sequence">${sequence || "Veri yok"}</span><span class="muted"> (${played || 0}/5 maç${score})</span></div>`;
    };
    const formHtml = `<div class="formbox"><div class="formtitle">Son 5 maç formu</div>
      ${formLine(match.home, form.homeLast5, form.homePlayed, form.homeGF, form.homeGA)}
      ${formLine(match.away, form.awayLast5, form.awayPlayed, form.awayGF, form.awayGA)}
      ${(form.notes || []).length ? `<div class="formnotes">${form.notes.join(" · ")}</div>` : ""}
    </div>`;
    return `<article class="card">
      <div class="cardhead">${rank}<span class="muted">${match.league} · ${date}</span></div>
      <b>${match.home} — ${match.away}</b>
      ${pickHtml}
      ${formHtml}
      <div class="muted">Veri kalitesi: ${dataQuality} · ${match.modelSource || "Yerel model"}</div>
    </article>`;
  }).join("");
}

async function load() {
  $("#status").textContent = "Gerçek maç verileri yükleniyor...";
  $("#matches").innerHTML = "";
  try {
    const bulletin = await j("/api/bulletin");
    matches = await analyzeInChunks(bulletin.matches || []);
    render(matches);
    const staleNote = bulletin.stale ? " · Son başarılı veri gösteriliyor (API yenilenemedi)" : "";
    const oddsNote = bulletin.oddsNotice ? ` · ${bulletin.oddsNotice}` : "";
    const formNote = ` · Son 5 maç verisi: ${bulletin.formTeamsWithStats ?? 0}/${bulletin.formTeamsRequested ?? 0} takım`;
    $("#status").textContent =
      `${matches.length} büyük lig maçı analiz edildi · ${bulletin.provider || bulletin.source} · Güven sırasına göre listelendi${formNote}${staleNote}${oddsNote}`;
  } catch (error) {
    $("#status").textContent = error.message;
  }
}

$("#load").addEventListener("click", load);
$("#marketType").addEventListener("change", () => render(matches));
load();
