const usernameInput = document.getElementById('auth-username');
const emailInput = document.getElementById('auth-email');
const passwordInput = document.getElementById('auth-password');

const authForm = document.getElementById('auth-form');
const authMessage = document.getElementById('auth-message');

const authTitle = document.getElementById('auth-title');
const authSubmit = document.getElementById('auth-submit');
const authSwitch = document.getElementById('auth-switch');
const authSwitchText = document.getElementById('auth-switch-text');

import { supabase } from './supabase.js';

let isSignup = false;

function showMessage(message, error = false) {
  if (!authMessage) return;

  authMessage.textContent = message;
  authMessage.classList.toggle('auth-message--error', error);
}

function setMode(signup) {
  isSignup = signup;

  authTitle.textContent = signup ? 'Create account' : 'Log in';
  authSubmit.textContent = signup ? 'Create account' : 'Log in';

  usernameInput.style.display = signup ? '' : 'none';

  authSwitchText.textContent = signup
    ? 'Already have an account?'
    : "Don't have an account?";

  authSwitch.textContent = signup ? 'Log in' : 'Sign up';

  showMessage('');
}

authSwitch.addEventListener('click', () => {
  setMode(!isSignup);
});

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showMessage('Please enter your email and password.', true);
    return;
  }

  if (isSignup) {
    const username = usernameInput.value.trim().toLowerCase();

    if (!username) {
      showMessage('Please enter a username.', true);
      return;
    }

    if (password.length < 6) {
      showMessage('Password must be at least 6 characters.', true);
      return;
    }

    authSubmit.disabled = true;
    showMessage('Creating your account...');

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: username
        }
      }
    });

    if (error) {
      console.error('[Auth] Signup failed:', error);
      showMessage(error.message, true);
      authSubmit.disabled = false;
      return;
    }

    if (!data.user) {
      showMessage('Account creation failed.', true);
      authSubmit.disabled = false;
      return;
    }

    /*
     * Email verification is enabled in Supabase.
     * The profile will be created after the user has
     * successfully verified their email.
     */

    localStorage.setItem(
      'quest-opus-pending-username',
      username
    );

    showMessage(
      'Account created. Check your email to verify your account.'
    );

    authForm.reset();
    authSubmit.disabled = false;

    return;
  }

  authSubmit.disabled = true;
  showMessage('Logging in...');

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    console.error('[Auth] Login failed:', error);
    showMessage(error.message, true);
    authSubmit.disabled = false;
    return;
  }

  console.log('[Auth] Logged in:', data.user.id);

  const pendingUsername =
    localStorage.getItem('quest-opus-pending-username');

  if (pendingUsername) {
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: data.user.id,
        username: pendingUsername
      });

    if (profileError) {
      console.error('[Auth] Profile creation failed:', profileError);
      showMessage(
        'Logged in, but your profile could not be created.',
        true
      );
      authSubmit.disabled = false;
      return;
    }

    localStorage.removeItem('quest-opus-pending-username');
  }

  window.location.href = 'index.html';

  window.location.href = 'index.html';
});