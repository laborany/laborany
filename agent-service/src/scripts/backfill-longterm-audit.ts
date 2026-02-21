import { memoryConsolidator } from '../memory/consolidator.js'

function parseDryRun(argv: string[]): boolean {
  return argv.includes('--dry-run') || argv.includes('--dryRun')
}

function main(): void {
  const dryRun = parseDryRun(process.argv.slice(2))
  const result = memoryConsolidator.backfillLongTermAuditFromTraces({ dryRun })
  console.log(JSON.stringify({ success: true, dryRun, ...result }, null, 2))
}

main()
