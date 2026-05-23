/**
 * Cloudflare R2 storage helper.
 * Audio files are stored at: voice/{accountId}/{captureId}.webm
 */

const encoder = new TextEncoder();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const keyBytes = key instanceof ArrayBuffer ? key : key.slice().buffer;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(data)));
}

function amzDate(now: Date): { shortDate: string; longDate: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    shortDate: iso.slice(0, 8),
    longDate: iso,
  };
}

function encodeKey(key: string): string {
  return key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function presignUrl(
  method: "DELETE" | "GET" | "PUT",
  key: string,
  contentType?: string,
  expiresInSeconds = 300
): Promise<string> {
  const accountId =
    process.env.CLOUDFLARE_R2_ACCOUNT_ID ??
    requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const accessKeyId = requireEnv("CLOUDFLARE_R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("CLOUDFLARE_R2_SECRET_ACCESS_KEY");
  const bucket = requireEnv("CLOUDFLARE_R2_BUCKET_NAME");
  const endpointHost = `${accountId}.r2.cloudflarestorage.com`;
  const now = new Date();
  const { shortDate, longDate } = amzDate(now);
  const credentialScope = `${shortDate}/auto/s3/aws4_request`;
  const signedHeaders = contentType ? "content-type;host" : "host";
  const encodedKey = encodeKey(key);
  const canonicalUri = `/${bucket}/${encodedKey}`;

  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${credentialScope}`,
    "X-Amz-Date": longDate,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  });

  const canonicalHeaders = contentType
    ? `content-type:${contentType}\nhost:${endpointHost}\n`
    : `host:${endpointHost}\n`;
  const canonicalRequest = [
    method,
    canonicalUri,
    query.toString(),
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    longDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = await hmac(encoder.encode(`AWS4${secretAccessKey}`), shortDate);
  const kRegion = await hmac(kDate, "auto");
  const kService = await hmac(kRegion, "s3");
  const kSigning = await hmac(kService, "aws4_request");
  const signature = toHex(await hmac(kSigning, stringToSign));
  query.set("X-Amz-Signature", signature);

  return `https://${endpointHost}${canonicalUri}?${query.toString()}`;
}

export async function generateUploadPresignedUrl(
  key: string,
  contentType: string
): Promise<string> {
  return presignUrl("PUT", key, contentType);
}

export async function generateDownloadPresignedUrl(
  key: string,
  expiresInSeconds = 900
): Promise<string> {
  return presignUrl("GET", key, undefined, expiresInSeconds);
}

export function getPublicUrl(key: string): string {
  return `${requireEnv("CLOUDFLARE_R2_PUBLIC_URL").replace(/\/$/, "")}/${key}`;
}

export async function deleteObject(key: string): Promise<void> {
  const url = await presignUrl("DELETE", key);
  await fetch(url, { method: "DELETE" });
}

export function r2KeyForCapture(accountId: string, captureId: string): string {
  return `voice/${accountId}/${captureId}.webm`;
}

export function r2KeyForPersonalisedMagnet(accountId: string): string {
  return `magnets/personalised/${accountId}.pdf`;
}

export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const url = await generateDownloadPresignedUrl(key, 300);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`R2 object not found: ${key}`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function uploadBytes(
  key: string,
  bytes: Uint8Array,
  contentType: string
): Promise<void> {
  const url = await generateUploadPresignedUrl(key, contentType);
  const body = new Uint8Array(bytes.length);
  body.set(bytes);
  const response = await fetch(url, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: body.buffer,
  });
  if (!response.ok) throw new Error(`Failed to upload R2 object: ${key}`);
}
