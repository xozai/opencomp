#!/usr/bin/env node
/**
 * OpenComp CLI
 * Usage: opencomp <command> [options]
 */
import { Command } from 'commander'
import { scaffoldCommand } from './commands/scaffold'
import { generateTypesCommand } from './commands/generate-types'
import { infoCommand } from './commands/info'

const program = new Command()

program
  .name('opencomp')
  .description('OpenComp CLI — scaffold plugins, generate types, and run admin commands')
  .version('0.1.0')

program.addCommand(scaffoldCommand())
program.addCommand(generateTypesCommand())
program.addCommand(infoCommand())

program.parse(process.argv)
