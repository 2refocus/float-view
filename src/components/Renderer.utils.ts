export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type Canvas = HTMLCanvasElement | OffscreenCanvas;

export class SvgImage {
  private constructor(
    private readonly canvas: Canvas,
    private readonly ctx: Ctx,
    private readonly image: HTMLImageElement,
  ) {}

  public static create(svgXml: string): Promise<SvgImage> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    return new Promise((resolve) => {
      const blob = new Blob([svgXml], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);

      const svgImg = new Image();
      svgImg.src = url;
      svgImg.onload = () => {
        resolve(new SvgImage(canvas, ctx, svgImg));
        URL.revokeObjectURL(url);
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
