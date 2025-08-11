export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type Canvas = HTMLCanvasElement | OffscreenCanvas;

export class RasterImage {
  private constructor(
    private readonly canvas: Canvas,
    private readonly ctx: Ctx,
    private readonly image: HTMLImageElement,
  ) {}

  public static create(imagePath: string): Promise<RasterImage> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    return new Promise((resolve) => {
      const svgImg = new Image();
      svgImg.src = imagePath;
      svgImg.onload = () => {
        resolve(new RasterImage(canvas, ctx, svgImg));
      };
    });
  }

  bitmap(width: number, height: number): Promise<ImageBitmap> {
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.drawImage(this.image, 0, 0, this.canvas.width, this.canvas.height);
    return createImageBitmap(this.canvas, 0, 0, this.canvas.width, this.canvas.height);
  }
}
