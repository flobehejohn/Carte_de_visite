import net from 'node:net';
import { describe, expect, it } from 'vitest';

describe('test hermeticity', () => {
  it('blocks outbound network calls to non-loopback hosts', () => {
    expect(() => net.connect(443, 'example.com')).toThrow(
      /TEST_NETWORK_BLOCKED/,
    );
  });
});
