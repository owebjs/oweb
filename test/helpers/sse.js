function parseEventData(rawData) {
    const payload = rawData.trim();

    try {
        return JSON.parse(payload);
    } catch {
        const numeric = Number(payload);
        if (!Number.isNaN(numeric) && String(numeric) === payload) {
            return numeric;
        }
        return payload;
    }
}

export async function collectSseEvents(url, expectedCount, timeoutMs = 7000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
        headers: {
            Accept: 'text/event-stream',
        },
        signal: controller.signal,
    });

    if (!response.body) {
        clearTimeout(timeoutId);
        throw new Error('SSE response has no body stream.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const events = [];
    let buffer = '';

    try {
        while (events.length < expectedCount) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            let boundary = buffer.indexOf('\n\n');
            while (boundary !== -1) {
                const block = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);

                const dataLines = block
                    .split('\n')
                    .filter((line) => line.startsWith('data:'))
                    .map((line) => line.slice(5).trimStart());

                if (dataLines.length) {
                    events.push(parseEventData(dataLines.join('\n')));
                }

                if (events.length >= expectedCount) break;
                boundary = buffer.indexOf('\n\n');
            }
        }
    } finally {
        clearTimeout(timeoutId);
        try {
            await reader.cancel();
        } catch {}
        controller.abort();
    }

    return { response, events };
}