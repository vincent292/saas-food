import {
  DeleteObjectsCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";
import { createClient } from "./server";
import { createAdminClient } from "./admin";

const supabaseBucketName = "restaurant-assets";
const defaultR2Region = "auto";
const privateUrlPrefix = "/api/storage/private";
const whatsappImageMaxBytes = 5 * 1024 * 1024;
const whatsappImageMaxSide = 1600;

let r2Client: S3Client | null = null;

function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const publicBucket = process.env.R2_PUBLIC_BUCKET;
  const privateBucket = process.env.R2_PRIVATE_BUCKET;

  if (!accountId || !accessKeyId || !secretAccessKey || !publicBucket || !privateBucket) {
    return null;
  }

  return {
    endpoint: process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`,
    accessKeyId,
    secretAccessKey,
    publicBucket,
    privateBucket,
    publicUrl: process.env.R2_PUBLIC_URL?.replace(/\/$/, "") || "",
    region: process.env.R2_REGION || defaultR2Region,
  };
}

function getR2Client() {
  const config = getR2Config();
  if (!config) {
    return null;
  }

  r2Client ??= new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return { client: r2Client, config };
}

function extensionFromFile(file: File) {
  const nameExtension = file.name.split(".").pop();
  if (nameExtension) {
    return nameExtension.toLowerCase();
  }

  return file.type.split("/").pop() || "bin";
}

export async function uploadPublicImage(file: File | null, folder: string) {
  if (!file || file.size === 0) {
    return null;
  }

  const r2 = getR2Client();
  if (r2) {
    if (!r2.config.publicUrl) {
      throw new Error("R2_PUBLIC_URL is required to upload public assets to R2.");
    }

    const extension = extensionFromFile(file);
    const path = `${folder}/${crypto.randomUUID()}.${extension}`;
    await putR2Object(r2.client, r2.config.publicBucket, path, file, "public, max-age=31536000, immutable");
    return `${r2.config.publicUrl}/${path}`;
  }

  const supabase = createAdminClient() ?? (await createClient());
  const extension = extensionFromFile(file);
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(supabaseBucketName).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from(supabaseBucketName).getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadPublicWhatsAppImage(file: File | null, folder: string) {
  if (!file || file.size === 0) {
    return null;
  }

  const image = await createWhatsAppJpegFile(file);
  return uploadPublicImage(image, `${folder}/whatsapp`);
}

export async function uploadPrivateFile(file: File | null, folder: string) {
  if (!file || file.size === 0) {
    return null;
  }

  const r2 = getR2Client();
  if (!r2) {
    return uploadPublicImage(file, folder);
  }

  const extension = extensionFromFile(file);
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  await putR2Object(r2.client, r2.config.privateBucket, path, file, "private, no-store");
  return privateObjectUrl(path);
}

export async function uploadTemporaryPublicImage(file: File | null, folder: string, maxAgeSeconds = 60 * 60 * 24 * 2) {
  if (!file || file.size === 0) {
    return null;
  }

  const r2 = getR2Client();
  if (r2) {
    if (!r2.config.publicUrl) {
      throw new Error("R2_PUBLIC_URL is required to upload public assets to R2.");
    }

    const extension = extensionFromFile(file);
    const path = `${folder}/${crypto.randomUUID()}.${extension}`;
    await putR2Object(r2.client, r2.config.publicBucket, path, file, `public, max-age=${maxAgeSeconds}`, new Date(Date.now() + maxAgeSeconds * 1000));
    return `${r2.config.publicUrl}/${path}`;
  }

  return uploadPublicImage(file, folder);
}

export async function deletePublicFileUrl(url?: string | null) {
  if (!url) return;
  const r2 = getR2Client();
  if (!r2?.config.publicUrl) return;

  const publicPrefix = `${r2.config.publicUrl}/`;
  if (!url.startsWith(publicPrefix)) return;

  const key = decodeURIComponent(url.slice(publicPrefix.length));
  if (!key) return;

  await r2.client.send(
    new DeleteObjectCommand({
      Bucket: r2.config.publicBucket,
      Key: key,
    }),
  );
}

export async function getPrivateFileSignedUrl(path: string, options?: { downloadFileName?: string }) {
  const r2 = getR2Client();
  if (!r2) {
    return null;
  }

  return getSignedUrl(
    r2.client,
    new GetObjectCommand({
      Bucket: r2.config.privateBucket,
      Key: path,
      ...(options?.downloadFileName ? { ResponseContentDisposition: attachmentDisposition(options.downloadFileName) } : {}),
    }),
    { expiresIn: 60 * 5 },
  );
}

async function putR2Object(client: S3Client, bucket: string, path: string, file: File, cacheControl: string, expiresAt?: Date) {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: path,
      Body: Buffer.from(await file.arrayBuffer()),
      ContentType: file.type || "application/octet-stream",
      CacheControl: cacheControl,
      Expires: expiresAt,
    }),
  );
}

async function createWhatsAppJpegFile(file: File) {
  let quality = 86;
  let buffer = await renderWhatsAppJpeg(file, quality, whatsappImageMaxSide);

  while (buffer.byteLength > whatsappImageMaxBytes && quality > 48) {
    quality -= 8;
    buffer = await renderWhatsAppJpeg(file, quality, whatsappImageMaxSide);
  }

  if (buffer.byteLength > whatsappImageMaxBytes) {
    buffer = await renderWhatsAppJpeg(file, 48, 1200);
  }

  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

  return new File([arrayBuffer], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

async function renderWhatsAppJpeg(file: File, quality: number, maxSide: number) {
  return sharp(Buffer.from(await file.arrayBuffer()))
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}

function privateObjectUrl(path: string) {
  return `${privateUrlPrefix}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function attachmentDisposition(fileName: string) {
  const safeName = (fileName || "comprobante").replace(/["\\\r\n]/g, "_");
  const asciiName = safeName.replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}

async function listStoragePaths(folder: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(supabaseBucketName).list(folder, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });

  if (error || !data?.length) {
    return [];
  }

  const paths: string[] = [];

  for (const entry of data as Array<{ name: string; id?: string | null; metadata?: unknown }>) {
    const path = `${folder}/${entry.name}`;
    if (entry.id || entry.metadata) {
      paths.push(path);
    } else {
      paths.push(...(await listStoragePaths(path)));
    }
  }

  return paths;
}

export async function deleteRestaurantAssets(restaurantId: string, slug: string) {
  const r2 = getR2Client();
  if (r2) {
    const prefixes = Array.from(new Set([`restaurants/${restaurantId}`, `restaurants/${slug}`]));
    await Promise.all([
      ...prefixes.map((prefix) => deleteR2Prefix(r2.client, r2.config.publicBucket, prefix)),
      ...prefixes.map((prefix) => deleteR2Prefix(r2.client, r2.config.privateBucket, prefix)),
    ]);
    return;
  }

  const supabase = await createClient();
  const prefixes = Array.from(new Set([`restaurants/${restaurantId}`, `restaurants/${slug}`]));
  const paths = (await Promise.all(prefixes.map((prefix) => listStoragePaths(prefix)))).flat();

  for (let index = 0; index < paths.length; index += 100) {
    const chunk = paths.slice(index, index + 100);
    if (chunk.length) {
      await supabase.storage.from(supabaseBucketName).remove(chunk);
    }
  }
}

async function deleteR2Prefix(client: S3Client, bucket: string, prefix: string) {
  let continuationToken: string | undefined;

  do {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    const objects = listed.Contents?.map((entry) => (entry.Key ? { Key: entry.Key } : null)).filter((entry): entry is { Key: string } => Boolean(entry)) ?? [];

    if (objects.length) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: objects },
        }),
      );
    }

    continuationToken = listed.NextContinuationToken;
  } while (continuationToken);
}
