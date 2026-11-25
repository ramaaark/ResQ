const ADMIN_FILTER_STORAGE_KEY = 'resq_admin_dashboard_filters';

let adminState = {
  search: '',
  date: '',
  priority: '',
  category: '',
  archived: 0,
};

let chartInstances = {
  statusPie: null,
  categoryBar: null,
  priorityBar: null,
  dateLine: null,
};

let knownReportIds = new Set();
let hasLoadedReportsOnce = false;
let detailMap = null;
let activeDetailReportId = null;
let searchDebounceTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  initImageLightbox();
  initConfirmModal();

  const authenticated = await verifyAdminSession();
  if (!authenticated) {
    return;
  }

  restoreSavedFilters();
  bindDashboardControls();
  await fetchAndRenderReports(false);

  window.setInterval(() => {
    fetchAndRenderReports(true);
  }, 10000);
});

async function verifyAdminSession() {
  try {
    const response = await fetch('../backend/api/session.php', { credentials: 'same-origin' });
    const data = await response.json();

    if (!data || !data.authenticated || !data.admin) {
      window.location.href = 'login.html';
      return false;
    }

    const identityEl = document.getElementById('adminIdentityText');
    if (identityEl) {
      identityEl.textContent = `${data.admin.full_name} â€¢ ${data.admin.role_title}`;
    }

    return true;
  } catch (err) {
    window.location.href = 'login.html';
    return false;
  }
}

function restoreSavedFilters() {
  const saved = loadAdminStorage(ADMIN_FILTER_STORAGE_KEY);
  if (saved) {
    adminState.search = typeof saved.search === 'string' ? saved.search : '';
    adminState.date = typeof saved.date === 'string' ? saved.date : '';
    adminState.priority = typeof saved.priority === 'string' ? saved.priority : '';
    adminState.category = typeof saved.category === 'string' ? saved.category : '';
    adminState.archived = saved.archived === 1 ? 1 : 0;
  }

  document.getElementById('searchInput').value = adminState.search;
  document.getElementById('dateFilter').value = adminState.date;
  document.getElementById('priorityFilter').value = adminState.priority;
  document.getElementById('categoryFilter').value = adminState.category;
  syncTabButtons();
}

function persistFilters() {
  saveAdminStorage(ADMIN_FILTER_STORAGE_KEY, adminState);
}

function syncTabButtons() {
  const activeTab = document.getElementById('tabActiveReports');
  const archivedTab = document.getElementById('tabArchivedReports');

  const isArchived = adminState.archived === 1;
  activeTab.classList.toggle('active', !isArchived);
  activeTab.setAttribute('aria-selected', !isArchived ? 'true' : 'false');

  archivedTab.classList.toggle('active', isArchived);
  archivedTab.setAttribute('aria-selected', isArchived ? 'true' : 'false');
}

function bindDashboardControls() {
  const searchInput = document.getElementById('searchInput');
  const dateFilter = document.getElementById('dateFilter');
  const priorityFilter = document.getElementById('priorityFilter');
  const categoryFilter = document.getElementById('categoryFilter');
  const clearFiltersBtn = document.getElementById('clearFiltersBtn');

  searchInput.addEventListener('input', () => {
    adminState.search = searchInput.value.trim();
    persistFilters();
    window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(() => {
      fetchAndRenderReports(false);
    }, 220);
  });

  dateFilter.addEventListener('change', () => {
    adminState.date = dateFilter.value;
    persistFilters();
    fetchAndRenderReports(false);
  });

  priorityFilter.addEventListener('change', () => {
    adminState.priority = priorityFilter.value;
    persistFilters();
    fetchAndRenderReports(false);
  });

  categoryFilter.addEventListener('change', () => {
    adminState.category = categoryFilter.value;
    persistFilters();
    fetchAndRenderReports(false);
  });

  clearFiltersBtn.addEventListener('click', () => {
    adminState.search = '';
    adminState.date = '';
    adminState.priority = '';
    adminState.category = '';
    searchInput.value = '';
    dateFilter.value = '';
    priorityFilter.value = '';
    categoryFilter.value = '';
    persistFilters();
    fetchAndRenderReports(false);
  });

  document.getElementById('tabActiveReports').addEventListener('click', () => {
    adminState.archived = 0;
    syncTabButtons();
    persistFilters();
    fetchAndRenderReports(false);
  });

  document.getElementById('tabArchivedReports').addEventListener('click', () => {
    adminState.archived = 1;
    syncTabButtons();
    persistFilters();
    fetchAndRenderReports(false);
  });

  document.getElementById('printReportBtn').addEventListener('click', () => {
    const printMeta = document.getElementById('printTimestampText');
    if (printMeta) {
      printMeta.textContent = `Printed on ${new Date().toLocaleString()}`;
    }
    window.print();
  });

  document.getElementById('exportCsvBtn').addEventListener('click', () => {
    const query = buildQueryParams();
    window.location.href = `api/export_csv.php?${query.toString()}`;
  });

  document.getElementById('adminLogoutBtn').addEventListener('click', async () => {
    try {
      await fetch('../backend/api/logout.php', { method: 'POST', credentials: 'same-origin' });
    } finally {
      window.location.href = 'index.html';
    }
  });

  const detailModal = document.getElementById('reportDetailModal');
  document.getElementById('closeDetailModalBtn').addEventListener('click', closeDetailModal);
  detailModal.addEventListener('click', (event) => {
    if (event.target === detailModal) {
      closeDetailModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeDetailModal();
    }
  });

  document.getElementById('saveDetailStatusBtn').addEventListener('click', async () => {
    if (!activeDetailReportId) {
      return;
    }
    const statusVal = document.getElementById('detailStatusSelect').value;
    const notesVal = document.getElementById('detailAdminNotes').value.trim();
    const updated = await updateReportStatus(activeDetailReportId, statusVal, notesVal);
    if (updated) {
      closeDetailModal();
    }
  });
}

function buildQueryParams() {
  const params = new URLSearchParams();
  if (adminState.search) params.set('search', adminState.search);
  if (adminState.date) params.set('date', adminState.date);
  if (adminState.priority) params.set('priority', adminState.priority);
  if (adminState.category) params.set('category', adminState.category);
  params.set('archived', String(adminState.archived));
  return params;
}

async function fetchAndRenderReports(isBackgroundPoll) {
  try {
    const params = buildQueryParams();
    const response = await fetch(`api/reports.php?${params.toString()}`, {
      credentials: 'same-origin',
    });

    if (response.status === 401) {
      window.location.href = 'login.html';
      return;
    }

    const data = await response.json();
    if (!data || !data.success) {
      return;
    }

    updateKpis(data.kpi);
    renderCharts(data.charts);
    renderReportsTable(data.reports);

    if (adminState.archived === 0) {
      data.reports.forEach((report) => {
        if (hasLoadedReportsOnce && isBackgroundPoll && !knownReportIds.has(report.id)) {
          showToast(`New emergency report received: ${report.tracking_number} (${report.category})`, 'success');
        }
        knownReportIds.add(report.id);
      });
      hasLoadedReportsOnce = true;
    }
  } catch (err) {
    if (!isBackgroundPoll) {
      showToast('Unable to fetch reports from database.', 'error');
    }
  }
}

function updateKpis(kpi) {
  if (!kpi) {
    return;
  }
  document.getElementById('kpiTotal').textContent = String(kpi.total ?? 0);
  document.getElementById('kpiPending').textContent = String(kpi.pending ?? 0);
  document.getElementById('kpiResponding').textContent = String(kpi.responding ?? 0);
  document.getElementById('kpiResolved').textContent = String(kpi.resolved ?? 0);
  document.getElementById('archivedCountBadge').textContent = String(kpi.archived ?? 0);
}

function renderCharts(charts) {
  if (!charts || typeof Chart === 'undefined') {
    return;
  }

  const statusData = charts.status_distribution || { Pending: 0, Responding: 0, Resolved: 0 };
  const categoryData = charts.by_category || {};
  const priorityData = charts.by_priority || { LOW: 0, MEDIUM: 0, HIGH: 0 };
  const dateSeries = Array.isArray(charts.by_date) ? charts.by_date : [];

  const pieCanvas = document.getElementById('statusPieChart');
  const catCanvas = document.getElementById('categoryBarChart');
  const prioCanvas = document.getElementById('priorityBarChart');
  const dateCanvas = document.getElementById('dateLineChart');

  if (chartInstances.statusPie) {
    chartInstances.statusPie.data.datasets[0].data = [
      statusData.Pending || 0,
      statusData.Responding || 0,
      statusData.Resolved || 0,
    ];
    chartInstances.statusPie.update();
  } else {
    chartInstances.statusPie = new Chart(pieCanvas, {
      type: 'pie',
      data: {
        labels: ['Pending', 'Responding', 'Resolved'],
        datasets: [{
          data: [
            statusData.Pending || 0,
            statusData.Responding || 0,
            statusData.Resolved || 0,
          ],
          backgroundColor: ['#ffcc00', '#333399', '#1b7a46'],
          borderColor: '#ffffff',
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
        },
      },
    });
  }

  const catLabels = ['Crime', 'Accident', 'Fire', 'Medical Emergency', 'Others'];
  const catValues = catLabels.map((label) => categoryData[label] || 0);

  if (chartInstances.categoryBar) {
    chartInstances.categoryBar.data.datasets[0].data = catValues;
    chartInstances.categoryBar.update();
  } else {
    chartInstances.categoryBar = new Chart(catCanvas, {
      type: 'bar',
      data: {
        labels: catLabels,
        datasets: [{
          label: 'Incidents',
          data: catValues,
          backgroundColor: '#333399',
          borderColor: '#ffcc00',
          borderWidth: 2,
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
          },
        },
      },
    });
  }

  const prioLabels = ['LOW', 'MEDIUM', 'HIGH'];
  const prioValues = prioLabels.map((label) => priorityData[label] || 0);

  if (chartInstances.priorityBar) {
    chartInstances.priorityBar.data.datasets[0].data = prioValues;
    chartInstances.priorityBar.update();
  } else {
    chartInstances.priorityBar = new Chart(prioCanvas, {
      type: 'bar',
      data: {
        labels: prioLabels,
        datasets: [{
          label: 'Incidents',
          data: prioValues,
          backgroundColor: ['#1b7a46', '#ffcc00', '#c62828'],
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
          },
        },
      },
    });
  }

  const dateLabels = dateSeries.map((d) => d.date);
  const dateValues = dateSeries.map((d) => d.count);

  if (chartInstances.dateLine) {
    chartInstances.dateLine.data.labels = dateLabels;
    chartInstances.dateLine.data.datasets[0].data = dateValues;
    chartInstances.dateLine.update();
  } else {
    chartInstances.dateLine = new Chart(dateCanvas, {
      type: 'line',
      data: {
        labels: dateLabels,
        datasets: [{
          label: 'Submitted Reports',
          data: dateValues,
          borderColor: '#333399',
          backgroundColor: 'rgba(51, 51, 153, 0.14)',
          pointBackgroundColor: '#ffcc00',
          pointBorderColor: '#333399',
          pointBorderWidth: 2,
          pointRadius: 5,
          fill: true,
          tension: 0.28,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
          },
        },
      },
    });
  }
}

function renderReportsTable(reports) {
  const tbody = document.getElementById('reportsTableBody');

  if (!Array.isArray(reports) || reports.length === 0) {
    const emptyMessage = adminState.archived === 1
      ? 'No archived reports found.'
      : 'No emergency reports match the current search or filters.';
    tbody.replaceChildren(
      createEl('tr', {}, [
        createEl('td', {
          className: 'empty-cell',
          text: emptyMessage,
          attrs: { colspan: '10' },
        }),
      ])
    );
    return;
  }

  const rows = reports.map((report) => {
    const priorityClass = `badge-${String(report.priority || 'low').toLowerCase()}`;
    const statusClass = `badge-${String(report.status || 'pending').toLowerCase()}`;

    const coordsText = report.latitude && report.longitude
      ? `${report.latitude}, ${report.longitude}`
      : 'No GPS coordinates';

    const mediaItems = Array.isArray(report.media) ? report.media : [];
    const counts = report.media_counts || { photo: 0, video: 0, audio: 0 };

    const countPills = [];
    if (counts.photo > 0) countPills.push(createEl('span', { className: 'media-pill', text: `${counts.photo} Photo` }));
    if (counts.video > 0) countPills.push(createEl('span', { className: 'media-pill', text: `${counts.video} Video` }));
    if (counts.audio > 0) countPills.push(createEl('span', { className: 'media-pill', text: `${counts.audio} Audio` }));
    if (countPills.length === 0) {
      countPills.push(createEl('span', { className: 'sub-meta', text: 'None' }));
    }

    const mediaCellContent = createEl('div', { className: 'media-indicators' }, [
      createEl('div', { className: 'media-count-row' }, countPills),
    ]);

    const photoItems = mediaItems.filter((m) => m.media_type === 'photo');
    if (photoItems.length > 0) {
      const thumbRow = createEl('div', { className: 'table-thumb-row' });
      photoItems.slice(0, 3).forEach((photo) => {
        thumbRow.appendChild(
          createEl('img', {
            className: 'table-thumb-img enlargeable-image',
            attrs: {
              src: photo.url,
              alt: `${report.tracking_number} â€” ${photo.original_name}`,
              title: 'Click to enlarge photo',
            },
          })
        );
      });
      mediaCellContent.appendChild(thumbRow);
    }

    const actionChildren = [];

    if (adminState.archived === 0) {
      const statusSelect = createEl('select', {
        className: 'status-select',
        attrs: { 'aria-label': `Update status for ${report.tracking_number}` },
      }, [
        createEl('option', { text: 'Pending', attrs: { value: 'Pending' } }),
        createEl('option', { text: 'Responding', attrs: { value: 'Responding' } }),
        createEl('option', { text: 'Resolved', attrs: { value: 'Resolved' } }),
      ]);
      statusSelect.value = report.status;

      statusSelect.addEventListener('change', async () => {
        await updateReportStatus(report.id, statusSelect.value, report.admin_notes || '');
      });

      actionChildren.push(statusSelect);
    }

    const detailBtn = createEl('button', {
      className: 'btn btn-outline btn-sm',
      text: 'View Details',
      attrs: { type: 'button' },
    });
    detailBtn.addEventListener('click', () => openDetailModal(report));
    actionChildren.push(detailBtn);

    if (adminState.archived === 0) {
      const archiveBtn = createEl('button', {
        className: 'btn btn-danger btn-sm',
        text: 'Archive',
        attrs: { type: 'button' },
      });
      archiveBtn.addEventListener('click', () => {
        openConfirmModal({
          title: 'Archive Incident Report',
          message: `Move report ${report.tracking_number} to Archived Records? The record remains preserved in the database (logical deletion).`,
          confirmText: 'Archive Report',
          confirmClass: 'btn btn-danger',
          onConfirm: () => toggleReportArchive(report.id, false),
        });
      });
      actionChildren.push(archiveBtn);
    } else {
      const restoreBtn = createEl('button', {
        className: 'btn btn-primary btn-sm',
        text: 'Restore',
        attrs: { type: 'button' },
      });
      restoreBtn.addEventListener('click', () => {
        openConfirmModal({
          title: 'Restore Incident Report',
          message: `Restore report ${report.tracking_number} back to Active Reports?`,
          confirmText: 'Restore Report',
          confirmClass: 'btn btn-primary',
          onConfirm: () => toggleReportArchive(report.id, true),
        });
      });
      actionChildren.push(restoreBtn);
    }

    return createEl('tr', {}, [
      createEl('td', {}, [
        createEl('span', { className: 'tracking-cell', text: report.tracking_number }),
      ]),
      createEl('td', {}, [
        createEl('strong', { text: report.contact_number }),
        createEl('span', { className: 'sub-meta', text: report.resident_name }),
      ]),
      createEl('td', { text: report.category }),
      createEl('td', {}, [
        createEl('span', { className: `badge ${priorityClass}`, text: report.priority }),
      ]),
      createEl('td', {}, [
        createEl('span', { text: report.location_description }),
        createEl('span', { className: 'sub-meta', text: coordsText }),
      ]),
      createEl('td', {}, [mediaCellContent]),
      createEl('td', {}, [
        createEl('div', { className: 'desc-summary', text: report.description }),
      ]),
      createEl('td', {}, [
        createEl('span', { text: formatReadableDateTime(report.created_at) }),
      ]),
      createEl('td', {}, [
        createEl('span', { className: `badge ${statusClass}`, text: report.status }),
      ]),
      createEl('td', {}, [
        createEl('div', { className: 'row-actions' }, actionChildren),
      ]),
    ]);
  });

  tbody.replaceChildren(...rows);
}

async function updateReportStatus(reportId, status, adminNotes) {
  try {
    const response = await fetch('../backend/api/update_status.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        report_id: reportId,
        status,
        admin_notes: adminNotes,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      showToast(data.message || 'Unable to update report status.', 'error');
      await fetchAndRenderReports(false);
      return false;
    }

    showToast(data.message || 'Status updated.', 'success');
    await fetchAndRenderReports(false);
    return true;
  } catch (err) {
    showToast('Network error updating report status.', 'error');
    return false;
  }
}

async function toggleReportArchive(reportId, restore) {
  try {
    const response = await fetch('../backend/api/archive_report.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        report_id: reportId,
        restore,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      showToast(data.message || 'Unable to update archive state.', 'error');
      return;
    }

    showToast(data.message, 'success');
    await fetchAndRenderReports(false);
  } catch (err) {
    showToast('Network error updating archive state.', 'error');
  }
}

function openDetailModal(report) {
  activeDetailReportId = report.id;

  const modal = document.getElementById('reportDetailModal');
  document.getElementById('detailTracking').textContent = report.tracking_number;
  document.getElementById('detailResident').textContent = `${report.resident_name} â€¢ ${report.contact_number}`;
  document.getElementById('detailCategoryPriority').textContent = `${report.category} (${report.priority} Priority)`;
  document.getElementById('detailTimestamp').textContent = formatReadableDateTime(report.created_at);

  const coordsPart = report.latitude && report.longitude
    ? ` â€” GPS: ${report.latitude}, ${report.longitude}`
    : '';
  document.getElementById('detailLocation').textContent = `${report.location_description}${coordsPart}`;
  document.getElementById('detailDescription').textContent = report.description;
  document.getElementById('detailAdminNotes').value = report.admin_notes || '';

  const detailStatusSelect = document.getElementById('detailStatusSelect');
  const saveDetailBtn = document.getElementById('saveDetailStatusBtn');
  const notesField = document.getElementById('detailAdminNotes');

  detailStatusSelect.value = report.status;
  const isArchived = Number(report.is_deleted) === 1;
  detailStatusSelect.disabled = isArchived;
  saveDetailBtn.disabled = isArchived;
  notesField.disabled = isArchived;

  const gallery = document.getElementById('detailMediaGallery');
  gallery.replaceChildren();

  const mediaList = Array.isArray(report.media) ? report.media : [];
  if (mediaList.length === 0) {
    gallery.appendChild(createEl('span', { className: 'sub-meta', text: 'No media attachments submitted.' }));
  } else {
    mediaList.forEach((m) => {
      if (m.media_type === 'photo') {
        gallery.appendChild(
          createEl('img', {
            className: 'detail-photo-img enlargeable-image',
            attrs: {
              src: m.url,
              alt: `${report.tracking_number} â€” ${m.original_name}`,
              title: 'Click to enlarge photo',
            },
          })
        );
      } else if (m.media_type === 'video') {
        gallery.appendChild(
          createEl('video', {
            className: 'detail-video',
            attrs: { src: m.url, controls: '' },
          })
        );
      } else {
        gallery.appendChild(
          createEl('audio', {
            className: 'detail-audio',
            attrs: { src: m.url, controls: '' },
          })
        );
      }
    });
  }

  const mapContainer = document.getElementById('detailMapContainer');
  if (detailMap) {
    detailMap.remove();
    detailMap = null;
  }

  if (report.latitude && report.longitude && typeof L !== 'undefined') {
    mapContainer.classList.remove('hidden');
    modal.classList.remove('hidden');

    const latNum = Number(report.latitude);
    const lngNum = Number(report.longitude);

    detailMap = L.map(mapContainer).setView([latNum, lngNum], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(detailMap);

    const pinIcon = L.divIcon({
      className: 'resq-map-pin',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    L.marker([latNum, lngNum], { icon: pinIcon }).addTo(detailMap);
  } else {
    mapContainer.classList.add('hidden');
    modal.classList.remove('hidden');
  }
}

function closeDetailModal() {
  const modal = document.getElementById('reportDetailModal');
  if (!modal) {
    return;
  }
  modal.classList.add('hidden');
  activeDetailReportId = null;
  if (detailMap) {
    detailMap.remove();
    detailMap = null;
  }
}
