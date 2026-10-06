/**
 * Strings that convert cleanly to numbers: decimals and exponents, but not
 * empty strings, hexadecimal, or other inputs Number() would silently accept.
 */
export const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
