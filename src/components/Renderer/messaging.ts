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

export function rendererInitProgress(_pct: number, msg: string) {
  postMessage({ type: 'log', message: `Initialising renderer: ${msg}...` });
}

export function postUpdateMessage(args: WorkerMessageDef['progress']) {
  postMessage({ type: 'progress', ...args });
}
