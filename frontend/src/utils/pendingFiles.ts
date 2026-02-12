/* 跨页面传递上传文件的临时存储（navigate 无法序列化 File 对象） */

let _pending: File[] = []

export function setPendingFiles(files: File[]) {
  _pending = files
}

export function takePendingFiles(): File[] {
  const files = _pending
  _pending = []
  return files
}
