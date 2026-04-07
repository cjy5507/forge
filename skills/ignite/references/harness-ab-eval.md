# Harness A/B Evaluation

Use this reference when validating whether Forge improves outcomes.

## Comparison setup

Run the same task twice:
- `with harness`: Forge phases, guards, and team roles active
- `without harness`: plain agent workflow or baseline prompt

Keep the task, repo state, and success criteria identical.

## Minimum metrics

- Completion rate
- First-pass success rate
- Retry count
- Tests passed
- Number of regressions
- Output consistency
- User correction effort

## Suggested task mix

- Simple change
- Multi-file feature
- Bug diagnosis
- Regression fix
- Delivery/documentation task

## Evaluation output

Write findings to an A/B report and include:
- task description
- baseline output summary
- harness output summary
- metric comparison
- qualitative notes
- recommendation
