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

## Phase 2 buyer database boundary

The buyer database now stores explicit buy boxes and observed buyer performance, but it does not yet feed this score. `buyerDemandScore` remains a provisional operator input until the next milestone can calculate explainable criteria matches and a probable buyer count from active, contact-eligible buyers. No profile count alone should be treated as demand.
