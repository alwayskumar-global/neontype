/**
 * Thin adapter over `mp4-muxer` 5.2.2 (Req 12.1, 12.2).
 *
 * Isolates the one dependency behind a small internal surface so the MP4
 * exporter never touches the library's types directly: this keeps the format
 * module swappable and the dependency's shape in exactly one place. The adapter
 * muxes WebCodecs `EncodedVideoChunk`/`EncodedAudioChunk` into an in-memory MP4
 * (`ArrayBufferTarget`, Fast Start), returning the finalized bytes.
 */

import { Muxer, ArrayBufferTarget } from "mp4-muxer";

/** Video track config for the MP4 (H.264 only here). */
export interface Mp4VideoConfig {
  width: number;
  height: number;
  frameRate: number;
}

/** Optional AAC audio track config. */
export interface Mp4AudioConfig {
  numberOfChannels: number;
  sampleRate: number;
}

/**
 * A small muxer handle: feed encoded chunks, then `finalize()` for the bytes.
 * `addVideoChunk`/`addAudioChunk` take the WebCodecs chunk plus its
 * encoder-provided metadata (needed for the codec description in the container).
 */
export interface Mp4MuxerHandle {
  addVideoChunk(chunk: EncodedVideoChunk, meta: EncodedVideoChunkMetadata | undefined): void;
  addAudioChunk(chunk: EncodedAudioChunk, meta: EncodedAudioChunkMetadata | undefined): void;
  finalize(): Uint8Array;
}

/**
 * Builds an MP4 muxer for an H.264 video track and an optional AAC audio track.
 * Uses `'in-memory'` Fast Start (metadata at the front for clean playback) and
 * `firstTimestampBehavior: 'offset'` so a non-zero first timestamp is
 * normalised to zero.
 */
export function createMp4Muxer(video: Mp4VideoConfig, audio?: Mp4AudioConfig): Mp4MuxerHandle {
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: video.width, height: video.height, frameRate: video.frameRate },
    audio: audio ? { codec: "aac", numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate } : undefined,
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });

  return {
    addVideoChunk(chunk, meta): void {
      muxer.addVideoChunk(chunk, meta);
    },
    addAudioChunk(chunk, meta): void {
      muxer.addAudioChunk(chunk, meta);
    },
    finalize(): Uint8Array {
      muxer.finalize();
      return new Uint8Array(muxer.target.buffer);
    },
  };
}
