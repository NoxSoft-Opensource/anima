const MODULE_SPECIFIER = "@noxsoft/svrn-node";
const LOCAL_CANDIDATES = [
  new URL("../../../svrn-node/src/index.ts", import.meta.url).href,
  new URL("../../../svrn-node/dist/index.js", import.meta.url).href,
];

export type SvrnNodeModule = typeof import("@noxsoft/svrn-node");

let cachedModule: SvrnNodeModule | null | undefined;

export async function loadSvrnNodeModule(): Promise<SvrnNodeModule | null> {
  if (cachedModule !== undefined) {
    return cachedModule;
  }

  try {
    const mod = await import(MODULE_SPECIFIER);
    cachedModule = mod;
    return mod;
  } catch {
    for (const candidate of LOCAL_CANDIDATES) {
      try {
        const mod = (await import(candidate)) as SvrnNodeModule;
        cachedModule = mod;
        return mod;
      } catch {
        // Keep trying candidates until one resolves.
      }
    }
  }

  cachedModule = null;
  return null;
}
