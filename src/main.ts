import { Game } from './game/Game'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './types'

async function main(): Promise<void> {
  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement
  if (!canvas) throw new Error('Canvas element not found')

  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT

  const game = new Game(canvas)
  await game.init()
  game.start()
}

main().catch(console.error)
