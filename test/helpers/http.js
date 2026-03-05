const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function requestJson(baseUrl, routePath, init = {}) {
    const response = await fetch(`${baseUrl}${routePath}`, init);
    const raw = await response.text();

    let body = raw;
    if (raw.length) {
        try {
            body = JSON.parse(raw);
        } catch {
            body = raw;
        }
    } else {
        body = null;
    }

    return { response, body, raw };
}

export async function waitFor(checkFn, { timeoutMs = 8000, intervalMs = 120 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let lastError;

    while (Date.now() < deadline) {
        try {
            const result = await checkFn();
            if (result) return result;
        } catch (err) {
            lastError = err;
        }

        await sleep(intervalMs);
    }

    if (lastError) throw lastError;
    throw new Error(`Condition not met within ${timeoutMs}ms`);
}