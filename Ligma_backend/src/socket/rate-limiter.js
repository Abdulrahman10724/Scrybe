// Per-socket token buckets for high-frequency client events. Excess events
// are dropped silently; a socket that keeps flooding after being throttled
// is disconnected.

const EVENT_CLASSES = {
  // ~60/s with a short burst allowance: cursor + live canvas manipulation.
  realtime: { ratePerSecond: 60, burst: 120 },
  // ~10/s: typing indicators.
  typing: { ratePerSecond: 10, burst: 20 },
};

const EVENT_TO_CLASS = {
  "workspace:cursor": "realtime",
  "workspace:zone-cursor": "realtime",
  "canvas:drag": "realtime",
  "canvas:resize": "realtime",
  "canvas:rotate": "realtime",
  "canvas:data": "realtime",
  "canvas:text": "realtime",
  "canvas:draft": "realtime",
  "chat:typing": "typing",
  "chat:stopped-typing": "typing",
};

// Disconnect after this many dropped events inside the window.
const ABUSE_WINDOW_MS = 10 * 1000;
const ABUSE_DROP_THRESHOLD = 600;

const createBucket = ({ ratePerSecond, burst }, now) => ({ tokens: burst, capacity: burst, ratePerSecond, updatedAt: now });

const take = (bucket, now) => {
  const elapsedSeconds = (now - bucket.updatedAt) / 1000;
  bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsedSeconds * bucket.ratePerSecond);
  bucket.updatedAt = now;
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
};

// Returns a Socket.IO per-socket middleware (socket.use). Calling next()
// lets the packet through; not calling it drops the event silently.
const createSocketRateLimiter = (socket, { now = () => Date.now(), onAbuse } = {}) => {
  const buckets = new Map();
  let drops = [];

  return (packet, next) => {
    const eventClass = EVENT_TO_CLASS[packet?.[0]];
    if (!eventClass) return next();

    const time = now();
    if (!buckets.has(eventClass)) buckets.set(eventClass, createBucket(EVENT_CLASSES[eventClass], time));

    if (take(buckets.get(eventClass), time)) return next();

    drops.push(time);
    drops = drops.filter((at) => time - at < ABUSE_WINDOW_MS);
    if (drops.length >= ABUSE_DROP_THRESHOLD) {
      onAbuse?.(socket, packet[0]);
      socket.disconnect(true);
    }
    return undefined;
  };
};

export { EVENT_CLASSES, EVENT_TO_CLASS, ABUSE_DROP_THRESHOLD, ABUSE_WINDOW_MS, createSocketRateLimiter };
