const $ = (selector) => document.querySelector(selector);
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const fieldHelp = {
  county: "Choose the Arizona county that maintains this parcel's public records. Find it on the assessor, treasurer, recorder, or trustee-sale record.",
  apn: "The county parcel number (APN) uniquely identifies the property. Copy it from the county assessor or treasurer record.",
  address: "The property's physical street address. Verify it against the parcel record; do not use the owner's mailing address here.",
  ownerName: "The owner name shown on the latest reliable public record. The county assessor or recorded deed are the usual starting points.",
  trusteeSaleDate: "The scheduled foreclosure auction date from a current Notice of Trustee's Sale or trustee source. Leave blank when it has not been verified.",
  sourceRecordId: "The document or record number that lets you trace this lead back to its source, such as a county recorder document number.",
  arvLow: "Your conservative after-repair value estimate: what the property may sell for after repairs. Support it with recent comparable sales; this is not the assessed value.",
  arvHigh: "Your optimistic but supportable after-repair value estimate, based on recent comparable renovated sales in the same market.",
  repairsLow: "The lower reasonable estimate for renovation and property-condition work. Use a walkthrough, contractor estimate, photos, or a clearly labeled preliminary estimate.",
  repairsHigh: "The upper reasonable repair estimate, including uncertainty for work that has not yet been inspected.",
  debtLow: "The lower estimate of loans or other debt that must be paid at closing. A recorded deed of trust shows original debt, not the current payoff; verify later with a payoff statement.",
  debtHigh: "The upper estimate of debt that must be paid at closing. Include uncertainty when only recorded loan documents or owner statements are available.",
  liens: "Known additional liens, delinquent taxes, judgments, or other payoff items. Use current treasurer, recorder, title, or lien evidence and avoid double-counting mortgage debt.",
  proposedContractPrice: "The price GNS may agree to pay the seller. If blank, the engine estimates a contract price as base debt + known liens + the configured $5,000 seller-net floor.",
  ownerConfidence: "How confident you are that the recorded owner identity is correct. Compare assessor and deed records; lower this when names conflict or ownership is unclear.",
  dataConfidence: "Your overall confidence in the economic inputs. Use a lower value when ARV, repairs, debt, liens, or dates are estimates rather than verified evidence.",
  buyerDemandScore: "A provisional 0–100 estimate used for the first screening. After buyer matching is run, the model replaces it in a new evaluation using recorded buyer profiles.",
  propertyDesirabilityScore: "An operator-entered 0–100 view of investor appeal, considering location, condition, property type, layout, and resale demand. Record the supporting evidence separately.",
  titleComplexity: "Check this when known facts suggest probate, bankruptcy, multiple owners, disputed liens, entities, trusts, or another title issue that may complicate closing.",
  ownerMismatch: "Check this when owner names conflict between reliable sources or the apparent seller is not the recorded owner. This is a stop-and-verify warning.",
  csvFile: "A batch file using the downloadable template and the same lead fields as manual evaluation. The app accepts up to 500 records or 2 MB.",
  queueState: "Filters saved opportunities by their current workflow result: qualified, preliminary screen, or rejected.",
  queueCounty: "Filters the opportunity queue to Maricopa or Pinal County. Leave it on both counties to see everything.",
  buyerStatusFilter: "Filters buyer profiles by whether they are active, paused, do-not-contact, or archived.",
  buyerCountyFilter: "Filters buyers by the counties explicitly included in their recorded buy box.",
  displayName: "The buyer or investor's recognizable name. Use the person or team name you use when communicating with them.",
  companyName: "The buyer's business or acquisition company, when known. This is optional and should come from the buyer or verified business information.",
  email: "A buyer email supplied by the buyer or otherwise lawfully recorded. An email alone does not establish permission to market deals to them.",
  phone: "A buyer phone number supplied by the buyer or otherwise lawfully recorded. Contact standing controls whether outreach is allowed.",
  status: "Controls whether this buyer participates operationally. Only active profiles can become eligible buyer matches.",
  contactStatus: "Records the basis for contacting this buyer. Existing relationship or opted in can be contact-eligible; unverified and do-not-contact cannot.",
  source: "How this buyer profile entered the database, such as OPERATOR_MANUAL, referral, event, or a permitted source.",
  sourceUrl: "A link that supports the buyer or property evidence. Use the exact public record, permitted source, or research page rather than a generic home page.",
  notes: "Operator notes that help qualify or understand the buyer. Do not place sensitive personal data or unsupported claims here.",
  preferredCounties: "Counties the buyer has explicitly said or demonstrated they will purchase in. At least one is required.",
  preferredZips: "Optional ZIP-code targets, separated by commas or spaces. Leave blank when the entire selected county is acceptable.",
  propertyTypes: "Property categories the buyer will consider. Record only types the buyer has communicated or demonstrated.",
  purchasePriceMin: "The lowest acquisition price the buyer wants to consider. Buyer matching compares this range with estimated contract price + the target assignment fee.",
  purchasePriceMax: "The highest acquisition price the buyer wants to consider. Buyer matching compares this range with estimated contract price + the target assignment fee.",
  arvMin: "The buyer's minimum acceptable after-repair value, based on the buy box they communicated or demonstrated.",
  arvMax: "The buyer's maximum acceptable after-repair value, if they have one. Leave blank when no upper limit is known.",
  maxRepairs: "The largest repair budget the buyer is willing to take on. Matching uses the property's base repair estimate.",
  closeSpeedDays: "The fastest number of days the buyer says they can reliably close. Matching compares it with a verified property deadline when one exists.",
  squareFeetMin: "The buyer's minimum building size. This criterion stays unknown until square footage is recorded as property evidence.",
  squareFeetMax: "The buyer's maximum building size. This criterion stays unknown until square footage is recorded as property evidence.",
  yearBuiltMin: "The oldest construction year the buyer will accept. Matching needs a recorded year-built fact to verify it.",
  yearBuiltMax: "The newest construction year the buyer will accept, if applicable. Matching needs a recorded year-built fact to verify it.",
  hoaPreference: "Whether the buyer accepts HOA properties, wants to avoid them, or has no preference. HOA status must be recorded as property evidence for a constrained match.",
  occupancies: "Occupancy situations the buyer accepts. Choose Any only when occupancy does not restrict the buy box.",
  financing: "How the buyer expects to fund purchases. Record what the buyer has demonstrated or documented, not an assumption.",
  verifiedPurchaseCount: "Prior purchases supported by reliable evidence, such as recorded deeds or verified closing records.",
  gnsClosingCount: "Transactions this buyer has successfully closed directly with GNS. The system uses this as credibility evidence.",
  retradeCount: "Times the buyer materially reduced their agreed price or terms late in a transaction. This lowers buyer credibility.",
  reliabilityScore: "Optional operator rating from 0–100 supported by documented performance. Leave blank until there is enough evidence.",
  sourceType: "Classifies where property evidence came from: public record, operator research, permitted API, or paid provider.",
  provider: "The agency, company, or research source that supplied the evidence, such as Maricopa County Assessor.",
  costDollars: "The actual cost to obtain this evidence. Use zero for free public records or operator research with no direct vendor charge.",
  classification: "Describes evidence strength. Public record or verified evidence is stronger than an estimate; model-derived means calculated by a documented model.",
  confidence: "How strongly this source supports the facts being added. This percentage is stored with the evidence and contributes to average confidence.",
  propertyType: "The property category shown by assessor data or verified research, such as SFR, condo, townhouse, multifamily, mobile home, or land.",
  squareFeet: "Building living area from the county assessor or another reliable property source. Use the source's stated measurement and link it.",
  bedrooms: "Recorded bedroom count from assessor data, listing history, inspection, or other reliable property evidence.",
  bathrooms: "Recorded bathroom count from assessor data, listing history, inspection, or other reliable property evidence.",
  yearBuilt: "Construction year from the assessor or another reliable property record.",
  lotSquareFeet: "Parcel or lot area from assessor or GIS records, measured in square feet.",
  assessedValue: "The county's assessed value for tax purposes. It is a public-record fact and is not the same as market value or ARV.",
  lastSaleDate: "The most recent verified transfer or sale date from recorder, assessor, or reliable transaction records.",
  lastSalePrice: "The most recent verified sale consideration when available. Some transfers are non-market transactions, so review the deed context.",
  occupancy: "The best-supported current occupancy state: vacant, tenant occupied, owner occupied, or unknown. Do not infer it from mailing address alone.",
  hoaStatus: "Whether the property is subject to an HOA, supported by disclosure, assessor/GIS information, title research, or verified operator research.",
  mailingAddress: "The owner's mailing address shown by the assessor or tax record. It may help compare ownership facts but is not proof of occupancy.",
};

let helpCaptionSequence = 0;

function addInfoMarker(container, key, control) {
  const help = fieldHelp[key];
  if (!help || container.querySelector(".info-tip")) return;
  const textNode = [...container.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
  if (!textNode) return;
  const caption = textNode.textContent.trim();
  const captionLine = document.createElement("span");
  captionLine.className = "field-caption";
  const captionText = document.createElement("span");
  captionText.textContent = caption;
  captionText.id = `field-caption-${++helpCaptionSequence}`;
  captionLine.append(captionText);
  if (control) control.setAttribute("aria-labelledby", captionText.id);
  const marker = document.createElement("span");
  marker.className = "info-tip";
  marker.tabIndex = 0;
  marker.setAttribute("role", "button");
  marker.setAttribute("aria-label", `Information about ${caption}`);
  marker.setAttribute("aria-expanded", "false");
  marker.innerHTML = `<span aria-hidden="true">i</span><span class="info-tooltip" role="tooltip">${escapeHtml(help)}</span>`;
  captionLine.append(marker);
  container.replaceChild(captionLine, textNode);
}

function decorateFieldHelp(root = document) {
  root.querySelectorAll("fieldset").forEach((fieldset) => {
    const legend = fieldset.querySelector(":scope > legend");
    const control = fieldset.querySelector("input:not([type='hidden']), select, textarea");
    if (legend && control) addInfoMarker(legend, control.name, undefined);
  });
  root.querySelectorAll("label").forEach((label) => {
    const control = label.querySelector("input:not([type='hidden']), select, textarea");
    if (!control) return;
    if (label.closest("fieldset") && ["preferredCounties", "propertyTypes", "occupancies", "financing"].includes(control.name)) return;
    const key = control.dataset.field || control.name || control.id;
    addInfoMarker(label, ({
      "csv-file": "csvFile",
      "queue-state": "queueState",
      "queue-county": "queueCounty",
      "buyer-status-filter": "buyerStatusFilter",
      "buyer-county-filter": "buyerCountyFilter",
    })[key] || key, control);
  });
}

function closeInfoMarkers(except) {
  document.querySelectorAll(".info-tip.open").forEach((marker) => {
    if (marker === except) return;
    marker.classList.remove("open");
    marker.setAttribute("aria-expanded", "false");
  });
}

document.addEventListener("click", (event) => {
  const marker = event.target.closest(".info-tip");
  if (!marker) {
    closeInfoMarkers();
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const willOpen = !marker.classList.contains("open");
  closeInfoMarkers(marker);
  marker.classList.toggle("open", willOpen);
  marker.setAttribute("aria-expanded", String(willOpen));
});

document.addEventListener("keydown", (event) => {
  const marker = event.target.closest?.(".info-tip");
  if (!marker || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  marker.click();
});

const helpObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) decorateFieldHelp(node);
  }));
});
decorateFieldHelp();
helpObserver.observe(document.body, { childList: true, subtree: true });

fetch("/api/health").then((response) => response.json()).then((health) => {
  $("#health").textContent = health.persistence ? "Engine online · database connected" : "Engine online · local evaluation mode";
  $("#health-dot").classList.add("ok");
}).catch(() => { $("#health").textContent = "Engine unavailable"; });

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === tab));
  document.querySelectorAll("main > .panel").forEach((panel) => panel.classList.toggle("hidden", panel.id !== `${tab.dataset.tab}-panel`));
  $("#results").innerHTML = "";
  if (tab.dataset.tab === "opportunities") loadOpportunities();
  if (tab.dataset.tab === "buyers") loadBuyers();
  if (tab.dataset.tab === "sellers") loadSellerInquiries();
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
  const skipTraceAction = item.state === "REJECTED" ? "" : `<button class="skip-trace-button" type="button" data-evaluation-id="${escapeHtml(item.evaluationId)}" aria-expanded="false">Selective skip trace</button>`;
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
    <div class="history-row"><span>${item.historyCount} evaluation${item.historyCount === 1 ? "" : "s"} on record</span><div class="card-actions">${skipTraceAction}${buyerMatchAction}<button class="enrichment-button" type="button" data-evaluation-id="${escapeHtml(item.evaluationId)}" aria-expanded="false">Property evidence</button><button class="history-button" type="button" data-county="${escapeHtml(item.county)}" data-apn="${escapeHtml(item.apn)}" aria-expanded="false">View history</button></div></div>
    <div class="skip-trace-panel hidden"></div>
    <div class="buyer-match-panel hidden"></div>
    <div class="enrichment-panel hidden"></div>
    <div class="history-list hidden"></div>
  </article>`;
}

function renderSkipTracePanel(evaluationId, candidate, status, message = "") {
  const warning = `<div class="skip-trace-warning"><strong>Research only.</strong> This workflow never sends data to a provider and never initiates outreach. A discovered phone, email, or address remains <strong>unknown standing</strong> until separate evidence supports consent, an existing relationship, or suppression.</div>`;
  const candidateSummary = candidate ? `<div class="skip-trace-summary"><div><span>Qualification</span><strong>${escapeHtml(candidate.state.replaceAll("_", " "))} · ${candidate.score}/100</strong></div><div><span>Base assignment</span><strong>${money.format(candidate.expectedAssignmentFee)}</strong></div><div><span>Owner confidence</span><strong>${Math.round(candidate.ownerConfidence * 100)}%</strong></div><div><span>External transmission</span><strong>Disabled</strong></div></div>` : "";
  if (!status) {
    return `${message ? `<div class="success-message">${escapeHtml(message)}</div>` : ""}${warning}${candidateSummary}
      <form class="skip-trace-request-form guarded-form" data-evaluation-id="${escapeHtml(evaluationId)}">
        <div class="section-heading compact-heading"><h4>Open one research case</h4><p>Requires a qualified 80+ opportunity, $10,000+ base assignment, 65%+ owner confidence, bounded cost, and no active suppression.</p></div>
        <div class="skip-trace-grid">
          <label>Purpose<select name="purpose"><option value="OWNER_LOCATION">Owner location</option><option value="OWNER_IDENTITY_CONFIRMATION">Owner identity confirmation</option><option value="AUTHORIZED_REPRESENTATIVE">Authorized representative</option></select></label>
          <label>Planned source<select name="plannedSourceType"><option value="OPERATOR_RESEARCH">Operator research</option><option value="PUBLIC_RECORD">Public record</option><option value="PERMITTED_PROVIDER">Permitted provider</option><option value="PAID_PROVIDER">Paid provider</option></select></label>
          <label>Provider or source<input name="provider" required placeholder="Operator research"></label>
          <label>Estimated cost in dollars<input name="estimatedCostDollars" type="number" min="0" step="0.01" value="0"></label>
          <label class="wide">Source URL<input name="sourceUrl" type="url" placeholder="Required for public or provider sources"></label>
          <label class="wide">Why this lookup is necessary<textarea name="necessityReason" required minlength="20" placeholder="Explain why this specific opportunity needs contact research."></textarea></label>
          <label class="wide">Owner identity evidence already reviewed<textarea name="identityBasis" required minlength="20" placeholder="Name the deed, assessor, recorder, or other evidence tying this owner to the parcel."></textarea></label>
          <label class="wide">Privacy and minimization notes<textarea name="privacyNotes" required minlength="20" placeholder="Explain what will be collected, why it is proportionate, and how unrelated data will be avoided."></textarea></label>
        </div>
        <label class="check-row"><input name="publicRecordsReviewed" type="checkbox" required> I reviewed available public/property evidence before requesting contact research.</label>
        <label class="check-row"><input name="contactStandingReviewed" type="checkbox" required> I reviewed known contact standing and understand that contact data is not consent.</label>
        <button class="primary skip-trace-submit" type="submit">Approve research case</button>
        <div class="skip-trace-feedback" aria-live="polite"></div>
      </form>`;
  }

  const findingCards = status.findings.length ? `<div class="skip-trace-findings">${status.findings.map((finding) => `<article><p class="eyebrow">${escapeHtml(finding.kind.replaceAll("_", " "))} · ${escapeHtml(finding.identityStatus.replaceAll("_", " "))}</p><h5>${escapeHtml(finding.value)}</h5><p>${escapeHtml(finding.subjectName)} · ${escapeHtml(finding.classification.replaceAll("_", " "))} · ${Math.round(finding.confidence * 100)}%</p><small>${escapeHtml(finding.provider)} · ${escapeHtml(new Date(finding.retrievedAt).toLocaleString())} · ${money.format(finding.costCents / 100)}</small></article>`).join("")}</div>` : '<p class="empty compact">No contact findings were stored.</p>';
  const statusSummary = `<div class="skip-trace-summary"><div><span>Case status</span><strong>${escapeHtml(status.status.replaceAll("_", " "))}</strong></div><div><span>Outcome</span><strong>${escapeHtml((status.outcome || "PENDING").replaceAll("_", " "))}</strong></div><div><span>Research cost</span><strong>${money.format(status.actualCostCents / 100)} / ${money.format(status.gate.maximumApprovedCostCents / 100)}</strong></div><div><span>Contact standing</span><strong>${escapeHtml(status.contactStanding.replaceAll("_", " "))}</strong></div></div>`;
  const resultForm = status.status === "READY_FOR_RESEARCH" ? `<form class="skip-trace-result-form guarded-form" data-case-id="${escapeHtml(status.caseId)}">
      <div class="section-heading compact-heading"><h4>Record completed research</h4><p>Record evidence obtained outside this app. Do not enter unrelated people or data beyond the stated purpose.</p></div>
      <div class="skip-trace-grid">
        <label>Outcome<select name="outcome"><option value="CONTACT_FOUND">Contact found</option><option value="NO_MATCH">No match</option><option value="NEEDS_REVIEW">Needs review</option></select></label>
        <label>Actual cost in dollars<input name="actualCostDollars" type="number" min="0" step="0.01" value="0"></label>
        <label>Finding type<select name="kind"><option value="PHONE">Phone</option><option value="EMAIL">Email</option><option value="MAILING_ADDRESS">Mailing address</option><option value="OTHER">Other</option></select></label>
        <label>Contact value<input name="value" placeholder="Leave blank only for no match"></label>
        <label>Subject name<input name="subjectName" placeholder="Name attached to the finding"></label>
        <label>Identity status<select name="identityStatus"><option value="UNVERIFIED">Unverified</option><option value="OWNER">Owner</option><option value="AUTHORIZED_REPRESENTATIVE">Authorized representative</option><option value="WRONG_PARTY">Wrong party</option><option value="STALE">Stale</option></select></label>
        <label>Evidence source<select name="sourceType"><option value="OPERATOR_RESEARCH">Operator research</option><option value="PUBLIC_RECORD">Public record</option><option value="PERMITTED_PROVIDER">Permitted provider</option><option value="PAID_PROVIDER">Paid provider</option></select></label>
        <label>Provider<input name="findingProvider" placeholder="Research source"></label>
        <label class="wide">Exact source URL<input name="findingSourceUrl" type="url" placeholder="Required for public or provider sources"></label>
        <label>Source record ID<input name="sourceRecordId"></label>
        <label>Classification<select name="classification"><option value="HUMAN_VERIFIED">Human verified</option><option value="VERIFIED">Verified</option><option value="PUBLIC_RECORD">Public record</option><option value="ESTIMATED">Estimated</option></select></label>
        <label>Confidence<select name="confidence"><option value="0.9">High · 90%</option><option value="0.75">Good · 75%</option><option value="0.6">Moderate · 60%</option><option value="0.4">Low · 40%</option></select></label>
        <label>Finding cost in dollars<input name="findingCostDollars" type="number" min="0" step="0.01" value="0"></label>
        <label class="wide">Research notes<textarea name="researchNotes" minlength="10" placeholder="How this result was found and what remains uncertain."></textarea></label>
        <label class="wide">Completion notes<textarea name="completionNotes" required minlength="10" placeholder="Summarize the completed search and any unresolved questions."></textarea></label>
      </div>
      <button class="primary skip-trace-result-submit" type="submit">Record result and close case</button>
      <div class="skip-trace-feedback" aria-live="polite"></div>
    </form>` : "";
  const standingForm = status.status === "COMPLETED" ? `<form class="contact-standing-form guarded-form" data-case-id="${escapeHtml(status.caseId)}">
      <div class="section-heading compact-heading"><h4>Record contact standing</h4><p>This append-only review does not send a message or place a call.</p></div>
      <div class="skip-trace-grid">
        <label>Standing<select name="standing"><option value="UNKNOWN">Unknown / research only</option><option value="CONSENTED">Consented</option><option value="EXISTING_RELATIONSHIP">Existing relationship</option><option value="DO_NOT_CONTACT">Do not contact</option><option value="DECEASED">Deceased</option></select></label>
        <label>Evidence source<input name="evidenceSource" required placeholder="Signed form, operator review, verbal request"></label>
        <label class="wide">Evidence URL<input name="evidenceUrl" type="url" placeholder="Optional exact evidence link"></label>
        <fieldset class="wide channel-fieldset"><legend>Explicitly supported channels</legend><label><input type="checkbox" name="allowedChannels" value="CALL"> Call</label><label><input type="checkbox" name="allowedChannels" value="TEXT"> Text</label><label><input type="checkbox" name="allowedChannels" value="EMAIL"> Email</label><label><input type="checkbox" name="allowedChannels" value="MAIL"> Mail</label></fieldset>
        <label class="wide">Reason and evidence<textarea name="reason" required minlength="10" placeholder="Document the consent, relationship, suppression request, or unresolved standing."></textarea></label>
      </div>
      <button class="secondary contact-standing-submit" type="submit">Record standing event</button>
      <div class="skip-trace-feedback" aria-live="polite"></div>
    </form>` : "";
  return `${message ? `<div class="success-message">${escapeHtml(message)}</div>` : ""}${warning}${statusSummary}${findingCards}${resultForm}${standingForm}`;
}

async function loadSkipTracePanel(button, message = "") {
  const panel = button.closest(".opportunity-card").querySelector(".skip-trace-panel");
  panel.classList.remove("hidden");
  panel.innerHTML = '<p class="loading">Loading selective skip-trace controls…</p>';
  button.disabled = true;
  try {
    const params = new URLSearchParams({ evaluationId: button.dataset.evaluationId });
    const body = await send(`/api/opportunities/skip-trace?${params}`, {});
    if (body.selectiveSkipTracingAvailable === false) {
      panel.innerHTML = '<div class="empty">Apply the selective-skip-tracing migration before opening a research case.</div>';
      return;
    }
    panel.innerHTML = renderSkipTracePanel(button.dataset.evaluationId, body.candidate, body.skipTrace, message);
    button.textContent = "Hide skip trace";
    button.setAttribute("aria-expanded", "true");
  } catch (error) {
    panel.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  } finally {
    button.disabled = false;
  }
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

function renderSellerInquiry(inquiry) {
  const permission = [inquiry.consentEmail ? "EMAIL" : "", inquiry.consentCall ? "CALL" : "", inquiry.consentText ? "TEXT" : ""].filter(Boolean);
  const delivery = inquiry.deliveryStatuses.length ? inquiry.deliveryStatuses.map((item) => `${item.kind.replaceAll("_", " ")}: ${item.status}`).join(" · ") : "No delivery attempts recorded";
  const tierClass = inquiry.qualification.tier === "PRIORITY" ? "seller-priority" : inquiry.qualification.tier === "INELIGIBLE" ? "seller-ineligible" : "";
  return `<article class="seller-inquiry-card ${tierClass}">
    <div class="seller-inquiry-header"><div><p class="eyebrow">${escapeHtml(inquiry.qualification.tier)} · ${escapeHtml(inquiry.status.replaceAll("_", " "))}</p><h4>${escapeHtml(inquiry.propertyAddress)}</h4><p>${escapeHtml(inquiry.name)} · ${escapeHtml(inquiry.county.replaceAll("_", " "))} · ${escapeHtml(new Date(inquiry.submittedAt).toLocaleString())}</p></div><div class="score"><strong>${inquiry.qualification.score}</strong><span>/ 100 · INTAKE</span></div></div>
    <div class="seller-inquiry-grid"><div><span>Timeline</span><strong>${escapeHtml(inquiry.timeline.replaceAll("_", " "))}</strong></div><div><span>Situation</span><strong>${escapeHtml(inquiry.motivation.replaceAll("_", " "))}</strong></div><div><span>Condition</span><strong>${escapeHtml(inquiry.condition.replaceAll("_", " "))}</strong></div><div><span>Occupancy</span><strong>${escapeHtml(inquiry.occupancy.replaceAll("_", " "))}</strong></div></div>
    <div class="seller-contact-evidence"><p><strong>Contact:</strong> ${escapeHtml([inquiry.email, inquiry.phone].filter(Boolean).join(" · ") || "None")}</p><p><strong>Authorized channels:</strong> ${escapeHtml(permission.join(" · ") || "None — do not initiate outreach")}</p><p><strong>Relationship:</strong> ${escapeHtml(inquiry.relationship.replaceAll("_", " "))}${inquiry.apn ? ` · <strong>APN:</strong> ${escapeHtml(inquiry.apn)}` : ""}</p><p><strong>Asking / mortgage:</strong> ${inquiry.askingPrice === undefined ? "Not provided" : money.format(inquiry.askingPrice)} / ${inquiry.mortgageBalance === undefined ? "Not provided" : money.format(inquiry.mortgageBalance)}</p>${inquiry.notes ? `<p><strong>Seller notes:</strong> ${escapeHtml(inquiry.notes)}</p>` : ""}<p><strong>Assessment:</strong> ${escapeHtml(inquiry.qualification.summary)}</p><p><strong>Review flags:</strong> ${escapeHtml(inquiry.qualification.reviewFlags.join(" · ") || "None")}</p><p><strong>Delivery:</strong> ${escapeHtml(delivery)}</p>${inquiry.bookingUrl ? `<p><strong>Cal.com:</strong> Booking link offered</p>` : ""}</div>
    <form class="seller-status-form" data-inquiry-id="${escapeHtml(inquiry.id)}"><label>Record status<select name="status"><option value="NEW" ${inquiry.status === "NEW" ? "selected" : ""}>New</option><option value="REVIEWING" ${inquiry.status === "REVIEWING" ? "selected" : ""}>Reviewing</option><option value="CONTACTED" ${inquiry.status === "CONTACTED" ? "selected" : ""}>Contacted</option><option value="APPOINTMENT_SET" ${inquiry.status === "APPOINTMENT_SET" ? "selected" : ""}>Appointment set</option><option value="CLOSED" ${inquiry.status === "CLOSED" ? "selected" : ""}>Closed</option></select></label><label class="rationale">Rationale<input name="rationale" required minlength="10" maxlength="1000" placeholder="What changed and what evidence supports it?"></label><button class="secondary" type="submit">Record status</button><div class="seller-status-feedback" aria-live="polite"></div></form>
  </article>`;
}

async function loadSellerInquiries(message = "") {
  const list = $("#seller-inquiry-list");
  list.innerHTML = '<p class="loading">Loading seller inquiries…</p>';
  const params = new URLSearchParams({ limit: "50" });
  if ($("#seller-status-filter").value) params.set("status", $("#seller-status-filter").value);
  if ($("#seller-tier-filter").value) params.set("tier", $("#seller-tier-filter").value);
  try {
    const body = await send(`/api/seller/inquiries?${params}`, {});
    if (body.sellerIntakeAvailable === false) {
      list.innerHTML = '<div class="empty">Apply the Phase 2 seller-intake migration before receiving public inquiries.</div>';
      return;
    }
    list.innerHTML = `${message ? `<div class="success-message">${escapeHtml(message)}</div>` : ""}${body.inquiries.length ? body.inquiries.map(renderSellerInquiry).join("") : '<div class="empty">No seller inquiries match these filters.</div>'}`;
  } catch (error) {
    list.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  }
}

$("#refresh-sellers").addEventListener("click", () => loadSellerInquiries());
$("#seller-status-filter").addEventListener("change", () => loadSellerInquiries());
$("#seller-tier-filter").addEventListener("change", () => loadSellerInquiries());
$("#seller-inquiry-list").addEventListener("submit", async (event) => {
  const form = event.target.closest(".seller-status-form");
  if (!form) return;
  event.preventDefault();
  const button = event.submitter;
  const feedback = form.querySelector(".seller-status-feedback");
  button.disabled = true;
  feedback.innerHTML = "";
  try {
    const data = Object.fromEntries(new FormData(form));
    const body = await send("/api/seller/inquiries/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inquiryId: form.dataset.inquiryId, status: data.status, rationale: data.rationale }) });
    await loadSellerInquiries(`${body.inquiry.status.replaceAll("_", " ")} status recorded. No outreach was initiated by this action.`);
  } catch (error) {
    feedback.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    button.disabled = false;
  }
});

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
  const skipTraceButton = event.target.closest(".skip-trace-button");
  if (skipTraceButton) {
    const panel = skipTraceButton.closest(".opportunity-card").querySelector(".skip-trace-panel");
    if (!panel.classList.contains("hidden")) {
      panel.classList.add("hidden");
      skipTraceButton.textContent = "Selective skip trace";
      skipTraceButton.setAttribute("aria-expanded", "false");
    } else {
      await loadSkipTracePanel(skipTraceButton);
    }
    return;
  }
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
  const skipTraceRequestForm = event.target.closest(".skip-trace-request-form");
  if (skipTraceRequestForm) {
    event.preventDefault();
    const button = skipTraceRequestForm.querySelector(".skip-trace-submit");
    const feedback = skipTraceRequestForm.querySelector(".skip-trace-feedback");
    button.disabled = true;
    feedback.innerHTML = "";
    try {
      const data = Object.fromEntries(new FormData(skipTraceRequestForm));
      const body = await send("/api/opportunities/skip-trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evaluationId: skipTraceRequestForm.dataset.evaluationId,
          purpose: data.purpose,
          necessityReason: data.necessityReason,
          identityBasis: data.identityBasis,
          plannedSourceType: data.plannedSourceType,
          provider: data.provider,
          sourceUrl: data.sourceUrl,
          estimatedCostCents: Math.round(Number(data.estimatedCostDollars || 0) * 100),
          privacyNotes: data.privacyNotes,
          publicRecordsReviewed: data.publicRecordsReviewed === "on",
          contactStandingReviewed: data.contactStandingReviewed === "on",
        }),
      });
      const toggle = skipTraceRequestForm.closest(".opportunity-card").querySelector(".skip-trace-button");
      await loadSkipTracePanel(toggle, `Research case ${body.created ? "approved" : "already exists"}. No data was sent to an external provider.`);
    } catch (error) {
      feedback.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
      button.disabled = false;
    }
    return;
  }

  const skipTraceResultForm = event.target.closest(".skip-trace-result-form");
  if (skipTraceResultForm) {
    event.preventDefault();
    const button = skipTraceResultForm.querySelector(".skip-trace-result-submit");
    const feedback = skipTraceResultForm.querySelector(".skip-trace-feedback");
    button.disabled = true;
    feedback.innerHTML = "";
    try {
      const data = Object.fromEntries(new FormData(skipTraceResultForm));
      const findings = data.outcome === "NO_MATCH" ? [] : [{
        kind: data.kind,
        value: data.value,
        subjectName: data.subjectName,
        identityStatus: data.identityStatus,
        provider: data.findingProvider,
        sourceType: data.sourceType,
        sourceUrl: data.findingSourceUrl,
        sourceRecordId: data.sourceRecordId,
        classification: data.classification,
        confidence: Number(data.confidence),
        costCents: Math.round(Number(data.findingCostDollars || 0) * 100),
        researchNotes: data.researchNotes,
      }];
      const body = await send("/api/opportunities/skip-trace/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: skipTraceResultForm.dataset.caseId,
          outcome: data.outcome,
          actualCostCents: Math.round(Number(data.actualCostDollars || 0) * 100),
          completionNotes: data.completionNotes,
          findings,
        }),
      });
      const toggle = skipTraceResultForm.closest(".opportunity-card").querySelector(".skip-trace-button");
      await loadSkipTracePanel(toggle, `${body.findingsStored} contact finding${body.findingsStored === 1 ? "" : "s"} recorded as evidence. Contact standing remains separate; no outreach was initiated.`);
    } catch (error) {
      feedback.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
      button.disabled = false;
    }
    return;
  }

  const standingForm = event.target.closest(".contact-standing-form");
  if (standingForm) {
    event.preventDefault();
    const button = standingForm.querySelector(".contact-standing-submit");
    const feedback = standingForm.querySelector(".skip-trace-feedback");
    button.disabled = true;
    feedback.innerHTML = "";
    try {
      const formData = new FormData(standingForm);
      const data = Object.fromEntries(formData);
      const body = await send("/api/opportunities/skip-trace/standing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: standingForm.dataset.caseId,
          standing: data.standing,
          allowedChannels: formData.getAll("allowedChannels"),
          reason: data.reason,
          evidenceSource: data.evidenceSource,
          evidenceUrl: data.evidenceUrl,
        }),
      });
      const toggle = standingForm.closest(".opportunity-card").querySelector(".skip-trace-button");
      await loadSkipTracePanel(toggle, `${body.result.standing.replaceAll("_", " ")} standing recorded in the append-only audit trail. No outreach was initiated.`);
    } catch (error) {
      feedback.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
      button.disabled = false;
    }
    return;
  }

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
