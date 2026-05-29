(function () {
  'use strict';
  console.log('🔐 Passwordless OTP Auth System Initializing...');

  if (typeof emailjs !== 'undefined') {
    emailjs.init("0ESSxwLxdIwZp8yvr");
  }

  let currentOTP = null;
  let authTargetEmail = null;

  function getLang() { return localStorage.getItem('lang') === 'ar' ? 'ar' : 'en'; }
  function t(en, ar) { return getLang() === 'ar' ? ar : en; }

  function updateAuthLang() {
    const lang = getLang();
    document.querySelectorAll('#authModal [data-' + lang + ']').forEach(function (el) {
      var val = el.getAttribute('data-' + lang);
      if (val) el.textContent = val;
    });
  }

  function showAuthStep(step) {
    for (var i = 1; i <= 2; i++) {
      var el = document.getElementById('authStep' + i);
      if (el) el.style.display = (i === step) ? 'block' : 'none';
    }
    var errEl = document.getElementById('authError');
    if (errEl) errEl.style.display = 'none';
    if (step === 2) {
      setTimeout(function () {
        var boxes = document.querySelectorAll('#authOtpContainer .otp-input');
        boxes.forEach(function (b) { b.value = ''; });
        if (boxes.length > 0) boxes[0].focus();
      }, 400);
    }
    updateAuthLang();
  }

  function showAuthError(msg) {
    var el = document.getElementById('authError');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
    setTimeout(function () { if (el) el.style.display = 'none'; }, 5000);
  }

  async function handleSendCode() {
    var emailInput = document.getElementById('authEmail');
    var btn = document.getElementById('authSendCodeBtn');
    authTargetEmail = emailInput.value.trim().toLowerCase();

    if (!authTargetEmail || !authTargetEmail.includes('@')) {
      showAuthError(t('Please enter a valid email address', 'يرجى إدخال بريد إلكتروني صحيح'));
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> ' + t('Sending...', 'جاري الإرسال...');

    currentOTP = Math.floor(100000 + Math.random() * 900000).toString();
    console.log('🔑 OTP for ' + authTargetEmail + ':', currentOTP);

    try {
      await emailjs.send("service_cqw3gb9", "template_8bpvbip", {
        email: authTargetEmail,
        code: currentOTP,
        from_name: "FutureGEN",
        site_name: "FutureGEN.space",
        reply_to: "support@futuregen.space"
      });
      document.getElementById('authEmailDisplay').textContent = authTargetEmail;
      showAuthStep(2);
    } catch (err) {
      console.error('EmailJS Error:', err);
      showAuthError(t('Failed to send email. Please try again.', 'فشل إرسال البريد. يرجى المحاولة مرة أخرى.'));
    } finally {
      btn.disabled = false;
      btn.textContent = t('Continue', 'متابعة');
    }
  }

  async function handleVerifyCode() {
    var boxes = document.querySelectorAll('#authOtpContainer .otp-input');
    var code = '';
    boxes.forEach(function (b) { code += b.value; });

    if (code.length < 6) {
      showAuthError(t('Please enter the complete 6-digit code', 'يرجى إدخال الرمز المكون من 6 أرقام كاملاً'));
      return;
    }

    // Show verifying spinner
    var btn = document.getElementById('authVerifyBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>' + t('Verifying...', 'جاري التحقق...');
    boxes.forEach(function (b) { b.disabled = true; });

    // Wait 3 seconds for verification feel
    await new Promise(function (r) { setTimeout(r, 3000); });

    if (code !== currentOTP) {
      // ❌ Incorrect code
      btn.innerHTML = '<i class="fas fa-times-circle me-2"></i>' + t('Incorrect Code', 'رمز غير صحيح');
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-danger');
      boxes.forEach(function (b) { b.style.borderColor = '#ef4444'; b.disabled = false; });

      setTimeout(function () {
        boxes.forEach(function (b) { b.value = ''; b.style.borderColor = ''; });
        boxes[0].focus();
        btn.innerHTML = t('Verify Code', 'تأكيد الرمز');
        btn.classList.remove('btn-danger');
        btn.classList.add('btn-primary');
        btn.disabled = false;
      }, 1500);
      return;
    }

    // ✅ Correct code
    btn.innerHTML = '<i class="fas fa-check-circle me-2"></i>' + t('Verified!', 'تم التحقق!');
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-success');
    boxes.forEach(function (b) { b.style.borderColor = '#22c55e'; });

    var userName = authTargetEmail.split('@')[0];
    var user = { name: userName, email: authTargetEmail, isLoggedIn: true, loginTime: new Date().toISOString() };
    localStorage.setItem('currentUser', JSON.stringify(user));

    // Short pause to show success, then sync + close + toast
    setTimeout(async function () {
      // Close the modal
      try {
        var modalEl = document.getElementById('authModal');
        var bsModal = bootstrap.Modal.getInstance(modalEl);
        if (bsModal) bsModal.hide();
      } catch (e) { }
      document.getElementById('authModal').classList.remove('show');
      document.getElementById('authModal').style.display = 'none';
      document.body.classList.remove('modal-open');
      document.querySelectorAll('.modal-backdrop').forEach(function (b) { b.remove(); });

      // Show welcome toast
      if (typeof window.showToast === 'function') {
          window.showToast(t('Welcome back, ' + userName + '!', 'مرحباً بعودتك، ' + userName + '!'), 'success');
      } else {
          showWelcomeToast(t('Welcome back, ' + userName + '!', 'مرحباً بعودتك، ' + userName + '!'));
      }

      // Reset button state
      btn.classList.remove('btn-success');
      btn.classList.add('btn-primary');
      btn.disabled = false;
      btn.textContent = t('Verify Code', 'تأكيد الرمز');
      boxes.forEach(function (b) { b.style.borderColor = ''; b.disabled = false; });

      // ⚡ Firestore sync BEFORE reload — this is key for cross-device data
      if (window.fsGetDoc && window.fsDb && window.fsDoc) {
        try {
          var userRef = window.fsDoc(window.fsDb, "users", authTargetEmail);
          var userSnap = await window.fsGetDoc(userRef);
          if (userSnap.exists()) {
            var userData = userSnap.data();
            if (userData.name) { user.name = userData.name; localStorage.setItem('currentUser', JSON.stringify(user)); }
            try { var favSnap = await window.fsGetDoc(window.fsDoc(window.fsDb, "users", authTargetEmail, "data", "favorites")); if (favSnap.exists()) localStorage.setItem('favorites_' + authTargetEmail, JSON.stringify(favSnap.data().list || [])); } catch (e) { }
            try { var ratSnap = await window.fsGetDoc(window.fsDoc(window.fsDb, "users", authTargetEmail, "data", "ratings")); if (ratSnap.exists()) localStorage.setItem('ratings_' + authTargetEmail, JSON.stringify(ratSnap.data() || {})); } catch (e) { }
          } else if (window.fsSetDoc) {
            await window.fsSetDoc(userRef, { name: userName, email: authTargetEmail, createdAt: new Date().toISOString() });
            await window.fsSetDoc(window.fsDoc(window.fsDb, "users", authTargetEmail, "data", "favorites"), { list: [] });
            await window.fsSetDoc(window.fsDoc(window.fsDb, "users", authTargetEmail, "data", "ratings"), {});
            localStorage.setItem('favorites_' + authTargetEmail, JSON.stringify([]));
            localStorage.setItem('ratings_' + authTargetEmail, JSON.stringify({}));
          }
        } catch (e) { console.warn('Firestore sync on login:', e); }
      }

      if (typeof updateUserInterface === 'function') updateUserInterface();
      if (typeof window.displayToolsByCategories === 'function') window.displayToolsByCategories();
      setTimeout(function () { location.reload(); }, 800);
    }, 1200);
  }

  // ✅ Premium Welcome Toast (Fallback if window.showToast not loaded)
  function showWelcomeToast(message) {
    var existing = document.getElementById('welcome-toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.id = 'welcome-toast';
    toast.style.cssText = 'position:fixed;top:24px;left:50%;transform:translateX(-50%) translateY(-100px);z-index:999999;display:flex;align-items:center;gap:14px;padding:16px 28px;border-radius:16px;color:#fff;font-weight:600;font-size:1rem;box-shadow:0 12px 40px rgba(34,197,94,0.3);background:linear-gradient(135deg,#22c55e,#16a34a);transition:transform 0.5s cubic-bezier(.4,0,.2,1),opacity 0.5s;opacity:0;max-width:500px;';
    toast.innerHTML = '<div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas fa-check" style="font-size:1rem;"></i></div><span>' + message + '</span>';
    document.body.appendChild(toast);
    requestAnimationFrame(function () { toast.style.transform = 'translateX(-50%) translateY(0)'; toast.style.opacity = '1'; });
    setTimeout(function () {
      toast.style.transform = 'translateX(-50%) translateY(-100px)'; toast.style.opacity = '0';
      setTimeout(function () { toast.remove(); }, 600);
    }, 4000);
  }

  function setupOTPBoxes() {
    var boxes = document.querySelectorAll('#authOtpContainer .otp-input');
    boxes.forEach(function (box, index) {
      box.oninput = function () {
        if (box.value.length === 1 && index < 5) boxes[index + 1].focus();
      };
      box.onkeydown = function (e) {
        if (e.key === 'Backspace' && !box.value && index > 0) boxes[index - 1].focus();
      };
      box.onpaste = function (e) {
        var data = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (data.length > 0) {
          data.split('').forEach(function (c, i) {
            if (boxes[index + i]) boxes[index + i].value = c;
          });
          var lastIdx = Math.min(index + data.length - 1, 5);
          boxes[lastIdx].focus();
        }
        e.preventDefault();
      };
    });
  }

  function initAuth() {
    var sendBtn = document.getElementById('authSendCodeBtn');
    if (sendBtn) sendBtn.onclick = handleSendCode;
    var verifyBtn = document.getElementById('authVerifyBtn');
    if (verifyBtn) verifyBtn.onclick = handleVerifyCode;
    var resendBtn = document.getElementById('authResendBtn');
    if (resendBtn) resendBtn.onclick = handleSendCode;

    var authModal = document.getElementById('authModal');
    if (authModal) {
      authModal.addEventListener('show.bs.modal', function () {
        showAuthStep(1);
        var emailInput = document.getElementById('authEmail');
        if (emailInput) emailInput.value = '';
      });
    }
    setupOTPBoxes();
    updateAuthLang();
  }

  initAuth();
  document.addEventListener('DOMContentLoaded', initAuth);

  // ⚡ Auto-sync Firestore data on EVERY page load for logged-in users
  (async function syncOnPageLoad() {
    try {
      var raw = localStorage.getItem('currentUser');
      if (!raw) return;
      var u = JSON.parse(raw);
      if (!u || !u.isLoggedIn || !u.email) return;
      var email = u.email.toLowerCase();

      // Wait for Firestore SDK to be available
      var attempts = 0;
      while ((!window.fsGetDoc || !window.fsDb) && attempts < 20) {
        await new Promise(function (r) { setTimeout(r, 300); });
        attempts++;
      }
      if (!window.fsGetDoc || !window.fsDb || !window.fsDoc) return;

      // Sync favorites from Firestore
      try {
        var favSnap = await window.fsGetDoc(window.fsDoc(window.fsDb, "users", email, "data", "favorites"));
        if (favSnap.exists()) {
          var cloudFavs = favSnap.data().list || [];
          localStorage.setItem('favorites_' + email, JSON.stringify(cloudFavs));
        }
      } catch (e) { console.warn('Firestore fav sync:', e); }

      // Sync ratings from Firestore
      try {
        var ratSnap = await window.fsGetDoc(window.fsDoc(window.fsDb, "users", email, "data", "ratings"));
        if (ratSnap.exists()) {
          localStorage.setItem('ratings_' + email, JSON.stringify(ratSnap.data() || {}));
        }
      } catch (e) { console.warn('Firestore rat sync:', e); }

      console.log('✅ Firestore data synced for', email);
    } catch (e) { console.warn('Page-load sync:', e); }
  })();
})();
