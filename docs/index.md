---
layout: home

hero:
  name: "report-relay"
  text: "In-app problem reports, filed as GitHub issues"
  tagline: People report a problem from inside the app. It lands on the right GitHub repo, with no GitHub account needed.
  actions:
    - theme: brand
      text: View on GitHub
      link: https://github.com/ScottKirvan/report-relay
    - theme: alt
      text: Discord
      link: https://discord.gg/TN6XJSNK5Y

features:
  - icon: 📮
    title: No account needed
    details: Apps send reports to one endpoint. The relay files them as public GitHub issues that anyone can read.

  - icon: 🔐
    title: No credentials in the apps
    details: Issues are filed through a GitHub App installed only on the app repos. Its key lives in the Worker's secrets.

  - icon: 🧹
    title: Keeps nothing
    details: No report content or IP addresses are stored or logged. A kill switch turns filing off while the apps fall back to their own GitHub link.
---

<!-- Begin Sponsors -->

<div align="center" style="margin-top: 3rem; margin-bottom: 2rem;">
<h2>Sponsors</h2>
 <a href="https://www.sabelhawk.com/" target="_blank">
    <img src="/sabelhawk_dark.png" alt="Sabelhawk Studios" width="300" class="sponsor-logo dark-only" />
    <img src="/sabelhawk_lite.png" alt="Sabelhawk Studios" width="300" class="sponsor-logo light-only" />
  </a>
  <h3>Please support open source software:</h3>
  <div style="display: flex; gap: 12px; justify-content: center; align-items: center; flex-wrap: wrap;">
  <a href="https://ko-fi.com/ScottKirvan" target="_blank">
    <img src="https://storage.ko-fi.com/cdn/kofi2.png?v=3" alt="Support on Ko-fi"  width="160"  />
  </a> &nbsp; &nbsp;
  <a href="https://github.com/sponsors/ScottKirvan" target="_blank">
    <img src="https://img.shields.io/badge/Sponsor-GitHub-ea4aaa?style=for-the-badge&logo=github" height="36" />
  </a>
  </div>
  <br>
Thank you! Your help makes a real and direct difference.
</div>

<!-- End Sponsors -->
