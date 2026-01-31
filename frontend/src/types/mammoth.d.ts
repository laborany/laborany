/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                       mammoth.js 类型声明                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

declare module 'mammoth' {
  export interface Message {
    type: 'warning' | 'error'
    message: string
  }

  export interface ConversionResult {
    value: string
    messages: Message[]
  }

  export interface Image {
    read(encoding: 'base64' | 'buffer'): Promise<string | Buffer>
    contentType: string
  }

  export interface ImageElement {
    src: string
    alt?: string
  }

  export interface ConversionOptions {
    styleMap?: string[]
    convertImage?: {
      (image: Image): Promise<ImageElement>
    }
  }

  export interface Input {
    arrayBuffer?: ArrayBuffer
    buffer?: Buffer
    path?: string
  }

  export function convertToHtml(
    input: Input,
    options?: ConversionOptions
  ): Promise<ConversionResult>

  export function extractRawText(input: Input): Promise<ConversionResult>

  export const images: {
    imgElement(
      converter: (image: Image) => Promise<ImageElement>
    ): (image: Image) => Promise<ImageElement>
    dataUri(image: Image): Promise<ImageElement>
  }
}
