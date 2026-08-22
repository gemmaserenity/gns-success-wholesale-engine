const $ = (selector) => document.querySelector(selector);
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

fetch("/api/health").then((response) => response.json()).then((health) => {
  $("#health").textContent = health.persistence ? "Engine online · Supabase connected" : "Engine online · local evaluation mode";
  $("#health-dot").classList.add("ok");
}).catch(() => { $("#health").textContent = "Engine unavailable"; });

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === tab));
  $("#manual-panel").classList.toggle("hidden", tab.dataset.tab !== "manual");
  $("#csv-panel").classList.toggle("hidden", tab.dataset.tab !== "csv");
  $("#results").innerHTML = "";
}));

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function renderEvaluation(item) {
  const base = item.scenarios.find((scenario) => scenario.name === "BASE");
  const downside = item.scenarios.find((scenario) => scenario.name === "DOWNSIDE");
  const upside = item.scenarios.find((scenario) => scenario.name === "UPSIDE");
  const style = item.state === "REJECTED" ? "reject" : item.nextAction === "HUMAN_REVIEW" ? "review" : "";
  const reasons = item.reasons.map((reason) => `<li class="reason-${reason.severity.toLowerCase()}"><strong>${escapeHtml(reason.code)}</strong> — ${escapeHtml(reason.message)}</li>`).join("");
  return `<article class="result-card ${style}">
    <div class="result-header"><div><p class="eyebrow">${escapeHtml(item.nextAction.replaceAll("_", " "))}</p><h3>${escapeHtml(item.lead.address)}</h3><p>${escapeHtml(item.lead.county)} · APN ${escapeHtml(item.lead.apn)} · ${escapeHtml(item.lead.ownerName)}</p></div><div class="score"><strong>${item.score.total}</strong><span>/ 100 · ${escapeHtml(item.score.band.replaceAll("_", " "))}</span></div></div>
    <div class="metrics"><div class="metric"><span>Base ARV</span><strong>${money.format(base.arv)}</strong></div><div class="metric"><span>Est. debt + liens</span><strong>${money.format(base.estimatedDebt)}</strong></div><div class="metric"><span>Max contract</span><strong>${money.format(base.maximumContractForTargetFee)}</strong></div><div class="metric"><span>Assignment range</span><strong>${money.format(downside.expectedAssignmentFee)}–${money.format(upside.expectedAssignmentFee)}</strong></div><div class="metric"><span>Confidence</span><strong>${escapeHtml(item.confidence)}</strong></div></div>
    <div class="decision"><div><h4>Decision evidence</h4><ul class="reasons">${reasons}</ul></div><div><h4>Next action</h4><p><strong>${escapeHtml(item.nextAction.replaceAll("_", " "))}</strong></p><p>${item.lead.trusteeSaleDate ? `Trustee sale: ${escapeHtml(item.lead.trusteeSaleDate)}` : "Trustee-sale date needs verification."}</p></div></div>
  </article>`;
}

async function send(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.issues?.map((issue) => issue.message).join("; ") || body.error || "Request failed");
  return body;
}

$("#lead-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    const data = Object.fromEntries(new FormData(event.currentTarget));
    for (const key of ["arvLow","arvHigh","repairsLow","repairsHigh","debtLow","debtHigh","liens","proposedContractPrice","ownerConfidence","dataConfidence","buyerDemandScore","propertyDesirabilityScore"]) {
      if (data[key] !== "") data[key] = Number(data[key]); else delete data[key];
    }
    data.source = "OPERATOR_MANUAL";
    data.titleComplexity = Boolean(data.titleComplexity);
    data.ownerMismatch = Boolean(data.ownerMismatch);
    const body = await send("/api/evaluate", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(data) });
    $("#results").innerHTML = renderEvaluation(body.evaluation);
    $("#results").scrollIntoView({ behavior:"smooth", block:"start" });
  } catch (error) { $("#results").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; }
  finally { button.disabled = false; }
});

$("#import-button").addEventListener("click", async () => {
  const file = $("#csv-file").files[0];
  if (!file) { $("#results").innerHTML = '<div class="error">Choose a CSV file first.</div>'; return; }
  const button = $("#import-button"); button.disabled = true;
  try {
    const body = await send("/api/import/csv", { method:"POST", headers:{ "Content-Type":"text/csv" }, body:file });
    const summary = body.summary;
    $("#results").innerHTML = `<p class="batch-summary"><strong>${summary.imported}</strong> evaluated · <strong>${summary.qualified}</strong> qualified · <strong>${summary.rejected}</strong> rejected · <strong>${summary.duplicates}</strong> duplicates</p>${body.evaluations.sort((a,b) => b.score.total-a.score.total).map(renderEvaluation).join("")}`;
  } catch (error) { $("#results").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; }
  finally { button.disabled = false; }
});
