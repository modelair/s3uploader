# @zotov/s3uploader

[![CI](https://github.com/modelair/s3uploader/actions/workflows/ci.yml/badge.svg)](https://github.com/modelair/s3uploader/actions/workflows/ci.yml)

Universal file uploader for **AWS S3** and any **S3-compatible** storage — MinIO, Cloudflare R2, DigitalOcean Spaces, Yandex Object Storage, and more. Built on AWS SDK v3, written in TypeScript, ships ESM + CJS + type declarations.

## Features

- 📤 Upload from `Buffer`, `Uint8Array`, `Readable` stream, or `string`
- 📁 `uploadFile()` — stream a local file straight to the bucket
- 🔗 Presigned URLs for download (`get`) and upload (`put`)
- 🧹 `delete`, `deleteMany` (batched), `exists`, `list` (auto-paginated)
- 🌍 Works with any S3-compatible endpoint (custom `endpoint` + `forcePathStyle`)
- 🧠 Automatic `Content-Type` inference from the key extension
- 📦 Multipart transfer under the hood for large/streamed bodies

## Install

```bash
pnpm add @zotov/s3uploader
# or: npm i @zotov/s3uploader / yarn add @zotov/s3uploader
```

## Quick start

```ts
import { S3Uploader } from "@zotov/s3uploader";

const uploader = new S3Uploader({
  bucket: "my-bucket",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const result = await uploader.upload({
  key: "images/avatar.png",
  body: Buffer.from(/* ... */),
  acl: "public-read",
});

console.log(result.location);
```

> Omit `credentials` to use the AWS SDK default provider chain (env vars, shared config, IAM roles, etc.).

## S3-compatible storage

```ts
// MinIO (self-hosted) — needs path-style addressing
const minio = new S3Uploader({
  bucket: "uploads",
  endpoint: "http://localhost:9000",
  forcePathStyle: true,
  region: "us-east-1",
  credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" },
});

// Cloudflare R2
const r2 = new S3Uploader({
  bucket: "assets",
  endpoint: "https://<account>.r2.cloudflarestorage.com",
  region: "auto",
  credentials: { accessKeyId: "...", secretAccessKey: "..." },
  publicBaseUrl: "https://cdn.example.com", // used for result.location
});
```

## API

### `new S3Uploader(config)`

| Option           | Type           | Description                                                        |
| ---------------- | -------------- | ------------------------------------------------------------------ |
| `bucket`         | `string`       | **Required.** Target bucket.                                       |
| `region`         | `string`       | AWS region. Default `"us-east-1"`.                                 |
| `endpoint`       | `string`       | Custom endpoint for S3-compatible storage.                         |
| `forcePathStyle` | `boolean`      | Path-style addressing. Required by MinIO.                          |
| `credentials`    | `object`       | `{ accessKeyId, secretAccessKey, sessionToken? }`. Optional.       |
| `publicBaseUrl`  | `string`       | Base URL (e.g. CDN) used to build `result.location`.               |
| `client`         | `S3Client`     | Bring your own configured client (overrides connection options).   |

### Methods

```ts
upload(options: UploadOptions): Promise<UploadResult>
uploadFile(filePath: string, options?): Promise<UploadResult>
delete(key: string): Promise<void>
deleteMany(keys: string[]): Promise<void>
exists(key: string): Promise<boolean>
list(prefix?: string): Promise<S3Object[]>
getPresignedUrl(options: PresignOptions): Promise<string>
destroy(): void
```

#### Upload options

`key`, `body`, `contentType?`, `acl?`, `metadata?`, `cacheControl?`, `contentDisposition?`, `partSize?`, `queueSize?`.

#### Presigned URLs

```ts
// Let a client download for 1 hour
const url = await uploader.getPresignedUrl({ key: "report.pdf", expiresIn: 3600 });

// Let a client upload directly to the bucket
const putUrl = await uploader.getPresignedUrl({
  key: "uploads/raw.bin",
  operation: "put",
  contentType: "application/octet-stream",
});
```

## Errors

All failures are wrapped in `S3UploaderError`, with the original error on `.cause`.

```ts
import { S3UploaderError } from "@zotov/s3uploader";

try {
  await uploader.upload({ key: "k", body });
} catch (err) {
  if (err instanceof S3UploaderError) console.error(err.message, err.cause);
}
```

## Development

```bash
pnpm install
pnpm test        # vitest (mocked S3, no network)
pnpm run build   # tsup → dist (ESM + CJS + d.ts)
pnpm typecheck
```

## License

MIT © Dmitry Zotov
