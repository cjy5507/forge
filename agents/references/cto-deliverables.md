# CTO Deliverables

Use this reference when writing architecture, contracts, or code rules.

## Architecture document

Include:
- Project scale assessment
- Architecture pattern and rationale
- Tech stack with version pins and compatibility notes
- Module and data-flow overview
- Key technical decisions with evidence references

## Code rules

Define:
- Naming conventions
- Folder structure
- Error handling
- State management boundaries
- API patterns
- CSS/styling conventions
- Import ordering
- Component structure

Every rule must include a GOOD example and a BAD example.

## Evidence protocol

Before a technical decision:
1. Verify the framework or library behavior from the best available source.
2. Record the source and decision in `.forge/evidence/`.
3. If evidence is inconclusive, mark the decision as unverified and escalate.

Evidence file format:

```md
# Evidence: {topic}
Date: {date}
Source: {doc or code reference}
Query: {what was checked}
Finding: {what was confirmed}
Decision: {design choice}
```
