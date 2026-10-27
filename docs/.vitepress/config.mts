import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "report-relay",
  description: "TODO - Replace with your project description.",
  base: '/report-relay/',
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'GitHub', link: 'https://github.com/ScottKirvan/report-relay' }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/ScottKirvan/report-relay' },
      { icon: 'discord', link: 'https://discord.gg/TN6XJSNK5Y' }
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © Scott Kirvan'
    }
  }
})
