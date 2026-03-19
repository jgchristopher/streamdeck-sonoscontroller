const PROBE_TIMEOUT_MS = 500;
const MAX_CONCURRENT = 20;

export async function discoverSonosDevice(subnetPrefix: string): Promise<string | null> {
  const trimmed = subnetPrefix.trim();
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) {
    throw new Error(`Invalid subnet prefix "${trimmed}". Expected format like "192.168.1"`);
  }

  const ips = Array.from({ length: 254 }, (_, i) => `${trimmed}.${i + 1}`);

  for (let i = 0; i < ips.length; i += MAX_CONCURRENT) {
    const batch = ips.slice(i, i + MAX_CONCURRENT);
    const results = await Promise.allSettled(batch.map(probeSonosDevice));

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        return result.value;
      }
    }
  }

  return null;
}

async function probeSonosDevice(ip: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    // no-cors is required in the Stream Deck PI webview. The tradeoff is that
    // the response is opaque (status 0, empty body), so we detect "something
    // listening on port 1400" rather than confirming a Sonos device. False
    // positives are unlikely on a home network since Sonos owns this port.
    await fetch(`http://${ip}:1400/status/zp`, {
      signal: controller.signal,
      mode: "no-cors",
    });
    return ip;
  } catch (error: unknown) {
    if ((error instanceof DOMException && error.name === "AbortError") || error instanceof TypeError) {
      return null;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
