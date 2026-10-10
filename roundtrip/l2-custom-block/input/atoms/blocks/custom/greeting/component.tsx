import * as React from 'react'

export interface GreetingProps {
  name?: string
  emphasis?: boolean
}

export const GreetingBlock = ({ props, block }: { props: GreetingProps; block: { id: string } }) => (
  <p data-block-id={block.id} data-block-type="greeting" style={{ margin: 0, fontWeight: props.emphasis ? 600 : 400, color: 'var(--pw-color-primary)' }}>
    Hello, {props.name ?? 'there'}!
  </p>
)
