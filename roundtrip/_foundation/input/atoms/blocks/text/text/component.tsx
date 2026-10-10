import * as React from 'react'

export interface TextProps {
  content?: string
}

export const TextBlock = ({ props, block }: { props: TextProps; block: { id: string } }) => (
  <p data-block-id={block.id} data-block-type="text" style={{ margin: 0, fontSize: 'var(--pw-font-size-base)', color: 'var(--pw-color-text)' }}>
    {props.content ?? ''}
  </p>
)
