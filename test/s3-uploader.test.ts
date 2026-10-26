import { Readable } from 'node:stream'
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { mockClient } from 'aws-sdk-client-mock'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { S3Uploader, S3UploaderError, inferContentType } from '../src/index'

const s3Mock = mockClient(S3Client)

function makeUploader(overrides = {}) {
  return new S3Uploader({
    bucket: 'test-bucket',
    region: 'us-east-1',
    client: new S3Client({ region: 'us-east-1' }),
    ...overrides,
  })
}

beforeEach(() => s3Mock.reset())
afterEach(() => s3Mock.reset())

describe('constructor', () => {
  it('throws without a bucket', () => {
    // @ts-expect-error — intentionally invalid
    expect(() => new S3Uploader({})).toThrow(S3UploaderError)
  })
})

describe('inferContentType', () => {
  it('maps known extensions', () => {
    expect(inferContentType('a.png')).toBe('image/png')
    expect(inferContentType('dir/b.JSON')).toBe('application/json')
  })
  it('falls back to octet-stream', () => {
    expect(inferContentType('noext')).toBe('application/octet-stream')
    expect(inferContentType('x.unknown')).toBe('application/octet-stream')
  })
})

describe('upload', () => {
  it('uploads a buffer and returns a result', async () => {
    s3Mock.on(PutObjectCommand).resolves({ ETag: '"abc123"' })
    const uploader = makeUploader()

    const res = await uploader.upload({
      key: 'folder/file.png',
      body: Buffer.from('hello'),
    })

    expect(res.key).toBe('folder/file.png')
    expect(res.bucket).toBe('test-bucket')
    expect(res.etag).toBe('abc123')
    expect(res.location).toBe('s3://test-bucket/folder/file.png')

    const call = s3Mock.commandCalls(PutObjectCommand)[0]
    expect(call?.args[0].input.ContentType).toBe('image/png')
  })

  it('uses publicBaseUrl for location and encodes the key', async () => {
    s3Mock.on(PutObjectCommand).resolves({ ETag: 'x' })
    const uploader = makeUploader({ publicBaseUrl: 'https://cdn.example.com/' })

    const res = await uploader.upload({
      key: 'a b/c.txt',
      body: 'data',
    })

    expect(res.location).toBe('https://cdn.example.com/a%20b/c.txt')
  })

  it('accepts a readable stream', async () => {
    s3Mock.on(PutObjectCommand).resolves({ ETag: 'x' })
    const uploader = makeUploader()

    const res = await uploader.upload({
      key: 's.txt',
      body: Readable.from([Buffer.from('streamed')]),
    })

    expect(res.key).toBe('s.txt')
  })

  it('throws a wrapped error on failure', async () => {
    s3Mock.on(PutObjectCommand).rejects(new Error('boom'))
    const uploader = makeUploader()

    await expect(
      uploader.upload({ key: 'k', body: Buffer.from('x') }),
    ).rejects.toThrow(S3UploaderError)
  })

  it('requires a key and body', async () => {
    const uploader = makeUploader()
    // @ts-expect-error
    await expect(uploader.upload({ body: 'x' })).rejects.toThrow(
      S3UploaderError,
    )
    // @ts-expect-error
    await expect(uploader.upload({ key: 'k' })).rejects.toThrow(S3UploaderError)
  })
})

describe('exists', () => {
  it('returns true when the object exists', async () => {
    s3Mock.on(HeadObjectCommand).resolves({})
    expect(await makeUploader().exists('k')).toBe(true)
  })

  it('returns false on a 404', async () => {
    s3Mock.on(HeadObjectCommand).rejects({ name: 'NotFound' })
    expect(await makeUploader().exists('k')).toBe(false)
  })

  it('returns false on a 404 status code', async () => {
    s3Mock
      .on(HeadObjectCommand)
      .rejects({ name: 'Whatever', $metadata: { httpStatusCode: 404 } })
    expect(await makeUploader().exists('k')).toBe(false)
  })

  it('rethrows other errors', async () => {
    s3Mock.on(HeadObjectCommand).rejects({ name: 'AccessDenied' })
    await expect(makeUploader().exists('k')).rejects.toThrow(S3UploaderError)
  })
})

describe('delete', () => {
  it('sends a delete command', async () => {
    s3Mock.on(DeleteObjectCommand).resolves({})
    await makeUploader().delete('k')
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(1)
  })
})

describe('deleteMany', () => {
  it('no-ops on an empty list', async () => {
    await makeUploader().deleteMany([])
    expect(s3Mock.commandCalls(DeleteObjectsCommand)).toHaveLength(0)
  })

  it('batches by 1000', async () => {
    s3Mock.on(DeleteObjectsCommand).resolves({})
    const keys = Array.from({ length: 1500 }, (_, i) => `k${i}`)
    await makeUploader().deleteMany(keys)
    expect(s3Mock.commandCalls(DeleteObjectsCommand)).toHaveLength(2)
  })
})

describe('list', () => {
  it('paginates through all pages', async () => {
    s3Mock
      .on(ListObjectsV2Command)
      .resolvesOnce({
        Contents: [{ Key: 'a', Size: 1 }],
        IsTruncated: true,
        NextContinuationToken: 'tok',
      })
      .resolvesOnce({
        Contents: [{ Key: 'b', Size: 2 }],
        IsTruncated: false,
      })

    const objects = await makeUploader().list('prefix/')
    expect(objects.map((o) => o.key)).toEqual(['a', 'b'])
    expect(objects[0]?.size).toBe(1)
  })
})
