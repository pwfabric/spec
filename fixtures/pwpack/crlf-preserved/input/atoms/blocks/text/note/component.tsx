import * as React from 'react'

export const Note = ({ props }: { props: { text?: string } }) => <span>{props.text ?? ''}</span>
