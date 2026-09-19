# Security Policy

## Supported code

AllGo is currently under active development. Security fixes should target the latest code on `main`.

Older development snapshots and unmerged feature branches are not treated as independently supported releases.

## Reporting a vulnerability

Please do **not** open a public GitHub issue for an exploitable vulnerability.

Use GitHub's private vulnerability-reporting or Security Advisory flow for this repository when available. If that option is unavailable, contact the repository maintainer privately through GitHub before sharing technical exploit details publicly.

Include enough information to reproduce and assess the issue:

- affected component and route or feature;
- impact;
- reproduction steps;
- proof of concept where appropriate;
- affected commit or version;
- suggested mitigation, if known.

Do not include real customer data, production credentials, live OTPs, API keys, or access tokens in a report.

## High-priority classes

Examples of issues that should be reported privately include:

- authentication or authorization bypass;
- account takeover;
- OTP, token, or session vulnerabilities;
- insecure direct object references;
- injection vulnerabilities;
- secret or credential exposure;
- payment or subscription authorization flaws;
- privilege escalation;
- unsafe admin access;
- sensitive location or personal-data exposure;
- cross-user trip access;
- distributed race conditions that break security boundaries.

## Disclosure

Please allow reasonable time for investigation and remediation before public disclosure.

Once a fix is available, the maintainer may publish an advisory describing the issue, affected versions, remediation, and any required operational steps.
