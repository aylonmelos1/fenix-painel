self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  event.waitUntil((async () => {
    const notificationId = Number(payload.notificationId) || null;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) client.postMessage({ type: 'fenix:push-received', notificationId });

    const hasVisiblePanel = windows.some((client) => {
      try {
        return client.visibilityState === 'visible' && new URL(client.url).pathname.startsWith('/painel');
      } catch {
        return false;
      }
    });
    if (hasVisiblePanel) return;

    const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title.slice(0, 120) : 'Atualização no Fênix Painel';
    const body = typeof payload.body === 'string' ? payload.body.slice(0, 220) : 'Há uma nova atualização nos processos acompanhados.';
    await self.registration.showNotification(title, {
      body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: notificationId ? `fenix-${notificationId}` : undefined,
      data: { notificationId, url: '/painel' }
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notificationId = Number(event.notification.data && event.notification.data.notificationId) || null;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const panel = windows.find((client) => {
      try {
        return new URL(client.url).origin === self.location.origin && new URL(client.url).pathname.startsWith('/painel');
      } catch {
        return false;
      }
    });
    if (panel) {
      await panel.focus();
      panel.postMessage({ type: 'fenix:push-click', notificationId });
      return;
    }

    const target = new URL('/painel', self.location.origin);
    if (notificationId) target.searchParams.set('pushNotification', String(notificationId));
    await self.clients.openWindow(target.toString());
  })());
});
