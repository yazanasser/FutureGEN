// FutureGen — Restore favorites for the currently logged-in user
// Paste into browser console on futuregen.space while logged in

(async function() {
  // All favorites from backup (keyed by email variants)
  const backupFavorites = {
  "nalogaili@gmail_com": [
    "youware"
  ],
  "test@example_com": [
    "chopdi-ai",
    "email-template-builder"
  ],
  "yazanasser2013@gmail,com": [
    "youware",
    "cosupport-ai",
    "google-antigravity",
    "memmachine"
  ],
  "yazanasser2013@gmail_com": [
    "google-antigravity",
    "memmachine",
    "cosupport-ai",
    "everdone",
    "atono",
    "cospace",
    "email-template-builder",
    "thematic",
    "youware",
    "emdash",
    "nodeland",
    "astron-agent"
  ]
};

  // Get current user
  var userData;
  try { userData = JSON.parse(localStorage.getItem("currentUser")); } catch(e) {}
  if (!userData || !userData.isLoggedIn || !userData.email) {
    console.error("Not logged in — please log in first");
    return;
  }
  var email = userData.email.toLowerCase();
  console.log("Logged in as:", email);

  // Find matching favorites (try exact key, _ variant, , variant)
  var favList = backupFavorites[email] ||
    backupFavorites[email.replace(/./g, "_")] ||
    backupFavorites[email.replace(/./g, ",")] ||
    null;

  if (!favList) {
    console.warn("No backup favorites found for:", email);
    console.log("Available:", Object.keys(backupFavorites));
    return;
  }

  console.log("Restoring", favList.length, "favorites:", favList);

  // 1. Save to localStorage
  localStorage.setItem("favorites_" + email, JSON.stringify(favList));
  localStorage.setItem("favorites_slugs_" + email, JSON.stringify(favList));
  // Clear the migration marker so the cleanup does not wipe it again
  localStorage.setItem("fg_slg_v1_" + email, "1");

  // 2. Save to Firestore
  if (window.fsSetDoc && window.fsDb && window.fsDoc) {
    const docRef = window.fsDoc(window.fsDb, "users", email, "data", "favorites");
    await window.fsSetDoc(docRef, { list: favList });
    console.log("✅ Firestore updated");
  } else {
    console.warn("Firestore not ready — localStorage updated only");
  }

  // 3. Refresh UI
  if (typeof updateAllFavoriteButtons === "function") updateAllFavoriteButtons();
  console.log("✅ Done! Favorites restored for", email);
})();
