export const sseAbortState = {
    aborted: 0,
    close: 0,
};

export function resetSseAbortState() {
    sseAbortState.aborted = 0;
    sseAbortState.close = 0;
}
