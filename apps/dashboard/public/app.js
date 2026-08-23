const $ = (selector) => document.querySelector(selector);
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

fetch("/api/health").then((response) => response.json()).then((health) => {
  $("#health").textContent = health.persistence ? "Engine online · Supabase connected" : "Engine online · local evaluation mode";
  $("#health-dot").classList.add("ok");
}).catch(() => { $("#health").textContent = "Engine unavailable"; });

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === tab));
  document.querySelectorAll("main > .panel").forEach((panel) => panel.classList.toggle("hidden", panel.id !== `${tab.dataset.tab}-panel`));
  $("#results").innerHTML = "";
  if (tab.dataset.tab === "opportunities") loadOpportunities();
  if (tab.dataset.tab === "buyers") loadBuyers();
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

function renderOpportunity(item) {
  const style = item.state === "REJECTED" ? "reject" : item.nextAction === "HUMAN_REVIEW" ? "review" : "";
  const evaluatedAt = new Date(item.evaluatedAt).toLocaleString();
  const buyerMatchAction = item.state === "REJECTED" ? "" : `<button class="buyer-match-button" type="button" data-evaluation-id="${escapeHtml(item.evaluationId)}" aria-expanded="false">Buyer demand</button>`;
  return `<article class="opportunity-card ${style}">
    <div class="opportunity-main">
      <div><p class="eyebrow">${escapeHtml(item.nextAction.replaceAll("_", " "))}</p><h4>${escapeHtml(item.address)}</h4><p>${escapeHtml(item.county)} · APN ${escapeHtml(item.apn)} · ${escapeHtml(item.ownerName)}</p></div>
      <div class="score"><strong>${item.score}</strong><span>/ 100 · ${escapeHtml(item.state.replaceAll("_", " "))}</span></div>
    </div>
    <div class="queue-metrics">
      <div><span>Base assignment</span><strong>${money.format(item.baseUnderwriting.expectedAssignmentFee)}</strong></div>
      <div><span>Max contract</span><strong>${money.format(item.baseUnderwriting.maximumContractForTargetFee)}</strong></div>
      <div><span>Confidence</span><strong>${escapeHtml(item.confidence)}</strong></div>
      <div><span>Last evaluated</span><strong>${escapeHtml(evaluatedAt)}</strong></div>
    </div>
    <div class="history-row"><span>${item.historyCount} evaluation${item.historyCount === 1 ? "" : "s"} on record</span><div class="card-actions">${buyerMatchAction}<button class="enrichment-button" type="button" data-evaluation-id="${escapeHtml(item.evaluationId)}" aria-expanded="false">Property evidence</button><button class="history-button" type="button" data-county="${escapeHtml(item.county)}" data-apn="${escapeHtml(item.apn)}" aria-expanded="false">View history</button></div></div>
    <div class="buyer-match-panel hidden"></div>
    <div class="enrichment-panel hidden"></div>
    <div class="history-list hidden"></div>
  </article>`;
}

function renderHistory(history) {
  return `<ol class="timeline">${history.map((item) => `<li><div><strong>${escapeHtml(item.state.replaceAll("_", " "))} · ${item.score}/100</strong><span>${escapeHtml(new Date(item.evaluatedAt).toLocaleString())}</span></div><p>${escapeHtml(item.nextAction.replaceAll("_", " "))} · Base assignment ${money.format(item.baseUnderwriting.expectedAssignmentFee)}</p></li>`).join("")}</ol>`;
}

const enrichmentFields = [
  ["propertyType", "Property type", "text"],
  ["squareFeet", "Square feet", "number"],
  ["bedrooms", "Bedrooms", "number"],
  ["bathrooms", "Bathrooms", "number"],
  ["yearBuilt", "Year built", "number"],
  ["lotSquareFeet", "Lot square feet", "number"],
  ["assessedValue", "Assessed value", "number"],
  ["lastSaleDate", "Last sale date", "date"],
  ["lastSalePrice", "Last sale price", "number"],
  ["occupancy", "Occupancy", "text"],
  ["hoaStatus", "HOA status", "text"],
  ["mailingAddress", "Owner mailing address", "text"],
  ["arvLow", "ARV low", "number"],
  ["arvHigh", "ARV high", "number"],
  ["repairsLow", "Repairs low", "number"],
  ["repairsHigh", "Repairs high", "number"],
  ["debtLow", "Debt low", "number"],
  ["debtHigh", "Debt high", "number"],
  ["liens", "Known liens", "number"],
];

function factDisplayValue(fact) {
  const moneyFields = new Set(["assessedValue", "lastSalePrice", "arvLow", "arvHigh", "repairsLow", "repairsHigh", "debtLow", "debtHigh", "liens"]);
  return moneyFields.has(fact.field) && typeof fact.value === "number" ? money.format(fact.value) : String(fact.value);
}

function renderEnrichmentPanel(evaluationId, status, message = "") {
  const currentFacts = status?.currentFacts?.length
    ? `<div class="current-facts">${status.currentFacts.map((fact) => `<div><span>${escapeHtml(enrichmentFields.find(([field]) => field === fact.field)?.[1] || fact.field)}</span><strong>${escapeHtml(factDisplayValue(fact))}</strong><small>${escapeHtml(fact.classification.replaceAll("_", " "))} · ${Math.round(fact.confidence * 100)}% · ${escapeHtml(fact.provider)}</small></div>`).join("")}</div>`
    : '<p class="empty compact">No property evidence has been recorded yet.</p>';
  const factInputs = enrichmentFields.map(([field, label, type]) => `<label>${label}<input class="fact-input" data-field="${field}" data-kind="${type}" type="${type}" ${type === "number" ? 'min="0" step="any"' : ""}></label>`).join("");
  return `${message ? `<div class="success-message">${escapeHtml(message)}</div>` : ""}
    <div class="enrichment-summary"><div><span>Total enrichment cost</span><strong>${money.format((status?.totalCostCents || 0) / 100)}</strong></div><div><span>Current facts</span><strong>${status?.currentFacts?.length || 0}</strong></div><div><span>Average confidence</span><strong>${status?.averageConfidence !== undefined ? `${Math.round(status.averageConfidence * 100)}%` : "—"}</strong></div></div>
    ${currentFacts}
    <form class="enrichment-form" data-evaluation-id="${escapeHtml(evaluationId)}">
      <div class="section-heading compact-heading"><h4>Add evidence</h4><p>Paid sources are allowed only after the deterministic qualification and cost gate.</p></div>
      <div class="enrichment-source-grid">
        <label>Source type<select name="sourceType"><option value="PUBLIC_RECORD">Public record</option><option value="OPERATOR_RESEARCH">Operator research</option><option value="PERMITTED_API">Permitted API</option><option value="PAID_PROVIDER">Paid provider</option></select></label>
        <label>Provider or source<input name="provider" required placeholder="County Assessor"></label>
        <label class="wide">Source URL<input name="sourceUrl" type="url" placeholder="Required for external sources"></label>
        <label>Cost in dollars<input name="costDollars" type="number" min="0" step="0.01" value="0"></label>
        <label>Evidence classification<select name="classification"><option value="PUBLIC_RECORD">Public record</option><option value="VERIFIED">Verified</option><option value="HUMAN_VERIFIED">Human verified</option><option value="ESTIMATED">Estimated</option><option value="MODEL_DERIVED">Model derived</option></select></label>
        <label>Confidence<select name="confidence"><option value="0.9">High · 90%</option><option value="0.75">Good · 75%</option><option value="0.6">Moderate · 60%</option><option value="0.4">Low · 40%</option></select></label>
      </div>
      <div class="fact-grid">${factInputs}</div>
      <button class="primary enrichment-submit" type="submit">Record property evidence</button>
      <div class="enrichment-feedback" aria-live="polite"></div>
    </form>`;
}

async function loadEnrichmentPanel(button, message = "") {
  const card = button.closest(".opportunity-card");
  const panel = card.querySelector(".enrichment-panel");
  panel.classList.remove("hidden");
  panel.innerHTML = '<p class="loading">Loading property evidence…</p>';
  button.disabled = true;
  try {
    const params = new URLSearchParams({ evaluationId: button.dataset.evaluationId });
    const body = await send(`/api/opportunities/enrichment?${params}`, {});
    if (body.enrichmentAvailable === false) {
      panel.innerHTML = '<div class="empty">Apply the property-enrichment migration before recording evidence.</div>';
      return;
    }
    panel.innerHTML = renderEnrichmentPanel(button.dataset.evaluationId, body.enrichment, message);
    button.textContent = "Hide evidence";
    button.setAttribute("aria-expanded", "true");
  } catch (error) {
    panel.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  } finally {
    button.disabled = false;
  }
}

function buyerMatchClassLabel(classification) {
  return classification.toLowerCase().replaceAll("_", " ");
}

function buyerCriterionLabel(criterion) {
  return criterion.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

function renderBuyerMatchPanel(evaluationId, status, message = "") {
  const action = `<button class="primary run-buyer-match" type="button" data-evaluation-id="${escapeHtml(evaluationId)}">${status ? "Recalculate buyer demand" : "Calculate buyer demand"}</button>`;
  if (!status) return `${message ? `<div class="success-message">${escapeHtml(message)}</div>` : ""}<p class="empty compact">No buyer-demand analysis has been recorded for this property.</p>${action}`;
  const displayedMatches = status.matches;
  const matchCards = displayedMatches.length
    ? `<div class="buyer-match-list">${displayedMatches.map((match) => {
      const evidence = match.criteria.filter((item) => item.outcome === "MISMATCH" || item.outcome === "UNKNOWN");
      const details = evidence.length
        ? evidence.map((item) => `<li class="criterion-${item.outcome.toLowerCase()}"><strong>${escapeHtml(buyerCriterionLabel(item.criterion))}</strong> — ${escapeHtml(item.detail)}</li>`).join("")
        : '<li class="criterion-match">All constrained criteria matched recorded evidence.</li>';
      return `<article class="buyer-match-card match-${match.classification.toLowerCase()}"><div><p class="eyebrow">${escapeHtml(buyerMatchClassLabel(match.classification))}</p><h5>${escapeHtml(match.buyerName)}</h5></div><div class="match-scores"><span>Fit <strong>${match.fitScore}</strong></span><span>Credibility <strong>${match.credibilityScore}</strong></span></div><ul>${details}</ul></article>`;
    }).join("")}</div>`
    : '<p class="empty compact">No active buyer profiles were available for this analysis.</p>';
  const gaps = status.reasonCodes.length ? status.reasonCodes.map((code) => escapeHtml(code.replaceAll("_", " "))).join(" · ") : "No aggregate warnings";
  return `${message ? `<div class="success-message">${escapeHtml(message)}</div>` : ""}
    <div class="section-heading compact-heading"><h4>Explainable buyer demand</h4><p>${escapeHtml(status.modelVersion)} · ${escapeHtml(new Date(status.analyzedAt).toLocaleString())}</p></div>
    <div class="buyer-demand-summary"><div><span>Demand score</span><strong>${status.buyerDemandScore}/100</strong></div><div><span>Probable buyers</span><strong>${status.probableBuyerCount}</strong></div><div><span>Possible buyers</span><strong>${status.possibleBuyerCount}</strong></div><div><span>Contact-eligible</span><strong>${status.eligibleBuyerCount}/${status.evaluatedBuyerCount}</strong></div></div>
    <p class="buyer-match-reasons"><strong>Model result:</strong> ${gaps}</p>
    ${matchCards}${action}`;
}

async function loadBuyerMatchPanel(button, message = "") {
  const panel = button.closest(".opportunity-card").querySelector(".buyer-match-panel");
  panel.classList.remove("hidden");
  panel.innerHTML = '<p class="loading">Loading buyer-demand analysis…</p>';
  button.disabled = true;
  try {
    const params = new URLSearchParams({ evaluationId: button.dataset.evaluationId });
    const body = await send(`/api/opportunities/buyer-matches?${params}`, {});
    if (body.buyerMatchingAvailable === false) {
      panel.innerHTML = '<div class="empty">Apply the buyer-demand migration before calculating matches.</div>';
      return;
    }
    panel.innerHTML = renderBuyerMatchPanel(button.dataset.evaluationId, body.buyerMatch, message);
    button.textContent = "Hide buyer demand";
    button.setAttribute("aria-expanded", "true");
  } catch (error) {
    panel.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  } finally {
    button.disabled = false;
  }
}

async function send(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.issues?.map((issue) => issue.message).join("; ") || body.error || "Request failed");
  return body;
}

async function loadOpportunities() {
  const list = $("#opportunity-list");
  list.innerHTML = '<p class="loading">Loading persisted opportunities…</p>';
  const params = new URLSearchParams({ limit: "50" });
  if ($("#queue-state").value) params.set("state", $("#queue-state").value);
  if ($("#queue-county").value) params.set("county", $("#queue-county").value);
  try {
    const body = await send(`/api/opportunities?${params}`, {});
    if (!body.persistence) {
      list.innerHTML = '<div class="empty">The durable queue is available when Supabase is connected.</div>';
      return;
    }
    if (body.historyAvailable === false) {
      list.innerHTML = '<div class="empty">The Phase 2 database migration must be applied before the durable queue can load.</div>';
      return;
    }
    list.innerHTML = body.opportunities.length
      ? body.opportunities.map(renderOpportunity).join("")
      : '<div class="empty">No opportunities match these filters.</div>';
  } catch (error) {
    list.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  }
}

let loadedBuyers = [];

function formatOptionalRange(minimum, maximum, formatter = (value) => String(value)) {
  if (minimum === undefined && maximum === undefined) return "Any";
  if (minimum === undefined) return `Up to ${formatter(maximum)}`;
  if (maximum === undefined) return `${formatter(minimum)}+`;
  return `${formatter(minimum)}–${formatter(maximum)}`;
}

function renderBuyer(buyer) {
  const criteria = buyer.criteria;
  const contact = [buyer.email, buyer.phone].filter(Boolean).map(escapeHtml).join(" · ");
  const statusClass = buyer.status === "DO_NOT_CONTACT" ? "buyer-stop" : buyer.status !== "ACTIVE" ? "buyer-paused" : "";
  return `<article class="buyer-card ${statusClass}">
    <div class="buyer-card-header"><div><p class="eyebrow">${escapeHtml(buyer.status.replaceAll("_", " "))}</p><h4>${escapeHtml(buyer.displayName)}</h4><p>${buyer.companyName ? `${escapeHtml(buyer.companyName)} · ` : ""}${contact}</p></div><button class="buyer-edit" type="button" data-buyer-id="${escapeHtml(buyer.id)}">Edit</button></div>
    <div class="buyer-buybox"><div><span>Markets</span><strong>${escapeHtml(criteria.preferredCounties.join(" · "))}</strong></div><div><span>Property types</span><strong>${escapeHtml(criteria.propertyTypes.join(" · "))}</strong></div><div><span>Purchase price</span><strong>${escapeHtml(formatOptionalRange(criteria.purchasePriceMin, criteria.purchasePriceMax, (value) => money.format(value)))}</strong></div><div><span>Maximum repairs</span><strong>${criteria.maxRepairs === undefined ? "Any" : money.format(criteria.maxRepairs)}</strong></div></div>
    <p class="buyer-detail"><strong>ZIPs:</strong> ${escapeHtml(criteria.preferredZips.join(", ") || "Any in selected counties")} · <strong>Financing:</strong> ${escapeHtml(criteria.financing.join(", ").replaceAll("_", " "))} · <strong>Close:</strong> ${criteria.closeSpeedDays ? `${criteria.closeSpeedDays} days` : "Not recorded"}</p>
    <p class="buyer-detail"><strong>Contact:</strong> ${escapeHtml(buyer.contactStatus.replaceAll("_", " "))} · <strong>Verified purchases:</strong> ${buyer.verifiedPurchaseCount} · <strong>GNS closings:</strong> ${buyer.gnsClosingCount} · <strong>Retrades:</strong> ${buyer.retradeCount} · <strong>Reliability:</strong> ${buyer.reliabilityScore === undefined ? "Not rated" : `${buyer.reliabilityScore}/100`}</p>
  </article>`;
}

async function loadBuyers(message = "") {
  const list = $("#buyer-list");
  list.innerHTML = '<p class="loading">Loading buyer profiles…</p>';
  const params = new URLSearchParams({ limit: "50" });
  if ($("#buyer-status-filter").value) params.set("status", $("#buyer-status-filter").value);
  if ($("#buyer-county-filter").value) params.set("county", $("#buyer-county-filter").value);
  try {
    const body = await send(`/api/buyers?${params}`, {});
    if (!body.persistence) {
      list.innerHTML = '<div class="empty">The buyer database is available when Supabase is connected.</div>';
      return;
    }
    if (body.buyerDatabaseAvailable === false) {
      list.innerHTML = '<div class="empty">Apply the Phase 2 buyer-database migration before recording buyers.</div>';
      return;
    }
    loadedBuyers = body.buyers;
    list.innerHTML = `${message ? `<div class="success-message">${escapeHtml(message)}</div>` : ""}${loadedBuyers.length ? loadedBuyers.map(renderBuyer).join("") : '<div class="empty">No buyer profiles match these filters.</div>'}`;
  } catch (error) {
    list.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  }
}

function checkedValues(form, name) {
  return [...form.querySelectorAll(`[name="${name}"]:checked`)].map((input) => input.value);
}

function optionalNumber(data, name) {
  return data[name] === "" || data[name] === undefined ? undefined : Number(data[name]);
}

function resetBuyerForm() {
  const form = $("#buyer-form");
  form.reset();
  form.elements.buyerId.value = "";
  $("#buyer-feedback").innerHTML = "";
}

function setCheckedValues(form, name, values) {
  form.querySelectorAll(`[name="${name}"]`).forEach((input) => { input.checked = values.includes(input.value); });
}

function editBuyer(buyer) {
  const form = $("#buyer-form");
  const criteria = buyer.criteria;
  for (const name of ["buyerId", "displayName", "companyName", "email", "phone", "status", "contactStatus", "source", "sourceUrl", "notes", "verifiedPurchaseCount", "gnsClosingCount", "retradeCount", "reliabilityScore"]) {
    form.elements[name].value = name === "buyerId" ? buyer.id : buyer[name] ?? "";
  }
  for (const name of ["purchasePriceMin", "purchasePriceMax", "arvMin", "arvMax", "maxRepairs", "squareFeetMin", "squareFeetMax", "yearBuiltMin", "yearBuiltMax", "closeSpeedDays", "hoaPreference"]) {
    form.elements[name].value = criteria[name] ?? (name === "hoaPreference" ? "EITHER" : "");
  }
  form.elements.preferredZips.value = criteria.preferredZips.join(", ");
  setCheckedValues(form, "preferredCounties", criteria.preferredCounties);
  setCheckedValues(form, "propertyTypes", criteria.propertyTypes);
  setCheckedValues(form, "occupancies", criteria.occupancies);
  setCheckedValues(form, "financing", criteria.financing);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  form.elements.displayName.focus({ preventScroll: true });
}

$("#refresh-buyers").addEventListener("click", () => loadBuyers());
$("#new-buyer").addEventListener("click", resetBuyerForm);
$("#buyer-status-filter").addEventListener("change", () => loadBuyers());
$("#buyer-county-filter").addEventListener("change", () => loadBuyers());

$("#buyer-list").addEventListener("click", (event) => {
  const button = event.target.closest(".buyer-edit");
  if (!button) return;
  const buyer = loadedBuyers.find((item) => item.id === button.dataset.buyerId);
  if (buyer) editBuyer(buyer);
});

$("#buyer-form").elements.status.addEventListener("change", (event) => {
  if (event.target.value === "DO_NOT_CONTACT") $("#buyer-form").elements.contactStatus.value = "DO_NOT_CONTACT";
  else if ($("#buyer-form").elements.contactStatus.value === "DO_NOT_CONTACT") $("#buyer-form").elements.contactStatus.value = "UNVERIFIED";
});
$("#buyer-form").elements.contactStatus.addEventListener("change", (event) => {
  if (event.target.value === "DO_NOT_CONTACT") $("#buyer-form").elements.status.value = "DO_NOT_CONTACT";
  else if ($("#buyer-form").elements.status.value === "DO_NOT_CONTACT") $("#buyer-form").elements.status.value = "ACTIVE";
});
$("#buyer-form").querySelectorAll('[name="occupancies"]').forEach((input) => input.addEventListener("change", () => {
  if (!input.checked) return;
  $("#buyer-form").querySelectorAll('[name="occupancies"]').forEach((other) => {
    if (other !== input && (input.value === "ANY" || other.value === "ANY")) other.checked = false;
  });
}));

$("#buyer-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = event.submitter;
  const feedback = $("#buyer-feedback");
  button.disabled = true;
  feedback.innerHTML = "";
  try {
    const data = Object.fromEntries(new FormData(form));
    const numberFields = ["purchasePriceMin", "purchasePriceMax", "arvMin", "arvMax", "maxRepairs", "squareFeetMin", "squareFeetMax", "yearBuiltMin", "yearBuiltMax", "closeSpeedDays", "reliabilityScore"];
    const criteria = {
      preferredCounties: checkedValues(form, "preferredCounties"),
      preferredZips: String(data.preferredZips || "").split(/[\s,]+/).filter(Boolean),
      propertyTypes: checkedValues(form, "propertyTypes"),
      hoaPreference: data.hoaPreference,
      occupancies: checkedValues(form, "occupancies"),
      financing: checkedValues(form, "financing"),
    };
    for (const name of numberFields.filter((name) => name !== "reliabilityScore")) {
      const value = optionalNumber(data, name);
      if (value !== undefined) criteria[name] = value;
    }
    const payload = {
      ...(data.buyerId ? { id: data.buyerId } : {}),
      displayName: data.displayName,
      companyName: data.companyName,
      email: data.email,
      phone: data.phone,
      status: data.status,
      contactStatus: data.contactStatus,
      source: data.source,
      sourceUrl: data.sourceUrl,
      notes: data.notes,
      verifiedPurchaseCount: Number(data.verifiedPurchaseCount),
      gnsClosingCount: Number(data.gnsClosingCount),
      retradeCount: Number(data.retradeCount),
      ...(optionalNumber(data, "reliabilityScore") !== undefined ? { reliabilityScore: optionalNumber(data, "reliabilityScore") } : {}),
      criteria,
    };
    const body = await send("/api/buyers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    resetBuyerForm();
    await loadBuyers(`${body.created ? "Created" : "Updated"} ${body.buyer.displayName}.`);
  } catch (error) {
    feedback.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  } finally {
    button.disabled = false;
  }
});

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

$("#refresh-opportunities").addEventListener("click", loadOpportunities);
$("#queue-state").addEventListener("change", loadOpportunities);
$("#queue-county").addEventListener("change", loadOpportunities);

$("#opportunity-list").addEventListener("click", async (event) => {
  const buyerMatchButton = event.target.closest(".buyer-match-button");
  if (buyerMatchButton) {
    const panel = buyerMatchButton.closest(".opportunity-card").querySelector(".buyer-match-panel");
    if (!panel.classList.contains("hidden")) {
      panel.classList.add("hidden");
      buyerMatchButton.textContent = "Buyer demand";
      buyerMatchButton.setAttribute("aria-expanded", "false");
    } else {
      await loadBuyerMatchPanel(buyerMatchButton);
    }
    return;
  }
  const runBuyerMatchButton = event.target.closest(".run-buyer-match");
  if (runBuyerMatchButton) {
    runBuyerMatchButton.disabled = true;
    try {
      const body = await send("/api/opportunities/buyer-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluationId: runBuyerMatchButton.dataset.evaluationId }),
      });
      const toggle = runBuyerMatchButton.closest(".opportunity-card").querySelector(".buyer-match-button");
      await loadBuyerMatchPanel(toggle, `Recorded ${body.buyerMatch.probableBuyerCount} probable buyer${body.buyerMatch.probableBuyerCount === 1 ? "" : "s"} and a ${body.buyerMatch.buyerDemandScore}/100 demand score. Refresh the queue to see the new immutable evaluation.`);
    } catch (error) {
      runBuyerMatchButton.closest(".buyer-match-panel").insertAdjacentHTML("afterbegin", `<div class="error">${escapeHtml(error.message)}</div>`);
      runBuyerMatchButton.disabled = false;
    }
    return;
  }
  const enrichmentButton = event.target.closest(".enrichment-button");
  if (enrichmentButton) {
    const panel = enrichmentButton.closest(".opportunity-card").querySelector(".enrichment-panel");
    if (!panel.classList.contains("hidden")) {
      panel.classList.add("hidden");
      enrichmentButton.textContent = "Property evidence";
      enrichmentButton.setAttribute("aria-expanded", "false");
    } else {
      await loadEnrichmentPanel(enrichmentButton);
    }
    return;
  }
  const button = event.target.closest(".history-button");
  if (!button) return;
  const historyList = button.closest(".opportunity-card").querySelector(".history-list");
  if (!historyList.classList.contains("hidden")) {
    historyList.classList.add("hidden");
    button.textContent = "View history";
    button.setAttribute("aria-expanded", "false");
    return;
  }
  button.disabled = true;
  historyList.classList.remove("hidden");
  historyList.innerHTML = '<p class="loading">Loading history…</p>';
  try {
    const params = new URLSearchParams({ county: button.dataset.county, apn: button.dataset.apn });
    const body = await send(`/api/opportunities/history?${params}`, {});
    historyList.innerHTML = renderHistory(body.history);
    button.textContent = "Hide history";
    button.setAttribute("aria-expanded", "true");
  } catch (error) {
    historyList.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  } finally {
    button.disabled = false;
  }
});

$("#opportunity-list").addEventListener("submit", async (event) => {
  const form = event.target.closest(".enrichment-form");
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector(".enrichment-submit");
  const feedback = form.querySelector(".enrichment-feedback");
  button.disabled = true;
  feedback.innerHTML = "";
  try {
    const data = Object.fromEntries(new FormData(form));
    const facts = [...form.querySelectorAll(".fact-input")].filter((input) => input.value !== "").map((input) => ({
      field: input.dataset.field,
      value: input.dataset.kind === "number" ? Number(input.value) : input.value,
      classification: data.classification,
      confidence: Number(data.confidence),
    }));
    if (facts.length === 0) throw new Error("Enter at least one property fact.");
    const body = await send("/api/opportunities/enrichment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        evaluationId: form.dataset.evaluationId,
        provider: data.provider,
        sourceType: data.sourceType,
        sourceUrl: data.sourceUrl,
        costCents: Math.round(Number(data.costDollars || 0) * 100),
        facts,
      }),
    });
    const revised = body.revisedEvaluation ? ` A new ${body.revisedEvaluation.score.total}/100 evaluation was created.` : "";
    const enrichmentButton = form.closest(".opportunity-card").querySelector(".enrichment-button");
    await loadEnrichmentPanel(
      enrichmentButton,
      `${body.result.factsStored} fact${body.result.factsStored === 1 ? "" : "s"} recorded.${revised}${body.revisedEvaluation ? " Refresh the queue to see its revised ranking." : ""}`,
    );
  } catch (error) {
    feedback.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  } finally {
    button.disabled = false;
  }
});
