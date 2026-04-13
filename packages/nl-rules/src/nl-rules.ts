import Anthropic from '@anthropic-ai/sdk'

export type RuleType = 'credit' | 'measure' | 'earnings'

export type ParseResult = {
  parsedDefinition: unknown
  confidence: number
  warnings: string[]
  requiresReview: boolean
}

export type ParseContext = {
  planComponents?: Array<{ id: string; name: string; type: string }>
  positions?: Array<{ id: string; name: string; type: string }>
  transactionFields?: string[]
}

const SCHEMAS: Record<RuleType, string> = {
  credit: `
Credit rule parsed definition schema:
{
  "conditions": [{ "field": string, "operator": "eq|neq|contains|in|gte|lte|matches_regex", "value": string }],
  "actions": [{ "actionType": "assign_to_position|assign_to_participant|split|inherit_to_parent", "targetType": "position_type|position_id|participant_attribute", "targetValue": string, "splitPct": number, "inheritanceDepth": number }],
  "mode": "first_match|all_matches"
}
Examples:
- "Assign all SaaS deals over $50k to the Enterprise overlay" → conditions: [{field:"transaction.payload.product",op:"eq",value:"SaaS"},{field:"transaction.amountCents",op:"gte",value:"5000000"}] actions: [{actionType:"assign_to_position",targetType:"position_type",targetValue:"overlay",splitPct:100}]
- "Split 70/30 between the account owner and their manager" → actions: [{actionType:"split",splitPct:70,...},{actionType:"inherit_to_parent",splitPct:30,inheritanceDepth:1,...}]
`,
  measure: `
Measure definition parsed definition schema:
{
  "aggregationType": "sum|count|average|max|min|weighted_average",
  "filterConditions": [{ "field": string, "operator": string, "value": string }],
  "unitType": "currency|count|percentage"
}
Examples:
- "Sum of all Closed Won revenue in the period" → aggregationType: sum, filterConditions: [{field:"transaction.payload.stage",op:"eq",value:"Closed Won"}], unitType: currency
- "Count of new logo deals" → aggregationType: count, filterConditions: [{field:"transaction.payload.isNewLogo",op:"eq",value:"true"}], unitType: count
`,
  earnings: `
Earnings rule parsed definition schema:
{
  "formulaType": "flat_rate|tiered|accelerated|mbo|draw|guarantee",
  "basisType": "aggregate|per_transaction",
  "formulaConfig": { ... formula-specific ... },
  "cap": { "type": "absolute|multiplier", "value": number } | null
}
Examples:
- "8% commission on all revenue, accelerating to 12% above 100% attainment" → formulaType: accelerated, formulaConfig: { baseRate: 0.08, accelerators: [{ thresholdPct: 100, multiplier: 1.5 }] }
- "Tiered: 5% up to 75% quota, 8% from 75-100%, 12% above 100%" → formulaType: tiered, formulaConfig: { tiers: [{ fromPct:0,toPct:75,rate:0.05},{fromPct:75,toPct:100,rate:0.08},{fromPct:100,toPct:null,rate:0.12}] }
- "Flat $500 bonus per deal" → formulaType: flat_rate, basisType: per_transaction, formulaConfig: { amountCents: 50000 }
`,
}

export async function parseRuleFromText(
  ruleText: string,
  ruleType: RuleType,
  context: ParseContext = {},
): Promise<ParseResult> {
  const client = new Anthropic()

  const contextBlock = context.planComponents?.length
    ? `\nAvailable components: ${context.planComponents.map((c) => `${c.name} (${c.type})`).join(', ')}`
    : ''

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: `You are a sales compensation rules parser. Parse natural language comp rules into structured JSON definitions.

${SCHEMAS[ruleType]}${contextBlock}

Respond ONLY with valid JSON in this exact format:
{
  "parsedDefinition": { ... the parsed rule ... },
  "confidence": 0.0-1.0,
  "warnings": ["any ambiguities or assumptions made"]
}`,
    messages: [{ role: 'user', content: `Parse this ${ruleType} rule: ${ruleText}` }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')
    const result = JSON.parse(jsonMatch[0])
    return {
      parsedDefinition: result.parsedDefinition,
      confidence: result.confidence ?? 0.5,
      warnings: result.warnings ?? [],
      requiresReview: (result.confidence ?? 0.5) < 0.8,
    }
  } catch {
    return {
      parsedDefinition: null,
      confidence: 0,
      warnings: ['Failed to parse rule — please define manually'],
      requiresReview: true,
    }
  }
}
