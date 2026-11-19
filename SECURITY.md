# Security policy

Thank you for helping keep **PanelAlpha Single Server Edition** and its users safe.

The panel runs as a project on a PanelAlpha Engine and holds an Engine API token that can create, change and delete every site on that server. A flaw in the panel can reach all of them, so we take security reports seriously and ask you to handle them with care.

## Reporting a vulnerability

**Disclose privately. Do not open a public issue, pull request or discussion for a security problem.** That would expose users before a fix is available.

Report it at **[manage.panelalpha.com/contact](https://manage.panelalpha.com/contact)**.

You get an acknowledgement that your report arrived, and we keep you updated while we investigate and fix it.

### What to include

The more of this you give us, the faster we can reproduce and fix the issue:

- A clear description of the vulnerability and its **impact**: what an attacker could do.
- **Steps to reproduce**, or a proof of concept.
- The **Engine version** (`pae system:version`), the host OS and the edition (Community, Plus or Pro).
- Relevant logs, requests or configuration, with passwords, secrets and tokens removed.

## What counts as a vulnerability

In scope, for example:

- Remote code execution or privilege escalation through the panel.
- Bypassing sign-in, two-factor authentication or a check on what an account may do.
- Getting the panel's Engine token, a Connect AI token or a PanelAlpha Hub pairing secret.
- One account reaching another account's projects, or a site reaching the panel.
- A Connect AI token reaching something the panel says it cannot, such as the panel's own project or server-wide tools.

**Not** a security report:

- **A failed deploy or a site that does not start.** That is a support question: ask on [Discord](https://discord.gg/9twHWR7xGX) or in the [community forum](https://community.panelalpha.com/).
- Something a token or account was allowed to do. A Connect AI token can delete your projects by design. Revoke a token you no longer trust in **Connect AI > MCP URL & tokens**.
- Hardening you left off yourself, for example a panel project you did not protect.
- Reports against a server you do not own or have explicit permission to test.

## Supported versions

Security fixes land on the latest version of the panel. Update by deploying the newest archive into the panel's project.

| Version | Supported |
|---|:---:|
| Latest | yes |
| Older | no, please update |

## Safe harbour

Good-faith security research against **your own panel and server** is welcome. If you follow this policy, disclose privately and give us reasonable time to fix the issue before you go public, we will not pursue action against you, and we are happy to credit valid first reports.

Do not access, change or destroy data that is not yours, and do not test against servers you do not control.

Thank you for reporting responsibly.
