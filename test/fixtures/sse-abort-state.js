export const sseAbortState = {
    aborted: 0,
    close: 0,
    signal: 0,
};

export function resetSseAbortState() {
    sseAbortState.aborted = 0;
    sseAbortState.close = 0;
    sseAbortState.signal = 0;
}
