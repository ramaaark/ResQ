const ADMIN_LOGIN_DRAFT_KEY = 'resq_admin_login_draft';

document.addEventListener('DOMContentLoaded', () => {
  initPasswordToggles();
  checkExistingAdminSession();

  const loginForm = document.getElementById('adminLoginForm');
  if (loginForm) {
    setupAdminLoginForm(loginForm);
  }
});

async function checkExistingAdminSession() {
  try {
    const response = await fetch('../backend/api/session.php', { credentials: 'same-origin' });
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    if (data && data.authenticated) {
      window.location.href = 'dashboard.html';
    }
  } catch (err) {
    return;
  }
}

function setupAdminLoginForm(form) {
  const banner = document.getElementById('adminAuthBanner');
  const identifierInput = document.getElementById('adminIdentifier');
  const passwordInput = document.getElementById('adminPassword');
  const identifierError = document.getElementById('adminIdentifierError');
  const passwordError = document.getElementById('adminPasswordError');
  const submitBtn = document.getElementById('adminLoginBtn');

  const saved = loadAdminStorage(ADMIN_LOGIN_DRAFT_KEY);
  if (saved && typeof saved.identifier === 'string') {
    identifierInput.value = saved.identifier;
  }

  identifierInput.addEventListener('input', () => {
    clearFieldError(identifierInput, identifierError);
    saveAdminStorage(ADMIN_LOGIN_DRAFT_KEY, { identifier: identifierInput.value });
  });

  passwordInput.addEventListener('input', () => {
    clearFieldError(passwordInput, passwordError);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideBanner(banner);

    const identifierVal = identifierInput.value.trim();
    const passwordVal = passwordInput.value;

    let valid = true;

    if (identifierVal === '') {
      setFieldError(identifierInput, identifierError, 'Admin username or email is required.');
      valid = false;
    } else {
      clearFieldError(identifierInput, identifierError);
    }

    if (passwordVal.trim() === '') {
      setFieldError(passwordInput, passwordError, 'Password is required.');
      valid = false;
    } else {
      clearFieldError(passwordInput, passwordError);
    }

    if (!valid) {
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';

    try {
      const response = await fetch('../backend/api/login.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          identifier: identifierVal,
          password: passwordVal,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        showBanner(banner, data.message || 'Sign in failed. Check your official credentials.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In to Command Dashboard';
        return;
      }

      clearAdminStorage(ADMIN_LOGIN_DRAFT_KEY);
      window.location.href = 'dashboard.html';
    } catch (err) {
      showBanner(banner, 'Network error connecting to dashboard server.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In to Command Dashboard';
    }
  });
}
