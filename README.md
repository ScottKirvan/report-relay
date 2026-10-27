# report-relay [![starline](https://raw.githubusercontent.com/ScottKirvan/report-relay/refs/heads/starlines/ScottKirvan/report-relay/starline.svg)](https://github.com/qoomon/starlines)
<div align="center">

  <img src="assets/media/logo.jpg" alt="logo" width="200" height="auto" />
    <h1><a href="https://github.com/ScottKirvan/report-relay">ScottKirvan/report-relay</a></h1>
  <h3>In-app problem reports, filed as GitHub issues.</h3>
  
  
<!-- Badges -->
<p>
  <a href="https://github.com/ScottKirvan/report-relay/graphs/contributors">
    <img src="https://img.shields.io/github/contributors/ScottKirvan/report-relay" alt="contributors" />
  </a>
  <a href="">
    <img src="https://img.shields.io/github/last-commit/ScottKirvan/report-relay" alt="last update" />
  </a>
  <a href="https://github.com/ScottKirvan/report-relay/network/members">
    <img src="https://img.shields.io/github/forks/ScottKirvan/report-relay" alt="forks" />
  </a>
  <a href="https://github.com/ScottKirvan/report-relay/stargazers">
    <img src="https://img.shields.io/github/stars/ScottKirvan/report-relay" alt="stars" />
  </a>
  <a href="https://github.com/ScottKirvan/report-relay/issues/">
    <img src="https://img.shields.io/github/issues/ScottKirvan/report-relay" alt="open issues" />
  </a>
  <a href="https://github.com/ScottKirvan/report-relay/blob/main/LICENSE.md">
    <img src="https://img.shields.io/github/license/ScottKirvan/report-relay.svg" alt="license" />
  </a>
  <a href="https://discord.gg/TN6XJSNK5Y">
    <!--<img src="https://img.shields.io/discord/704680098577514527?style=flat-square&label=%F0%9F%92%AC%20discord&color=00ACD7">-->
    <img src="https://img.shields.io/discord/1052011377415438346?style=flat-square&label=discord&color=00ACD7">
  </a>
</p>
   
<h4>
    <a href="https://tinyurl.com/3vf7whyd">View Demo</a>
  <span> · </span>
    <a href="https://github.com/ScottKirvan/report-relay/blob/main/README.md">Documentation</a>
  <span> · </span>
    <a href="https://github.com/ScottKirvan/report-relay/issues/new?template=bug_report.md">Report Bug</a>
  <span> · </span>
    <a href="https://github.com/ScottKirvan/report-relay/issues/new?template=feature_request.md">Request Feature</a>
  </h4>
</div>

**report-relay** is a [Cloudflare Worker](https://developers.cloudflare.com/workers/) that receives problem reports from the in-app report forms in Scott Kirvan's apps (starting with [BojuBot](https://github.com/ScottKirvan/BojuBot)) and files them as public GitHub issues on the right repo. People can report a problem without a GitHub account, and no credentials ship inside the apps.

> **Status:** version 1, not deployed yet. No email.

## Repo Layout

```
report-relay/
├── .github/
│   ├── gitignore-templates/    # Ready-to-use .gitignore files (Unreal, Unity, Python, Node, C++)
│   ├── release-please/         # Release-Please configuration and version manifest
│   └── workflows/              # GitHub Actions workflows (see Key Features above)
├── assets/
│   └── media/                  # Images and logos
├── docs/                       # VitePress documentation site
├── notes/                      # CHANGELOG, VERSION, TODO; developer docs in notes/dev/
├── CLAUDE.md                   # AI agent context (optional)
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── LICENSE.md
└── README.md
```

> **Note:** Issue templates, PR templates, and funding config live in the org-level [`ScottKirvan/.github`](https://github.com/ScottKirvan/.github) repo and apply here automatically via GitHub's community health file fallback.

How it works
------------
1. An app's report form posts the report (app, type, title, body) to the relay.
2. The relay checks it, looks up which repo that app reports to, and files a public issue there through a GitHub App, labelled `user-report`.
3. The app gets the issue link back and shows it to the person who reported.

Nothing about the report is stored by the relay. If the relay is switched off or can't be reached, the apps fall back to opening a pre-filled GitHub issue or copying the report.

Contributions / Contact
-----------------------
- Please [file an issue](https://github.com/ScottKirvan/report-relay/issues/new), or [grab a fork](https://github.com/ScottKirvan/report-relay/fork), hack away, and submit a [pull request](https://github.com/ScottKirvan/report-relay/pulls).
- Contact me at [linkedin.com/in/scottkirvan/](https://www.linkedin.com/in/scottkirvan/)
- You can also contact me at my [discord](https://discord.gg/TN6XJSNK5Y) server, I'm cptvideo.

Credits
-------
**[report-relay](https://github.com/ScottKirvan/report-relay)** — Copyright (c) 2025 [Scott Kirvan](https://github.com/ScottKirvan). [MIT License](LICENSE.md).

Project Link:  [report-relay](https://github.com/ScottKirvan/report-relay)  
[CHANGELOG](notes/CHANGELOG.md)  
[TODO](notes/TODO.md)
