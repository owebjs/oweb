export default function integerMatcher(value) {
    return /^-?\d+$/.test(String(value));
}