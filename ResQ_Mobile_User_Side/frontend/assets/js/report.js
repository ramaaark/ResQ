const REPORT_DRAFT_KEY = 'resq_resident_report_draft';

let residentProfile = null;
let attachedMedia = [];
let mapInstance = null;
let mapMarker = null;
let mediaRecorder = null;
let recordingChunks = [];
let activeRecordingStream = null;
let knownNotificationIds = new Set();
let hasLoadedNotificationsOnce = false;

document.addEventListener('DOMContentLoaded', async () => {
  initImageLightbox();

  const authenticated = await verifyResidentSession();
  if (!authenticated) {
    return;
  }

  setupLogoutButton();
  setupDateRestriction();
  initMapPicker();
  await restoreDraftState();
  bindFormListeners();
  updateSummaryPreview();
  detectGpsLocation(true);
  await pollNotifications();
  window.setInterval(pollNotifications, 8000);
});

async function verifyResidentSession() {
  try {
    const response = await fetch('../backend/api/session.php', { credentials: 'same-origin' });
    const data = await response.json();
    if (!data || !data.authenticated || !data.resident) {
      window.location.href = 'login.html';
      return false;
    }

    residentProfile = data.resident;
    const greeting = document.getElementById('residentGreeting');
    if (greeting) {
      greeting.textContent = `${residentProfile.full_name} â€¢ ${residentProfile.address}`;
    }

    return true;
  } catch (err) {
    window.location.href = 'login.html';
    return false;
  }
}

function setupLogoutButton() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (!logoutBtn) {
    return;
  }

  logoutBtn.addEventListener('click', async () => {
    try {
      await fetch('../backend/api/logout.php', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } finally {
      window.location.href = 'index.html';
    }
  });
}

function setupDateRestriction() {
  const dateInput = document.getElementById('incidentDate');
  const today = getLocalTodayString();
  dateInput.min = today;
  dateInput.max = today;
  if (!dateInput.value || dateInput.value < today || dateInput.value > today) {
    dateInput.value = today;
  }
}

function initMapPicker() {
  const mapEl = document.getElementById('residentMap');
  if (!mapEl || typeof L === 'undefined') {
    return;
  }

  const defaultLat = 14.5995;
  const defaultLng = 120.9842;

  mapInstance = L.map(mapEl).setView([defaultLat, defaultLng], 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
  }).addTo(mapInstance);

  mapInstance.on('click', (event) => {
    const { lat, lng } = event.latlng;
    setCoordinates(lat, lng, 'Pinned on map');
    reverseGeocodeLocation(lat, lng);
  });
}

function setCoordinates(lat, lng, statusMessage) {
  const latInput = document.getElementById('latitudeInput');
  const lngInput = document.getElementById('longitudeInput');
  const gpsStatus = document.getElementById('gpsStatusText');

  const formattedLat = Number(lat).toFixed(6);
  const formattedLng = Number(lng).toFixed(6);

  latInput.value = formattedLat;
  lngInput.value = formattedLng;

  if (gpsStatus && statusMessage) {
    gpsStatus.textContent = `${statusMessage}: ${formattedLat}, ${formattedLng}`;
  }

  if (mapInstance && typeof L !== 'undefined') {
    const coords = [Number(formattedLat), Number(formattedLng)];
    if (!mapMarker) {
      const pinIcon = L.divIcon({
        className: 'resq-map-pin',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      mapMarker = L.marker(coords, { icon: pinIcon, draggable: true }).addTo(mapInstance);
      mapMarker.on('dragend', () => {
        const pos = mapMarker.getLatLng();
        setCoordinates(pos.lat, pos.lng, 'Adjusted pin');
        reverseGeocodeLocation(pos.lat, pos.lng);
      });
    } else {
      mapMarker.setLatLng(coords);
    }
    mapInstance.setView(coords, Math.max(mapInstance.getZoom(), 16));
  }

  persistFormDraft();
  updateSummaryPreview();
}

function detectGpsLocation(isSilentAuto = false) {
  const gpsStatus = document.getElementById('gpsStatusText');
  const latInput = document.getElementById('latitudeInput');
  const lngInput = document.getElementById('longitudeInput');

  if (isSilentAuto && latInput.value.trim() !== '' && lngInput.value.trim() !== '') {
    setCoordinates(Number(latInput.value), Number(lngInput.value), 'Restored GPS coordinates');
    return;
  }

  if (!('geolocation' in navigator)) {
    if (gpsStatus) {
      gpsStatus.textContent = 'GPS not supported on this device. Tap map or type coordinates.';
    }
    return;
  }

  if (gpsStatus) {
    gpsStatus.textContent = 'Detecting current GPS coordinates...';
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      setCoordinates(latitude, longitude, 'GPS locked');
      reverseGeocodeLocation(latitude, longitude);
      if (!isSilentAuto) {
        showToast('GPS coordinates updated.', 'success');
      }
    },
    () => {
      if (gpsStatus) {
        gpsStatus.textContent = 'GPS unavailable. Click the map or enter location manually.';
      }
      if (!isSilentAuto) {
        showToast('Could not detect GPS. Please click on the map or enter location details.', 'info');
      }
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
  );
}

async function reverseGeocodeLocation(lat, lng) {
  const locationInput = document.getElementById('locationDescription');
  if (!locationInput || locationInput.value.trim() !== '') {
    return;
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
    const response = await fetch(url);
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    if (data && data.display_name && locationInput.value.trim() === '') {
      locationInput.value = data.display_name;
      persistFormDraft();
      updateSummaryPreview();
    }
  } catch (err) {
    return;
  }
}

async function restoreDraftState() {
  const draft = loadDraftValue(REPORT_DRAFT_KEY);
  const contactInput = document.getElementById('contactNumber');
  const dateInput = document.getElementById('incidentDate');
  const latInput = document.getElementById('latitudeInput');
  const lngInput = document.getElementById('longitudeInput');
  const locationInput = document.getElementById('locationDescription');
  const descInput = document.getElementById('incidentDescription');
  const truthfulCheckbox = document.getElementById('truthfulCheckbox');
  const submitBtn = document.getElementById('submitReportBtn');

  const today = getLocalTodayString();

  if (draft) {
    if (draft.category) {
      const radio = Array.from(document.querySelectorAll('input[name="category"]'))
        .find((el) => el.value === draft.category);
      if (radio) radio.checked = true;
    }

    if (draft.priority) {
      const radio = Array.from(document.querySelectorAll('input[name="priority"]'))
        .find((el) => el.value === draft.priority);
      if (radio) radio.checked = true;
    }

    if (typeof draft.contact_number === 'string' && draft.contact_number !== '') {
      contactInput.value = draft.contact_number;
    } else if (residentProfile && residentProfile.contact_number) {
      contactInput.value = residentProfile.contact_number;
    }

    if (typeof draft.incident_date === 'string' && draft.incident_date === today) {
      dateInput.value = draft.incident_date;
    } else {
      dateInput.value = today;
    }

    if (typeof draft.latitude === 'string') latInput.value = draft.latitude;
    if (typeof draft.longitude === 'string') lngInput.value = draft.longitude;
    if (typeof draft.location_description === 'string') locationInput.value = draft.location_description;
    if (typeof draft.description === 'string') descInput.value = draft.description;

    truthfulCheckbox.checked = Boolean(draft.truthful_confirmed);
  } else if (residentProfile && residentProfile.contact_number) {
    contactInput.value = residentProfile.contact_number;
  }

  submitBtn.disabled = !truthfulCheckbox.checked;
  updateDescCharCount();

  if (latInput.value.trim() !== '' && lngInput.value.trim() !== '') {
    const latNum = Number(latInput.value);
    const lngNum = Number(lngInput.value);
    if (!Number.isNaN(latNum) && !Number.isNaN(lngNum)) {
      setCoordinates(latNum, lngNum, 'Restored coordinates');
    }
  }

  const restoredMedia = await loadMediaDrafts();
  if (restoredMedia.length > 0) {
    attachedMedia = restoredMedia.map((item) => ({
      ...item,
      previewUrl: URL.createObjectURL(item.file),
    }));
    renderAttachedMedia();
  }
}

function getSelectedRadioValue(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : '';
}

function persistFormDraft() {
  saveDraftValue(REPORT_DRAFT_KEY, {
    category: getSelectedRadioValue('category'),
    priority: getSelectedRadioValue('priority'),
    contact_number: document.getElementById('contactNumber').value,
    incident_date: document.getElementById('incidentDate').value,
    latitude: document.getElementById('latitudeInput').value,
    longitude: document.getElementById('longitudeInput').value,
    location_description: document.getElementById('locationDescription').value,
    description: document.getElementById('incidentDescription').value,
    truthful_confirmed: document.getElementById('truthfulCheckbox').checked,
  });
}

function updateDescCharCount() {
  const descInput = document.getElementById('incidentDescription');
  const counter = document.getElementById('descCharCount');
  if (descInput && counter) {
    counter.textContent = String(descInput.value.length);
  }
}

function bindFormListeners() {
  const form = document.getElementById('emergencyReportForm');
  const contactInput = document.getElementById('contactNumber');
  const dateInput = document.getElementById('incidentDate');
  const latInput = document.getElementById('latitudeInput');
  const lngInput = document.getElementById('longitudeInput');
  const locationInput = document.getElementById('locationDescription');
  const descInput = document.getElementById('incidentDescription');
  const truthfulCheckbox = document.getElementById('truthfulCheckbox');
  const submitBtn = document.getElementById('submitReportBtn');

  document.querySelectorAll('input[name="category"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      clearFieldError(null, document.getElementById('categoryError'));
      persistFormDraft();
      updateSummaryPreview();
    });
  });

  document.querySelectorAll('input[name="priority"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      clearFieldError(null, document.getElementById('priorityError'));
      persistFormDraft();
      updateSummaryPreview();
    });
  });

  contactInput.addEventListener('input', () => {
    clearFieldError(contactInput, document.getElementById('contactNumberError'));
    persistFormDraft();
    updateSummaryPreview();
  });

  dateInput.addEventListener('change', () => {
    const today = getLocalTodayString();
    const errEl = document.getElementById('incidentDateError');
    if (dateInput.value < today) {
      setFieldError(dateInput, errEl, 'Backdating is not allowed. Date reset to today.');
      dateInput.value = today;
      showToast('Backdating is not allowed for emergency reports.', 'error');
    } else if (dateInput.value > today) {
      setFieldError(dateInput, errEl, 'Future dates are not allowed. Date reset to today.');
      dateInput.value = today;
    } else {
      clearFieldError(dateInput, errEl);
    }
    persistFormDraft();
    updateSummaryPreview();
  });

  [latInput, lngInput].forEach((input) => {
    input.addEventListener('input', () => {
      persistFormDraft();
      updateSummaryPreview();
    });
  });

  locationInput.addEventListener('input', () => {
    clearFieldError(locationInput, document.getElementById('locationDescriptionError'));
    persistFormDraft();
    updateSummaryPreview();
  });

  descInput.addEventListener('input', () => {
    clearFieldError(descInput, document.getElementById('incidentDescriptionError'));
    updateDescCharCount();
    persistFormDraft();
    updateSummaryPreview();
  });

  truthfulCheckbox.addEventListener('change', () => {
    submitBtn.disabled = !truthfulCheckbox.checked;
    clearFieldError(null, document.getElementById('truthfulCheckboxError'));
    persistFormDraft();
  });

  const detectGpsBtn = document.getElementById('detectGpsBtn');
  if (detectGpsBtn) {
    detectGpsBtn.addEventListener('click', () => detectGpsLocation(false));
  }

  document.getElementById('photoUploadInput').addEventListener('change', (e) => {
    handleFileSelections(e.target.files, 'photo');
    e.target.value = '';
  });

  document.getElementById('videoUploadInput').addEventListener('change', (e) => {
    handleFileSelections(e.target.files, 'video');
    e.target.value = '';
  });

  document.getElementById('audioUploadInput').addEventListener('change', (e) => {
    handleFileSelections(e.target.files, 'audio');
    e.target.value = '';
  });

  setupVoiceRecorder();

  const copyBtn = document.getElementById('copyTrackingBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const code = document.getElementById('generatedTrackingCode').textContent;
      try {
        await navigator.clipboard.writeText(code);
        showToast(`Tracking number ${code} copied.`, 'success');
      } catch (err) {
        showToast(`Tracking number: ${code}`, 'info');
      }
    });
  }

  const anotherBtn = document.getElementById('submitAnotherBtn');
  if (anotherBtn) {
    anotherBtn.addEventListener('click', () => {
      document.getElementById('trackingSuccessSection').classList.add('hidden');
      form.classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  form.addEventListener('submit', handleReportSubmit);
}

async function handleFileSelections(fileList, mediaType) {
  const mediaErrorEl = document.getElementById('mediaError');
  mediaErrorEl.textContent = '';

  const maxSizeMap = {
    photo: 10 * 1024 * 1024,
    video: 50 * 1024 * 1024,
    audio: 20 * 1024 * 1024,
  };

  Array.from(fileList || []).forEach((file) => {
    if (file.size > maxSizeMap[mediaType]) {
      mediaErrorEl.textContent = `${file.name} exceeds the maximum size limit.`;
      return;
    }

    const id = `${mediaType}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    attachedMedia.push({
      id,
      mediaType,
      file,
      previewUrl: URL.createObjectURL(file),
    });
  });

  await saveMediaDrafts(attachedMedia);
  renderAttachedMedia();
  updateSummaryPreview();
}

function setupVoiceRecorder() {
  const recordBtn = document.getElementById('recordVoiceBtn');
  const recordingStatus = document.getElementById('recordingStatus');
  if (!recordBtn) {
    return;
  }

  recordBtn.addEventListener('click', async () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      recordBtn.textContent = 'Record Voice';
      recordingStatus.classList.add('hidden');
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      showToast('Live voice recording is unavailable in this browser. Use the audio file upload instead.', 'info');
      return;
    }

    try {
      activeRecordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingChunks = [];
      mediaRecorder = new MediaRecorder(activeRecordingStream);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordingChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (activeRecordingStream) {
          activeRecordingStream.getTracks().forEach((t) => t.stop());
          activeRecordingStream = null;
        }

        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(recordingChunks, { type: mimeType });
        const voiceFile = new File([blob], `voice_note_${Date.now()}.${ext}`, { type: mimeType });

        attachedMedia.push({
          id: `audio_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
          mediaType: 'audio',
          file: voiceFile,
          previewUrl: URL.createObjectURL(voiceFile),
        });

        await saveMediaDrafts(attachedMedia);
        renderAttachedMedia();
        updateSummaryPreview();
        showToast('Voice recording attached to report.', 'success');
      };

      mediaRecorder.start();
      recordBtn.textContent = 'Stop Recording';
      recordingStatus.classList.remove('hidden');
    } catch (err) {
      showToast('Microphone permission denied or unavailable.', 'error');
    }
  });
}

function renderAttachedMedia() {
  const listEl = document.getElementById('attachedMediaList');
  listEl.replaceChildren();

  attachedMedia.forEach((item) => {
    const row = createEl('div', { className: 'media-preview-item' });
    const left = createEl('div', { className: 'media-item-left' });

    if (item.mediaType === 'photo') {
      const img = createEl('img', {
        className: 'media-thumb-img enlargeable-image',
        attrs: {
          src: item.previewUrl,
          alt: item.file.name,
          title: 'Click to enlarge image',
        },
      });
      left.appendChild(img);
    } else if (item.mediaType === 'video') {
      const video = createEl('video', {
        className: 'media-inline-video',
        attrs: { src: item.previewUrl, controls: '' },
      });
      left.appendChild(video);
    } else {
      const audio = createEl('audio', {
        className: 'media-inline-audio',
        attrs: { src: item.previewUrl, controls: '' },
      });
      left.appendChild(audio);
    }

    const sizeKb = Math.max(1, Math.round(item.file.size / 1024));
    const meta = createEl('div', { className: 'media-meta' }, [
      createEl('span', { className: 'media-filename', text: item.file.name }),
      createEl('span', { className: 'media-submeta', text: `${item.mediaType.toUpperCase()} â€¢ ${sizeKb} KB` }),
    ]);
    left.appendChild(meta);

    const removeBtn = createEl('button', {
      className: 'btn btn-danger btn-sm',
      text: 'Remove',
      attrs: { type: 'button' },
    });

    removeBtn.addEventListener('click', async () => {
      URL.revokeObjectURL(item.previewUrl);
      attachedMedia = attachedMedia.filter((m) => m.id !== item.id);
      await saveMediaDrafts(attachedMedia);
      renderAttachedMedia();
      updateSummaryPreview();
    });

    row.appendChild(left);
    row.appendChild(removeBtn);
    listEl.appendChild(row);
  });
}

function updateSummaryPreview() {
  const category = getSelectedRadioValue('category');
  const priority = getSelectedRadioValue('priority');
  const contact = document.getElementById('contactNumber').value.trim();
  const incidentDate = document.getElementById('incidentDate').value;
  const lat = document.getElementById('latitudeInput').value.trim();
  const lng = document.getElementById('longitudeInput').value.trim();
  const locationDesc = document.getElementById('locationDescription').value.trim();
  const description = document.getElementById('incidentDescription').value.trim();

  document.getElementById('previewCategory').textContent = category || 'Not selected';
  document.getElementById('previewPriority').textContent = priority || 'Not selected';
  document.getElementById('previewContact').textContent = contact || 'Not provided';
  document.getElementById('previewDate').textContent = incidentDate || 'Not selected';

  const gpsPart = lat && lng ? ` (GPS: ${lat}, ${lng})` : '';
  document.getElementById('previewLocation').textContent = locationDesc
    ? `${locationDesc}${gpsPart}`
    : (gpsPart ? `GPS: ${lat}, ${lng}` : 'No location entered');

  document.getElementById('previewDescription').textContent = description || 'No description entered';

  const counts = { photo: 0, video: 0, audio: 0 };
  attachedMedia.forEach((m) => {
    counts[m.mediaType] = (counts[m.mediaType] || 0) + 1;
  });

  const parts = [];
  if (counts.photo > 0) parts.push(`${counts.photo} Photo(s)`);
  if (counts.video > 0) parts.push(`${counts.video} Video(s)`);
  if (counts.audio > 0) parts.push(`${counts.audio} Audio/Voice Clip(s)`);

  document.getElementById('previewMediaSummary').textContent = parts.length > 0
    ? parts.join(', ')
    : 'No files attached';

  const thumbsEl = document.getElementById('previewMediaThumbs');
  thumbsEl.replaceChildren();
  attachedMedia
    .filter((item) => item.mediaType === 'photo')
    .forEach((photoItem) => {
      const thumb = createEl('img', {
        className: 'media-thumb-img enlargeable-image',
        attrs: {
          src: photoItem.previewUrl,
          alt: photoItem.file.name,
          title: 'Click to enlarge image',
        },
      });
      thumbsEl.appendChild(thumb);
    });
}

async function handleReportSubmit(event) {
  event.preventDefault();

  const category = getSelectedRadioValue('category');
  const priority = getSelectedRadioValue('priority');
  const contactInput = document.getElementById('contactNumber');
  const dateInput = document.getElementById('incidentDate');
  const latInput = document.getElementById('latitudeInput');
  const lngInput = document.getElementById('longitudeInput');
  const locationInput = document.getElementById('locationDescription');
  const descInput = document.getElementById('incidentDescription');
  const truthfulCheckbox = document.getElementById('truthfulCheckbox');
  const submitBtn = document.getElementById('submitReportBtn');

  const today = getLocalTodayString();
  let firstInvalid = null;

  const markError = (inputEl, errorId, msg) => {
    setFieldError(inputEl, document.getElementById(errorId), msg);
    if (!firstInvalid && inputEl) {
      firstInvalid = inputEl;
    }
  };

  if (!category) {
    document.getElementById('categoryError').textContent = 'Select an emergency category.';
    if (!firstInvalid) firstInvalid = document.querySelector('input[name="category"]');
  }

  if (!priority) {
    document.getElementById('priorityError').textContent = 'Select an emergency priority level.';
    if (!firstInvalid) firstInvalid = document.querySelector('input[name="priority"]');
  }

  if (!isValidPhilippinePhone(contactInput.value.trim())) {
    markError(contactInput, 'contactNumberError', 'Enter a valid resident mobile number.');
  }

  if (!dateInput.value || dateInput.value < today) {
    markError(dateInput, 'incidentDateError', 'Backdating is not allowed. Select todayâ€™s date.');
  } else if (dateInput.value > today) {
    markError(dateInput, 'incidentDateError', 'Future dates are not allowed.');
  }

  if (locationInput.value.trim().length < 3) {
    markError(locationInput, 'locationDescriptionError', 'Location description is required.');
  }

  if (descInput.value.trim().length < 10) {
    markError(descInput, 'incidentDescriptionError', 'Provide a detailed description (at least 10 characters).');
  }

  if (!truthfulCheckbox.checked) {
    document.getElementById('truthfulCheckboxError').textContent = 'Please check the confirmation box before submitting.';
    if (!firstInvalid) firstInvalid = truthfulCheckbox;
  }

  if (firstInvalid) {
    firstInvalid.focus();
    showToast('Please complete all required fields properly.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('category', category);
  formData.append('priority', priority);
  formData.append('contact_number', contactInput.value.trim());
  formData.append('incident_date', dateInput.value);
  formData.append('latitude', latInput.value.trim());
  formData.append('longitude', lngInput.value.trim());
  formData.append('location_description', locationInput.value.trim());
  formData.append('description', descInput.value.trim());
  formData.append('truthful_confirmed', '1');

  attachedMedia.forEach((item) => {
    if (item.mediaType === 'photo') {
      formData.append('photos[]', item.file);
    } else if (item.mediaType === 'video') {
      formData.append('videos[]', item.file);
    } else if (item.mediaType === 'audio') {
      formData.append('audios[]', item.file);
    }
  });

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending report to Barangay...';

  try {
    const response = await fetch('../backend/api/submit_report.php', {
      method: 'POST',
      credentials: 'same-origin',
      body: formData,
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      if (data.errors) {
        if (data.errors.category) document.getElementById('categoryError').textContent = data.errors.category;
        if (data.errors.priority) document.getElementById('priorityError').textContent = data.errors.priority;
        if (data.errors.contact_number) markError(contactInput, 'contactNumberError', data.errors.contact_number);
        if (data.errors.incident_date) markError(dateInput, 'incidentDateError', data.errors.incident_date);
        if (data.errors.location_description) markError(locationInput, 'locationDescriptionError', data.errors.location_description);
        if (data.errors.description) markError(descInput, 'incidentDescriptionError', data.errors.description);
        if (data.errors.media) document.getElementById('mediaError').textContent = data.errors.media;
      }

      showToast(data.message || 'Unable to submit report.', 'error');
      submitBtn.disabled = !truthfulCheckbox.checked;
      submitBtn.textContent = 'Submit Emergency Report to Barangay';
      return;
    }

    clearDraftValue(REPORT_DRAFT_KEY);
    await clearMediaDrafts();

    attachedMedia.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    attachedMedia = [];
    renderAttachedMedia();

    const formEl = document.getElementById('emergencyReportForm');
    formEl.reset();
    setupDateRestriction();
    if (residentProfile && residentProfile.contact_number) {
      contactInput.value = residentProfile.contact_number;
    }
    truthfulCheckbox.checked = false;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submit Emergency Report to Barangay';
    updateDescCharCount();
    updateSummaryPreview();

    document.getElementById('generatedTrackingCode').textContent = data.report.tracking_number;
    document.getElementById('trackingSuccessSection').classList.remove('hidden');
    formEl.classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(`Report submitted! Tracking #: ${data.report.tracking_number}`, 'success');
  } catch (err) {
    showToast('Network error submitting report. Please try again.', 'error');
    submitBtn.disabled = !truthfulCheckbox.checked;
    submitBtn.textContent = 'Submit Emergency Report to Barangay';
  }
}

async function pollNotifications() {
  try {
    const response = await fetch('../backend/api/notifications.php', { credentials: 'same-origin' });
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    if (!data || !data.success) {
      return;
    }

    const badge = document.getElementById('unreadNotifBadge');
    const liveBanner = document.getElementById('liveAlertBanner');
    const unread = Number(data.unread_count || 0);

    if (badge) {
      badge.textContent = String(unread);
      badge.classList.toggle('hidden', unread === 0);
    }

    const notifications = Array.isArray(data.notifications) ? data.notifications : [];
    const unreadItems = notifications.filter((n) => Number(n.is_read) === 0);

    if (liveBanner) {
      if (unreadItems.length > 0) {
        const latest = unreadItems[0];
        showBanner(
          liveBanner,
          `Barangay Response Alert (${latest.tracking_number}): ${latest.message}`,
          'info'
        );
      } else {
        hideBanner(liveBanner);
      }
    }

    notifications.forEach((item) => {
      if (hasLoadedNotificationsOnce && !knownNotificationIds.has(item.id) && Number(item.is_read) === 0) {
        showToast(`${item.title}: ${item.message}`, 'success');
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(item.title, { body: item.message });
        }
      }
      knownNotificationIds.add(item.id);
    });

    hasLoadedNotificationsOnce = true;
  } catch (err) {
    return;
  }
}
