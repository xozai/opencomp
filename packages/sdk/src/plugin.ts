/**
 * OpenComp Plugin SDK
 *
 * Plugins register themselves at startup via `registerPlugin()`.
 * They may only depend on @opencomp/sdk and @opencomp/contracts.
 */

import type { FormulaExtension } from './extension-points'

export interface PluginManifest {
  /** Unique plugin identifier, e.g. "@myorg/my-plugin" */
  name: string
  version: string
  /** Semver range of OpenComp SDK versions this plugin supports */
  compatibleWith: string
  description?: string
  author?: string
}

export interface PluginExtensions {
  /** Custom formula implementations */
  formulas?: FormulaExtension[]
  // Future extension points will be added here:
  // creditingStrategies?: CreditingStrategyExtension[]
  // payrollExports?: PayrollExportExtension[]
  // disputeRouters?: DisputeRouterExtension[]
  // transactionAdapters?: TransactionAdapterExtension[]
}

export interface Plugin {
  manifest: PluginManifest
  extensions: PluginExtensions
  /** Optional lifecycle hook called after registration */
  onRegister?: () => void | Promise<void>
}

// ─── Registry ─────────────────────────────────────────────────────────────────

class PluginRegistry {
  private plugins: Plugin[] = []

  async register(plugin: Plugin): Promise<void> {
    const existing = this.plugins.find((p) => p.manifest.name === plugin.manifest.name)
    if (existing) {
      throw new Error(`Plugin '${plugin.manifest.name}' is already registered`)
    }

    this.plugins.push(plugin)

    if (plugin.onRegister) {
      await plugin.onRegister()
    }

    console.log(`[plugins] Registered: ${plugin.manifest.name}@${plugin.manifest.version}`)
  }

  list(): Plugin[] {
    return [...this.plugins]
  }

  getFormulas(): FormulaExtension[] {
    return this.plugins.flatMap((p) => p.extensions.formulas ?? [])
  }
}

export const pluginRegistry = new PluginRegistry()

/** Convenience wrapper for registering a plugin */
export async function registerPlugin(plugin: Plugin): Promise<void> {
  return pluginRegistry.register(plugin)
}
