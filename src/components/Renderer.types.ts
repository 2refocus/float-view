import type { RowWithIndex } from '../lib/parse/types';

/*
 * Incoming commands
 */

export type WorkerCommandDef = {
  image: {
    name: string;
    image: ImageBitmap;
  };
  draw: {
    canvas: OffscreenCanvas;
    showRemoteTilt: boolean;
    data: RowWithIndex;
  };
  file: {
    inputFile: File;
    startingIndex: number;
    endingIndex: number;
    gapThresholdSecs: number;
    fps: number;
  };
  start: {
    directoryHandle: FileSystemDirectoryHandle;
    filename: string;
    canvas: OffscreenCanvas;
    interpolate: boolean;
    showRemoteTilt: boolean;
    fps: number;
    width: number;
    height: number;
  };
  update: {};
  stop: {};
};

export type WorkerCommand = {
  [K in keyof WorkerCommandDef]: { type: K } & WorkerCommandDef[K];
}[keyof WorkerCommandDef];

/*
 * Outgoing messages
 */

export type WorkerMessageDef = {
  complete: {
    totalMilliseconds: number;
  };
  progress: {
    totalFramesToGenerate: number;
    totalFramesGenerated: number;
  };
  log: {
    message: string;
  };
  fatal: {
    message: string;
  };
};

export type WorkerMessage = {
  [K in keyof WorkerMessageDef]: { type: K } & WorkerMessageDef[K];
}[keyof WorkerMessageDef];

/*
 * Worker definition
 */

interface TypedWorkerCreator<C, M> {
  postMessage(message: C, transfer?: Transferable[]): void;

  addEventListener(
    type: 'message',
    listener: (this: Worker, ev: MessageEvent<M>) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;

  removeEventListener(
    type: 'message',
    listener: (this: Worker, ev: MessageEvent<M>) => any,
    options?: boolean | EventListenerOptions,
  ): void;

  terminate(): void;

  onmessage: ((this: Worker, ev: MessageEvent<M>) => any) | null;
}

export interface TypedWorker<C, M> extends TypedWorkerCreator<C, M>, Omit<Worker, keyof TypedWorkerCreator<C, M>> {}
