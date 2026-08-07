import { Game } from './game/Game'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './types'

async function main(): Promise<void> {
  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement
  if (!canvas) throw new Error('Canvas element #gameCanvas not found')

  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT

  const game = new Game(canvas)
  await game.init()
  game.start()

  // Release resources when the tab is hidden or the page is unloaded so the
  // AudioContext and GPU bitmaps don't linger after the user navigates away.
  window.addEventListener('pagehide', () => game.destroy(), { once: true })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') game.destroy()
  }, { once: true })
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

main().catch(err => {
  console.error('Hat Trick failed to start:', err)
  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement | null
  const ctx = canvas?.getContext('2d')
  if (ctx && canvas) {
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#cc3333'
    ctx.font = 'bold 18px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Failed to start — check console', canvas.width / 2, canvas.height / 2)
  }
})
