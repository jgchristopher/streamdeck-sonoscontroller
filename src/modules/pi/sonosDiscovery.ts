const PROBE_TIMEOUT_MS = 500;
const MAX_CONCURRENT = 20;

export async function discoverSonosDevice(subnetPrefix: string): Promise<string | null> {
  const ips = Array.from({ length: 254 }, (_, i) => `${subnetPrefix}.${i + 1}`);

  for (let i = 0; i < ips.length; i += MAX_CONCURRENT) {
    const batch = ips.slice(i, i + MAX_CONCURRENT);
    const results = await Promise.allSettled(batch.map((ip) => probeSonosDevice(ip)));

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
    const response = await fetch(`http://${ip}:1400/status/zp`, {
      signal: controller.signal,
    });
    if (response.ok) {
      return ip;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
