document.addEventListener('DOMContentLoaded', async () => {
  const guestActions = document.getElementById('adminGuestActions');
  const authActions = document.getElementById('adminAuthActions');

  try {
    const response = await fetch('../backend/api/session.php', { credentials: 'same-origin' });
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    if (data && data.authenticated) {
      if (guestActions) {
        guestActions.classList.add('hidden');
      }
      if (authActions) {
        authActions.classList.remove('hidden');
      }
    }
  } catch (err) {
    return;
  }
});
