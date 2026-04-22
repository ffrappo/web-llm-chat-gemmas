import fs from "node:fs";
import path from "node:path";

const webllmBundlePath = path.resolve(
  process.cwd(),
  "node_modules/@mlc-ai/web-llm/lib/index.js",
);

if (!fs.existsSync(webllmBundlePath)) {
  throw new Error(`Missing WebLLM bundle at ${webllmBundlePath}`);
}

const originalBundle = fs.readFileSync(webllmBundlePath, "utf8");

const decodePatchPattern =
  /const recSource = buffer\.slice\(rec\.byteOffset, rec\.byteOffset \+ rec\.nbytes\);\r?\n([ \t]+)\/\/ first sync copy to cpu\.\r?\n\1this\.ctx\.arrayDecodeStorage\(cpu_arr, new Uint8Array\(recSource\), rec\.format, rec\.dtype\);/;

const patchedDecodeMarker =
  "const recSource = new Uint8Array(buffer, rec.byteOffset, rec.nbytes);";

let nextBundle = originalBundle;

if (!nextBundle.includes(patchedDecodeMarker)) {
  if (!decodePatchPattern.test(nextBundle)) {
    throw new Error(
      "Unable to locate the expected WebLLM decode path. The upstream bundle likely changed.",
    );
  }

  nextBundle = nextBundle.replace(
    decodePatchPattern,
    (_match, indent) =>
      `const recSource = new Uint8Array(buffer, rec.byteOffset, rec.nbytes);\n${indent}// Reuse the fetched shard buffer instead of copying large records before decode.\n${indent}this.ctx.arrayDecodeStorage(cpu_arr, recSource, rec.format, rec.dtype);`,
  );
}

if (nextBundle !== originalBundle) {
  fs.writeFileSync(webllmBundlePath, nextBundle, "utf8");
  console.log("[patch-web-llm] Applied zero-copy tensor decode patch.");
} else {
  console.log("[patch-web-llm] WebLLM patch already applied.");
}
