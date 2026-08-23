# Data Sources

## Initial Geography

### Pinal County, Arizona

Primary research material is maintained outside this repository in the parent workspace under:

research/data-sources/AZ Pinal County/

Official operator sources currently recorded in that research:

- Pinal County Recorder document search: `https://acclaim.pinalcountyaz.gov/AcclaimWeb/`
- Pinal County Assessor parcel search: `https://app1.pinal.gov/search/parcel-search.aspx`
- Pinal County Treasurer parcel inquiry: `https://treasurer.pinal.gov/ParcelInquiry`
- Pinal County parcel zoning report: `https://app1.pinal.gov/ZoningReport/`

### Maricopa County, Arizona

Primary research material is maintained outside this repository under:

research/data-sources/AZ Maricopa County/

Official operator sources currently recorded in that research:

- Maricopa County Recorder document search: `https://recorder.maricopa.gov/recording/document-search.html`
- Maricopa County Assessor: `https://mcassessor.maricopa.gov/`
- Maricopa County Treasurer property-tax information: `https://treasurer.maricopa.gov/PropertyTaxInformation`
- Maricopa County Assessor parcel map: `https://maps.mcassessor.maricopa.gov/`

## Operator research guide

The deployed dashboard links to `apps/dashboard/public/research-guide.html`. It is the canonical operator-facing source-to-field map and future AI-squad handoff blueprint. It records:

- the end-to-end manual research workflow;
- official Maricopa, Pinal, Arizona entity, court, and bankruptcy starting points;
- each manual-evaluation, property-evidence, and buyer-profile field;
- calculation boundaries and facts that must not be inferred;
- evidence-envelope requirements; and
- agent ownership, stop conditions, and handoff requirements.

Source links on the guide were last reviewed on August 23, 2026. Material facts still require verification against the responsible agency or qualified professional because public systems can be delayed, incomplete, or changed.

## Initial Signal

Notice of Trustee's Sale / Trustee Sale records.

## Data Principles

Every imported datum should preserve:

- source
- source identifier when available
- retrieval timestamp
- original value
- normalized value
- confidence
- provenance

Data should distinguish between:

- verified
- public record
- estimated
- model-derived
- seller-reported
- human-verified

The system should not depend on brittle unauthorized scraping.

## Phase 1 ingestion contract

The operational fallback is manual entry or CSV. Every row stores its source name, source record identifier when available, source URL when available, retrieval time, parser version, raw values, normalized values, and evidence confidence. The template is in `apps/dashboard/public/trustee-sale-template.csv`.

The same county/APN within one import is considered a duplicate. Database uniqueness additionally protects source + source record ID. Automated county retrieval remains deferred until an endpoint is confirmed lawful, stable, and economical.
