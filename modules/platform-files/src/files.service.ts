/**
 * File storage abstraction.
 * Pluggable backend: local disk (dev) or S3-compatible object store (prod).
 * Switch via FILES_DRIVER env var: "local" | "s3"
 */

import { createWriteStream, createReadStream, mkdirSync, existsSync } from 'node:fs'
import { unlink, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'

export interface StoredFile {
  key: string
  bucket: string
  sizeBytes: number
  mimeType: string
  originalName: string
  uploadedAt: string
}

export interface FileDriver {
  put(key: string, stream: Readable, meta: { mimeType: string; sizeBytes?: number }): Promise<void>
  get(key: string): Promise<Readable>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  url(key: string): string
}

// ─── Local driver ─────────────────────────────────────────────────────────────

export class LocalFileDriver implements FileDriver {
  constructor(private baseDir: string = '/tmp/opencomp-files') {}

  private path(key: string) { return join(this.baseDir, key) }

  async put(key: string, stream: Readable): Promise<void> {
    const dest = this.path(key)
    mkdirSync(dirname(dest), { recursive: true })
    await pipeline(stream, createWriteStream(dest))
  }

  async get(key: string): Promise<Readable> {
    return createReadStream(this.path(key)) as unknown as Readable
  }

  async delete(key: string): Promise<void> {
    await unlink(this.path(key)).catch(() => {})
  }

  async exists(key: string): Promise<boolean> {
    return existsSync(this.path(key))
  }

  url(key: string): string {
    return `/files/${encodeURIComponent(key)}`
  }
}

// ─── S3 driver (uses @aws-sdk/client-s3 when available) ──────────────────────

export class S3FileDriver implements FileDriver {
  constructor(
    private bucket: string,
    private region: string,
    private endpoint?: string,
  ) {}

  private async getClient() {
    try {
      // Dynamic import so the module is optional — only required when FILES_DRIVER=s3
      const { S3Client } = await import('@aws-sdk/client-s3')
      return new S3Client({
        region: this.region,
        ...(this.endpoint ? { endpoint: this.endpoint, forcePathStyle: true } : {}),
      })
    } catch {
      throw new Error(
        'S3FileDriver: @aws-sdk/client-s3 is not installed. Run: pnpm add @aws-sdk/client-s3',
      )
    }
  }

  async put(key: string, stream: Readable, meta: { mimeType: string }): Promise<void> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3')
    const client = await this.getClient()
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: stream,
        ContentType: meta.mimeType,
      }),
    )
  }

  async get(key: string): Promise<Readable> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3')
    const client = await this.getClient()
    const response = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    if (!response.Body) throw new Error(`S3FileDriver: empty body for key "${key}"`)
    // AWS SDK v3 returns a SdkStream which is Readable-compatible
    return response.Body as unknown as Readable
  }

  async delete(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3')
    const client = await this.getClient()
    await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }

  async exists(key: string): Promise<boolean> {
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3')
    const client = await this.getClient()
    try {
      await client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
      return true
    } catch (err: unknown) {
      const code = (err as { name?: string })?.name
      if (code === 'NotFound' || code === 'NoSuchKey') return false
      throw err
    }
  }

  url(key: string): string {
    const base = this.endpoint ?? `https://${this.bucket}.s3.${this.region}.amazonaws.com`
    return `${base}/${encodeURIComponent(key)}`
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class FilesService {
  constructor(private driver: FileDriver) {}

  /**
   * Store a file under `{tenantId}/{category}/{uuid}.{ext}`.
   * Returns the key and metadata — persist the key to your domain table.
   */
  async upload(
    tenantId: string,
    category: string,
    originalName: string,
    stream: Readable,
    mimeType: string,
    sizeBytes?: number,
  ): Promise<StoredFile> {
    const ext = originalName.split('.').pop() ?? 'bin'
    const key = `${tenantId}/${category}/${randomUUID()}.${ext}`

    await this.driver.put(key, stream, { mimeType, sizeBytes })

    return {
      key,
      bucket: 'default',
      sizeBytes: sizeBytes ?? 0,
      mimeType,
      originalName,
      uploadedAt: new Date().toISOString(),
    }
  }

  download(key: string): Promise<Readable> {
    return this.driver.get(key)
  }

  delete(key: string): Promise<void> {
    return this.driver.delete(key)
  }

  exists(key: string): Promise<boolean> {
    return this.driver.exists(key)
  }

  /** Public URL or signed URL depending on driver. */
  url(key: string): string {
    return this.driver.url(key)
  }
}

// ─── Singleton factory ────────────────────────────────────────────────────────

export function createFilesService(): FilesService {
  const driver = process.env.FILES_DRIVER === 's3'
    ? new S3FileDriver(
        process.env.FILES_S3_BUCKET ?? 'opencomp',
        process.env.FILES_S3_REGION ?? 'us-east-1',
        process.env.FILES_S3_ENDPOINT,
      )
    : new LocalFileDriver(process.env.FILES_LOCAL_DIR ?? '/tmp/opencomp-files')

  return new FilesService(driver)
}
