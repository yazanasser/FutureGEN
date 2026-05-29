// FutureGen — Restore slug-based ratings into Firebase
// Paste this into the browser console on futuregen.space

(async function() {
  const db = window._firebaseDb;
  if (!db) { console.error("Firebase not ready — open the site first"); return; }
  const { ref, set } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");

  const ratings = {
  "email-template-builder": {
    "total": 10,
    "count": 3,
    "average": 3.33
  },
  "youware": {
    "total": 15,
    "count": 3,
    "average": 5
  },
  "everdone": {
    "total": 10,
    "count": 2,
    "average": 5
  },
  "cosupport-ai": {
    "total": 23,
    "count": 5,
    "average": 4.6
  },
  "rewnue": {
    "total": 7,
    "count": 2,
    "average": 3.5
  },
  "ordinal": {
    "total": 2,
    "count": 1,
    "average": 2
  },
  "evechange": {
    "total": 1,
    "count": 1,
    "average": 1
  },
  "ori": {
    "total": 9,
    "count": 2,
    "average": 4.5
  },
  "plurality-network": {
    "total": 5,
    "count": 1,
    "average": 5
  },
  "astron-agent": {
    "total": 6,
    "count": 2,
    "average": 3
  },
  "nodeland": {
    "total": 10,
    "count": 2,
    "average": 5
  },
  "rootlenses": {
    "total": 5,
    "count": 1,
    "average": 5
  },
  "google-antigravity": {
    "total": 10,
    "count": 2,
    "average": 5
  },
  "inboxparser": {
    "total": 5,
    "count": 1,
    "average": 5
  },
  "postsyncer": {
    "total": 5,
    "count": 1,
    "average": 5
  },
  "anyreach": {
    "total": 5,
    "count": 1,
    "average": 5
  },
  "pageon-ai": {
    "total": 5,
    "count": 1,
    "average": 5
  },
  "coldi": {
    "total": 5,
    "count": 1,
    "average": 5
  },
  "medo": {
    "total": 8,
    "count": 2,
    "average": 4
  },
  "devlo": {
    "total": 4,
    "count": 1,
    "average": 4
  },
  "docket": {
    "total": 5,
    "count": 1,
    "average": 5
  },
  "alemia-ai": {
    "total": 5,
    "count": 1,
    "average": 5
  },
  "daisy-so": {
    "total": 15,
    "count": 3,
    "average": 5
  },
  "memmachine": {
    "total": 11,
    "count": 3,
    "average": 3.67
  },
  "gptbots-ai": {
    "total": 3,
    "count": 1,
    "average": 3
  },
  "shortmotion": {
    "total": 5,
    "count": 1,
    "average": 5
  },
  "floot": {
    "total": 15,
    "count": 3,
    "average": 5
  },
  "translatevideos-io": {
    "total": 15,
    "count": 3,
    "average": 5
  },
  "omind": {
    "total": 15,
    "count": 3,
    "average": 5
  },
  "magic": {
    "total": 15,
    "count": 3,
    "average": 5
  },
  "openart": {
    "total": 5,
    "count": 1,
    "average": 5
  },
  "dolby-on": {
    "total": 15,
    "count": 3,
    "average": 5
  },
  "imageai-photoshop-with-text-data": {
    "total": 15,
    "count": 3,
    "average": 5
  }
};

  console.log("Writing " + Object.keys(ratings).length + " ratings...");
  await set(ref(db, "ratings"), ratings);
  console.log("✅ Done! Ratings restored.");
})();
