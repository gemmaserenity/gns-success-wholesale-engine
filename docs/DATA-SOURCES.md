# Data Sources

## Initial Geography

### Pinal County, Arizona

Primary research material is maintained outside this repository in the parent workspace under:

research/data-sources/AZ Pinal County/

Official operator sources currently recorded in that research:

- Pinal County Recorder document search: `https://acclaim.pinalcountyaz.gov/AcclaimWeb/`
- Pinal County Assessor: `https://www.pinal.gov/486/Assessor`
- Pinal County GIS: `https://www.pinal.gov/630/GIS`

### Maricopa County, Arizona

Primary research material is maintained outside this repository under:

research/data-sources/AZ Maricopa County/

Official operator sources currently recorded in that research:

- Maricopa County Recorder document search: `https://recorder.maricopa.gov/recording/document-search.html`
- Maricopa County Assessor: `https://www.mcassessor.maricopa.gov/`

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
