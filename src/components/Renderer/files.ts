import WebMWriter from '../../lib/webm-writer2.js';

export class VideoFileWriter {
  private webmWriter: InstanceType<typeof WebMWriter>;
  private fileWritableStream: FileSystemWritableFileStream;
  private isClosed = false;
  public readonly name: string;

  constructor(
    fileWritableStream: FileSystemWritableFileStream,
    name: string,
    canvas: OffscreenCanvas,
    frameRate: number,
  ) {
    this.fileWritableStream = fileWritableStream;
    this.name = name;
    this.webmWriter = new WebMWriter({
      fileWriter: fileWritableStream,
      codec: 'VP8',
      width: canvas.width,
      height: canvas.height,
      frameRate,
    });
  }

  addFrame(chunk: EncodedVideoChunk): void {
    this.webmWriter.addFrame(chunk);
  }

  async close(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;
    await this.webmWriter.complete();
    await this.fileWritableStream.close();
  }
}

export class VideoFileManager {
  constructor(private directoryHandle: FileSystemDirectoryHandle) {}

  async createWriter(canvas: OffscreenCanvas, baseName: string, frameRate: number): Promise<VideoFileWriter> {
    const name = `${baseName}.webm`;
    const fileHandle = await this.directoryHandle.getFileHandle(name, { create: true });
    const fileWritableStream = await fileHandle.createWritable();

    return new VideoFileWriter(fileWritableStream, name, canvas, frameRate);
  }
}
