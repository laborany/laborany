declare module 'tar-stream' {
  import type { Readable, Writable } from 'stream'

  export interface Headers {
    name?: string
    type?: string
    [key: string]: unknown
  }

  export interface Extract extends Writable {
    on(event: 'entry', listener: (header: Headers, stream: Readable, next: () => void) => void): this
    on(event: 'finish', listener: () => void): this
    on(event: 'error', listener: (error: Error) => void): this
  }

  export function extract(): Extract
}
