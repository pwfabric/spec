import * as React from 'react'

export interface RepeaterProps {
  emptyText?: string
  gap?: number
}

/**
 * Lays out its children. The receipt writes a block-level `"repeat": "{{source}}"`
 * and one child template; the runtime clones the template once per item, with
 * {{item.<field>}} resolved, before this component runs. It draws no items itself.
 */
export const RepeaterBlock = ({ props, block, children }: { props: RepeaterProps; block: { id: string }; children?: React.ReactNode }) => {
  if (React.Children.count(children) === 0) return <p data-block-id={block.id} data-block-type="repeater">{props.emptyText ?? ''}</p>
  return (
    <div data-block-id={block.id} data-block-type="repeater" style={{ display: 'flex', flexDirection: 'column', gap: `${props.gap ?? 12}px` }}>
      {children}
    </div>
  )
}
