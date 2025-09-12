import { h } from 'preact'

export type CustomButton = { label: string; seconds: number }

export function CustomButtons(props: {
  buttons: CustomButton[]
  isCompactLayout: boolean | null
  isEditMode: boolean
  onClick: (displayIndex: number) => void
  setButtonRef?: (index: number, el: HTMLElement | null) => void
  titleFor: (btn: CustomButton, isEditMode: boolean) => string
}) {
  const { buttons, isCompactLayout, isEditMode, onClick, setButtonRef, titleFor } = props

  return (
    <div 
      class={`custom-buttons ${isCompactLayout === true ? 'compact' : 'row'}`} 
      data-layout={isCompactLayout === true ? 'grid' : 'row'}
      style={{ 
        marginTop: '8px',
        visibility: isCompactLayout === null ? 'hidden' : 'visible',
        '--cols': Math.min(buttons.length, 6).toString()
      } as any}
    >
      {buttons.map((button, displayIndex) => (
        <div 
          key={displayIndex} 
          class="custom-button" 
          style={{ position: 'relative' }}
          onClick={() => onClick(displayIndex)}
          onMouseDown={(e: any) => e.stopPropagation()}
          title={titleFor(button, isEditMode)}
        >
          <div
            ref={el => setButtonRef && setButtonRef(displayIndex, el)}
            style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}
          >
            {button.label}
          </div>
        </div>
      ))}
    </div>
  )
}

