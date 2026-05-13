import { describe, expect, it, vi } from 'vitest';

import { Hub, WS_OPEN, type HubSocket } from '../src/hub.js';

function fakeSocket(readyState = WS_OPEN): HubSocket & { sent: string[] } {
  const sent: string[] = [];
  return {
    readyState,
    send: (s: string) => { sent.push(s); },
    sent,
  };
}

describe('Hub', () => {
  it('count() reflects add and remove', () => {
    const hub = new Hub();
    const a = fakeSocket();
    const b = fakeSocket();
    expect(hub.count()).toBe(0);
    hub.addClient(a);
    hub.addClient(b);
    expect(hub.count()).toBe(2);
    hub.removeClient(a);
    expect(hub.count()).toBe(1);
  });

  it('broadcast() fans out to OPEN sockets only', () => {
    const hub = new Hub();
    const open1   = fakeSocket(WS_OPEN);
    const open2   = fakeSocket(WS_OPEN);
    const closing = fakeSocket(2);
    hub.addClient(open1);
    hub.addClient(open2);
    hub.addClient(closing);

    hub.broadcast('hello');

    expect(open1.sent).toEqual(['hello']);
    expect(open2.sent).toEqual(['hello']);
    expect(closing.sent).toEqual([]);
  });

  it('broadcast() does not call send on non-open sockets', () => {
    const hub = new Hub();
    const closed: HubSocket = { readyState: 3, send: vi.fn() };
    hub.addClient(closed);
    hub.broadcast('x');
    expect(closed.send).not.toHaveBeenCalled();
  });

  it('snapshot() returns a stable copy', () => {
    const hub = new Hub();
    const a = fakeSocket();
    hub.addClient(a);
    const snap = hub.snapshot();
    hub.removeClient(a);
    expect(snap).toEqual([a]);
    expect(hub.count()).toBe(0);
  });
});
