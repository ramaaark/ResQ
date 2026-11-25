let knownNotifIds = new Set();
let initializedPoll = false;

document.addEventListener('DOMContentLoaded', async () => {
  initImageLightbox();

  const authenticated = await verifySession();
  if (!authenticated) {
    return;
  }

  setupActions();
  await Promise.all([loadNotifications(), loadReportHistory()]);

  window.setInterval(async () => {
    await Promise.all([loadNotifications(), loadReportHistory()]);
  }, 8000);
});

async function verifySession() {
  try {
    const response = await fetch('../backend/api/session.php', { credentials: 'same-origin' });
    const data = await response.json();
    if (!data || !data.authenticated || !data.resident) {
      window.location.href = 'login.html';
      return false;
    }

    const greeting = document.getElementById('residentGreeting');
    if (greeting) {
      greeting.textContent = `${data.resident.full_name} â€¢ ${data.resident.address}`;
    }

    return true;
  } catch (err) {
    window.location.href = 'login.html';
    return false;
  }
}

function setupActions() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('../backend/api/logout.php', { method: 'POST', credentials: 'same-origin' });
      } finally {
        window.location.href = 'index.html';
      }
    });
  }

  const enablePushBtn = document.getElementById('enablePushBtn');
  if (enablePushBtn) {
    if (!('Notification' in window)) {
      enablePushBtn.classList.add('hidden');
    } else if (Notification.permission === 'granted') {
      enablePushBtn.textContent = 'Browser Alerts Enabled';
      enablePushBtn.disabled = true;
    }

    enablePushBtn.addEventListener('click', async () => {
      if (!('Notification' in window)) {
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        enablePushBtn.textContent = 'Browser Alerts Enabled';
        enablePushBtn.disabled = true;
        showToast('Browser status alerts enabled.', 'success');
      } else {
        showToast('Browser notifications were not granted. In-app alerts will remain active.', 'info');
      }
    });
  }

  const markAllBtn = document.getElementById('markAllReadBtn');
  if (markAllBtn) {
    markAllBtn.addEventListener('click', async () => {
      await fetch('../backend/api/notifications.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ mark_all: true }),
      });
      await loadNotifications();
      showToast('All status alerts marked as read.', 'success');
    });
  }
}

async function loadNotifications() {
  try {
    const response = await fetch('../backend/api/notifications.php', { credentials: 'same-origin' });
    const data = await response.json();
    if (!data || !data.success) {
      return;
    }

    const badge = document.getElementById('unreadNotifBadge');
    const unread = Number(data.unread_count || 0);
    if (badge) {
      badge.textContent = String(unread);
      badge.classList.toggle('hidden', unread === 0);
    }

    const container = document.getElementById('notificationsList');
    const list = Array.isArray(data.notifications) ? data.notifications : [];

    if (list.length === 0) {
      container.replaceChildren(
        createEl('p', {
          className: 'empty-state',
          text: 'No barangay response alerts yet. Alerts appear here as soon as officials respond to a report.',
        })
      );
      initializedPoll = true;
      return;
    }

    const nodes = list.map((item) => {
      const isUnread = Number(item.is_read) === 0;

      if (initializedPoll && !knownNotifIds.has(item.id) && isUnread) {
        showToast(`${item.title}: ${item.message}`, 'success');
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(item.title, { body: item.message });
        }
      }
      knownNotifIds.add(item.id);

      const statusClass = `badge-${String(item.status_at_event || 'pending').toLowerCase()}`;
      const infoBlock = createEl('div', {}, [
        createEl('div', { className: 'history-badges' }, [
          createEl('strong', { text: item.title }),
          createEl('span', { className: `badge ${statusClass}`, text: item.status_at_event }),
        ]),
        createEl('p', { className: 'field-hint', text: item.message }),
        createEl('p', {
          className: 'media-submeta',
          text: `Tracking: ${item.tracking_number} â€¢ ${formatReadableDateTime(item.created_at)}`,
        }),
      ]);

      const wrapper = createEl('div', {
        className: isUnread ? 'notif-item unread' : 'notif-item',
      }, [infoBlock]);

      if (isUnread) {
        const readBtn = createEl('button', {
          className: 'btn btn-primary btn-sm',
          text: 'Mark Read',
          attrs: { type: 'button' },
        });
        readBtn.addEventListener('click', async () => {
          await fetch('../backend/api/notifications.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ notification_id: item.id }),
          });
          await loadNotifications();
        });
        wrapper.appendChild(readBtn);
      }

      return wrapper;
    });

    container.replaceChildren(...nodes);
    initializedPoll = true;
  } catch (err) {
    return;
  }
}

async function loadReportHistory() {
  const container = document.getElementById('reportHistoryList');

  try {
    const response = await fetch('../backend/api/my_reports.php', { credentials: 'same-origin' });
    const data = await response.json();

    if (!data || !data.success) {
      return;
    }

    const reports = Array.isArray(data.reports) ? data.reports : [];
    if (reports.length === 0) {
      container.replaceChildren(
        createEl('p', {
          className: 'empty-state',
          text: 'You have not submitted any emergency reports yet.',
        })
      );
      return;
    }

    const cards = reports.map((report) => {
      const priorityClass = `badge-${String(report.priority || 'low').toLowerCase()}`;
      const statusClass = `badge-${String(report.status || 'pending').toLowerCase()}`;

      const topRow = createEl('div', { className: 'history-card-top' }, [
        createEl('span', { className: 'history-tracking', text: report.tracking_number }),
        createEl('div', { className: 'history-badges' }, [
          createEl('span', { className: 'badge badge-primary', text: report.category }),
          createEl('span', { className: `badge ${priorityClass}`, text: report.priority }),
          createEl('span', { className: `badge ${statusClass}`, text: report.status }),
        ]),
      ]);

      const coordsText = report.latitude && report.longitude
        ? ` (${report.latitude}, ${report.longitude})`
        : '';

      const metaGrid = createEl('div', { className: 'history-meta-grid' }, [
        createEl('span', { text: `Submitted: ${formatReadableDateTime(report.created_at)}` }),
        createEl('span', { text: `Contact: ${report.contact_number}` }),
        createEl('span', { text: `Location: ${report.location_description}${coordsText}` }),
      ]);

      const descP = createEl('p', { className: 'history-description', text: report.description });
      const children = [topRow, metaGrid, descP];

      if (report.status !== 'Pending' || report.admin_notes) {
        const responderText = report.responder_name ? ` by ${report.responder_name}` : '';
        const noteText = report.admin_notes ? ` â€” Note: ${report.admin_notes}` : '';
        children.push(
          createEl('div', {
            className: 'history-staff-note',
            text: `Barangay Staff Response: Status is ${report.status}${responderText}${noteText}`,
          })
        );
      }

      if (Array.isArray(report.media) && report.media.length > 0) {
        const strip = createEl('div', { className: 'history-media-strip' });
        report.media.forEach((m) => {
          if (m.media_type === 'photo') {
            strip.appendChild(
              createEl('img', {
                className: 'media-thumb-img enlargeable-image',
                attrs: {
                  src: m.url,
                  alt: m.original_name,
                  title: 'Click to enlarge photo',
                },
              })
            );
          } else if (m.media_type === 'video') {
            strip.appendChild(
              createEl('video', {
                className: 'media-inline-video',
                attrs: { src: m.url, controls: '' },
              })
            );
          } else {
            strip.appendChild(
              createEl('audio', {
                className: 'media-inline-audio',
                attrs: { src: m.url, controls: '' },
              })
            );
          }
        });
        children.push(strip);
      }

      return createEl('article', { className: 'history-card' }, children);
    });

    container.replaceChildren(...cards);
  } catch (err) {
    container.replaceChildren(
      createEl('p', { className: 'empty-state', text: 'Unable to load report history right now.' })
    );
  }
}
