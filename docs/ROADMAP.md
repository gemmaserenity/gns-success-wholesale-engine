# GNS Success Wholesale Engine Roadmap

## Phase 1 — Opportunity Discovery MVP

Build a functioning private system capable of:

1. ingesting Arizona trustee-sale and property records;
2. normalizing property and ownership data;
3. deduplicating records;
4. performing preliminary wholesale underwriting;
5. eliminating economically weak opportunities;
6. calculating an opportunity score;
7. identifying plausible $10,000+ assignment opportunities;
8. presenting qualified opportunities in a private dashboard.

### Phase 1 does not require

- mass skip tracing
- automated SMS
- automated cold calling
- automated cold email
- sophisticated disposition automation
- multiple states
- numerous paid data vendors

## Phase 2 — Qualification and Acquisition

Add:

- [x] normalized property, owner, ownership-interest, and distress-event persistence
- [x] durable opportunity queue and evaluation history
- [x] improved property enrichment with explicit confidence and cost gates
- [x] buyer database with explicit buy boxes and contact standing
- [x] explainable buyer-demand scoring and probable-buyer counts
- [x] selective skip tracing with qualification, privacy, cost, provenance, contact-standing, and audit controls
- [x] seller-facing portal
- [x] inbound seller qualification
- [x] AI-assisted seller intake
- [x] Cal.com integration
- [x] Resend transactional communications
- [x] operator notifications

## Phase 3 — Scale

After revenue validates the model, evaluate:

- [x] first operational milestone: seller inquiry → verified property research → underwriting → buyer-demand evidence → human acquisition decision
- [x] second operational milestone: immutable acquisition diligence → explicit blockers/open items → evidence-only readiness for a separate human offer-authorization step
- [x] third operational milestone: expiring internal term authorization → append-only decline/revocation → no document generation, sending, or outreach
- [x] fourth operational milestone: server-assembled immutable internal offer-terms draft → version/hash provenance → no seller-facing approval, signature, delivery, or outreach
- [x] fifth operational milestone: controlled release governance → central permissions and legal-version evidence ledgers → seller-facing generation, signature, delivery, providers, and outreach remain unavailable until approvals exist

- premium property-data providers
- premium AVM/comparable-sales data
- title/lien data
- advanced skip tracing
- compliant communications infrastructure
- disposition automation
- additional Arizona counties
- additional states
- additional distress signals

Infrastructure expansion should follow demonstrated economic value.
