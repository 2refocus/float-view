import { create2dRenderer } from './2d';
import { create3dRenderer } from './3d';
import { rendererInitProgress } from './messaging';
import type { Canvas } from './svg';
import type { RendererOptions } from './types';

export const FONT_FAMILY = 'IosevkaTerm Nerd Font, monospace, Arial, sans-serif';

export async function createRenderer(canvas: Canvas, options: RendererOptions, use3dRenderer: boolean) {
  const renderer = await (use3dRenderer
    ? create3dRenderer(canvas, options, rendererInitProgress)
    : create2dRenderer(canvas, options, rendererInitProgress));

  return renderer;
}
