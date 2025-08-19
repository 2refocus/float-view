import type { WorkerMessage, WorkerMessageDef } from './types';

export function postMessage(message: WorkerMessage) {
  self.postMessage(message);
}

export function log(message: string) {
  postMessage({ type: 'log', message });
}

export function fatal(message: string) {
  postMessage({ type: 'fatal', message });
  console.error(message);
}

export function rendererInitProgress(pct: number, msg: string) {
  postMessage({ type: 'log', message: `Renderer init progress: ${(pct * 100).toFixed(0)}% - ${msg}` });
}

export function postUpdateMessage(args: WorkerMessageDef['progress']) {
  postMessage({ type: 'progress', ...args });
}
