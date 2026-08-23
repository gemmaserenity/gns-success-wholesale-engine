# Opportunity Scoring

The system should eventually calculate a transparent score from 0 to 100.

Initial conceptual weighting:

- projected assignment economics: 25
- equity confidence: 15
- distress / motivation: 15
- buyer demand: 15
- execution timeline: 10
- property desirability: 10
- contactability: 5
- data confidence: 5

Suggested bands:

90–100: Immediate Priority

80–89: High Priority

70–79: Research / Nurture

Below 70: Archive unless manually overridden

Weights and thresholds must remain configurable.

## Phase 2 buyer-demand model

Initial manual and CSV evaluations may still carry a clearly labeled provisional `buyerDemandScore`. Once the operator runs buyer matching, `buyer-demand-v1` replaces that component in a new immutable evaluation.

A probable buyer must be active, contact-eligible, credible, free of buy-box mismatches, and supported by all property evidence required by that buyer's constrained criteria. A missing property type, occupancy, HOA status, ZIP, timeline, square footage, or year built remains an explicit unknown and produces at most a possible match. The aggregate score weights probable-buyer breadth at 70% and average fit/credibility quality at 30%; zero probable buyers produces zero modeled demand. Criterion weights and the breadth curve are named in the matching engine and covered by tests.
