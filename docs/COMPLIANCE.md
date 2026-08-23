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

The current implementation has no provider credentials, external transmission, bulk endpoint, or outreach action. Adding any of those capabilities requires explicit authorization, provider terms/privacy review, and appropriate legal/compliance review.

Arizona-specific wholesale transaction requirements should be versioned and configurable.

This documentation is operational guidance and not a substitute for legal advice.
