import type { Readable } from 'node:stream'
import type { ObjectCannedACL, S3Client } from '@aws-sdk/client-s3'

/** Supported body payloads for an upload. */
export type UploadBody = Buffer | Uint8Array | Readable | string

/** Credentials passed explicitly. When omitted, the AWS SDK default chain is used. */
export interface S3Credentials {
  accessKeyId: string
  secretAccessKey: string
  /** Optional session token for temporary credentials (STS). */
  sessionToken?: string
}

/** Configuration for creating an {@link S3Uploader}. */
export interface S3UploaderConfig {
  /** Target bucket name. */
  bucket: string
  /** AWS region. Defaults to `us-east-1` (required by most S3-compatible endpoints). */
  region?: string
  /**
   * Custom endpoint for S3-compatible storage
   * (MinIO, Cloudflare R2, DigitalOcean Spaces, Yandex Object Storage, ...).
   */
  endpoint?: string
  /**
   * Use path-style addressing (`endpoint/bucket/key`) instead of virtual-hosted
   * (`bucket.endpoint/key`). Required by MinIO and most self-hosted gateways.
   */
  forcePathStyle?: boolean
  /** Explicit credentials. Omit to use the AWS SDK default provider chain. */
  credentials?: S3Credentials
  /**
   * Optional public base URL used to build {@link UploadResult.location}
   * (e.g. a CDN domain in front of the bucket). No trailing slash.
   */
  publicBaseUrl?: string
  /** Bring your own fully-configured client. Overrides all connection options above. */
  client?: S3Client
}

/** Options for a single upload. */
export interface UploadOptions {
  /** Object key (path) inside the bucket. */
  key: string
  /** File contents: Buffer, Uint8Array, Readable stream, or string. */
  body: UploadBody
  /** MIME type. Inferred from the key extension when omitted. */
  contentType?: string
  /** Canned ACL, e.g. `"public-read"`. */
  acl?: ObjectCannedACL
  /** Arbitrary user metadata stored with the object. */
  metadata?: Record<string, string>
  /** `Cache-Control` header value. */
  cacheControl?: string
  /** `Content-Disposition` header value. */
  contentDisposition?: string
  /** Part size in bytes for multipart uploads. Default 5 MiB (the S3 minimum). */
  partSize?: number
  /** Max concurrent parts for multipart uploads. Default 4. */
  queueSize?: number
}

/** Result of a successful upload. */
export interface UploadResult {
  key: string
  bucket: string
  /** ETag returned by S3 (quotes stripped), if provided. */
  etag?: string
  /** Public/addressable URL of the object. */
  location: string
}

/** A single object returned by {@link S3Uploader.list}. */
export interface S3Object {
  key: string
  size: number
  lastModified?: Date
  etag?: string
}

/** Options for presigned URL generation. */
export interface PresignOptions {
  key: string
  /** `"get"` to download, `"put"` to upload. Default `"get"`. */
  operation?: 'get' | 'put'
  /** Expiry in seconds. Default 900 (15 minutes). */
  expiresIn?: number
  /** For `"put"`: content type the client must send. */
  contentType?: string
}
