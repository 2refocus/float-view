/**
 * @param {OffscreenCanvas} canvas
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} data
 */
function draw(canvas, ctx, data) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'black';
  ctx.font = '20px Arial';
  ctx.fillText(`Speed: ${data['Speed(km/h)']} km/h`, 10, 50);
}

self.draw = draw;
