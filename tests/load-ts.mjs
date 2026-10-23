import { readFile } from "node:fs/promises";
import ts from "typescript";

// Run the actual TypeScript helpers without adding a browser/test framework.
export async function loadTs(path, overrides = {}) {
  const cache = new Map();
  async function urlFor(file) {
    if (cache.has(file)) return cache.get(file);
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    let { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    });
    const imports = [...outputText.matchAll(/from\s+["']([^"']+)["']/g)];
    for (const [, specifier] of imports) {
      const target = overrides[specifier]
        ? `data:text/javascript;base64,${Buffer.from(overrides[specifier]).toString("base64")}`
        : await urlFor(`src/${specifier.replace(/^@\//, "")}.ts`);
      outputText = outputText
        .replaceAll(`"${specifier}"`, `"${target}"`)
        .replaceAll(`'${specifier}'`, `"${target}"`);
    }
    const url = `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
    cache.set(file, url);
    return url;
  }
  return import(await urlFor(path));
}
