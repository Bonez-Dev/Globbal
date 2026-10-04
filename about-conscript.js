/**
 * About page: "Get Conscripted" goes to profile when already signed in.
 */
(function aboutConscriptLink() {
  const btn = document.getElementById("aboutConscriptBtn");
  const accounts = window.GlobbleAccounts;
  if (!btn || !accounts) {
    return;
  }

  const SIGN_IN_URL = "./sign-in.html";
  const PROFILE_URL = "./profile.html";

  function setHref(signedIn) {
    btn.href = signedIn ? PROFILE_URL : SIGN_IN_URL;
  }

  if (accounts.getToken()) {
    setHref(true);
  }

  accounts.refreshMe().then((user) => {
    setHref(!!user);
  });
})();
