# Security policy

Concord runs as a live service for a real community, so security reports are welcome and taken seriously.

## Reporting a vulnerability

Please report privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability** ([private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)). Don't open a public issue, pull request or discussion for a security problem.

A useful report says what is affected, how to reproduce it, and what an attacker could gain. You should get an answer within a week. Concord is run by one person, so fixes are made as fast as that allows.

## Scope

- **In scope**: the code in this repository, and the deployment at `concord.jaalip.com` as far as Concord's own code and configuration are concerned: the web client under `/app`, Concord's layer under `/app/api/v1/`, and the files in `deploy/`.
- **Upstream**: problems in Stoat, LiveKit or another dependency belong with that project. Tell us too if they affect Concord.

## Testing rules

- Test against a local stack ([docs/dev-environment.md](docs/dev-environment.md)) wherever you can.
- On `concord.jaalip.com`, use only your own accounts. Never read, change or delete other people's data, and stop as soon as you reach anything that isn't yours.
- No denial of service, spam, social engineering or physical attacks.

Reports that follow these rules are welcome, and you will be credited if you want to be.
