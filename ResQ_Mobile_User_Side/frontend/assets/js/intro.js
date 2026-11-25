document.addEventListener('DOMContentLoaded', async () => {
  const guestActions = document.getElementById('guestActions');
  const authenticatedActions = document.getElementById('authenticatedActions');

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
      if (authenticatedActions) {
        authenticatedActions.classList.remove('hidden');
      }
    }
  } catch (err) {
    return;
  }
});
