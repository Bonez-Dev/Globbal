/**
 * Sign-in page: account login/register only. Redirects to profile when signed in.
 */
(function accountsAuthPage() {
  const accounts = window.GlobbleAccounts;
  const authBootstrapError = document.getElementById("authBootstrapError");
  if (!accounts) {
    if (authBootstrapError) {
      authBootstrapError.hidden = false;
      authBootstrapError.textContent =
        "Account sign-in did not load. Refresh the page or try again later.";
    }
    return;
  }

  const PROFILE_URL = "./profile.html";
  const authForm = document.getElementById("authForm");
  const forgotForm = document.getElementById("forgotForm");
  const authUsername = document.getElementById("authUsername");
  const authEmail = document.getElementById("authEmail");
  const authPassword = document.getElementById("authPassword");
  const authPasswordToggle = document.getElementById("authPasswordToggle");
  const authError = document.getElementById("authError");
  const loginBtn = document.getElementById("loginBtn");
  const registerBtn = document.getElementById("registerBtn");
  const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
  const forgotLogin = document.getElementById("forgotLogin");
  const forgotSubmitBtn = document.getElementById("forgotSubmitBtn");
  const forgotBackBtn = document.getElementById("forgotBackBtn");
  const forgotError = document.getElementById("forgotError");
  const forgotResetHint = document.getElementById("forgotResetHint");
  const forgotDevLinkWrap = document.getElementById("forgotDevLinkWrap");
  const forgotDevLink = document.getElementById("forgotDevLink");

  let passwordResetEmailConfigured = null;

  function isProductionSite() {
    return (
      location.protocol === "https:" ||
      (!/localhost|127\.0\.0\.1/i.test(location.hostname) && location.protocol !== "file:")
    );
  }

  function setAuthError(message) {
    if (authError) authError.textContent = message || "";
  }

  function setForgotMessage(message, { isError = false } = {}) {
    if (!forgotError) {
      return;
    }
    forgotError.textContent = message || "";
    forgotError.classList.toggle("is-success", Boolean(message) && !isError);
    forgotError.classList.toggle("is-error", Boolean(message) && isError);
  }

  function setForgotDevLink(url) {
    if (!forgotDevLinkWrap || !forgotDevLink) {
      return;
    }
    if (url) {
      forgotDevLink.href = url;
      forgotDevLinkWrap.hidden = false;
    } else {
      forgotDevLink.removeAttribute("href");
      forgotDevLinkWrap.hidden = true;
    }
  }

  function updateForgotResetHint() {
    if (!forgotResetHint) {
      return;
    }
    if (passwordResetEmailConfigured === false && isProductionSite()) {
      forgotResetHint.hidden = false;
      forgotResetHint.textContent =
        "Password reset email is not configured on this site yet. Submitting will show an error until the host sets up email (Resend).";
      return;
    }
    forgotResetHint.hidden = true;
    forgotResetHint.textContent = "";
  }

  async function loadAuthConfig() {
    try {
      const data = await accounts.api("/api/auth/config");
      passwordResetEmailConfigured = !!data.passwordResetEmail;
    } catch {
      passwordResetEmailConfigured = null;
    }
    updateForgotResetHint();
  }

  function setAuthPasswordVisible(visible) {
    if (!authPassword || !authPasswordToggle) {
      return;
    }
    authPassword.type = visible ? "text" : "password";
    authPasswordToggle.textContent = visible ? "Hide" : "Show";
    authPasswordToggle.setAttribute("aria-label", visible ? "Hide password" : "Show password");
    authPasswordToggle.setAttribute("aria-pressed", visible ? "true" : "false");
  }

  function showForgot(show) {
    if (authForm) authForm.hidden = !!show;
    if (forgotForm) forgotForm.hidden = !show;
    setForgotMessage("");
    setForgotDevLink("");
    setAuthError("");
    updateForgotResetHint();
    if (show && forgotLogin && authUsername?.value) {
      forgotLogin.value = authUsername.value.trim();
    }
    if (show) {
      forgotForm?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      window.requestAnimationFrame(() => {
        (forgotLogin || forgotSubmitBtn)?.focus({ preventScroll: true });
      });
    } else {
      authForm?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function goToProfile() {
    location.href = PROFILE_URL;
  }

  async function doAuth(mode) {
    setAuthError("");
    const login = (authUsername?.value || "").trim();
    const password = authPassword?.value || "";
    const email = (authEmail?.value || "").trim();
    if (!login || !password) {
      setAuthError(
        mode === "register"
          ? "Enter a username, email, and password."
          : "Enter username or email, and password."
      );
      return;
    }
    if (mode === "register" && login.includes("@")) {
      setAuthError("Choose a username for your account (email goes in the email field).");
      return;
    }
    if (mode === "register" && !email) {
      setAuthError("Email is required to create an account.");
      return;
    }
    if (loginBtn) loginBtn.disabled = true;
    if (registerBtn) registerBtn.disabled = true;
    try {
      const body =
        mode === "register"
          ? { username: login, password, email }
          : { login, password };
      const data = await accounts.api(
        mode === "register" ? "/api/auth/register" : "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify(body)
        }
      );
      accounts.setSession(data.token, data.user);
      goToProfile();
    } catch (err) {
      let message = err.message || "Could not sign in.";
      if (err.status === 401 && /no account/i.test(message)) {
        message =
          "No account found on this site. Use Create account, or sign in with the username (not display name) you used when you registered here.";
      } else if (err.status === 401 && /password/i.test(message)) {
        message = "Incorrect password. Passwords are case-sensitive.";
      } else if (err.status === 409) {
        message = err.message || "That username or email is already taken.";
      } else if (!err.status) {
        message = isProductionSite()
          ? "Could not reach the account server. Check your connection and try again in a moment."
          : "Could not reach the account server. Use npm run start:local (or start:static with the API-enabled server), not opening HTML files directly.";
      }
      setAuthError(message);
    } finally {
      if (loginBtn) loginBtn.disabled = false;
      if (registerBtn) registerBtn.disabled = false;
    }
  }

  async function doForgot() {
    setForgotMessage("");
    setForgotDevLink("");
    const login = (forgotLogin?.value || "").trim();
    if (!login) {
      setForgotMessage("Enter your username or email.", { isError: true });
      return;
    }
    if (forgotSubmitBtn) forgotSubmitBtn.disabled = true;
    try {
      const data = await accounts.api("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ login })
      });
      setForgotMessage(
        data.message || "If that account has an email, we sent a reset link.",
        { isError: false }
      );
      if (data.devResetUrl) {
        setForgotDevLink(data.devResetUrl);
      }
    } catch (err) {
      setForgotMessage(err.message || "Could not send reset email.", { isError: true });
    } finally {
      if (forgotSubmitBtn) forgotSubmitBtn.disabled = false;
    }
  }

  void loadAuthConfig();

  authPasswordToggle?.addEventListener("click", () => {
    setAuthPasswordVisible(authPassword?.type === "password");
  });

  loginBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    doAuth("login");
  });
  registerBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    doAuth("register");
  });
  authForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    doAuth("login");
  });
  forgotPasswordBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    showForgot(true);
  });
  forgotBackBtn?.addEventListener("click", () => showForgot(false));
  forgotForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    doForgot();
  });

  accounts.refreshMe().then((user) => {
    if (user) {
      const params = new URLSearchParams(location.search);
      if (params.get("dictionary") === "1") {
        const returnParam = params.get("return");
        location.href = returnParam
          ? `./profile.html?dictionary=1&return=${encodeURIComponent(returnParam)}`
          : "./profile.html?dictionary=1";
        return;
      }
      goToProfile();
    }
  });
})();
