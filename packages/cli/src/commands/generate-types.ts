import { Command } from 'commander'

export function generateTypesCommand(): Command {
  const cmd = new Command('generate')
  cmd
    .description('Generate TypeScript types from the database schema')
    .option('--out <path>', 'Output file path', './src/generated/schema.types.ts')
    .action((options: { out: string }) => {
      console.log(`[opencomp generate] Writing types to ${options.out}`)
      console.log('Tip: run `pnpm --filter @opencomp/api db:studio` to inspect your schema visually.')
      console.log('Type generation from live DB is a future feature.')
    })

  return cmd
}
