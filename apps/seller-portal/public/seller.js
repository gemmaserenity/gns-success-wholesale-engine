const form = document.querySelector("#seller-intake-form");
const feedback = document.querySelector("#form-feedback");
const result = document.querySelector("#seller-result");
const startedAt = new Date().toISOString();
let submissionId = sessionStorage.getItem("gns-seller-submission-id") || crypto.randomUUID();
sessionStorage.setItem("gns-seller-submission-id", submissionId);

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function optionalNumber(data, name) {
  return data[name] === "" ? undefined : Number(data[name]);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  feedback.innerHTML = "";
  try {
    const data = Object.fromEntries(new FormData(form));
    if (!data.email && !data.phone) throw new Error("Please provide an email address or phone number.");
    const payload = {
      submissionId,
      startedAt,
      name: data.name,
      email: data.email,
      phone: data.phone,
      propertyAddress: data.propertyAddress,
      county: data.county,
      apn: data.apn,
      relationship: data.relationship,
      timeline: data.timeline,
      motivation: data.motivation,
      condition: data.condition,
      occupancy: data.occupancy,
      notes: data.notes,
      consentEmail: data.consentEmail === "on",
      consentCall: data.consentCall === "on",
      consentText: data.consentText === "on",
      privacyAccepted: data.privacyAccepted === "on",
      companyWebsite: data.companyWebsite,
    };
    const askingPrice = optionalNumber(data, "askingPrice");
    const mortgageBalance = optionalNumber(data, "mortgageBalance");
    if (askingPrice !== undefined) payload.askingPrice = askingPrice;
    if (mortgageBalance !== undefined) payload.mortgageBalance = mortgageBalance;

    const response = await fetch("/api/seller/intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const responseText = await response.text();
    let body;
    try {
      body = JSON.parse(responseText);
    } catch {
      throw new Error(response.ok
        ? "The seller portal received an unexpected response. Please try again."
        : "Seller intake is temporarily unavailable. Please try again shortly.");
    }
    if (!response.ok) throw new Error(body.issues?.map((issue) => issue.message).join(" ") || body.error || "We could not submit the form.");

    form.closest(".seller-card").classList.add("hidden");
    result.classList.remove("hidden");
    result.innerHTML = `<p class="eyebrow">INFORMATION RECEIVED</p><h2>Thank you. Your property is in review.</h2><p>Keep this reference for your records: <strong>${escapeHtml(body.inquiryId)}</strong>.</p>${body.bookingUrl ? `<p>Your answers are ready for a private conversation. Choose a time that works for you.</p><a class="booking-button" href="${escapeHtml(body.bookingUrl)}" target="_blank" rel="noopener noreferrer">Book a call with GNS Success</a>` : "<p>Our team will review the information. Any follow-up will use only the contact methods you selected.</p>"}<p class="fine-print">No outreach was initiated beyond an email acknowledgement you expressly requested.</p>`;
    sessionStorage.removeItem("gns-seller-submission-id");
    result.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    feedback.innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
    button.disabled = false;
  }
});

