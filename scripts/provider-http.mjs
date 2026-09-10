// Node does not supply a browser Origin or enforce CORS. Probe each actual
// application origin explicitly; do not mistake a no-Origin response for denial.
export function providerOrigins(config) {
  const dev = new URL(config.build.devUrl).origin;
  const windows = config.app.windows;
  if (!Array.isArray(windows) || windows.length === 0) throw new Error('No configured Tauri windows.');
  return [...new Set([dev, ...windows.map((window) =>
    `${window.useHttpsScheme ? 'https' : 'http'}://tauri.localhost`)])];
}

export async function fetchWithCors(label, url, accept, origins) {
  if (!origins.length) throw new Error('Provider probe requires application origins.');
  let result;
  for (const origin of origins) {
    if (result) await result.body?.cancel();
    let response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(20000),
        credentials: 'omit',
        headers: { Origin: origin, ...(accept ? { Accept: accept } : {}) },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const allowed = response.headers.get('access-control-allow-origin');
      if (allowed !== '*' && allowed !== origin) {
        throw new Error(`Access-Control-Allow-Origin ${JSON.stringify(allowed)} does not allow ${origin}`);
      }
    } catch (error) {
      await response?.body?.cancel();
      throw new Error(`${label}: ${origin} -> ${url}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    result = response;
  }
  return result;
}
