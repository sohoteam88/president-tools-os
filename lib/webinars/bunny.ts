const BUNNY_API_BASE = "https://video.bunnycdn.com/library";

function getBunnyConfig() {
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  const apiKey = process.env.BUNNY_STREAM_API_KEY;
  if (!libraryId || !apiKey) {
    throw new Error("BUNNY_STREAM_LIBRARY_ID and BUNNY_STREAM_API_KEY must be set");
  }
  return { libraryId, apiKey };
}

export type BunnyVideo = {
  videoId: string;
  title: string;
  status: number;
  length: number;
  thumbnailFileName: string | null;
};

export function getBunnyLibraryId(): string {
  return process.env.BUNNY_STREAM_LIBRARY_ID ?? "test-library";
}

export function getBunnyUploadUrl(libraryId: string, videoId: string): string {
  return `${BUNNY_API_BASE}/${libraryId}/videos/${videoId}`;
}

export function getBunnyThumbnailUrl(libraryId: string, videoId: string): string {
  return `https://vz-${libraryId}.b-cdn.net/${videoId}/thumbnail.jpg`;
}

export async function createBunnyVideo(title: string): Promise<{ videoId: string }> {
  const { libraryId, apiKey } = getBunnyConfig();
  const response = await fetch(`${BUNNY_API_BASE}/${libraryId}/videos`, {
    method: "POST",
    headers: { AccessKey: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) throw new Error(`Bunny create video failed: ${response.status}`);
  const data = (await response.json()) as { guid: string };
  return { videoId: data.guid };
}

export async function getBunnyVideo(videoId: string): Promise<BunnyVideo> {
  const { libraryId, apiKey } = getBunnyConfig();
  const response = await fetch(`${BUNNY_API_BASE}/${libraryId}/videos/${videoId}`, {
    headers: { AccessKey: apiKey },
  });
  if (!response.ok) throw new Error(`Bunny get video failed: ${response.status}`);
  const data = (await response.json()) as {
    guid: string;
    title: string;
    status: number;
    length: number;
    thumbnailFileName: string | null;
  };
  return {
    videoId: data.guid,
    title: data.title,
    status: data.status,
    length: data.length,
    thumbnailFileName: data.thumbnailFileName,
  };
}

export async function deleteBunnyVideo(videoId: string): Promise<void> {
  const { libraryId, apiKey } = getBunnyConfig();
  await fetch(`${BUNNY_API_BASE}/${libraryId}/videos/${videoId}`, {
    method: "DELETE",
    headers: { AccessKey: apiKey },
  });
}

export function statusLabel(status: number): string {
  return ["Queued", "Processing", "Encoding", "Finished", "Error", "Upload failed"][status] ?? "Unknown";
}
