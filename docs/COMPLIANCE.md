# Compliance

Compliance must be implemented as system behavior rather than relying exclusively on operator memory.

Areas requiring controls include:

- wholesale disclosures
- seller-facing representation
- contact consent
- opt-outs
- do-not-contact suppression
- automated communications
- data-source terms and permissions
- handling of personally identifiable information

Automated mass calling, texting, or cold email must not be activated without appropriate review.

Selective skip tracing is limited to one explicitly qualified opportunity per request. The system preserves purpose, necessity, identity basis, source provenance, cost, confidence, minimization notes, and audit evidence. A discovered phone, email, or address has `UNKNOWN` standing by default and provides no permission to call, text, email, or mail. Consent or an existing relationship must identify specifically supported channels. Do-not-contact standing suppresses later research and remains sticky unless explicit consent evidence supports a later change.

The selective skip-tracing boundary has no provider credentials, external transmission, bulk endpoint, or outreach action. Adding any of those capabilities requires explicit authorization, provider terms/privacy review, and appropriate legal/compliance review.

Inbound seller intake records email, call, and text permission separately. A provided address or number remains unusable for a channel whose permission was not selected. Seller acknowledgements are transactional and require the email checkbox; internal notifications omit seller contact information and property details. No calling or texting integration exists.

Seller qualification is a routing assessment only. The portal states that submission is not an offer, contract, appraisal, or promise to buy. Reported ownership and representative authority remain subject to human verification. Cal.com receives no seller data from the Worker; a seller transmits booking information only by choosing the public booking link.

AI assistance excludes seller identity, contact values, property address, APN, exact financial amounts, and seller-authored notes. The application does not transmit the packet externally. Imported results are advisory, strictly structured, provider/model-attributed, and unusable until an operator records an acceptance, rejection, or revision decision with rationale. AI output cannot create consent, authorize contact, change status, initiate outreach, or constitute an offer, appraisal, title conclusion, or legal advice.

An acquisition-case decision is internal decision support, not permission to contact and not an offer. The first Phase 3 workflow accepts only zero-cost public-record or human-verified research, preserves the exact source and retrieval time, and keeps seller-reported facts distinct from verified facts. Advancing requires a human to review material evidence and the channel-specific consent boundary. Every decision records that no offer is generated or authorized; offer drafting and sending remain unavailable.

Acquisition diligence is also decision support. Each review preserves an immutable, zero-cost evidence envelope for property identity, owner identity, seller authority, title, liens/payoffs, taxes, distress timing, occupancy, condition/repairs, value, buyer demand, wholesale disclosure, and consent/communications. Missing work remains `OPEN`; a material impediment remains `BLOCKED`; required checks cannot be dismissed as not applicable. `READY_FOR_HUMAN_OFFER_AUTHORIZATION` means only that the recorded checklist is complete and current enough to present to a human. It neither records authorization nor creates terms, documents, contact permission, or outreach capability.

An internal term authorization is not an offer to a seller. It records a human's bounded internal authority against the latest ready diligence, expires within 72 hours, and becomes stale when underlying evidence changes. Authorization requires renewed material-fact and wholesale-disclosure attestations. Decline and revocation are append-only. The Access identity is stored as a one-way fingerprint rather than an email address; the selected acquisitions-manager or principal role is an explicit attestation and does not replace centrally managed role assignment. No milestone 3 action changes consent, authorizes a communication channel, produces a contract or disclosure, creates a signature request, or sends anything.

An internal offer-terms draft remains an operational control record, not a seller-facing offer, Arizona purchase contract, approved disclosure, or legal instrument. PostgreSQL assembles the draft from the current authorization and immutable inquiry so the browser cannot substitute identity, property, terms, expiry, or notices. Every revision is append-only and content-hashed. The fixed classification requires legal-template, wholesale-disclosure, and final human-release review. Milestone 4 provides no PDF/download, signature, delivery, provider, or outreach capability and does not change consent or contact standing.

Seller-document release governance requires centrally administered permission evidence; browser role attestation is insufficient. Legal versions must carry exact hashes, approval evidence, jurisdiction, validity, and retention before they can satisfy a gate. Release controls bind the exact current internal-draft hash, authorization, seller/property/term revalidation, channel consent, and suppression standing. Preparation, final human approval/rejection/revocation, signature history, and delivery history are separate append-only records. No approved legal artifact is inferred or seeded, and the current Worker cannot generate, sign, deliver, contact, or call a provider.

Arizona-specific wholesale transaction requirements should be versioned and configurable.

This documentation is operational guidance and not a substitute for legal advice.
