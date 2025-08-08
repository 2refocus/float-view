import { RowKey, type RowWithIndex } from '../lib/parse/types';

export function draw(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  data: RowWithIndex,
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'black';
  ctx.font = '20px Arial';
  ctx.fillText(`Speed: ${data[RowKey.Speed]} km/h`, 10, 50);
}
