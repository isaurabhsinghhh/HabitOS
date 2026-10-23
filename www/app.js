const today = document.getElementById('today-date');
if (today) {
  const now = new Date();
  today.textContent = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(now).toUpperCase();
  const localDate = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  today.dateTime = localDate;
}

const year = document.getElementById('current-year');
if (year) year.textContent = String(new Date().getFullYear());


import { supabase } from './supabase-client.js';

const logoutButton = document.getElementById('logout-button');

if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = 'Logging out...';

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Logout failed:', error);
      logoutButton.disabled = false;
      logoutButton.textContent = 'Logout';
      alert('Could not log out. Please try again.');
      return;
    }

    window.location.replace('auth.html');
  });
}



// Protect the homepage from logged-out users
const { data: { session }, error } = await supabase.auth.getSession();

if (error || !session) {
  window.location.replace('auth.html');
}


