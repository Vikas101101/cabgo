// How long a request waits for a driver before it expires
export const REQUEST_TTL_MINUTES = 15;

// A driver we haven't heard from in this long isn't offered rides or pinged
export const DRIVER_FRESH_MINUTES = 5;

const minutesAgo = (minutes, now = Date.now()) =>
  new Date(now - minutes * 60 * 1000).toISOString();

// Requests created before this moment have expired
export const requestCutoff = (now) => minutesAgo(REQUEST_TTL_MINUTES, now);

// Drivers last seen before this moment are treated as away
export const driverFreshCutoff = (now) => minutesAgo(DRIVER_FRESH_MINUTES, now);