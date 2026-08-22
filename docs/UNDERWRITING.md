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
