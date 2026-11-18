import { supabase } from './supabase.js';

const usernameElement = document.getElementById('account-username');
const emailElement = document.getElementById('account-email');
const createdElement = document.getElementById('account-created');

async function loadAccount() {
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error('[Account] Could not get user:', userError);
    window.location.href = 'auth.html';
    return;
  }

  emailElement.textContent = user.email || '—';

  if (user.created_at) {
    createdElement.textContent = new Date(
      user.created_at
    ).toLocaleDateString();
  } else {
    createdElement.textContent = '—';
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('[Account] Could not load profile:', profileError);
    usernameElement.textContent = '—';
    return;
  }

  usernameElement.textContent = profile?.username || '—';
}

loadAccount();