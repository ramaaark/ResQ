function createEl(tag, options = {}, children = []) {
  const el = document.createElement(tag);

  if (options.className) {
    el.className = options.className;
  }

  if (options.text !== undefined) {
    el.textContent = options.text;
  }

  if (options.attrs) {
    Object.entries(options.attrs).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        el.setAttribute(key, String(value));
      }
    });
  }

  children.forEach((child) => {
    if (child === null || child === undefined) {
      return;
    }
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else {
      el.appendChild(child);
    }
  });

  return el;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) {
    return;
  }

  const toast = createEl('div', {
    className: `toast-item toast-${type}`,
    attrs: { role: 'status' },
  });

  const textSpan = createEl('span', { text: message });
  const closeBtn = createEl('button', {
    className: 'toast-close-btn',
    text: '×',
    attrs: { type: 'button', 'aria-label': 'Dismiss notification' },
  });

  closeBtn.addEventListener('click', () => {
    toast.remove();
  });

  toast.appendChild(textSpan);
  toast.appendChild(closeBtn);
  container.appendChild(toast);

  window.setTimeout(() => {
    if (toast.parentNode) {
      toast.remove();
    }
  }, 5000);
}

function showBanner(bannerEl, message, type = 'error') {
  if (!bannerEl) {
    return;
  }
  bannerEl.className = `alert-banner ${type}`;
  bannerEl.textContent = message;
  bannerEl.classList.remove('hidden');
}

function hideBanner(bannerEl) {
  if (!bannerEl) {
    return;
  }
  bannerEl.textContent = '';
  bannerEl.classList.add('hidden');
}

function setFieldError(inputEl, errorEl, message) {
  if (inputEl) {
    inputEl.classList.add('input-error');
  }
  if (errorEl) {
    errorEl.textContent = message;
  }
}

function clearFieldError(inputEl, errorEl) {
  if (inputEl) {
    inputEl.classList.remove('input-error');
  }
  if (errorEl) {
    errorEl.textContent = '';
  }
}

function createEyeSvg(isVisible) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');

  if (isVisible) {
    const path1 = document.createElementNS(ns, 'path');
    path1.setAttribute('d', 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94');
    const path2 = document.createElementNS(ns, 'path');
    path2.setAttribute('d', 'M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19');
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', '1');
    line.setAttribute('y1', '1');
    line.setAttribute('x2', '23');
    line.setAttribute('y2', '23');
    svg.appendChild(path1);
    svg.appendChild(path2);
    svg.appendChild(line);
  } else {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z');
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '3');
    svg.appendChild(path);
    svg.appendChild(circle);
  }

  return svg;
}

function initPasswordToggles() {
  const buttons = document.querySelectorAll('[data-toggle-password]');
  buttons.forEach((btn) => {
    const targetId = btn.getAttribute('data-toggle-password');
    const input = targetId ? document.getElementById(targetId) : null;
    if (!input) {
      return;
    }

    input.type = 'password';
    btn.setAttribute('aria-pressed', 'false');

    btn.addEventListener('click', () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      const nowVisible = input.type === 'text';
      btn.setAttribute('aria-pressed', nowVisible ? 'true' : 'false');
      btn.setAttribute('aria-label', nowVisible ? 'Hide password' : 'Show password');
      btn.replaceChildren(createEyeSvg(nowVisible));
    });
  });
}

function openImageLightbox(src, captionText) {
  const modal = document.getElementById('imageLightboxModal');
  const img = document.getElementById('lightboxImage');
  const caption = document.getElementById('lightboxCaption');

  if (!modal || !img || !caption) {
    return;
  }

  img.src = src;
  caption.textContent = captionText || 'Enlarged Incident Photo';
  modal.classList.remove('hidden');
}

function closeImageLightbox() {
  const modal = document.getElementById('imageLightboxModal');
  const img = document.getElementById('lightboxImage');
  if (!modal) {
    return;
  }
  modal.classList.add('hidden');
  if (img) {
    img.src = '';
  }
}

function initImageLightbox() {
  const modal = document.getElementById('imageLightboxModal');
  const closeBtn = document.getElementById('closeLightboxBtn');

  if (closeBtn) {
    closeBtn.addEventListener('click', closeImageLightbox);
  }

  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeImageLightbox();
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeImageLightbox();
    }
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement)) {
      return;
    }
    if (target.id === 'lightboxImage') {
      return;
    }
    if (target.src) {
      openImageLightbox(target.src, target.alt || 'Incident Photo');
    }
  });
}

let activeConfirmHandler = null;

function initConfirmModal() {
  const modal = document.getElementById('confirmModal');
  const cancelBtn = document.getElementById('confirmCancelBtn');
  const proceedBtn = document.getElementById('confirmProceedBtn');

  if (!modal || !cancelBtn || !proceedBtn) {
    return;
  }

  const closeModal = () => {
    modal.classList.add('hidden');
    activeConfirmHandler = null;
  };

  cancelBtn.addEventListener('click', closeModal);

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  proceedBtn.addEventListener('click', async () => {
    const fn = activeConfirmHandler;
    closeModal();
    if (typeof fn === 'function') {
      await fn();
    }
  });
}

function openConfirmModal(options) {
  const modal = document.getElementById('confirmModal');
  const titleEl = document.getElementById('confirmModalTitle');
  const msgEl = document.getElementById('confirmModalMessage');
  const proceedBtn = document.getElementById('confirmProceedBtn');

  if (!modal || !titleEl || !msgEl || !proceedBtn) {
    return;
  }

  titleEl.textContent = options.title || 'Confirm Action';
  msgEl.textContent = options.message || 'Are you sure you want to proceed?';
  proceedBtn.textContent = options.confirmText || 'Confirm';
  proceedBtn.className = options.confirmClass || 'btn btn-danger';
  activeConfirmHandler = options.onConfirm || null;
  modal.classList.remove('hidden');
}

function formatReadableDateTime(dateStr) {
  if (!dateStr) {
    return '';
  }
  const normalized = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return dateStr;
  }
  return parsed.toLocaleString();
}
