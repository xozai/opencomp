import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

export default defineConfig({
  integrations: [
    starlight({
      title: 'OpenComp',
      description: 'Open-source sales compensation administration platform',
      logo: {
        light: './src/assets/logo-light.svg',
        dark: './src/assets/logo-dark.svg',
        replacesTitle: false,
      },
      social: {
        github: 'https://github.com/xozai/opencomp',
      },
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Introduction', slug: 'intro/introduction' },
            { label: 'Quick Start', slug: 'intro/quick-start' },
            { label: 'Architecture', slug: 'intro/architecture' },
          ],
        },
        {
          label: 'Concepts',
          items: [
            { label: 'Plans & Components', slug: 'concepts/plans' },
            { label: 'Quota & Attainment', slug: 'concepts/quotas' },
            { label: 'Goal Sheets', slug: 'concepts/goal-sheets' },
            { label: 'Transactions & Credits', slug: 'concepts/transactions' },
            { label: 'Calculations & Payouts', slug: 'concepts/calculations' },
            { label: 'Disputes & Approvals', slug: 'concepts/disputes' },
          ],
        },
        {
          label: 'API Reference',
          autogenerate: { directory: 'api' },
        },
        {
          label: 'Plugin Development',
          items: [
            { label: 'Overview', slug: 'plugins/overview' },
            { label: 'Formula Extension', slug: 'plugins/formula' },
            { label: 'Dispute Router', slug: 'plugins/dispute-router' },
            { label: 'Payroll Export', slug: 'plugins/payroll-export' },
            { label: 'Transaction Adapter', slug: 'plugins/transaction-adapter' },
          ],
        },
        {
          label: 'Deployment',
          items: [
            { label: 'Environment Variables', slug: 'deployment/env-vars' },
            { label: 'Docker Compose', slug: 'deployment/docker' },
            { label: 'Production Checklist', slug: 'deployment/production' },
          ],
        },
        {
          label: 'Contributing',
          items: [
            { label: 'Development Setup', slug: 'contributing/setup' },
            { label: 'RFC Process', slug: 'contributing/rfc' },
            { label: 'Release Policy', slug: 'contributing/releases' },
          ],
        },
      ],
      customCss: ['./src/styles/custom.css'],
    }),
  ],
})
