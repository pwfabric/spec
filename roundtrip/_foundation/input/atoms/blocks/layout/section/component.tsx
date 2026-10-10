import * as React from 'react'

export interface SectionProps {
  gap?: number
  textAlign?: 'left' | 'center' | 'right'
}

export const SectionBlock = ({ props, children, block }: { props: SectionProps; children?: React.ReactNode; block: { id: string } }) => (
  <section id={block.id} data-block-id={block.id} data-block-type="section" style={{ width: '100%', boxSizing: 'border-box', paddingBlock: 'var(--pw-space-section-y)', textAlign: props.textAlign ?? 'left' }}>
    <div style={{ maxWidth: 'var(--pw-layout-container-max-width)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: `${props.gap ?? 16}px` }}>{children}</div>
  </section>
)
