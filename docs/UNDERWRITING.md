# Underwriting

The underwriting engine must be transparent, deterministic where possible, and configurable.

Potential inputs include:

- current market value
- ARV
- estimated repairs
- investor purchase ceiling
- mortgage/payoff estimates
- liens
- taxes
- closing/risk buffer
- required assignment fee

Conceptual calculation:

Investor Maximum Purchase Price
− Repairs
− Transaction / Risk Buffer
− Desired Assignment Fee
= Maximum Wholesale Contract Price

A single universal 70% rule must not be hard-coded.

Calculations should support:

- downside case
- base case
- upside case
- confidence level

## Phase 1 calculation

For each downside/base/upside scenario:

```text
Investor purchase ceiling = ARV × investor purchase factor − repairs − risk buffer
Estimated contract price = proposed contract price, otherwise debt + liens + seller-net floor
Maximum contract for target fee = investor purchase ceiling − desired assignment fee
Expected assignment fee = investor purchase ceiling − estimated contract price
Estimated equity = ARV − debt − liens
```

Defaults are a 0.78 investor purchase factor, $12,000 risk buffer, $5,000 seller-net floor, and $10,000 desired assignment. They are named configuration values, not a universal market rule. Inputs without support must be marked estimated and reflected in `dataConfidence`.

## Phase 2 enriched evaluations

Enrichment never mutates an existing score. New ARV, repair, debt, lien, property-type, square-footage, or year-built evidence produces a fresh evaluation using the original lead plus the current enrichment facts. The fact provenance and enrichment-run UUID are retained in that evaluation's raw input. Non-economic property facts remain auditable without adding redundant score history.

Buyer criteria are currently stored independently from underwriting. A future matching run may use purchase-price, ARV, repair, size, year-built, occupancy, HOA, financing, and close-speed criteria, but must not alter an existing evaluation without producing a new auditable result.
