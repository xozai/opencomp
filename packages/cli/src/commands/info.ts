import { Command } from 'commander'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export function infoCommand(): Command {
  const cmd = new Command('info')
  cmd
    .description('Print information about the current OpenComp workspace')
    .action(() => {
      try {
        const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
        console.log(`\nOpenComp Workspace`)
        console.log(`  Name:    ${pkg.name ?? 'unknown'}`)
        console.log(`  Version: ${pkg.version ?? 'unknown'}`)
        console.log(`  Node:    ${process.version}`)
        console.log(`  Platform: ${process.platform}`)
      } catch {
        console.log('Could not read package.json — are you in the workspace root?')
      }
    })

  return cmd
}
