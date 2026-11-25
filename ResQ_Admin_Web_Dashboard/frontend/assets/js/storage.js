function saveAdminStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    return;
  }
}

function loadAdminStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function clearAdminStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    return;
  }
}
