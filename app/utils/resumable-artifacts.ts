import { WEBLLM_APP_CONFIG } from "../constant";

const RESUME_DB_NAME = "fornace-webllm-artifact-resume";
const RESUME_DB_VERSION = 1;
const META_STORE = "download-meta";
const CHUNK_STORE = "download-chunks";
const CHUNK_URL_INDEX = "url";
const CHUNK_SIZE = 8 * 1024 * 1024;
const MAX_CHUNK_CONCURRENCY = 4;
const MIN_RESUMABLE_BYTES = 1 * 1024 * 1024;
const STALE_ARTIFACT_MS = 7 * 24 * 60 * 60 * 1000;

type RuntimeScope = typeof globalThis & {
  __fornaceResumableArtifactDownloadsInstalled?: boolean;
};

type ArtifactMetaRecord = {
  url: string;
  totalBytes: number;
  chunkSize: number;
  contentType: string;
  etag?: string;
  lastModified?: string;
  updatedAt: number;
};

type ArtifactChunkRecord = {
  id: string;
  url: string;
  start: number;
  end: number;
  updatedAt: number;
  data: ArrayBuffer;
};

type ArtifactChunkRange = {
  start: number;
  end: number;
};

type ArtifactProbeResult =
  | {
      resumable: true;
      totalBytes: number;
      contentType: string;
      etag?: string;
      lastModified?: string;
    }
  | {
      resumable: false;
      fallbackResponse?: Response;
    };

const inflightArtifactResponses = new Map<string, Promise<Response>>();
const artifactBasePrefixes = new Set<string>();
const exactArtifactUrls = new Set<string>();

let resumeDBPromise: Promise<IDBDatabase> | undefined;

for (const modelRecord of WEBLLM_APP_CONFIG.model_list) {
  artifactBasePrefixes.add(
    ensureTrailingSlash(normalizeArtifactUrl(modelRecord.model)),
  );

  if (modelRecord.model_lib) {
    exactArtifactUrls.add(normalizeArtifactUrl(modelRecord.model_lib));
  }
}

function getRuntimeBaseUrl() {
  if (typeof self !== "undefined" && "location" in self) {
    return self.location.href;
  }

  return "http://localhost/";
}

function normalizeArtifactUrl(url: string) {
  return new URL(url, getRuntimeBaseUrl()).href;
}

function ensureTrailingSlash(url: string) {
  return url.endsWith("/") ? url : `${url}/`;
}

function shouldHandleArtifactRequest(request: Request) {
  if (request.method !== "GET") {
    return false;
  }

  if (request.headers.has("Range")) {
    return false;
  }

  if (!/^https?:/i.test(request.url)) {
    return false;
  }

  if (exactArtifactUrls.has(request.url)) {
    return true;
  }

  for (const prefix of artifactBasePrefixes) {
    if (request.url.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

function parseContentRangeTotal(contentRange: string | null) {
  if (!contentRange) {
    return undefined;
  }

  const match = contentRange.match(/bytes\s+\d+-\d+\/(\d+)/i);
  if (!match) {
    return undefined;
  }

  const total = Number.parseInt(match[1], 10);
  return Number.isFinite(total) && total > 0 ? total : undefined;
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionToPromise(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

function openResumeDB() {
  if (!resumeDBPromise) {
    resumeDBPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const openRequest = indexedDB.open(RESUME_DB_NAME, RESUME_DB_VERSION);

      openRequest.onupgradeneeded = () => {
        const database = openRequest.result;

        if (!database.objectStoreNames.contains(META_STORE)) {
          database.createObjectStore(META_STORE, {
            keyPath: "url",
          });
        }

        if (!database.objectStoreNames.contains(CHUNK_STORE)) {
          const chunkStore = database.createObjectStore(CHUNK_STORE, {
            keyPath: "id",
          });
          chunkStore.createIndex(CHUNK_URL_INDEX, "url", {
            unique: false,
          });
        }
      };

      openRequest.onsuccess = () => {
        const database = openRequest.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      openRequest.onerror = () =>
        reject(
          openRequest.error ??
            new Error("Failed to open resumable artifact database."),
        );
    });
  }

  return resumeDBPromise;
}

async function getArtifactMeta(url: string) {
  const database = await openResumeDB();
  const transaction = database.transaction(META_STORE, "readonly");
  const store = transaction.objectStore(META_STORE);
  const result = await requestToPromise(store.get(url));
  await transactionToPromise(transaction);
  return (result as ArtifactMetaRecord | undefined) ?? undefined;
}

async function putArtifactMeta(meta: ArtifactMetaRecord) {
  const database = await openResumeDB();
  const transaction = database.transaction(META_STORE, "readwrite");
  const store = transaction.objectStore(META_STORE);
  store.put(meta);
  await transactionToPromise(transaction);
}

async function getArtifactChunks(url: string) {
  const database = await openResumeDB();
  const transaction = database.transaction(CHUNK_STORE, "readonly");
  const store = transaction.objectStore(CHUNK_STORE);
  const index = store.index(CHUNK_URL_INDEX);
  const result = await requestToPromise(index.getAll(url));
  await transactionToPromise(transaction);

  return ((result as ArtifactChunkRecord[] | undefined) ?? []).sort(
    (left, right) => left.start - right.start,
  );
}

async function putArtifactChunk(record: ArtifactChunkRecord) {
  const database = await openResumeDB();
  const transaction = database.transaction(CHUNK_STORE, "readwrite");
  const store = transaction.objectStore(CHUNK_STORE);
  store.put(record);
  await transactionToPromise(transaction);
}

async function deleteArtifactDownload(url: string) {
  const database = await openResumeDB();
  const transaction = database.transaction(
    [META_STORE, CHUNK_STORE],
    "readwrite",
  );
  const metaStore = transaction.objectStore(META_STORE);
  const chunkStore = transaction.objectStore(CHUNK_STORE);
  const chunkIndex = chunkStore.index(CHUNK_URL_INDEX);
  const chunkKeys = await requestToPromise(chunkIndex.getAllKeys(url));

  metaStore.delete(url);

  for (const key of chunkKeys) {
    chunkStore.delete(key);
  }

  await transactionToPromise(transaction);
}

async function cleanupStaleArtifactDownloads() {
  const cutoff = Date.now() - STALE_ARTIFACT_MS;
  const database = await openResumeDB();
  const transaction = database.transaction(META_STORE, "readonly");
  const metaStore = transaction.objectStore(META_STORE);
  const metas = (await requestToPromise(
    metaStore.getAll(),
  )) as ArtifactMetaRecord[];
  await transactionToPromise(transaction);

  const staleUrls = metas
    .filter((meta) => meta.updatedAt < cutoff)
    .map((meta) => meta.url);

  await Promise.all(staleUrls.map((url) => deleteArtifactDownload(url)));
}

function getChunkId(url: string, start: number, end: number) {
  return `${url}::${start}-${end}`;
}

function getMissingRanges(
  meta: ArtifactMetaRecord,
  chunks: ArtifactChunkRecord[],
) {
  const chunkMap = new Map<number, ArtifactChunkRecord>();

  for (const chunk of chunks) {
    chunkMap.set(chunk.start, chunk);
  }

  const missingRanges: ArtifactChunkRange[] = [];

  for (let start = 0; start < meta.totalBytes; start += meta.chunkSize) {
    const end = Math.min(meta.totalBytes - 1, start + meta.chunkSize - 1);
    const expectedLength = end - start + 1;
    const chunk = chunkMap.get(start);

    if (
      !chunk ||
      chunk.end !== end ||
      chunk.data.byteLength !== expectedLength
    ) {
      missingRanges.push({ start, end });
    }
  }

  return missingRanges;
}

function validateArtifactChunks(
  meta: ArtifactMetaRecord,
  chunks: ArtifactChunkRecord[],
) {
  const missingRanges = getMissingRanges(meta, chunks);

  if (missingRanges.length > 0) {
    throw new Error(`Missing persisted chunks for ${meta.url}`);
  }
}

async function fetchHeadMetadata(
  request: Request,
  originalFetch: typeof fetch,
) {
  const headRequest = new Request(request, {
    method: "HEAD",
    signal: request.signal,
  });
  const response = await originalFetch(headRequest);

  if (!response.ok) {
    return undefined;
  }

  const totalBytes = Number.parseInt(
    response.headers.get("content-length") ?? "",
    10,
  );

  if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
    return undefined;
  }

  return {
    totalBytes,
    contentType:
      response.headers.get("content-type") ?? "application/octet-stream",
    etag: response.headers.get("etag") ?? undefined,
    lastModified: response.headers.get("last-modified") ?? undefined,
  };
}

async function probeArtifactDownload(
  request: Request,
  originalFetch: typeof fetch,
): Promise<ArtifactProbeResult> {
  const rangeHeaders = new Headers(request.headers);
  rangeHeaders.set("Range", "bytes=0-0");

  const probeRequest = new Request(request, {
    headers: rangeHeaders,
    signal: request.signal,
  });
  const probeResponse = await originalFetch(probeRequest);

  if (probeResponse.status === 206) {
    const headMetadata = await fetchHeadMetadata(request, originalFetch).catch(
      () => undefined,
    );
    const totalBytes =
      parseContentRangeTotal(probeResponse.headers.get("content-range")) ??
      headMetadata?.totalBytes;

    if (probeResponse.body) {
      await probeResponse.body.cancel().catch(() => undefined);
    }

    if (!totalBytes || totalBytes < MIN_RESUMABLE_BYTES) {
      return {
        resumable: false,
      };
    }

    return {
      resumable: true,
      totalBytes,
      contentType:
        probeResponse.headers.get("content-type") ??
        headMetadata?.contentType ??
        "application/octet-stream",
      etag:
        probeResponse.headers.get("etag") ?? headMetadata?.etag ?? undefined,
      lastModified:
        probeResponse.headers.get("last-modified") ??
        headMetadata?.lastModified ??
        undefined,
    };
  }

  if (probeResponse.ok) {
    return {
      resumable: false,
      fallbackResponse: probeResponse,
    };
  }

  throw new Error(
    `Unexpected probe response for ${request.url}: ${probeResponse.status}`,
  );
}

async function prepareArtifactMeta(
  requestUrl: string,
  probeResult: Extract<ArtifactProbeResult, { resumable: true }>,
) {
  const nextMeta: ArtifactMetaRecord = {
    url: requestUrl,
    totalBytes: probeResult.totalBytes,
    chunkSize: CHUNK_SIZE,
    contentType: probeResult.contentType,
    etag: probeResult.etag,
    lastModified: probeResult.lastModified,
    updatedAt: Date.now(),
  };
  const currentMeta = await getArtifactMeta(requestUrl);

  if (
    currentMeta &&
    currentMeta.totalBytes === nextMeta.totalBytes &&
    currentMeta.chunkSize === nextMeta.chunkSize &&
    currentMeta.etag === nextMeta.etag &&
    currentMeta.lastModified === nextMeta.lastModified
  ) {
    const refreshedMeta = {
      ...currentMeta,
      contentType: nextMeta.contentType || currentMeta.contentType,
      updatedAt: Date.now(),
    };
    await putArtifactMeta(refreshedMeta);
    return refreshedMeta;
  }

  await deleteArtifactDownload(requestUrl).catch(() => undefined);
  await putArtifactMeta(nextMeta);

  return nextMeta;
}

async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
) {
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= items.length) {
          return;
        }

        await task(items[currentIndex]);
      }
    }),
  );
}

async function downloadArtifactRange(
  request: Request,
  originalFetch: typeof fetch,
  meta: ArtifactMetaRecord,
  range: ArtifactChunkRange,
) {
  const rangeHeaders = new Headers(request.headers);
  rangeHeaders.set("Range", `bytes=${range.start}-${range.end}`);

  const chunkRequest = new Request(request, {
    headers: rangeHeaders,
    signal: request.signal,
  });
  const response = await originalFetch(chunkRequest);

  if (
    !(
      response.status === 206 ||
      (response.ok && range.start === 0 && range.end === meta.totalBytes - 1)
    )
  ) {
    throw new Error(
      `Failed to fetch byte range ${range.start}-${range.end} for ${request.url}`,
    );
  }

  const data = await response.arrayBuffer();
  const expectedLength = range.end - range.start + 1;

  if (data.byteLength !== expectedLength) {
    throw new Error(
      `Incomplete byte range ${range.start}-${range.end} for ${request.url}: expected ${expectedLength}, received ${data.byteLength}`,
    );
  }

  await putArtifactChunk({
    id: getChunkId(request.url, range.start, range.end),
    url: request.url,
    start: range.start,
    end: range.end,
    updatedAt: Date.now(),
    data,
  });
}

async function buildArtifactResponse(
  meta: ArtifactMetaRecord,
  cleanupAfterBuild: boolean,
) {
  const chunks = await getArtifactChunks(meta.url);
  validateArtifactChunks(meta, chunks);

  const blob = new Blob(
    chunks.map((chunk) => chunk.data),
    {
      type: meta.contentType || "application/octet-stream",
    },
  );
  const headers = new Headers();
  headers.set("Content-Length", String(meta.totalBytes));

  if (meta.contentType) {
    headers.set("Content-Type", meta.contentType);
  }

  if (meta.etag) {
    headers.set("ETag", meta.etag);
  }

  if (meta.lastModified) {
    headers.set("Last-Modified", meta.lastModified);
  }

  if (cleanupAfterBuild) {
    void deleteArtifactDownload(meta.url).catch(() => undefined);
  }

  return new Response(blob, {
    status: 200,
    statusText: "OK",
    headers,
  });
}

async function downloadArtifactWithResume(
  request: Request,
  originalFetch: typeof fetch,
) {
  const probeResult = await probeArtifactDownload(request, originalFetch);

  if (!probeResult.resumable) {
    return probeResult.fallbackResponse ?? originalFetch(request);
  }

  const meta = await prepareArtifactMeta(request.url, probeResult);
  const existingChunks = await getArtifactChunks(request.url);
  const missingRanges = getMissingRanges(meta, existingChunks);

  if (existingChunks.length > 0 && missingRanges.length > 0) {
    console.info(
      `[WebLLM] Resuming ${request.url} with ${existingChunks.length} saved chunks and ${missingRanges.length} missing chunks.`,
    );
  }

  await runWithConcurrency(
    missingRanges,
    MAX_CHUNK_CONCURRENCY,
    async (range) => {
      await downloadArtifactRange(request, originalFetch, meta, range);
      await putArtifactMeta({
        ...meta,
        updatedAt: Date.now(),
      });
    },
  );

  return buildArtifactResponse(meta, false);
}

async function fetchArtifactResponse(
  request: Request,
  originalFetch: typeof fetch,
) {
  const inflightResponse = inflightArtifactResponses.get(request.url);

  if (inflightResponse) {
    return (await inflightResponse).clone();
  }

  const nextResponse = downloadArtifactWithResume(request, originalFetch);
  inflightArtifactResponses.set(request.url, nextResponse);

  try {
    return (await nextResponse).clone();
  } finally {
    if (inflightArtifactResponses.get(request.url) === nextResponse) {
      inflightArtifactResponses.delete(request.url);
    }
  }
}

function patchFetch(originalFetch: typeof fetch) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);

    if (!shouldHandleArtifactRequest(request)) {
      return originalFetch(request);
    }

    try {
      return await fetchArtifactResponse(request, originalFetch);
    } catch (error) {
      console.warn(
        `[WebLLM] Falling back to standard artifact download for ${request.url}.`,
        error,
      );
      return originalFetch(request);
    }
  }) as typeof fetch;
}

function patchCacheAdd(originalFetch: typeof fetch) {
  if (typeof Cache === "undefined") {
    return;
  }

  const cachePrototype = Cache.prototype as Cache & {
    __fornaceOriginalAdd?: Cache["add"];
    __fornacePatchedAdd?: boolean;
  };

  if (cachePrototype.__fornacePatchedAdd) {
    return;
  }

  const originalAdd = cachePrototype.add;
  cachePrototype.__fornaceOriginalAdd = originalAdd;

  cachePrototype.add = async function (
    this: Cache,
    request: RequestInfo | URL,
  ) {
    const normalizedRequest =
      request instanceof Request ? request : new Request(request);

    if (!shouldHandleArtifactRequest(normalizedRequest)) {
      return originalAdd.call(this, request);
    }

    const response = await fetchArtifactResponse(
      normalizedRequest,
      originalFetch,
    );
    await this.put(normalizedRequest, response.clone());
    await deleteArtifactDownload(normalizedRequest.url).catch(() => undefined);
  } as Cache["add"];

  cachePrototype.__fornacePatchedAdd = true;
}

export function installResumableArtifactDownloads() {
  const runtimeScope = globalThis as RuntimeScope;

  if (runtimeScope.__fornaceResumableArtifactDownloadsInstalled) {
    return;
  }

  if (
    typeof fetch !== "function" ||
    typeof indexedDB === "undefined" ||
    typeof Request === "undefined" ||
    typeof Response === "undefined"
  ) {
    return;
  }

  const originalFetch = fetch.bind(globalThis);
  void cleanupStaleArtifactDownloads().catch(() => undefined);
  patchFetch(originalFetch);
  patchCacheAdd(originalFetch);

  runtimeScope.__fornaceResumableArtifactDownloadsInstalled = true;
}
