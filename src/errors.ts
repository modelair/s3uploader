/** Base error thrown by `@zotov/s3uploader`. */
export class S3UploaderError extends Error {
  /** The underlying error that caused this one, if any. */
  readonly cause?: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'S3UploaderError'
    this.cause = cause
  }
}
