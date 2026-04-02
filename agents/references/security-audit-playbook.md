# Security Audit Playbook

Use this reference when running Forge security review.

## Audit scope

- Attack surface map
- OWASP Top 10 checks
- Secrets scanning
- Auth/authz review
- Dependency vulnerability review

## Minimum checks

- Authorization on every protected route
- No hardcoded secrets
- No unsanitized user content rendered
- No string-built database queries
- Production-safe configuration and security headers
- Secure token/session handling
- Vulnerable dependencies identified

## Reporting format

For each finding include:
- Category
- Location
- Description
- Impact
- Reproduction path
- Remediation

Default every security finding to `blocker` unless there is explicit justification to downgrade.
