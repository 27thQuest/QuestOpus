import { supabase } from './supabase.js';

// Redirect if already logged in
const { data: { session } } = await supabase.auth.getSession();
if (session) {
  window.location.replace('index.html');
}

const authForm = document.getElementById('auth-form');

const authTitle = document.getElementById('auth-title');
const authSubmit = document.getElementById('auth-submit');

const authSwitch = document.getElementById('auth-switch');
const authSwitchText = document.getElementById('auth-switch-text');

const usernameField = document.getElementById('username-field');
const usernameInput = document.getElementById('auth-username');

const emailInput = document.getElementById('auth-email');
const passwordInput = document.getElementById('auth-password');

const authMessage = document.getElementById('auth-message');


const verificationPanel =
  document.getElementById('verification-panel');

const verificationEmail =
  document.getElementById('verification-email');

const verificationCode =
  document.getElementById('verification-code');

const verifyButton =
  document.getElementById('verify-button');

const verificationMessage =
  document.getElementById('verification-message');

const backToAuth =
  document.getElementById('back-to-auth');

const resendCode =
  document.getElementById('resend-code');

let isSignup = false;

let pendingVerificationEmail = '';


// ============================================================
// MESSAGE
// ============================================================

function showMessage(message, error = false) {
  if (!authMessage) return;

  authMessage.textContent = message;

  authMessage.classList.toggle(
    'auth-message--error',
    error
  );
}


// ============================================================
// SWITCH LOGIN / SIGN UP
// ============================================================

function setMode(signup) {
  isSignup = signup;

  console.log(
    '[Auth] Mode:',
    isSignup ? 'SIGN UP' : 'LOGIN'
  );

  if (isSignup) {
    authTitle.textContent = 'Create account';
    authSubmit.textContent = 'Create account';

    usernameField.style.display = 'flex';

    authSwitchText.textContent =
      'Already have an account?';

    authSwitch.textContent =
      'Log in';

    passwordInput.autocomplete =
      'new-password';

  } else {
    authTitle.textContent = 'Log in';
    authSubmit.textContent = 'Log in';

    usernameField.style.display = 'none';

    authSwitchText.textContent =
      "Don't have an account?";

    authSwitch.textContent =
      'Sign up';

    passwordInput.autocomplete =
      'current-password';
  }

  showMessage('');
}


// ============================================================
// SIGN UP / LOGIN SWITCH
// ============================================================

if (!authSwitch) {

  console.error(
    '[Auth] ERROR: #auth-switch was not found.'
  );

} else {

  console.log(
    '[Auth] Sign-up switch connected.'
  );

  authSwitch.addEventListener(
    'click',
    (event) => {

      event.preventDefault();
      event.stopPropagation();

      console.log(
        '[Auth] Sign-up button clicked.'
      );

      setMode(!isSignup);
    }
  );
}

verifyButton.addEventListener(
  'click',
  async () => {

    const token =
      verificationCode.value.trim();

    if (!/^\d{6}$/.test(token)) {

      verificationMessage.textContent =
        'Enter the 6-digit verification code.';

      verificationMessage.classList.add(
        'auth-message--error'
      );

      return;
    }

    verifyButton.disabled = true;

    verificationMessage.classList.remove(
      'auth-message--error'
    );

    verificationMessage.textContent =
      'Verifying...';


    try {
      const {
        data,
        error
      } =
        await supabase.auth.verifyOtp({
          email:
            pendingVerificationEmail,

          token,

          type: 'email'
        });


      if (error) {
        throw error;
      }


      console.log(
        '[Auth] Email verified.'
      );

      console.log(
        '[Auth] Session:',
        data.session
      );


      window.location.replace(
        'index.html'
      );

    } catch (error) {

      console.error(
        '[Auth] Verification failed:',
        error
      );

      verificationMessage.textContent =
        error.message ||
        'Invalid verification code.';

      verificationMessage.classList.add(
        'auth-message--error'
      );

      verifyButton.disabled = false;
    }
  }
);


if (resendCode) {
  resendCode.addEventListener('click', async () => {

    if (!pendingVerificationEmail) {
      verificationMessage.textContent =
        'No verification email to resend.';
      return;
    }

    resendCode.disabled = true;

    verificationMessage.classList.remove(
      'auth-message--error'
    );

    verificationMessage.textContent =
      'Sending a new code...';

    try {

    

      const { error } =
        await supabase.auth.resend({
          type: 'signup',
          email: pendingVerificationEmail
        });

      if (error) {
        throw error;
      }

      verificationMessage.textContent =
        'A new verification code was sent.';

    } catch (error) {

      console.error(
        '[Auth] Resend failed:',
        error
      );

      verificationMessage.textContent =
        error.message ||
        'Could not resend the code.';

      verificationMessage.classList.add(
        'auth-message--error'
      );

    } finally {

      resendCode.disabled = false;

    }
  });
}


// ============================================================
// AUTH FORM
// ============================================================

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  console.log('[Auth] SUBMIT');

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const username = usernameInput.value.trim();

  if (!email || !password) {
    showMessage(
      'Please enter your email and password.',
      true
    );
    return;
  }

  if (isSignup && !username) {
    showMessage(
      'Please enter a username.',
      true
    );
    return;
  }

  authSubmit.disabled = true;
  showMessage('Creating account...');

  try {

    console.log('[Auth] Loading Supabase...');
    console.log('[Auth] Supabase loaded.');

    if (isSignup) {

      console.log('[Auth] Signing up:', email);

      const {
        data,
        error
      } = await supabase.auth.signUp({
        email,
        password,

        options: {
          data: {
            username: username
          }
        }
      });

      console.log('[Auth] Signup response:', data);

      if (error) {
        throw error;
      }

      console.log(
        '[Auth] Account created.'
      );

      pendingVerificationEmail = email;

      verificationEmail.textContent = email;

      authForm.style.display = 'none';

      verificationPanel.style.display = 'block';

      verificationCode.focus();

      authSubmit.disabled = false;

      /*
       * Supabase returns no session when
       * email confirmation is required.
       */


      console.log(
        '[Auth] Session exists. Redirecting...'
      );

      window.location.replace(
        'index.html'
      );

      return;
    }


    // ====================================================
    // LOGIN
    // ====================================================

    console.log('[Auth] Logging in:', email);

    const {
      data,
      error
    } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      throw error;
    }

    console.log(
      '[Auth] Login successful:',
      data.user
    );

    window.location.replace(
      'index.html'
    );

  } catch (error) {

    console.error(
      '[Auth] AUTH ERROR:',
      error
    );

    showMessage(
      error.message ||
      'Authentication failed.',
      true
    );

    authSubmit.disabled = false;
  }
});


// ============================================================
// INITIAL MODE
// ============================================================

setMode(false);