import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const entryPoint = fileURLToPath(new URL("../src/tts/deepinfra.ts", import.meta.url));
const result = await build({
  entryPoints: [entryPoint],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
  write: false,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`;
const { extractDeepInfraJsonErrorMessage } = await import(moduleUrl);

test("formats FastAPI validation arrays returned by DeepInfra", () => {
  assert.equal(
    extractDeepInfraJsonErrorMessage({
      detail: [
        {
          type: "string_too_long",
          loc: ["text"],
          msg: "String should have at most 10000 characters",
        },
      ],
    }),
    "text: String should have at most 10000 characters",
  );
});

test("extracts conventional DeepInfra error messages", () => {
  assert.equal(
    extractDeepInfraJsonErrorMessage({ error: { message: "Model unavailable" } }),
    "Model unavailable",
  );
  assert.equal(extractDeepInfraJsonErrorMessage({ detail: "Bad request" }), "Bad request");
});
