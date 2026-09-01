self.addEventListener('push', function (event) {
  let data = { title: 'Prayer reminder', body: 'You have new prayer points to pray through.' };
  try { data = event.data.json(); } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Prayer reminder', {
      body: data.body || '',
      icon: '/icon.png',
      badge: '/icon.png',
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
