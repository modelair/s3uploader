import { createReadStream } from 'node:fs'
import { basename } from 'node:path'
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { S3UploaderError } from './errors'
import { inferContentType } from './mime'
import type {
  PresignOptions,
  S3Object,
  S3UploaderConfig,
  UploadOptions,
  UploadResult,
} from './types'

const MIN_PART_SIZE = 5 * 1024 * 1024 // 5 MiB — S3 minimum part size.

/**
 * Universal uploader for AWS S3 and any S3-compatible storage.
 *
 * @example
 * const uploader = new S3Uploader({ bucket: "my-bucket", region: "us-east-1" });
 * const { location } = await uploader.upload({ key: "a.png", body: buffer });
 */
export class S3Uploader {
  private readonly client: S3Client
  private readonly bucket: string
  private readonly publicBaseUrl?: string

  constructor(config: S3UploaderConfig) {
    if (!config?.bucket) {
      throw new S3UploaderError('`bucket` is required')
    }
    this.bucket = config.bucket
    this.publicBaseUrl = config.publicBaseUrl?.replace(/\/+$/, '')

    this.client =
      config.client ??
      new S3Client({
        region: config.region ?? 'us-east-1',
        ...(config.endpoint ? { endpoint: config.endpoint } : {}),
        ...(config.forcePathStyle !== undefined
          ? { forcePathStyle: config.forcePathStyle }
          : {}),
        ...(config.credentials ? { credentials: config.credentials } : {}),
      })
  }

  /** The underlying AWS SDK client, for advanced use. */
  get s3(): S3Client {
    return this.client
  }

  /**
   * Upload a Buffer, Uint8Array, Readable stream, or string.
   * Uses multipart transfer automatically for large/streamed bodies.
   */
  async upload(options: UploadOptions): Promise<UploadResult> {
    const { key, body } = options
    if (!key) throw new S3UploaderError('`key` is required')
    if (body === undefined || body === null) {
      throw new S3UploaderError('`body` is required')
    }

    const contentType = options.contentType ?? inferContentType(key)

    try {
      const upload = new Upload({
        client: this.client,
        partSize: Math.max(options.partSize ?? MIN_PART_SIZE, MIN_PART_SIZE),
        queueSize: options.queueSize ?? 4,
        params: {
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ...(options.acl ? { ACL: options.acl } : {}),
          ...(options.metadata ? { Metadata: options.metadata } : {}),
          ...(options.cacheControl
            ? { CacheControl: options.cacheControl }
            : {}),
          ...(options.contentDisposition
            ? { ContentDisposition: options.contentDisposition }
            : {}),
        },
      })

      const result = await upload.done()
      const etag = 'ETag' in result ? result.ETag : undefined

      return {
        key,
        bucket: this.bucket,
        etag: etag?.replace(/"/g, ''),
        location: this.buildLocation(key),
      }
    } catch (err) {
      throw new S3UploaderError(`Failed to upload "${key}"`, err)
    }
  }

  /**
   * Upload a file from the local filesystem by streaming it.
   * The object key defaults to the file's basename.
   */
  async uploadFile(
    filePath: string,
    options?: Partial<Omit<UploadOptions, 'body'>>,
  ): Promise<UploadResult> {
    const key = options?.key ?? basename(filePath)
    try {
      return await this.upload({
        ...options,
        key,
        body: createReadStream(filePath),
      })
    } catch (err) {
      if (err instanceof S3UploaderError) throw err
      throw new S3UploaderError(`Failed to read file "${filePath}"`, err)
    }
  }

  /** Delete a single object. Succeeds even if the key does not exist. */
  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      )
    } catch (err) {
      throw new S3UploaderError(`Failed to delete "${key}"`, err)
    }
  }

  /** Delete multiple objects in a single request (batched by 1000). */
  async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return
    try {
      for (let i = 0; i < keys.length; i += 1000) {
        const batch = keys.slice(i, i + 1000)
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })) },
          }),
        )
      }
    } catch (err) {
      throw new S3UploaderError('Failed to delete objects', err)
    }
  }

  /** Check whether an object exists. */
  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      )
      return true
    } catch (err) {
      if (isNotFound(err)) return false
      throw new S3UploaderError(`Failed to check "${key}"`, err)
    }
  }

  /** List objects under an optional prefix, paginating through all results. */
  async list(prefix?: string): Promise<S3Object[]> {
    const objects: S3Object[] = []
    let continuationToken: string | undefined

    try {
      do {
        const res = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            ...(prefix ? { Prefix: prefix } : {}),
            ...(continuationToken
              ? { ContinuationToken: continuationToken }
              : {}),
          }),
        )

        for (const obj of res.Contents ?? []) {
          if (!obj.Key) continue
          objects.push({
            key: obj.Key,
            size: obj.Size ?? 0,
            lastModified: obj.LastModified,
            etag: obj.ETag?.replace(/"/g, ''),
          })
        }

        continuationToken = res.IsTruncated
          ? res.NextContinuationToken
          : undefined
      } while (continuationToken)

      return objects
    } catch (err) {
      throw new S3UploaderError('Failed to list objects', err)
    }
  }

  /** Generate a presigned URL for downloading (`get`) or uploading (`put`). */
  async getPresignedUrl(options: PresignOptions): Promise<string> {
    const { key, operation = 'get', expiresIn = 900 } = options
    try {
      const command =
        operation === 'put'
          ? new PutObjectCommand({
              Bucket: this.bucket,
              Key: key,
              ...(options.contentType
                ? { ContentType: options.contentType }
                : {}),
            })
          : new GetObjectCommand({ Bucket: this.bucket, Key: key })

      return await getSignedUrl(this.client, command, { expiresIn })
    } catch (err) {
      throw new S3UploaderError(
        `Failed to presign "${key}" (${operation})`,
        err,
      )
    }
  }

  /** Release the underlying client's resources. */
  destroy(): void {
    this.client.destroy()
  }

  private buildLocation(key: string): string {
    const encodedKey = key.split('/').map(encodeURIComponent).join('/')
    if (this.publicBaseUrl) return `${this.publicBaseUrl}/${encodedKey}`
    return `s3://${this.bucket}/${key}`
  }
}

/** Detect a "not found" error across AWS SDK shapes and S3-compatible backends. */
function isNotFound(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const e = err as {
    name?: string
    $metadata?: { httpStatusCode?: number }
  }
  return e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404
}
