interface WebmWriter2Options {
  fileWriter: FileSystemWritableFileStream;
  codec: 'VP8' | 'VP9';
  width: number;
  height: number;
  frameRate: number;
}
interface WebmWriter2Instance {
  addFrame(chunk: EncodedVideoChunk): void;
  complete(): Promise<void>;
}

const WebMWriter: {
  new (options: WebmWriter2Options): WebmWriter2Instance;
};

export default WebMWriter;
