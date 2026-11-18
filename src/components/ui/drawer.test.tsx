import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from './drawer'

// vaul's iOS scroll lock calls window.scrollTo(0, 0) when it turns on and scrolls back to the
// saved position when it turns off, and it turns off for every press inside the sheet. On iOS a
// page scroll between touchstart and touchend cancels the tap, so buttons in a drawer opened
// on a scrolled page didn't respond. These tests pretend to be an iPhone to cover that path.
describe('Drawer on iOS', () => {
  let scrollTo: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('iPhone')
    scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 600 })
    Object.defineProperty(window, 'pageYOffset', { configurable: true, value: 600 })
    Element.prototype.setPointerCapture ??= () => {}
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // Opened through the trigger, like «Почати тренування»: vaul only locks scrolling for drawers
  // its own Radix onOpenChange opened, not for ones opened by flipping the `open` prop.
  function OpenDrawer({ onClick }: { onClick: () => void }) {
    return (
      <Drawer>
        <DrawerTrigger>Open</DrawerTrigger>
        <DrawerContent>
          <DrawerTitle>Title</DrawerTitle>
          <DrawerDescription>Description</DrawerDescription>
          <button type="button" onClick={onClick}>
            Action
          </button>
        </DrawerContent>
      </Drawer>
    )
  }

  function open(onClick: () => void = () => {}) {
    render(<OpenDrawer onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    return screen.getByRole('button', { name: 'Action' })
  }

  it('does not scroll the page when it opens', () => {
    open()
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('does not scroll the page while a button inside is pressed', () => {
    const onClick = vi.fn()
    const button = open(onClick)
    scrollTo.mockClear()

    act(() => {
      fireEvent.pointerDown(button, { pointerId: 1, pageY: 700 })
    })
    act(() => {
      fireEvent.pointerUp(button, { pointerId: 1, pageY: 700 })
    })
    fireEvent.click(button)

    expect(scrollTo).not.toHaveBeenCalled()
    expect(onClick).toHaveBeenCalledOnce()
  })
})
