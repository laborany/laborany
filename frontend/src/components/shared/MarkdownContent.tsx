import {
  isValidElement,
  useCallback,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from 'react'
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { openUrlExternal } from '../../lib/system-open'

function getCodeText(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children)
  }
  if (Array.isArray(children)) {
    return children.map(getCodeText).join('')
  }
  if (isValidElement<{ children?: ReactNode }>(children)) {
    return getCodeText(children.props.children)
  }
  return ''
}

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ')
}

function MarkdownLinkRenderer({
  node: _node,
  href,
  children,
  className,
  onClick,
  ...props
}: ComponentProps<'a'> & ExtraProps) {
  const handleClick = useCallback(
    async (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event)
      if (event.defaultPrevented) return
      if (!href) return
      if (href.startsWith('http://') || href.startsWith('https://')) {
        event.preventDefault()
        try {
          await openUrlExternal(href)
        } catch (error) {
          console.error('[MarkdownContent] Failed to open external link:', error)
          window.open(href, '_blank', 'noopener,noreferrer')
        }
      }
    },
    [href, onClick],
  )

  return (
    <a
      href={href}
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      onClick={handleClick}
      className={joinClassNames(
        'text-primary underline underline-offset-2 transition-colors hover:text-primary/80',
        className,
      )}
      {...props}
    >
      {children}
    </a>
  )
}

const markdownComponents: Components = {
  code({ node: _node, className, children, ...props }) {
    const codeText = getCodeText(children)
    const isBlock = Boolean(className) || codeText.includes('\n')

    return isBlock ? (
      <code
        className={joinClassNames(className, 'text-sm text-gray-100')}
        {...props}
      >
        {children}
      </code>
    ) : (
      <code className={joinClassNames('rounded bg-muted px-1 py-0.5 text-sm', className)} {...props}>
        {children}
      </code>
    )
  },
  pre({ node: _node, className, children, ...props }) {
    return (
      <pre
        className={joinClassNames(
          'my-4 overflow-x-auto rounded-lg bg-gray-900 p-3 text-sm text-gray-100',
          className,
        )}
        {...props}
      >
        {children}
      </pre>
    )
  },
  a: MarkdownLinkRenderer,
  table({ children }) {
    return (
      <div className="my-4 overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border text-sm">
          {children}
        </table>
      </div>
    )
  },
  thead({ children }) {
    return <thead className="bg-muted/50">{children}</thead>
  },
  th({ children }) {
    return (
      <th className="px-3 py-2 text-left text-xs font-semibold text-foreground">
        {children}
      </th>
    )
  },
  td({ children }) {
    return (
      <td className="px-3 py-2 text-foreground/90">
        {children}
      </td>
    )
  },
  tr({ children }) {
    return <tr className="border-b border-border/50 last:border-0">{children}</tr>
  },
}

export function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {content}
    </ReactMarkdown>
  )
}
