/* ================================
   NEWS LOADER – FINAL PRO (SMART ARABIC EDITOR)
   - Loads /site/data/news.json (60)
   - 3 cards per row desktop (CSS)
   - Infinite scroll batches
   - Smart Arabic rewrite (journalistic)
   - Removes duplicated header image inside body
================================ */


(() => {
  "use strict";


  const NEWS_URL = "/site/data/news.json";
  const BATCH_SIZE = 60;


  let cache = [];
  let indexMap = {};
  let offset = 0;
  let loading = false;
  let initialized = false;


  const el = (id) => document.getElementById(id);


  function getLang() {
    const w = (window.currentLang || "").toLowerCase();
    const doc = (document.documentElement.lang || "").toLowerCase();
    return (w === "ar" || doc === "ar") ? "ar" : "en";
  }


  function esc(s = "") {
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#039;"
    }[m]));
  }


  function normalizeSpaces(s) {
    return String(s || "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
  }


  function removeBoilerplateArabic(s) {
    s = normalizeSpaces(s);
    const patterns = [
      /^خبر تقني:\s*/i,
      /^تقرير مفصل عن\s*/i,
      /يشهد السوق تطورات? ملحوظة.*$/i,
      /تشير التقارير إلى.*$/i,
      /يستمر قطاع التكنولوجيا.*$/i,
      /هذا الخبر التقني يتناول.*$/i,
      /حيث يشهد السوق تطورات.*$/i,
      /مع إطلاق شركات التقنية.*$/i,
    ];
    patterns.forEach((re) => { s = s.replace(re, ""); });
    return normalizeSpaces(s);
  }


  function fixArabicPunctuation(s) {
    s = normalizeSpaces(s);
    s = s.replace(/\s*,\s*/g, "، ");
    s = s.replace(/\s*\.\s*/g, ". ");
    s = s.replace(/\s*:\s*/g, ": ");
    s = s.replace(/\s*!\s*/g, "! ");
    s = s.replace(/\s*\?\s*/g, "؟ ");
    s = s.replace(/([،.!؟])\1+/g, "$1");
    return normalizeSpaces(s);
  }


  function cleanArabicSpam(s) {
    s = normalizeSpaces(s);
    s = s.replace(/(\b[\u0600-\u06FF]{3,}\b)(?:\s+\1){2,}/g, "$1");
    if (/^(?:[A-Za-z]\s*){15,}$/i.test(s)) return "";
    s = s.replace(/([\u0600-\u06FF])\1{5,}/g, "$1$1");
    return normalizeSpaces(s);
  }


  function smartTruncate(text, maxLen = 380) {
    text = normalizeSpaces(text);
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
  }


  function pickLeadSentence(text) {
    text = normalizeSpaces(text);
    if (!text) return "";
    const parts = text.split(/(?<=[.!؟])\s+/).filter(Boolean);
    return normalizeSpaces(parts.slice(0, 2).join(" "));
  }


  function journalistRewriteArabic({ titleAr, categoryAr, summaryAr, bodyAr }) {
    let summary = fixArabicPunctuation(cleanArabicSpam(removeBoilerplateArabic(summaryAr)));
    let body = fixArabicPunctuation(cleanArabicSpam(removeBoilerplateArabic(bodyAr)));
    let base = pickLeadSentence(summary);
    if (!base || base.length < 60) base = pickLeadSentence(body);
    if (!base || base.length < 60) {
      const cat = categoryAr ? `في مجال ${categoryAr}` : "في مجال الذكاء الاصطناعي";
      base = `يتناول هذا الخبر ${cat}، ويسلط الضوء على تطور جديد مرتبط بـ "${titleAr}".`;
    }
    if (!/كشف|أعلن|أوضح|قال|أشار|أكد|أطلقت|تعمل|تواجه|تستعد|تسعى/.test(base)) {
      base = `في تطور جديد، ${base}`;
    }
    return smartTruncate(base, 380).trim();
  }


  function repairArabicHtml(html) {
    if (!html) return "";
    const wrap = document.createElement("div");
    wrap.innerHTML = String(html);
    const walker = document.createTreeWalker(wrap, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n => {
      const t = n.nodeValue || "";
      if (!/[\u0600-\u06FF]/.test(t)) return;
      n.nodeValue = fixArabicPunctuation(cleanArabicSpam(removeBoilerplateArabic(t)));
    });
    return wrap.innerHTML;
  }


  // =========================
  // ✅ FIXED: AbortController timeout + CORS mode + graceful CORB failure
  // =========================
  async function loadOnce() {
    if (cache.length) return cache;

    // Cancel the request after 8 seconds — CORB-blocked requests hang forever without this
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(NEWS_URL, {
        signal: controller.signal,
        mode: "cors",        // fails fast on CORB instead of hanging indefinitely
        credentials: "omit", // no cookies needed for public data
        cache: "default"     // use browser cache (removed ?ts= busting that forced server hit every load)
      });

      clearTimeout(timeoutId);
      if (!res.ok) throw new Error("HTTP " + res.status);

      const data = await res.json();
      cache = Array.isArray(data) ? data : (data.items || data.articles || []);
      cache = cache.filter(Boolean);

      indexMap = {};
      cache.forEach((p, i) => {
        const id = p.id ? String(p.id) : String(i);
        p.__id = id;
        indexMap[id] = p;
      });

      console.log("✅ News loaded:", cache.length);

    } catch (err) {
      clearTimeout(timeoutId);

      // ✅ CORB, timeout, or network error — show message, never hang the page
      const isTimeout = err.name === "AbortError";
      console.warn(isTimeout ? "⚠️ News fetch timed out" : "⚠️ News fetch failed: " + err.message);

      const container = el("blog-posts-container");
      const loadingEl = el("news-loading");
      if (loadingEl) loadingEl.style.display = "none";
      if (container) container.innerHTML =
        '<p class="text-muted text-center py-5">' +
        (getLang() === "ar" ? "الأخبار غير متاحة حالياً." : "News is currently unavailable.") +
        '</p>';

      cache = []; // prevent retry-on-scroll loop
    }

    return cache;
  }


  function createCard(post) {
    const lang = getLang();
    const newsPath = (window.FutureGenRoutes && typeof window.FutureGenRoutes.getNewsPath === "function")
      ? window.FutureGenRoutes.getNewsPath(post)
      : "/news/" + String(post.slug || post.title_en || post.title_ar || post.id || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const title = lang === "ar"
      ? (post.title_ar || post.title_en || "")
      : (post.title_en || post.title_ar || "");

    let summary = "";
    if (lang === "ar") {
      summary = journalistRewriteArabic({
        titleAr: post.title_ar || title,
        categoryAr: post.category_ar || "",
        summaryAr: post.summary_ar || "",
        bodyAr: post.body_ar || ""
      });
    } else {
      summary = smartTruncate(normalizeSpaces(post.summary_en || post.summary_ar || ""), 320);
    }

    const card = document.createElement("div");
    card.className = "news-card-item";
    card.innerHTML = `
      <div class="card h-100 shadow-sm border-0" style="cursor:pointer;">
        ${post.image ? `<a href="${esc(newsPath)}"><img src="${esc(post.image)}" alt="${esc(title)}" loading="lazy" onerror="this.style.display='none'" style="width:100%;height:180px;object-fit:cover;display:block;border-radius:8px 8px 0 0;"></a>` : ""}
        <div class="card-body d-flex flex-column">
          <a href="${esc(newsPath)}" class="text-decoration-none text-inherit" style="color:inherit;">
            <h5 class="card-title fw-normal mb-2">${esc(title)}</h5>
          </a>
          <p class="card-text text-muted flex-grow-1 fw-light">${esc(summary)}</p>
          <a class="btn btn-primary mt-auto" href="${esc(newsPath)}" data-open="${esc(post.__id)}">
            ${lang === "ar" ? "اقرأ المزيد" : "Read more"}
          </a>
        </div>
      </div>
    `;
    return card;
  }


  function renderBatch(reset = false) {
    const container = el("blog-posts-container");
    const loadingEl = el("news-loading");
    if (!container) return;
    if (reset) { container.innerHTML = ""; offset = 0; }
    cache.slice(offset, offset + BATCH_SIZE).forEach((post) => container.appendChild(createCard(post)));
    offset += BATCH_SIZE;
    if (loadingEl) loadingEl.style.display = "none";
  }


  function setupScroll() {
    window.addEventListener("scroll", () => {
      if (loading || offset >= cache.length) return;
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
        loading = true;
        const loadingEl = el("news-loading");
        if (loadingEl) loadingEl.style.display = "block";
        setTimeout(() => { renderBatch(false); loading = false; }, 200);
      }
    });
  }


  function openPost(id) {
    const post = indexMap[String(id)];
    if (!post) return;
    const newsPath = (window.FutureGenRoutes && typeof window.FutureGenRoutes.getNewsPath === "function")
      ? window.FutureGenRoutes.getNewsPath(post)
      : "/news/" + String(post.slug || post.title_en || post.title_ar || post.id || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

    window.location.assign(newsPath);
  }


  async function openNewsPageAndRender() {
    await loadOnce();
    renderBatch(true);
    if (!initialized) { setupScroll(); initialized = true; }
  }


  // =========================
  // ✅ FIX: Use MutationObserver instead of click listener.
  //
  // ROOT CAUSE: main.js calls e.stopImmediatePropagation() on every .nav-link
  // click, which blocks news_loader.js from ever seeing the click on #news-link.
  // main.js calls showPage('news-page') which sets display:block — we observe
  // that change and trigger loading automatically, regardless of what caused it.
  // =========================
  function attachNewsObserver() {
    const newsPage = el("news-page");
    const backBlog = el("back-to-home-from-blog");

    if (!newsPage) return;

    // If news-page is already visible on load (e.g. hash navigation), render now
    if (newsPage.style.display !== "none" && newsPage.style.display !== "") {
      openNewsPageAndRender();
    }

    // Watch for display changes on #news-page
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.attributeName === "style") {
          const visible = newsPage.style.display !== "none" && newsPage.style.display !== "";
          if (visible && el("blog-posts-container") && !el("blog-posts-container").children.length) {
            openNewsPageAndRender();
          }
        }
      });
    });

    observer.observe(newsPage, { attributes: true, attributeFilter: ["style"] });

    // Back button: return to news list (not home)
    if (backBlog) {
      backBlog.addEventListener("click", () => {
        document.querySelectorAll(".page").forEach(p => (p.style.display = "none"));
        newsPage.style.display = "block";
      });
    }
  }

  // Works whether DOMContentLoaded has fired or not (handles async script loading)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachNewsObserver);
  } else {
    attachNewsObserver();
  }

  window.openNewsPageAndRender = openNewsPageAndRender;
  window.__NEWS_ON_LANGUAGE_CHANGED__ = openNewsPageAndRender;

})();