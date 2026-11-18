import { supabase } from './supabase.js';

const logoutButton = document.getElementById('logout-btn');

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;

  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('[Auth] Logout failed:', error);
    logoutButton.disabled = false;
    return;
  }

  window.location.href = 'auth.html';
});