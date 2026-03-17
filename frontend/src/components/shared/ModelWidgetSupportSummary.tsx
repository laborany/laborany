import type { ModelProfile } from '../../contexts/ModelProfileContext'
import {
  getConverseWidgetSupportDisplay,
  getExecuteWidgetSupportDisplay,
  getProfileWidgetSupportDescription,
  type WidgetSupportTone,
} from '../../lib/widgetSupport'

interface ModelWidgetSupportSummaryProps {
  profile: ModelProfile
  compact?: boolean
  showDescription?: boolean
  labelMode?: 'full' | 'short'
  className?: string
}

function toneClassName(tone: WidgetSupportTone): string {
  if (tone === 'success') {
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
  }
  if (tone === 'warning') {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
  }
  return 'bg-secondary text-secondary-foreground'
}

export function ModelWidgetSupportSummary({
  profile,
  compact = false,
  showDescription = false,
  labelMode = 'full',
  className = '',
}: ModelWidgetSupportSummaryProps) {
  const converse = getConverseWidgetSupportDisplay(profile)
  const execute = getExecuteWidgetSupportDisplay(profile)
  const description = getProfileWidgetSupportDescription(profile)
  const converseLabel = labelMode === 'short' ? converse.shortLabel : converse.label
  const executeLabel = labelMode === 'short' ? execute.shortLabel : execute.label

  return (
    <div className={`${compact ? 'space-y-1.5' : 'space-y-2'} ${className}`.trim()}>
      <div className="flex flex-wrap gap-1.5">
        <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ${toneClassName(converse.tone)}`}>
          {converseLabel}
        </span>
        <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ${toneClassName(execute.tone)}`}>
          {executeLabel}
        </span>
      </div>
      {showDescription && (
        <p className={`text-xs text-muted-foreground ${compact ? '' : 'leading-5'}`}>
          {description}
        </p>
      )}
    </div>
  )
}
