const RESIDENT_LOGIN_DRAFT_KEY = 'resq_resident_login_draft';
const RESIDENT_REGISTER_DRAFT_KEY = 'resq_resident_register_draft';

document.addEventListener('DOMContentLoaded', () => {
  initPasswordToggles();
  checkExistingSession();

  const loginForm = document.getElementById('residentLoginForm');
  const registerForm = document.getElementById('residentRegisterForm');

  if (loginForm) {
    setupLoginForm(loginForm);
  }

  if (registerForm) {
    setupRegisterForm(registerForm);
  }
});

async function checkExistingSession() {
  try {
    const response = await fetch('../backend/api/session.php', { credentials: 'same-origin' });
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    if (data && data.authenticated) {
      window.location.href = 'report.html';
    }
  } catch (err) {
    return;
  }
}

function setupLoginForm(form) {
  const banner = document.getElementById('authBanner');
  const identifierInput = document.getElementById('loginIdentifier');
  const passwordInput = document.getElementById('loginPassword');
  const identifierError = document.getElementById('loginIdentifierError');
  const passwordError = document.getElementById('loginPasswordError');
  const submitBtn = document.getElementById('loginSubmitBtn');

  const saved = loadDraftValue(RESIDENT_LOGIN_DRAFT_KEY);
  if (saved && typeof saved.identifier === 'string') {
    identifierInput.value = saved.identifier;
  }

  identifierInput.addEventListener('input', () => {
    clearFieldError(identifierInput, identifierError);
    saveDraftValue(RESIDENT_LOGIN_DRAFT_KEY, { identifier: identifierInput.value });
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
      setFieldError(identifierInput, identifierError, 'Email address or mobile number is required.');
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
        showBanner(banner, data.message || 'Sign in failed. Check your credentials.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In to Report';
        return;
      }

      clearDraftValue(RESIDENT_LOGIN_DRAFT_KEY);
      window.location.href = 'report.html';
    } catch (err) {
      showBanner(banner, 'Network error while connecting to server.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In to Report';
    }
  });
}

function setupRegisterForm(form) {
  const banner = document.getElementById('authBanner');
  const fullNameInput = document.getElementById('regFullName');
  const emailInput = document.getElementById('regEmail');
  const contactInput = document.getElementById('regContact');
  const addressInput = document.getElementById('regAddress');
  const passwordInput = document.getElementById('regPassword');
  const confirmInput = document.getElementById('regConfirmPassword');

  const errorMap = {
    full_name: { input: fullNameInput, err: document.getElementById('regFullNameError') },
    email: { input: emailInput, err: document.getElementById('regEmailError') },
    contact_number: { input: contactInput, err: document.getElementById('regContactError') },
    address: { input: addressInput, err: document.getElementById('regAddressError') },
    password: { input: passwordInput, err: document.getElementById('regPasswordError') },
    confirm_password: { input: confirmInput, err: document.getElementById('regConfirmPasswordError') },
  };

  const submitBtn = document.getElementById('registerSubmitBtn');

  const saved = loadDraftValue(RESIDENT_REGISTER_DRAFT_KEY);
  if (saved) {
    if (typeof saved.full_name === 'string') fullNameInput.value = saved.full_name;
    if (typeof saved.email === 'string') emailInput.value = saved.email;
    if (typeof saved.contact_number === 'string') contactInput.value = saved.contact_number;
    if (typeof saved.address === 'string') addressInput.value = saved.address;
  }

  const persistRegisterDraft = () => {
    saveDraftValue(RESIDENT_REGISTER_DRAFT_KEY, {
      full_name: fullNameInput.value,
      email: emailInput.value,
      contact_number: contactInput.value,
      address: addressInput.value,
    });
  };

  [fullNameInput, emailInput, contactInput, addressInput].forEach((inputEl) => {
    inputEl.addEventListener('input', () => {
      persistRegisterDraft();
    });
  });

  Object.values(errorMap).forEach(({ input, err }) => {
    input.addEventListener('input', () => clearFieldError(input, err));
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideBanner(banner);

    Object.values(errorMap).forEach(({ input, err }) => clearFieldError(input, err));

    const fullName = fullNameInput.value.trim();
    const email = emailInput.value.trim();
    const contact = contactInput.value.trim();
    const address = addressInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmInput.value;

    let isValid = true;

    if (fullName.length < 2) {
      setFieldError(fullNameInput, errorMap.full_name.err, 'Full name is required (at least 2 characters).');
      isValid = false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError(emailInput, errorMap.email.err, 'Enter a valid email address.');
      isValid = false;
    }

    if (!isValidPhilippinePhone(contact)) {
      setFieldError(contactInput, errorMap.contact_number.err, 'Enter a valid mobile number (e.g., 09171234567).');
      isValid = false;
    }

    if (address.length < 4) {
      setFieldError(addressInput, errorMap.address.err, 'Barangay address / purok is required.');
      isValid = false;
    }

    if (password.trim() === '' || password.length < 8) {
      setFieldError(passwordInput, errorMap.password.err, 'Password must be at least 8 characters long.');
      isValid = false;
    }

    if (confirmPassword === '' || password !== confirmPassword) {
      setFieldError(confirmInput, errorMap.confirm_password.err, 'Passwords do not match.');
      isValid = false;
    }

    if (!isValid) {
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account...';

    try {
      const response = await fetch('../backend/api/register.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          full_name: fullName,
          email,
          contact_number: contact,
          address,
          password,
          confirm_password: confirmPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (data.errors) {
          Object.entries(data.errors).forEach(([field, msg]) => {
            if (errorMap[field]) {
              setFieldError(errorMap[field].input, errorMap[field].err, msg);
            }
          });
        }
        showBanner(banner, data.message || 'Registration failed.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Resident Account';
        return;
      }

      clearDraftValue(RESIDENT_REGISTER_DRAFT_KEY);
      window.location.href = 'report.html';
    } catch (err) {
      showBanner(banner, 'Network error while connecting to server.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Resident Account';
    }
  });
}
