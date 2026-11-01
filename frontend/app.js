(function () {
  "use strict";

  var savedTheme = "light";
  try { savedTheme = localStorage.getItem("maeen-theme") || "light"; } catch (error) { /* Private browsing may block storage. */ }
  document.documentElement.dataset.theme = savedTheme === "dark" ? "dark" : "light";

  // English is the default language; Arabic is the second language.
  var savedLang = "en";
  try { savedLang = localStorage.getItem("maeen-lang") || "en"; } catch (error) { /* Private browsing may block storage. */ }
  var lang = savedLang === "ar" ? "ar" : "en";
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";

  // Every text on the site is written twice: English first, then Arabic.
  function t(en, ar) {
    return lang === "ar" ? ar : en;
  }

  var app = document.getElementById("app");
  var path = window.location.pathname.replace(/\/+$/, "") || "/";
  var routes = {
    "/": "landing",
    "/signin": "signin",
    "/signup": "signup",
    "/verify": "verify",
    "/dashboard": "dashboard",
    "/upload": "upload",
    "/contracts": "contracts",
    "/contracts/details": "details",
    "/ask": "ask",
    "/account": "account"
  };
  var page = document.body.getAttribute("data-maeen-page") || routes[path] || "landing";

  // A hosted frontend can set window.MAEEN_API_URL before loading app.js.
  // Same-origin deployments work without configuration.
  var LOCAL_API_URL = "http://127.0.0.1:8000";
  var isLocalSite = ["localhost", "127.0.0.1", ""].indexOf(location.hostname) !== -1;
  var API_URL = (window.MAEEN_API_URL || (isLocalSite ? LOCAL_API_URL : location.origin)).replace(/\/$/, "");
  var SESSION_KEY = "maeen-session";
  // The assistant conversation lasts for this browser tab only.
  var ASSISTANT_KEY = "maeen-assistant";
  // The email waiting for its activation code lasts for this browser tab only.
  var PENDING_EMAIL_KEY = "maeen-pending-email";
  var scriptRoot = new URL(".", document.querySelector('script[src$="app.js"]').src);

  // When the site is opened from files (file://), each link must point to the page's index.html.
  function pageUrl(href) {
    if (location.protocol !== "file:") return href;
    var hashParts = href.split("#");
    var queryParts = hashParts[0].split("?");
    var route = queryParts[0].replace(/^\/|\/$/g, "");
    var destination = (route ? route + "/" : "") + "index.html" + (queryParts[1] ? "?" + queryParts[1] : "") + (hashParts[1] ? "#" + hashParts[1] : "");
    return new URL(destination, scriptRoot).href;
  }

  // The sign-in token from the backend is kept in the browser until it expires.
  function readSession() {
    try {
      var saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (saved && saved.token && saved.expiresAt > Date.now()) return saved;
    } catch (error) { /* Private browsing may block storage. */ }
    return null;
  }
  function saveSession(token, expiresIn) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ token: token, expiresAt: Date.now() + expiresIn * 1000 }));
      return true;
    } catch (error) {
      return false;
    }
  }
  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (error) { /* Nothing was saved. */ }
    try { sessionStorage.removeItem(ASSISTANT_KEY); } catch (error) { /* Nothing was saved. */ }
  }
  function rememberPendingEmail(email) {
    try {
      sessionStorage.setItem(PENDING_EMAIL_KEY, email);
      return true;
    } catch (error) {
      return false;
    }
  }
  function readPendingEmail() {
    try { return sessionStorage.getItem(PENDING_EMAIL_KEY) || ""; } catch (error) { return ""; }
  }
  function forgetPendingEmail() {
    try { sessionStorage.removeItem(PENDING_EMAIL_KEY); } catch (error) { /* Nothing was saved. */ }
  }
  var session = readSession();

  // Inner pages need a signed-in user; the sign-in pages are skipped when already signed in.
  var protectedPages = ["dashboard", "upload", "contracts", "details", "ask", "account"];
  if (protectedPages.indexOf(page) !== -1 && !session) {
    location.replace(pageUrl("/signin/"));
    return;
  }
  if ((page === "signin" || page === "signup" || page === "verify") && session) {
    location.replace(pageUrl("/dashboard/"));
    return;
  }
  // The code page only makes sense right after sign-up or sign-in in this tab.
  if (page === "verify" && !readPendingEmail()) {
    location.replace(pageUrl("/signin/"));
    return;
  }
  document.body.classList.add("page-" + page);

  var DISCLAIMER = t("Answers are based solely on the contract text and do not constitute legal advice.", "تستند الإجابات إلى نص العقد فقط، ولا تُعد استشارة قانونية.");
  var MAX_PDF_BYTES = 50 * 1024 * 1024;

  function icon(name) {
    var paths = {
      home: '<path d="m3 10 9-7 9 7v10H3zM9 20v-7h6v7"/>',
      contracts: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h6"/>',
      ask: '<path d="M4 4h16v12H9l-5 4zM8 8h8m-8 4h5"/>',
      upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
      account: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
      logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
      summary: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h4"/>',
      risk: '<path d="M12 3 2 20h20zM12 10v4m0 3v.01"/>',
      source: '<path d="m9 15 6-6m-4.5-2.5 1.6-1.6a3.9 3.9 0 0 1 5.5 5.5l-1.6 1.6m-2.5 5.5-1.6 1.6a3.9 3.9 0 0 1-5.5-5.5l1.6-1.6"/>',
      recent: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      star: '<path d="m12 2.8 2.7 5.6 6.2.9-4.5 4.4 1.1 6.2L12 17l-5.5 2.9 1.1-6.2-4.5-4.4 6.2-.9z"/>',
      menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
      moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
      sparkle: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
      refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
      close: '<path d="M6 6l12 12M18 6 6 18"/>',
      minimize: '<path d="M6 12h12"/>',
      restore: '<path d="m6 15 6-6 6 6"/>',
      send: '<path d="M12 19V5m-6 6 6-6 6 6"/>'
    };
    return '<svg class="ui-icon icon-' + name + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[name] + '</svg>';
  }

  function brand() {
    return [
      "<a class='wordmark' href='/' aria-label='", t("MAEEN, home page", "منصة معين، الصفحة الرئيسية"), "'>",
      "<span class='mark' aria-hidden='true'><svg viewBox='0 0 64 64' fill='none' stroke='currentColor' stroke-width='6' stroke-linecap='round'><path d='M18 39c10-17 16-21 26-17M18 39c12-1 22-3 28-10M18 39l12 9'/></svg></span>",
      t("<span>MAEEN<small lang='ar'>معين</small></span>", "<span>معين<small lang='en'>MAEEN</small></span>"),
      "</a>"
    ].join("");
  }

  function themeToggle() {
    return "<button class='icon-button theme-toggle' type='button' data-theme-toggle title='" + t("Toggle theme", "تبديل المظهر") + "' aria-label='" + t("Toggle theme", "تبديل المظهر") + "' aria-pressed='false'>" + icon("moon") + icon("sun") + "</button>";
  }

  // The button shows the other language, written in that language.
  function langToggle() {
    return "<button class='lang-toggle' type='button' data-lang-toggle>" + t("<span lang='ar'>العربية</span>", "<span lang='en'>English</span>") + "</button>";
  }

  function skipLink() {
    return "<a class='skip-link' href='#main-content'>" + t("Skip to main content", "تجاوز إلى المحتوى الرئيسي") + "</a>";
  }

  function navLink(href, label, active) {
    var name = {"/dashboard/": "home", "/contracts/": "contracts", "/ask/": "ask", "/upload/": "upload", "/account/": "account"}[href];
    return "<a class='nav-link" + (active ? " active" : "") + "' href='" + href + "'" + (active ? " aria-current='page'" : "") + ">" + icon(name) + "<span>" + label + "</span></a>";
  }

  function emptyState(iconName, title, text, action) {
    return "<div class='empty'><span class='empty-icon'>" + icon(iconName) + "</span><h3>" + title + "</h3><p>" + text + "</p>" + (action || "") + "</div>";
  }

  // File names come from users, so they are escaped before going into HTML.
  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function statusInfo(status) {
    return ({
      uploaded: { label: t("Uploaded", "تم الرفع"), css: "uploaded" },
      processing: { label: t("Analyzing", "قيد التحليل"), css: "processing" },
      completed: { label: t("Complete", "مكتمل"), css: "complete" },
      failed: { label: t("Analysis failed", "تعذّر التحليل"), css: "failed" }
    })[status] || { label: status, css: "" };
  }

  function statusBadge(status) {
    var info = statusInfo(status);
    return "<span class='status" + (info.css ? " status-" + info.css : "") + "'>" + escapeHtml(info.label) + "</span>";
  }

  // Gregorian dates with Western digits in both languages.
  var dateLocale = lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB";
  var dateFormat = new Intl.DateTimeFormat(dateLocale, { day: "numeric", month: "short", year: "numeric" });
  var dateTimeFormat = new Intl.DateTimeFormat(dateLocale, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  function formatDate(value, withTime) {
    var date = new Date(value);
    if (isNaN(date.getTime())) return "—";
    return (withTime ? dateTimeFormat : dateFormat).format(date);
  }

  // ---------- AI text: answers, analysis, and their sources ----------
  // AI text becomes paragraphs, lists and bold words. It is never inserted as HTML.
  function addInline(parent, text) {
    String(text).split(/\*\*(.+?)\*\*/).forEach(function (part, index) {
      if (!part) return;
      if (index % 2) {
        var strong = document.createElement("strong");
        strong.textContent = part;
        parent.appendChild(strong);
      } else {
        parent.appendChild(document.createTextNode(part));
      }
    });
  }
  function formatReply(text) {
    var fragment = document.createDocumentFragment();
    var list = null;
    var paragraph = null;
    String(text).split(/\r?\n/).forEach(function (rawLine) {
      var line = rawLine.trim();
      if (!line) { list = null; paragraph = null; return; }
      var bullet = line.match(/^[-*•]\s+(.*)$/);
      var numbered = line.match(/^(\d+)[.)]\s+(.*)$/);
      if (bullet || numbered) {
        var tag = bullet ? "ul" : "ol";
        if (!list || list.tagName.toLowerCase() !== tag) {
          list = document.createElement(tag);
          if (numbered) list.start = parseInt(numbered[1], 10);
          fragment.appendChild(list);
        }
        var item = document.createElement("li");
        addInline(item, bullet ? bullet[1] : numbered[2]);
        list.appendChild(item);
        paragraph = null;
        return;
      }
      list = null;
      line = line.replace(/^#{1,6}\s+/, "");
      if (paragraph) {
        paragraph.appendChild(document.createElement("br"));
      } else {
        paragraph = document.createElement("p");
        fragment.appendChild(paragraph);
      }
      addInline(paragraph, line);
    });
    return fragment;
  }

  function pagesLabel(pages) {
    var list = (pages || []).filter(function (page, index, all) {
      return typeof page === "number" && page > 0 && all.indexOf(page) === index;
    }).sort(function (a, b) { return a - b; });
    if (!list.length) return "";
    return list.length === 1 ? t("Page ", "صفحة ") + list[0] : t("Pages ", "الصفحات ") + list.join(t(", ", "، "));
  }
  function pageRef(pages) {
    var label = pagesLabel(pages);
    if (!label) return null;
    var ref = document.createElement("span");
    ref.className = "page-ref";
    ref.textContent = label;
    return ref;
  }
  function cleanSources(sources) {
    return (Array.isArray(sources) ? sources : []).filter(function (source) {
      return source && typeof source.page === "number" && typeof source.text === "string" && source.text.trim();
    });
  }
  // Each source is the contract passage an answer is based on, with its page.
  function sourcesBlock(sources) {
    var block = document.createElement("div");
    block.className = "sources";
    var heading = document.createElement("span");
    heading.className = "sources-title";
    heading.textContent = t("Sources in the contract", "المصادر في العقد");
    block.appendChild(heading);
    var list = document.createElement("ul");
    sources.forEach(function (source) {
      var item = document.createElement("li");
      item.appendChild(pageRef([source.page]));
      var quote = document.createElement("q");
      quote.setAttribute("dir", "auto");
      var text = source.text.replace(/\s+/g, " ").trim();
      quote.textContent = text.length > 280 ? text.slice(0, 280) + "…" : text;
      item.appendChild(quote);
      list.appendChild(item);
    });
    block.appendChild(list);
    return block;
  }
  function answerBubble(answer, sources) {
    var bubble = document.createElement("div");
    bubble.className = "bubble bubble-assistant";
    bubble.setAttribute("dir", "auto");
    bubble.appendChild(formatReply(answer));
    var shown = cleanSources(sources);
    if (shown.length) bubble.appendChild(sourcesBlock(shown));
    return bubble;
  }
  function questionBubble(text, caption) {
    var bubble = document.createElement("div");
    bubble.className = "bubble bubble-user";
    bubble.setAttribute("dir", "auto");
    if (caption) {
      var note = document.createElement("span");
      note.className = "bubble-caption";
      note.textContent = caption;
      bubble.appendChild(note);
    }
    bubble.appendChild(document.createTextNode(text));
    return bubble;
  }
  function typingIndicator(label) {
    var typing = document.createElement("div");
    typing.className = "bubble bubble-assistant assistant-typing";
    typing.innerHTML = "<span class='sr-only'></span><i></i><i></i><i></i>";
    typing.firstChild.textContent = label;
    return typing;
  }
  function errorBubble(message) {
    var bubble = document.createElement("div");
    bubble.className = "bubble bubble-error";
    var text = document.createElement("span");
    text.textContent = message;
    bubble.appendChild(text);
    return bubble;
  }

  function contractRow(contract) {
    var favorite = isFavorite(contract.id);
    return [
      "<div class='list-row' role='listitem'>",
      "<a class='row-name' href='", pageUrl("/contracts/details/?id=" + encodeURIComponent(contract.id)), "'><bdi>", escapeHtml(contract.file_name), "</bdi></a>",
      "<span class='row-status'>", statusBadge(contract.status), "</span>",
      "<span class='row-date'>", formatDate(contract.updated_at), "</span>",
      "<button class='fav-button row-fav' type='button' data-favorite='", escapeHtml(contract.id), "' aria-pressed='", favorite ? "true" : "false", "' aria-label='", t("Favorite", "المفضلة"), ": ", escapeHtml(contract.file_name), "'>", icon("star"), "</button>",
      "</div>"
    ].join("");
  }

  function contractTable(list) {
    return [
      "<div class='list-head' aria-hidden='true'><span>", t("Contract name", "اسم العقد"), "</span><span>", t("Status", "الحالة"), "</span><span>", t("Last updated", "تاريخ آخر تحديث"), "</span><span>", t("Favorite", "المفضلة"), "</span></div>",
      "<div role='list'>", list.map(contractRow).join(""), "</div>"
    ].join("");
  }

  function listState(text, isError) {
    return "<div class='list-state'>" + (isError ? "<p class='alert' role='alert'>" + escapeHtml(text) + "</p>" : "<p>" + escapeHtml(text) + "</p>") + "</div>";
  }

  // Favorites and recently opened contracts are kept in this browser, per user,
  // until the backend stores them.
  function sessionUserId() {
    try {
      return JSON.parse(atob(session.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).sub || "user";
    } catch (error) {
      return "user";
    }
  }
  var favoritesKey = session ? "maeen-favorites-" + sessionUserId() : "";
  var recentKey = session ? "maeen-recent-" + sessionUserId() : "";
  function readList(key) {
    try {
      var saved = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch (error) {
      return [];
    }
  }
  function writeList(key, list) {
    try { localStorage.setItem(key, JSON.stringify(list)); } catch (error) { /* The list lasts for this page only. */ }
  }
  function isFavorite(id) {
    return readList(favoritesKey).indexOf(id) !== -1;
  }
  function toggleFavorite(id) {
    var list = readList(favoritesKey);
    var index = list.indexOf(id);
    if (index === -1) list.push(id);
    else list.splice(index, 1);
    writeList(favoritesKey, list);
    return index === -1;
  }
  function rememberRecent(id) {
    var list = readList(recentKey).filter(function (item) { return item !== id; });
    list.unshift(id);
    writeList(recentKey, list.slice(0, 20));
  }
  function forgetContract(id) {
    writeList(favoritesKey, readList(favoritesKey).filter(function (item) { return item !== id; }));
    writeList(recentKey, readList(recentKey).filter(function (item) { return item !== id; }));
  }

  function shell(current, title, content) {
    return [
      skipLink(),
      "<div class='app'>",
      "<aside class='sidebar' id='sidebar' aria-label='", t("Main menu", "القائمة الرئيسية"), "'>",
      brand(),
      "<nav class='sidebar-nav' aria-label='", t("Main navigation", "التنقل الرئيسي"), "'>",
      navLink("/dashboard/", t("Home", "الرئيسية"), current === "dashboard"),
      navLink("/contracts/", t("Contracts", "العقود"), current === "contracts" || current === "details"),
      navLink("/ask/", t("Inquiries", "الاستفسارات"), current === "ask"),
      navLink("/upload/", t("Upload contract", "رفع عقد"), current === "upload"),
      navLink("/account/", t("Account", "الحساب"), current === "account"),
      "</nav>",
      "<div class='sidebar-footer'><button class='nav-button' type='button' data-sign-out>", icon("logout"), "<span>", t("Sign out", "تسجيل الخروج"), "</span></button></div>",
      "</aside>",
      "<button class='sidebar-backdrop' type='button' aria-label='", t("Close menu", "إغلاق القائمة"), "' data-menu-close></button>",
      "<main class='main' id='main-content' tabindex='-1'>",
      "<header class='topbar'><div class='topbar-start'><button class='icon-button mobile-menu-button' type='button' aria-label='", t("Open main menu", "فتح القائمة الرئيسية"), "' aria-controls='sidebar' aria-expanded='false' data-menu-toggle>", icon("menu"), "</button><span class='topbar-title'>", title, "</span></div>",
      "<div class='topbar-actions'>", langToggle(), themeToggle(), "</div></header>",
      "<div class='content'>", content, "</div>",
      "</main></div>",
      assistant()
    ].join("");
  }

  // The MAEEN Assistant: a round button in the bottom corner that opens a chat window.
  function assistant() {
    return [
      "<button class='assistant-fab' type='button' id='assistant-fab' aria-controls='assistant-panel' aria-expanded='false' aria-label='", t("Open MAEEN Assistant", "فتح مساعد معين"), "' title='", t("MAEEN Assistant", "مساعد معين"), "'>", icon("sparkle"), "</button>",
      "<section class='assistant-panel' id='assistant-panel' role='dialog' aria-modal='false' aria-labelledby='assistant-title' hidden>",
      "<header class='assistant-head'><h2 id='assistant-title'>", icon("sparkle"), "<span>", t("MAEEN Assistant", "مساعد معين"), "</span></h2>",
      "<div class='assistant-head-actions'>",
      "<button class='icon-button' type='button' data-assistant-minimize aria-expanded='true' aria-label='", t("Minimize assistant", "تصغير المساعد"), "' title='", t("Minimize", "تصغير"), "'>", icon("minimize"), "</button>",
      "<button class='icon-button' type='button' data-assistant-new aria-label='", t("New conversation", "محادثة جديدة"), "' title='", t("New conversation", "محادثة جديدة"), "'>", icon("refresh"), "</button>",
      "<button class='icon-button' type='button' data-assistant-close aria-label='", t("Close assistant", "إغلاق المساعد"), "' title='", t("Close", "إغلاق"), "'>", icon("close"), "</button>",
      "</div></header>",
      "<div class='assistant-scope'><label for='assistant-contract'>", t("Ask about", "السؤال عن"), "</label>",
      "<select class='input' id='assistant-contract'><option value=''>", t("General questions", "أسئلة عامة"), "</option></select></div>",
      "<div class='assistant-log' id='assistant-log' role='log' aria-live='polite' aria-label='", t("Conversation", "المحادثة"), "'></div>",
      "<form class='assistant-compose' id='assistant-form'>",
      "<label class='sr-only' for='assistant-input'>", t("Type your question", "اكتب سؤالك"), "</label>",
      "<textarea class='input' id='assistant-input' rows='1' maxlength='2000' dir='auto' placeholder='", t("Type your question", "اكتب سؤالك"), "'></textarea>",
      "<button class='button button-primary assistant-send' type='submit' aria-label='", t("Send", "إرسال"), "' title='", t("Send", "إرسال"), "'>", icon("send"), "</button>",
      "</form>",
      "<p class='assistant-note'>", t("General information only; it does not constitute legal advice.", "معلومات عامة فقط، ولا تُعد استشارة قانونية."), "</p>",
      "</section>"
    ].join("");
  }

  function landing() {
    function service(iconName, title, text) {
      return "<div class='service'>" + icon(iconName) + "<h3>" + title + "</h3><p>" + text + "</p></div>";
    }
    function step(number, title, text) {
      return "<li class='step'><span class='step-number'>" + number + "</span><h3>" + title + "</h3><p>" + text + "</p></li>";
    }
    return [
      skipLink(),
      "<header class='site-top on-dark'><div class='wrap site-header'>",
      brand(),
      "<nav class='site-nav' aria-label='", t("Page sections", "أقسام الصفحة"), "'><a href='#services'>", t("Services", "الخدمات"), "</a><a href='#how'>", t("How it works", "آلية العمل"), "</a></nav>",
      "<div class='header-actions'>", langToggle(), themeToggle(),
      session
        ? "<a class='button button-light' href='/dashboard/'>" + t("Dashboard", "لوحة التحكم") + "</a>"
        : "<a class='header-signin' href='/signin/'>" + t("Sign in", "تسجيل الدخول") + "</a><a class='button button-light header-signup' href='/signup/'>" + t("Create account", "إنشاء حساب جديد") + "</a>",
      "</div>",
      "</div></header>",
      "<main id='main-content' tabindex='-1'>",
      "<section class='hero on-dark' aria-labelledby='hero-title'><div class='wrap hero-copy'>",
      "<span class='eyebrow'>", t("AI-powered contract analysis", "تحليل العقود بالذكاء الاصطناعي"), "</span>",
      "<h1 id='hero-title'>", t("MAEEN Contract Analysis Platform", "منصة معين لتحليل العقود"), "</h1>",
      "<p>", t("Summarize contracts, identify clauses that require review, and get answers to your inquiries, with every finding linked to its location in the original text.", "تلخيص العقود، وتحديد البنود التي تستوجب المراجعة، والإجابة عن استفساراتك مع الإحالة إلى موضع كل نتيجة في النص الأصلي."), "</p>",
      "<div class='hero-actions'><a class='button button-light' href='/upload/'>", t("Upload contract", "رفع عقد"), "</a><a class='button button-outline-light' href='#how'>", t("How it works", "آلية العمل"), "</a></div>",
      "</div></section>",
      "<div class='wrap'><div class='product-shot' role='img' aria-label='", t("Illustrative analysis result for a residential lease agreement", "مثال توضيحي لنتيجة تحليل عقد إيجار سكني"), "'>",
      "<div class='shot-nav' aria-hidden='true'><span class='active'>", t("Contracts", "العقود"), "</span><span>", t("Inquiries", "الاستفسارات"), "</span><span>", t("Upload contract", "رفع عقد"), "</span></div>",
      "<div class='shot-main' aria-hidden='true'>",
      "<div class='shot-title'><strong>", t("Residential lease agreement", "عقد إيجار سكني"), "</strong><span class='status status-complete'>", t("Complete", "مكتمل"), "</span></div>",
      "<div class='shot-facts'><div><span>", t("Contract term", "مدة العقد"), "</span><b>", t("12 months", "12 شهرًا"), "</b></div><div><span>", t("Payment frequency", "دورية السداد"), "</span><b>", t("Monthly", "شهرية"), "</b></div><div><span>", t("Termination", "الإنهاء"), "</span><b>", t("30 days' prior notice", "إشعار مسبق 30 يومًا"), "</b></div></div>",
      "<p class='source-note'>", t("Source: Clause 7, page 3", "المصدر: البند 7، الصفحة 3"), "</p>",
      "</div></div></div>",
      "<section class='section' id='services' aria-labelledby='services-title'><div class='wrap'>",
      "<div class='section-head'><h2 id='services-title'>", t("Platform services", "خدمات المنصة"), "</h2></div>",
      "<div class='services'>",
      service("summary", t("Contract summary", "ملخص العقد"), t("A concise overview of the contract's parties, obligations, and key terms.", "عرض موجز لأطراف العقد والتزاماته وشروطه الأساسية.")),
      service("risk", t("Risk identification", "تحديد المخاطر"), t("Highlights the clauses that require review before signing.", "إبراز البنود التي تستوجب المراجعة قبل التوقيع.")),
      service("source", t("Source referencing", "الإحالة إلى المصدر"), t("Links every finding to its page and clause in the original text.", "ربط كل نتيجة برقم الصفحة والبند في النص الأصلي.")),
      "</div></div></section>",
      "<section class='section' id='how' aria-labelledby='how-title'><div class='wrap'>",
      "<div class='section-head'><h2 id='how-title'>", t("How it works", "آلية العمل"), "</h2></div>",
      "<ol class='steps'>",
      step(1, t("Upload the contract", "رفع العقد"), t("Upload the contract in PDF format.", "ارفع العقد بصيغة PDF.")),
      step(2, t("Analysis", "التحليل"), t("The platform extracts the clauses and key information.", "تستخرج المنصة البنود والمعلومات الأساسية.")),
      step(3, t("Review the results", "مراجعة النتائج"), t("Review the summary and risks, and trace each finding back to its location in the contract.", "اطّلع على الملخص والمخاطر، وارجع إلى موضع كل نتيجة في العقد.")),
      "</ol>",
      "<div class='cta-band on-dark'><div><h2>", t("Answers grounded in the contract text", "إجابات مستندة إلى نص العقد"), "</h2><p>", t("Create an account to upload contracts and track their analysis results.", "أنشئ حسابك لرفع العقود ومتابعة نتائج تحليلها."), "</p></div><a class='button button-light' href='/signup/'>", t("Create account", "إنشاء حساب جديد"), "</a></div>",
      "</div></section>",
      "</main>",
      "<footer class='wrap site-footer'><span>", t("© 2026 MAEEN. All rights reserved.", "جميع الحقوق محفوظة لمنصة معين © 2026"), "</span><span>", t("The information provided is for illustrative purposes only and does not constitute legal advice.", "المعلومات المقدمة لأغراض توضيحية ولا تُعد استشارة قانونية."), "</span></footer>"
    ].join("");
  }

  // Sign-in, sign-up and account activation share the half-navy layout.
  function authLayout(card) {
    return [
      skipLink(),
      "<div class='auth'>",
      "<aside class='auth-aside on-dark'>",
      "<div class='auth-aside-top'>", brand(), "<div class='aside-actions'>", langToggle(), themeToggle(), "</div></div>",
      "<div><h1>", t("MAEEN Contract Analysis Platform", "منصة معين لتحليل العقود"), "</h1><p>", t("Contract summaries and risk identification, with every finding linked to its location in the original text.", "تلخيص العقود وتحديد المخاطر، مع الإحالة إلى موضع كل نتيجة في النص الأصلي."), "</p></div>",
      "<small>", t("© 2026 MAEEN. All rights reserved.", "جميع الحقوق محفوظة لمنصة معين © 2026"), "</small>",
      "</aside>",
      "<main class='auth-main' id='main-content' tabindex='-1'><div class='auth-card'>",
      card,
      "</div></main></div>"
    ].join("");
  }

  function auth(type) {
    var signup = type === "signup";
    return authLayout([
      "<h2>", signup ? t("Create account", "إنشاء حساب جديد") : t("Sign in", "تسجيل الدخول"), "</h2>",
      "<p>", signup ? t("Please enter the required information to create your account.", "يرجى إدخال البيانات المطلوبة لإنشاء حسابك.") : t("Please enter your sign-in details.", "يرجى إدخال بيانات تسجيل الدخول."), "</p>",
      "<p class='notice notice-info' id='auth-notice' role='status' hidden></p>",
      "<form data-auth-form>",
      signup ? "<div class='field-pair'><div class='field'><label for='first-name'>" + t("First name", "الاسم الأول") + "</label><input class='input' id='first-name' name='firstName' type='text' autocomplete='given-name' maxlength='50' required></div><div class='field'><label for='last-name'>" + t("Last name", "اسم العائلة") + "</label><input class='input' id='last-name' name='lastName' type='text' autocomplete='family-name' maxlength='50' required></div></div>" : "",
      "<div class='field'><label for='email'>", t("Email address", "البريد الإلكتروني"), "</label><input class='input' id='email' name='email' type='email' dir='ltr' autocomplete='email' placeholder='name@example.com' required data-latin-digits></div>",
      "<div class='field'><label for='password'>", t("Password", "كلمة المرور"), "</label><input class='input' id='password' name='password' type='password' required data-latin-digits",
      signup ? " autocomplete='new-password' minlength='8' aria-describedby='password-hint'>" : " autocomplete='current-password'>",
      signup ? "<span class='hint' id='password-hint'>" + t("Password must be at least 8 characters and include letters and numbers.", "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل، وتشمل حروفًا إنجليزية وأرقامًا.") + "</span>" : "",
      "</div>",
      signup ? "<div class='field'><label for='password-confirm'>" + t("Confirm password", "تأكيد كلمة المرور") + "</label><input class='input' id='password-confirm' name='passwordConfirm' type='password' required autocomplete='new-password' minlength='8' data-latin-digits></div>" : "",
      "<p class='alert' id='auth-error' role='alert' hidden></p>",
      "<button class='button button-primary button-block' type='submit'>", signup ? t("Create account", "إنشاء الحساب") : t("Sign in", "تسجيل الدخول"), "</button>",
      "</form>",
      "<p class='auth-switch'>", signup ? t("Already have an account?", "لديك حساب؟") + " <a class='text-link' href='/signin/'>" + t("Sign in", "تسجيل الدخول") + "</a>" : t("Don't have an account?", "ليس لديك حساب؟") + " <a class='text-link' href='/signup/'>" + t("Create account", "إنشاء حساب جديد") + "</a>", "</p>",
      "<a class='text-link auth-back' href='/'>", t("Back to home page", "العودة إلى الصفحة الرئيسية"), "</a>"
    ].join(""));
  }

  function verify() {
    return authLayout([
      "<h2>", t("Account activation", "تفعيل الحساب"), "</h2>",
      "<p>", t("Please enter the verification code sent to", "يرجى إدخال رمز التحقق المرسل إلى"), " <bdi dir='ltr' id='verify-email'></bdi>.</p>",
      "<p class='notice notice-info' id='verify-notice' role='status' hidden></p>",
      "<form data-verify-form>",
      "<div class='field'><label for='code'>", t("Verification code", "رمز التحقق"), "</label><input class='input input-code' id='code' name='code' type='text' inputmode='numeric' autocomplete='one-time-code' maxlength='12' dir='ltr' required aria-describedby='code-hint'>",
      "<span class='hint' id='code-hint'>", t("The code consists of numbers only.", "يتكون الرمز من أرقام فقط."), "</span></div>",
      "<p class='alert' id='verify-error' role='alert' hidden></p>",
      "<button class='button button-primary button-block' type='submit'>", t("Activate account", "تفعيل الحساب"), "</button>",
      "</form>",
      "<p class='auth-switch'>", t("Did not receive the code?", "لم يصلك الرمز؟"), " <button class='button-link' type='button' data-resend-code>", t("Resend code", "إعادة إرسال الرمز"), "</button></p>",
      "<a class='text-link auth-back' href='/signin/'>", t("Back to sign in", "العودة إلى تسجيل الدخول"), "</a>"
    ].join(""));
  }

  function dashboard() {
    function stat(kind, label) {
      return "<div class='stat'><span class='status status-" + kind + "'>" + label + "</span><b data-stat='" + kind + "'><span aria-hidden='true'>—</span><span class='sr-only'>" + t("No data", "لا توجد بيانات") + "</span></b></div>";
    }
    var content = [
      "<div class='page-head'><div><h1>", t("Welcome to MAEEN", "أهلًا بك في منصة معين"), "</h1><p>", t("Track your contracts and their analysis status, or upload a new contract.", "تابع عقودك وحالة تحليلها، أو ارفع عقدًا جديدًا."), "</p></div><a class='button button-primary' href='/upload/'>", t("Upload contract", "رفع عقد"), "</a></div>",
      "<section class='block' aria-labelledby='services-title'><h2 class='section-title' id='services-title'>", t("Services", "الخدمات"), "</h2><div class='actions'>",
      "<a class='action' href='/upload/'><span class='action-icon'>", icon("upload"), "</span><span><strong>", t("Upload contract", "رفع عقد"), "</strong><span>", t("Upload a PDF contract for analysis.", "رفع عقد بصيغة PDF لتحليله."), "</span></span></a>",
      "<a class='action' href='/ask/'><span class='action-icon'>", icon("ask"), "</span><span><strong>", t("Ask about a contract", "الاستفسار عن عقد"), "</strong><span>", t("Ask about an analyzed contract and view the source of each answer.", "طرح استفسار حول عقد مكتمل التحليل والاطلاع على مصدر الإجابة."), "</span></span></a>",
      "</div></section>",
      "<section class='panel block' aria-labelledby='overview-title'><div class='panel-head'><h2 id='overview-title'>", t("Contracts overview", "ملخص العقود"), "</h2></div>",
      "<div class='stats'>", stat("uploaded", t("Uploaded", "تم الرفع")), stat("processing", t("Analyzing", "قيد التحليل")), stat("complete", t("Complete", "مكتمل")), stat("failed", t("Analysis failed", "تعذّر التحليل")), "</div>",
      "<div class='panel-head'><h3>", t("Recent contracts", "أحدث العقود"), "</h3><div class='panel-links'><a class='text-link' href='/contracts/#favorites'>", t("Favorites", "المفضلة"), "</a><a class='text-link' href='/contracts/'>", t("View all contracts", "عرض جميع العقود"), "</a></div></div>",
      "<div id='recent-contracts'>", listState(t("Loading contracts…", "جارٍ تحميل العقود…")), "</div>",
      "</section>"
    ].join("");
    return shell("dashboard", t("Home", "الرئيسية"), content);
  }

  function contracts() {
    var content = [
      "<div class='page-head'><div><h1>", t("Contracts", "العقود"), "</h1><p>", t("All uploaded contracts and their analysis status.", "جميع العقود المرفوعة وحالة تحليلها."), "</p></div><a class='button button-primary' href='/upload/'>", t("Upload contract", "رفع عقد"), "</a></div>",
      "<section class='panel' aria-label='", t("Contract list", "قائمة العقود"), "'>",
      "<div class='panel-tabs'><div class='tabs' role='group' aria-label='", t("Filter contracts", "تصفية العقود"), "'>",
      "<button class='tab active' type='button' data-library-tab='all' aria-pressed='true'>", t("All contracts", "جميع العقود"), "</button>",
      "<button class='tab' type='button' data-library-tab='recent' aria-pressed='false'>", t("Recent", "الأحدث"), "</button>",
      "<button class='tab' type='button' data-library-tab='favorites' aria-pressed='false'>", t("Favorites", "المفضلة"), "</button>",
      "</div></div>",
      "<div class='toolbar'><label class='sr-only' for='contract-search'>", t("Search by contract name", "البحث باسم العقد"), "</label><input class='input search-input' id='contract-search' type='search' placeholder='", t("Search by contract name", "البحث باسم العقد"), "'>",
      "<label class='sr-only' for='contract-sort'>", t("Sort contracts", "ترتيب العقود"), "</label><select class='input sort-select' id='contract-sort'><option value='newest'>", t("Newest first", "الأحدث أولًا"), "</option><option value='oldest'>", t("Oldest first", "الأقدم أولًا"), "</option></select></div>",
      "<div id='contract-list'>", listState(t("Loading contracts…", "جارٍ تحميل العقود…")), "</div>",
      "</section>",
      "<div class='legend'><span>", t("Contract statuses:", "حالات العقد:"), "</span><span class='status status-uploaded'>", t("Uploaded", "تم الرفع"), "</span><span class='status status-processing'>", t("Analyzing", "قيد التحليل"), "</span><span class='status status-complete'>", t("Complete", "مكتمل"), "</span><span class='status status-failed'>", t("Analysis failed", "تعذّر التحليل"), "</span></div>"
    ].join("");
    return shell("contracts", t("Contracts", "العقود"), content);
  }

  function upload() {
    var content = [
      "<div class='page-head'><div><h1>", t("Upload contract", "رفع عقد"), "</h1><p>", t("Please select the contract file in PDF format.", "يرجى اختيار ملف العقد بصيغة PDF."), "</p></div></div>",
      "<div class='upload-grid'><section class='panel upload-card' aria-label='", t("Select the contract file", "اختيار ملف العقد"), "'>",
      "<div class='dropzone' id='dropzone'><span class='empty-icon'>", icon("upload"), "</span><h2>", t("Drag and drop the contract file here", "اسحب ملف العقد وأفلته هنا"), "</h2><p>", t("Or choose the file from your device. Accepted format: PDF. Maximum size: 50 MB.", "أو اختر الملف من جهازك. الصيغة المقبولة: PDF، والحد الأقصى للحجم: 50 ميغابايت."), "</p>",
      "<button class='button button-secondary' type='button' id='select-file'>", t("Choose file", "اختيار ملف"), "</button><input class='file-input' id='file-input' type='file' accept='.pdf,application/pdf' tabindex='-1' aria-hidden='true'></div>",
      "<div class='file-row' id='file-preview' hidden><div><strong id='file-name'></strong><span id='file-size'></span></div><button class='button-link' type='button' id='remove-file'>", t("Remove", "إزالة"), "</button></div>",
      "<p class='alert' id='upload-error' role='alert' hidden></p>",
      "<div class='upload-actions'><button class='button button-primary' type='button' id='upload-submit'>", t("Upload contract", "رفع العقد"), "</button></div>",
      "</section>",
      "<aside class='panel help'><h2>", t("Before uploading", "قبل الرفع"), "</h2><p>", t("Make sure the file is in PDF format and that its pages are clear and legible.", "تأكد من أن الملف بصيغة PDF، وأن صفحاته واضحة وقابلة للقراءة."), "</p><hr class='divider'><h2>", t("After uploading", "بعد الرفع"), "</h2><p>", t("The contract status appears on the Contracts page, and analysis starts automatically once the upload is complete.", "تظهر حالة العقد في صفحة العقود، ويبدأ التحليل تلقائيًا بعد اكتمال الرفع."), "</p></aside>",
      "</div>"
    ].join("");
    return shell("upload", t("Upload contract", "رفع عقد"), content);
  }

  function details() {
    function tab(name, label, selected) {
      return "<button class='tab" + (selected ? " active" : "") + "' type='button' role='tab' id='tab-" + name + "' aria-controls='panel-" + name + "' aria-selected='" + (selected ? "true" : "false") + "' data-tab='" + name + "'>" + label + "</button>";
    }
    var tags = [
      t("Parties", "الأطراف"), t("Obligations", "الالتزامات"), t("Payment terms", "شروط الدفع"), t("Termination", "الإنهاء"),
      t("Renewal", "التجديد"), t("Material clauses", "البنود الجوهرية"), t("Risks", "المخاطر")
    ].map(function (label) {
      return "<span class='tag' role='listitem'>" + label + "</span>";
    }).join("");
    var content = [
      "<a class='text-link back-link' href='/contracts/'>", t("Back to contracts", "العودة إلى العقود"), "</a>",
      "<div class='page-head'><div><h1>", t("Contract details", "تفاصيل العقد"), "</h1></div><span id='detail-status'><span class='status'>", t("No contract selected", "لم يُحدَّد عقد"), "</span></span></div>",
      "<p class='alert detail-error' id='detail-error' role='alert' hidden></p>",
      "<div class='panel meta'><div><span>", t("File name", "اسم الملف"), "</span><strong id='detail-file'>—</strong></div><div><span>", t("Status", "الحالة"), "</span><strong id='detail-state'>—</strong></div><div><span>", t("Upload date", "تاريخ الرفع"), "</span><strong id='detail-date'>—</strong></div></div>",
      "<p class='suggested-filename' id='suggested-filename' hidden></p>",
      "<div class='analysis-state' id='analysis-state' role='status' hidden></div>",
      "<section class='panel'><div class='panel-tabs'><div class='tabs' role='tablist' aria-label='", t("Contract sections", "أقسام العقد"), "'>",
      tab("overview", t("Overview", "نظرة عامة"), true), tab("analysis", t("Analysis results", "نتائج التحليل"), false), tab("ask", t("Inquiries", "الاستفسارات"), false),
      "</div></div>",
      "<div class='tab-panel' role='tabpanel' id='panel-overview' aria-labelledby='tab-overview' data-tab-panel='overview'><div id='overview-body'><div class='detail-grid'>",
      "<div class='detail-box'><h3>", t("Contract summary", "ملخص العقد"), "</h3><p>", t("The summary will appear once the contract analysis is complete.", "يظهر الملخص بعد اكتمال تحليل العقد."), "</p></div>",
      "<div class='detail-box'><h3>", t("Key information", "المعلومات الأساسية"), "</h3><p>", t("Key information will appear once the contract analysis is complete.", "تظهر المعلومات الأساسية بعد اكتمال تحليل العقد."), "</p></div>",
      "</div></div></div>",
      "<div class='tab-panel' role='tabpanel' id='panel-analysis' aria-labelledby='tab-analysis' data-tab-panel='analysis' hidden><div id='analysis-body'>",
      emptyState("summary", t("No analysis results", "لا توجد نتائج تحليل"), t("Analysis results will appear here, each linked to its source.", "تظهر هنا نتائج التحليل مع الإحالة إلى مصدر كل نتيجة.")),
      "<div class='tags' role='list' aria-label='", t("Analysis sections", "أقسام التحليل"), "'>", tags, "</div>",
      "</div></div>",
      "<div class='tab-panel' role='tabpanel' id='panel-ask' aria-labelledby='tab-ask' data-tab-panel='ask' hidden>",
      "<h2 class='section-title'>", t("Ask about the contract", "الاستفسار عن العقد"), "</h2><p class='muted'>", t("Each answer shows the page and the text it is based on.", "تظهر الإجابة مع رقم الصفحة والنص الذي تستند إليه."), "</p>",
      "<div class='thread' id='detail-thread' role='log' aria-live='polite' aria-label='", t("Inquiry conversation", "محادثة الاستفسار"), "' hidden></div>",
      "<form class='qa-form' id='detail-ask-form'><label class='sr-only' for='detail-question'>", t("Type your inquiry", "اكتب استفسارك"), "</label><textarea class='input' id='detail-question' rows='3' maxlength='2000' dir='auto' placeholder='", t("Example: What are the termination conditions?", "مثال: ما شروط إنهاء العقد؟"), "'></textarea><button class='button button-primary' type='submit'>", t("Submit inquiry", "إرسال الاستفسار"), "</button></form>",
      "<p class='disclaimer'>", DISCLAIMER, "</p>",
      "</div>",
      "</section>",
      "<div class='detail-actions' id='detail-actions' hidden><button class='button button-secondary' type='button' id='apply-suggested-name' hidden>", t("Use suggested name", "استخدام الاسم المقترح"), "</button><button class='button button-danger' type='button' id='delete-contract'>", t("Delete contract", "حذف العقد"), "</button></div>"
    ].join("");
    return shell("details", t("Contract details", "تفاصيل العقد"), content);
  }

  function ask() {
    var content = [
      "<div class='page-head'><div><h1>", t("Inquiries", "الاستفسارات"), "</h1><p>", t("Please select a contract to begin.", "يرجى اختيار عقد للبدء."), "</p></div></div>",
      "<section class='panel ask' aria-label='", t("Ask about a contract", "الاستفسار عن عقد"), "'>",
      "<aside class='ask-aside'>",
      "<div><label class='aside-label' for='ask-contract'>", t("Selected contract", "العقد المحدد"), "</label><select class='input' id='ask-contract'><option value=''>", t("Select a contract", "اختيار عقد"), "</option></select><p class='aside-note' id='ask-contract-note'>", t("Loading contracts…", "جارٍ تحميل العقود…"), "</p></div>",
      "<div class='history'><span class='aside-label'>", t("Inquiry history", "سجل الاستفسارات"), "</span><p class='aside-note' id='ask-history-note'>", t("No previous inquiries.", "لا توجد استفسارات سابقة."), "</p></div>",
      "<a class='button button-secondary' href='/upload/'>", t("Upload contract", "رفع عقد"), "</a>",
      "</aside>",
      "<div class='ask-main'>",
      "<div class='ask-top'><strong>", t("New inquiry", "استفسار جديد"), "</strong><span id='ask-selected'>", t("Please select a contract", "يرجى اختيار عقد"), "</span></div>",
      "<div class='ask-body' role='log' aria-label='", t("Inquiry conversation", "محادثة الاستفسار"), "'><div class='ask-welcome'><span class='empty-icon'>", icon("ask"), "</span>",
      "<h3>", t("Ask about a contract", "الاستفسار عن عقد"), "</h3><p>", t("Select an analyzed contract, then type your inquiry. Each answer shows the page, clause, and text it is based on.", "اختر عقدًا مكتمل التحليل، ثم اكتب استفسارك. تظهر كل إجابة مع رقم الصفحة والبند والنص الذي تستند إليه."), "</p>",
      "<div class='suggestions' role='group' aria-label='", t("Example inquiries", "أمثلة على الاستفسارات"), "'><button class='suggestion' type='button'>", t("What are my obligations under the contract?", "ما التزاماتي في العقد؟"), "</button><button class='suggestion' type='button'>", t("What are the termination conditions?", "ما شروط إنهاء العقد؟"), "</button><button class='suggestion' type='button'>", t("What are the renewal terms?", "ما شروط التجديد؟"), "</button></div>",
      "</div><div class='thread' id='ask-thread' hidden></div></div>",
      "<div class='composer-wrap'><form class='composer' id='ask-form'><label class='sr-only' for='contract-question'>", t("Type your inquiry", "اكتب استفسارك"), "</label><textarea class='input' id='contract-question' rows='1' maxlength='2000' dir='auto' placeholder='", t("Type your inquiry here", "اكتب استفسارك هنا"), "'></textarea><button class='button button-primary' type='submit'>", t("Submit inquiry", "إرسال الاستفسار"), "</button></form>",
      "<p class='disclaimer'>", DISCLAIMER, "</p></div>",
      "</div></section>"
    ].join("");
    return shell("ask", t("Inquiries", "الاستفسارات"), content);
  }

  function account() {
    var content = [
      "<div class='page-head'><div><h1>", t("Account", "الحساب"), "</h1><p>", t("Your account details and sign-in settings.", "بيانات حسابك وإعدادات الدخول."), "</p></div></div>",
      "<div class='account-grid'>",
      "<section class='panel' aria-labelledby='account-info-title'><div class='panel-head'><h2 id='account-info-title'>", t("Account details", "بيانات الحساب"), "</h2></div><div class='panel-body'>",
      "<div class='field-row'><span>", t("Name", "الاسم"), "</span><strong id='account-name' dir='auto'>—</strong></div>",
      "<div class='field-row'><span>", t("Email address", "البريد الإلكتروني"), "</span><strong id='account-email' dir='ltr'>—</strong></div>",
      "<div class='field-row'><span>", t("Account status", "حالة الحساب"), "</span><strong>", t("Signed in", "مسجّل الدخول"), "</strong></div>",
      "</div></section>",
      "<section class='panel panel-pad account-login' aria-labelledby='account-signout-title'><h2 class='section-title' id='account-signout-title'>", t("Sign out", "تسجيل الخروج"), "</h2><p class='muted'>", t("End your session on this device.", "إنهاء الجلسة على هذا الجهاز."), "</p><button class='button button-secondary' type='button' data-sign-out>", t("Sign out", "تسجيل الخروج"), "</button></section>",
      "</div>"
    ].join("");
    return shell("account", t("Account", "الحساب"), content);
  }

  var views = {
    landing: landing,
    signin: function () { return auth("signin"); },
    signup: function () { return auth("signup"); },
    verify: verify,
    dashboard: dashboard,
    upload: upload,
    contracts: contracts,
    details: details,
    ask: ask,
    account: account
  };
  app.innerHTML = views[page]();
  if (location.protocol === "file:") {
    app.querySelectorAll('a[href^="/"]').forEach(function (link) {
      link.href = pageUrl(link.getAttribute("href"));
    });
  }

  var darkHeader = page === "landing" || page === "signin" || page === "signup";
  function syncThemeButtons() {
    var dark = document.documentElement.dataset.theme === "dark";
    var themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute("content", darkHeader ? (dark ? "#12223a" : "#13294b") : (dark ? "#0f1218" : "#f7f8fa"));
    document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
      button.setAttribute("aria-pressed", dark ? "true" : "false");
      button.setAttribute("aria-label", dark ? t("Switch to light mode", "تفعيل الوضع الفاتح") : t("Switch to dark mode", "تفعيل الوضع الداكن"));
    });
  }
  syncThemeButtons();
  document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
    button.addEventListener("click", function () {
      var next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("maeen-theme", next); } catch (error) { /* Theme still applies for this page. */ }
      syncThemeButtons();
    });
  });
  document.querySelectorAll("[data-lang-toggle]").forEach(function (button) {
    button.addEventListener("click", function () {
      try { localStorage.setItem("maeen-lang", lang === "ar" ? "en" : "ar"); } catch (error) { /* Without storage the language cannot change. */ }
      location.reload();
    });
  });
  document.title = ({
    landing: t("MAEEN Contract Analysis Platform", "منصة معين لتحليل العقود"),
    signin: t("Sign in | MAEEN", "تسجيل الدخول | معين"),
    signup: t("Create account | MAEEN", "إنشاء حساب جديد | معين"),
    verify: t("Account activation | MAEEN", "تفعيل الحساب | معين"),
    dashboard: t("Home | MAEEN", "الرئيسية | معين"),
    upload: t("Upload contract | MAEEN", "رفع عقد | معين"),
    contracts: t("Contracts | MAEEN", "العقود | معين"),
    details: t("Contract details | MAEEN", "تفاصيل العقد | معين"),
    ask: t("Inquiries | MAEEN", "الاستفسارات | معين"),
    account: t("Account | MAEEN", "الحساب | معين")
  })[page];
  var descriptionMeta = document.querySelector('meta[name="description"]');
  if (descriptionMeta) descriptionMeta.setAttribute("content", t("MAEEN Contract Analysis Platform: contract summaries and risk identification, with every finding linked to its location in the original text.", "منصة معين لتحليل العقود: تلخيص العقود وتحديد المخاطر، مع الإحالة إلى موضع كل نتيجة في النص الأصلي."));

  var toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  document.body.appendChild(toast);
  var toastTimer;
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 4600);
  }

  // Calls the General Backend and resolves with its JSON reply. A failure has .status
  // (0 when the backend cannot be reached) and .detail from the backend.
  function request(method, apiPath, options) {
    options = options || {};
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(method, API_URL + apiPath);
      xhr.timeout = options.timeout || (options.body instanceof FormData ? 0 : 30000);
      if (session) xhr.setRequestHeader("Authorization", "Bearer " + session.token);
      var body = options.body || null;
      if (options.json) {
        xhr.setRequestHeader("Content-Type", "application/json");
        body = JSON.stringify(options.json);
      }
      if (options.onProgress) {
        xhr.upload.addEventListener("progress", function (event) {
          if (event.lengthComputable) options.onProgress(event.loaded / event.total);
        });
      }
      // For replies sent in parts: receives the reply text so far each time more arrives.
      if (options.onText) {
        xhr.addEventListener("progress", function () {
          if (xhr.status >= 200 && xhr.status < 300) options.onText(xhr.responseText);
        });
      }
      function fail(status, detail) {
        var error = new Error("Request failed with status " + status);
        error.status = status;
        error.detail = detail;
        reject(error);
      }
      xhr.addEventListener("load", function () {
        var data = null;
        try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch (error) { /* The reply is not JSON. */ }
        if (xhr.status === 401 && session) {
          // The token expired or was revoked, so the user signs in again.
          clearSession();
          location.replace(pageUrl("/signin/?expired=1"));
          var expired = new Error("Session expired");
          expired.status = 401;
          expired.redirected = true;
          reject(expired);
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          if (options.onText) options.onText(xhr.responseText);
          resolve(data);
        } else {
          fail(xhr.status, data && data.detail);
        }
      });
      xhr.addEventListener("error", function () { fail(0); });
      xhr.addEventListener("timeout", function () { fail(0); });
      xhr.send(body);
    });
  }

  function errorMessage(error) {
    if (error.status === 0) return t("Sorry, the service could not be reached. Please check your connection and try again.", "عذرًا، تعذّر الاتصال بالخدمة. يرجى التحقق من الاتصال والمحاولة مرة أخرى.");
    if (error.status === 429) return t("Sorry, too many attempts. Please wait a moment and try again.", "عذرًا، تجاوزت عدد المحاولات المسموح. يرجى الانتظار قليلًا ثم المحاولة مرة أخرى.");
    if (error.status >= 500) return t("Sorry, the service is currently unavailable. Please try again later.", "عذرًا، الخدمة غير متاحة حاليًا. يرجى المحاولة لاحقًا.");
    return t("Sorry, the request could not be completed. Please try again.", "عذرًا، تعذّر إكمال الطلب. يرجى المحاولة مرة أخرى.");
  }

  // Keeps a button from being pressed twice while its request runs.
  function setBusy(button, busy, busyText) {
    if (busy) {
      button.dataset.label = button.textContent;
      button.textContent = busyText;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    } else {
      if (button.dataset.label) button.textContent = button.dataset.label;
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }

  // Removes a one-time flag such as ?uploaded=1 from the address after it is shown.
  function takeQueryFlag(name) {
    var params = new URLSearchParams(location.search);
    if (!params.has(name)) return false;
    params.delete(name);
    var query = params.toString();
    if (location.protocol !== "file:") history.replaceState(null, "", location.pathname + (query ? "?" + query : "") + location.hash);
    return true;
  }

  document.querySelectorAll("[data-sign-out]").forEach(function (button) {
    button.addEventListener("click", function () {
      clearSession();
      location.href = pageUrl("/signin/");
    });
  });

  // Arabic and Persian keyboards type their own digits (٠-٩ and ۰-۹), but emails,
  // passwords and codes accept only 0-9, so these boxes switch them while typing.
  function toLatinDigits(value) {
    return value.replace(/[٠-٩۰-۹]/g, function (digit) {
      var code = digit.charCodeAt(0);
      return String(code - (code >= 0x06F0 ? 0x06F0 : 0x0660));
    });
  }
  document.querySelectorAll("[data-latin-digits]").forEach(function (input) {
    input.addEventListener("input", function () {
      var value = toLatinDigits(input.value);
      if (value === input.value) return;
      // Each digit stays one character, so the cursor can stay where it was.
      var start = input.selectionStart;
      var end = input.selectionEnd;
      input.value = value;
      if (start !== null) input.setSelectionRange(start, end);
    });
  });

  var authForm = document.querySelector("[data-auth-form]");
  if (authForm) {
    var authError = document.getElementById("auth-error");
    var authNotice = document.getElementById("auth-notice");
    var authSubmit = authForm.querySelector("[type='submit']");
    if (page === "signin" && takeQueryFlag("expired")) {
      authNotice.textContent = t("Your session has expired. Please sign in again.", "انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.");
      authNotice.hidden = false;
    }
    var authErrorMessage = function (error) {
      if (error.status === 401) return t("Sorry, the email address or password is incorrect.", "عذرًا، البريد الإلكتروني أو كلمة المرور غير صحيحة.");
      if (error.status === 403 && page === "signin") return t("Sorry, your account has not been activated yet.", "عذرًا، لم يُفعَّل الحساب بعد.");
      if (error.status === 422) {
        var nameMissing = Array.isArray(error.detail) && error.detail.some(function (issue) {
          return issue.loc.indexOf("first_name") !== -1 || issue.loc.indexOf("last_name") !== -1;
        });
        if (nameMissing) return t("Please enter your first name and last name.", "يرجى إدخال الاسم الأول واسم العائلة.");
        return Array.isArray(error.detail)
          ? t("Please enter a valid email address.", "يرجى إدخال بريد إلكتروني صحيح.")
          : t("Sorry, the password does not meet the requirements. It must be at least 8 characters and include letters and numbers.", "عذرًا، كلمة المرور لا تستوفي المتطلبات. يجب أن تتكون من 8 أحرف على الأقل، وتشمل حروفًا إنجليزية وأرقامًا.");
      }
      if (page === "signup" && error.status === 409) return t("An account with this email address already exists. Please sign in instead.", "يوجد حساب مسجّل بهذا البريد الإلكتروني. يرجى تسجيل الدخول بدلًا من ذلك.");
      if (page === "signup" && (error.status === 400 || error.status === 403)) return t("Sorry, the account could not be created. Please check your information and try again.", "عذرًا، تعذّر إنشاء الحساب. يرجى التحقق من البيانات والمحاولة مرة أخرى.");
      if (error.storage) return t("Sorry, your browser blocked saving the sign-in. Please allow site data and try again.", "عذرًا، منع المتصفح حفظ بيانات الدخول. يرجى السماح بحفظ بيانات المواقع والمحاولة مرة أخرى.");
      return errorMessage(error);
    };
    authForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      authError.hidden = true;
      authNotice.hidden = true;
      // The password is hidden while typing, so sign-up asks for it twice.
      if (page === "signup" && toLatinDigits(authForm.elements.password.value) !== toLatinDigits(authForm.elements.passwordConfirm.value)) {
        authError.textContent = t("Sorry, the passwords do not match.", "عذرًا، كلمتا المرور غير متطابقتين.");
        authError.hidden = false;
        authForm.elements.passwordConfirm.focus();
        return;
      }
      var credentials = { email: toLatinDigits(authForm.elements.email.value.trim()), password: toLatinDigits(authForm.elements.password.value) };
      if (page === "signup") {
        credentials.first_name = authForm.elements.firstName.value.trim();
        credentials.last_name = authForm.elements.lastName.value.trim();
      }
      setBusy(authSubmit, true, page === "signup" ? t("Creating account…", "جارٍ إنشاء الحساب…") : t("Signing in…", "جارٍ تسجيل الدخول…"));
      try {
        if (page === "signup") {
          var signup = await request("POST", "/api/auth/register", { json: credentials });
          if (!rememberPendingEmail(credentials.email)) {
            var signupStorageError = new Error("Storage blocked");
            signupStorageError.storage = true;
            throw signupStorageError;
          }
          location.href = pageUrl(signup && signup.account_status === "not_activated" ? "/verify/?notactivated=1" : "/verify/");
          return;
        }
        var reply = await request("POST", "/api/auth/login", { json: credentials });
        if (!saveSession(reply.access_token, reply.expires_in || 3600)) {
          var storageError = new Error("Storage blocked");
          storageError.storage = true;
          throw storageError;
        }
        location.replace(pageUrl("/dashboard/"));
      } catch (error) {
        // An account that is not activated yet goes to the code page instead of an error.
        if (page === "signin" && error.status === 403 && rememberPendingEmail(credentials.email)) {
          location.href = pageUrl("/verify/?unconfirmed=1");
          return;
        }
        setBusy(authSubmit, false);
        authError.textContent = authErrorMessage(error);
        authError.hidden = false;
      }
    });
  }

  var verifyForm = document.querySelector("[data-verify-form]");
  if (verifyForm) {
    var pendingEmail = readPendingEmail();
    var verifyError = document.getElementById("verify-error");
    var verifyNotice = document.getElementById("verify-notice");
    var verifySubmit = verifyForm.querySelector("[type='submit']");
    var resendButton = document.querySelector("[data-resend-code]");
    document.getElementById("verify-email").textContent = pendingEmail;
    var verifyErrorMessage = function (error) {
      if (error.status === 400) return t("Sorry, the verification code is incorrect or has expired.", "عذرًا، رمز التحقق غير صحيح أو منتهي الصلاحية.");
      if (error.status === 422) return t("Please enter the verification code as it appears in the email.", "يرجى إدخال رمز التحقق كما ورد في البريد الإلكتروني.");
      if (error.storage) return t("Sorry, your browser blocked saving the sign-in. Please allow site data and try again.", "عذرًا، منع المتصفح حفظ بيانات الدخول. يرجى السماح بحفظ بيانات المواقع والمحاولة مرة أخرى.");
      return errorMessage(error);
    };
    // Pasted codes may contain spaces.
    var normalizeCode = function (value) {
      return toLatinDigits(value.replace(/\s+/g, ""));
    };
    verifyForm.elements.code.addEventListener("input", function () {
      var code = normalizeCode(this.value);
      if (code !== this.value) this.value = code;
    });
    verifyForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      verifyError.hidden = true;
      verifyNotice.hidden = true;
      setBusy(verifySubmit, true, t("Activating…", "جارٍ التفعيل…"));
      try {
        var reply = await request("POST", "/api/auth/verify", { json: { email: pendingEmail, code: normalizeCode(verifyForm.elements.code.value) } });
        if (!saveSession(reply.access_token, reply.expires_in || 3600)) {
          var storageError = new Error("Storage blocked");
          storageError.storage = true;
          throw storageError;
        }
        forgetPendingEmail();
        location.replace(pageUrl("/dashboard/"));
      } catch (error) {
        setBusy(verifySubmit, false);
        verifyError.textContent = verifyErrorMessage(error);
        verifyError.hidden = false;
      }
    });
    var sendNewCode = async function (sentText) {
      verifyError.hidden = true;
      verifyNotice.hidden = true;
      resendButton.disabled = true;
      try {
        await request("POST", "/api/auth/resend", { json: { email: pendingEmail } });
        verifyNotice.textContent = sentText;
        verifyNotice.hidden = false;
      } catch (error) {
        verifyError.textContent = error.status === 429
          ? t("Sorry, please wait a moment before requesting a new code.", "عذرًا، يرجى الانتظار قليلًا قبل طلب رمز جديد.")
          : errorMessage(error);
        verifyError.hidden = false;
      } finally {
        resendButton.disabled = false;
      }
    };
    resendButton.addEventListener("click", function () {
      sendNewCode(t("A new code has been sent to your email.", "تم إرسال رمز جديد إلى بريدك الإلكتروني."));
    });
    // Signing in does not send a code, so an account that is not activated gets a new one on arrival.
    if (takeQueryFlag("unconfirmed")) {
      sendNewCode(t("Your account has not been activated yet. A new verification code has been sent to your email.", "لم يُفعَّل حسابك بعد. تم إرسال رمز تحقق جديد إلى بريدك الإلكتروني."));
    }
    // Signing up again with an account that is not activated already sent a new code.
    if (takeQueryFlag("notactivated")) {
      verifyNotice.textContent = t("This email address is already registered, but the account has not been activated yet. A new verification code has been sent to your email.", "هذا البريد الإلكتروني مسجّل مسبقًا، ولكن الحساب لم يُفعَّل بعد. تم إرسال رمز تحقق جديد إلى بريدك الإلكتروني.");
      verifyNotice.hidden = false;
    }
  }
  // ---------- Questions about a contract (AI Backend) ----------
  function contractQuestionError(error) {
    if (error.status === 409) return t("Inquiries become available once the contract analysis is complete.", "تتاح الاستفسارات بعد اكتمال تحليل العقد.");
    if (error.status === 404) return t("Sorry, this contract does not exist or is no longer available.", "عذرًا، هذا العقد غير موجود أو لم يعد متاحًا.");
    if (error.status === 503) return t("Sorry, the analysis service is currently unavailable. Please try again later.", "عذرًا، خدمة التحليل غير متاحة حاليًا. يرجى المحاولة لاحقًا.");
    return errorMessage(error);
  }
  function showInThread(thread, element) {
    thread.hidden = false;
    thread.appendChild(element);
    element.scrollIntoView({ block: "nearest" });
  }
  function renderChatHistory(thread, entries) {
    thread.textContent = "";
    entries.forEach(function (entry) {
      thread.appendChild(questionBubble(entry.question));
      thread.appendChild(answerBubble(entry.answer, entry.sources));
    });
    thread.hidden = entries.length === 0;
  }
  // Sends one question and shows the answer, with its sources, in the thread.
  function sendContractQuestion(contractId, question, thread, button, input) {
    showInThread(thread, questionBubble(question));
    var typing = typingIndicator(t("Preparing the answer", "جارٍ إعداد الإجابة"));
    showInThread(thread, typing);
    input.value = "";
    setBusy(button, true, t("Sending…", "جارٍ الإرسال…"));
    return request("POST", "/api/contracts/" + encodeURIComponent(contractId) + "/chat", { json: { question: question }, timeout: 90000 }).then(function (data) {
      typing.remove();
      showInThread(thread, answerBubble(data.answer, data.sources));
    }).catch(function (error) {
      typing.remove();
      if (error.redirected) return;
      showInThread(thread, errorBubble(contractQuestionError(error)));
      input.value = question;
    }).then(function () {
      setBusy(button, false);
    });
  }
  function readQuestion(input) {
    var question = input.value.trim().slice(0, 2000);
    if (!question) {
      input.focus();
      showToast(t("Please type your inquiry first.", "يرجى كتابة الاستفسار أولًا."));
    }
    return question;
  }

  document.querySelectorAll(".suggestion").forEach(function (button) {
    button.addEventListener("click", function () {
      var question = document.getElementById("contract-question");
      question.value = button.textContent;
      question.focus();
    });
  });

  var sidebar = document.getElementById("sidebar");
  var menuToggle = document.querySelector("[data-menu-toggle]");
  var backdrop = document.querySelector("[data-menu-close]");
  var mobileQuery = window.matchMedia("(max-width: 800px)");
  function syncMenuAccessibility() {
    if (!sidebar) return;
    var hidden = mobileQuery.matches && !sidebar.classList.contains("open");
    sidebar.inert = hidden;
    sidebar.setAttribute("aria-hidden", hidden ? "true" : "false");
  }
  function closeMenu(returnFocus) {
    if (!sidebar || !menuToggle || !backdrop) return;
    var wasOpen = sidebar.classList.contains("open");
    sidebar.classList.remove("open");
    backdrop.classList.remove("show");
    menuToggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("menu-open");
    if (returnFocus && wasOpen) menuToggle.focus();
    syncMenuAccessibility();
  }
  if (menuToggle && sidebar && backdrop) {
    syncMenuAccessibility();
    mobileQuery.addEventListener("change", function () {
      if (!mobileQuery.matches) closeMenu(false);
      syncMenuAccessibility();
    });
    menuToggle.addEventListener("click", function () {
      var open = !sidebar.classList.contains("open");
      if (!open) { closeMenu(true); return; }
      sidebar.classList.add("open");
      backdrop.classList.add("show");
      menuToggle.setAttribute("aria-expanded", "true");
      document.body.classList.add("menu-open");
      syncMenuAccessibility();
      sidebar.querySelector(".nav-link").focus();
    });
    backdrop.addEventListener("click", function () { closeMenu(true); });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeMenu(true);
      if (event.key !== "Tab" || !mobileQuery.matches || !sidebar.classList.contains("open")) return;
      var items = Array.from(sidebar.querySelectorAll("a, button:not(:disabled)"));
      var first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }

  var detailTabs = Array.from(document.querySelectorAll("[data-tab]"));
  // The next tab is to the left in Arabic and to the right in English.
  var nextTabKey = lang === "ar" ? "ArrowLeft" : "ArrowRight";
  var previousTabKey = lang === "ar" ? "ArrowRight" : "ArrowLeft";
  function activateDetailTab(tab, moveFocus) {
    var name = tab.getAttribute("data-tab");
    detailTabs.forEach(function (item) {
      var selected = item === tab;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-selected", selected ? "true" : "false");
      item.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll("[data-tab-panel]").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-tab-panel") !== name;
    });
    if (moveFocus) tab.focus();
  }
  detailTabs.forEach(function (tab) {
    tab.tabIndex = tab.classList.contains("active") ? 0 : -1;
    tab.addEventListener("click", function () { activateDetailTab(tab, false); });
    tab.addEventListener("keydown", function (event) {
      var index = detailTabs.indexOf(tab);
      var next = index;
      if (event.key === nextTabKey) next = (index + 1) % detailTabs.length;
      else if (event.key === previousTabKey) next = (index - 1 + detailTabs.length) % detailTabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = detailTabs.length - 1;
      else return;
      event.preventDefault();
      activateDetailTab(detailTabs[next], true);
    });
  });

  // The user's contracts, newest first, once loaded from the backend.
  var myContracts = null;
  function loadContracts() {
    return request("GET", "/api/contracts").then(function (list) {
      myContracts = list || [];
      return myContracts;
    });
  }

  // A star in any contract list adds or removes the contract from favorites.
  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-favorite]");
    if (!button) return;
    var added = toggleFavorite(button.getAttribute("data-favorite"));
    button.setAttribute("aria-pressed", added ? "true" : "false");
    if (libraryView === "favorites") renderContractList();
  });

  var libraryView = "all";
  var contractList = document.getElementById("contract-list");
  var contractSearch = document.getElementById("contract-search");
  var contractSort = document.getElementById("contract-sort");
  function renderContractList() {
    if (!contractList || !myContracts) return;
    var list = myContracts.slice();
    if (libraryView === "favorites") {
      var favorites = readList(favoritesKey);
      list = list.filter(function (contract) { return favorites.indexOf(contract.id) !== -1; });
    } else if (libraryView === "recent") {
      var recent = readList(recentKey);
      list = list.filter(function (contract) { return recent.indexOf(contract.id) !== -1; });
    }
    var query = contractSearch.value.trim().toLowerCase();
    var hasContracts = list.length > 0;
    if (query) list = list.filter(function (contract) { return contract.file_name.toLowerCase().indexOf(query) !== -1; });
    var oldestFirst = contractSort.value === "oldest";
    list.sort(function (a, b) {
      var difference = new Date(a.created_at) - new Date(b.created_at);
      return oldestFirst ? difference : -difference;
    });
    if (list.length) {
      contractList.innerHTML = contractTable(list);
    } else if (hasContracts) {
      contractList.innerHTML = emptyState("contracts", t("No matching contracts", "لا توجد عقود مطابقة"), t("Please try a different contract name.", "يرجى تجربة اسم عقد آخر."));
    } else if (libraryView === "favorites") {
      contractList.innerHTML = emptyState("star", t("No favorite contracts", "لا توجد عقود في المفضلة"), t("Add important contracts to your favorites for quick access.", "أضف العقود المهمة إلى المفضلة للوصول إليها بسرعة."));
    } else if (libraryView === "recent") {
      contractList.innerHTML = emptyState("recent", t("No recent contracts", "لا توجد عقود حديثة"), t("Contracts you recently uploaded or viewed will appear here.", "تظهر هنا العقود التي رفعتها أو اطّلعت عليها مؤخرًا."));
    } else {
      contractList.innerHTML = emptyState("contracts", t("No contracts uploaded", "لا توجد عقود مرفوعة"), t("Contracts will appear here once uploaded.", "تظهر العقود هنا بعد رفعها."), "<a class='button button-secondary' href='" + pageUrl("/upload/") + "'>" + t("Upload contract", "رفع عقد") + "</a>");
    }
  }
  if (contractList) {
    contractSearch.addEventListener("input", renderContractList);
    contractSort.addEventListener("change", renderContractList);
    if (takeQueryFlag("deleted")) showToast(t("The contract has been deleted.", "تم حذف العقد بنجاح."));
    loadContracts().then(renderContractList).catch(function (error) {
      if (!error.redirected) contractList.innerHTML = listState(errorMessage(error), true);
    });
  }

  var libraryTabs = Array.from(document.querySelectorAll("[data-library-tab]"));
  function setLibraryView(view) {
    libraryView = view;
    libraryTabs.forEach(function (button) {
      var active = button.getAttribute("data-library-tab") === view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    renderContractList();
  }
  libraryTabs.forEach(function (button) {
    button.addEventListener("click", function () {
      var view = button.getAttribute("data-library-tab");
      setLibraryView(view);
      if (location.protocol === "file:") location.hash = view === "all" ? "" : view;
      else history.replaceState(null, "", view === "all" ? location.pathname : "#" + view);
    });
  });
  if (page === "contracts" && (location.hash === "#recent" || location.hash === "#favorites")) setLibraryView(location.hash.slice(1));

  var fileInput = document.getElementById("file-input");
  var selectFileButton = document.getElementById("select-file");
  var dropzone = document.getElementById("dropzone");
  var filePreview = document.getElementById("file-preview");
  var fileName = document.getElementById("file-name");
  var fileSize = document.getElementById("file-size");
  var uploadError = document.getElementById("upload-error");
  var uploadSubmit = document.getElementById("upload-submit");
  var selectedFile = null;
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + t(" bytes", " بايت");
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + t(" KB", " كيلوبايت");
    return (bytes / (1024 * 1024)).toFixed(1) + t(" MB", " ميغابايت");
  }
  function showUploadError(message) {
    uploadError.textContent = message;
    uploadError.hidden = false;
  }
  function clearFile() {
    if (!fileInput) return;
    selectedFile = null;
    fileInput.value = "";
    filePreview.hidden = true;
    uploadError.hidden = true;
  }
  async function selectFile(file) {
    if (!file) return;
    selectedFile = null;
    filePreview.hidden = true;
    uploadError.hidden = true;
    if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== "application/pdf")) {
      showUploadError(t("Sorry, only PDF files are accepted.", "عذرًا، يُقبل ملف بصيغة PDF فقط."));
      return;
    }
    if (file.size === 0) {
      showUploadError(t("Sorry, the selected file is empty. Please choose another file.", "عذرًا، الملف المختار فارغ. يرجى اختيار ملف آخر."));
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      showUploadError(t("Sorry, the file exceeds the maximum size (50 MB).", "عذرًا، يتجاوز حجم الملف الحد المسموح (50 ميغابايت)."));
      return;
    }
    try {
      var signature = await file.slice(0, 5).text();
      if (signature !== "%PDF-") {
        showUploadError(t("Sorry, the file format could not be verified. Please choose a valid PDF file.", "عذرًا، تعذّر التحقق من صيغة الملف. يرجى اختيار ملف PDF صالح."));
        return;
      }
    } catch (error) {
      showUploadError(t("Sorry, the file could not be read. Please try again.", "عذرًا، تعذّرت قراءة الملف. يرجى المحاولة مرة أخرى."));
      return;
    }
    selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatSize(file.size) + t(" · Ready to upload", " · جاهز للرفع");
    filePreview.hidden = false;
  }
  if (fileInput && dropzone) {
    selectFileButton.addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function () { selectFile(fileInput.files[0]); });
    dropzone.addEventListener("dragover", function (event) { event.preventDefault(); dropzone.classList.add("dragging"); });
    dropzone.addEventListener("dragleave", function () { dropzone.classList.remove("dragging"); });
    dropzone.addEventListener("drop", function (event) {
      event.preventDefault();
      dropzone.classList.remove("dragging");
      selectFile(event.dataTransfer.files[0]);
    });
    document.getElementById("remove-file").addEventListener("click", clearFile);
    var uploadErrorMessage = function (error) {
      if (error.status === 400) return t("Sorry, the selected file is empty. Please choose another file.", "عذرًا، الملف المختار فارغ. يرجى اختيار ملف آخر.");
      if (error.status === 413) return t("Sorry, the file exceeds the maximum size (50 MB).", "عذرًا، يتجاوز حجم الملف الحد المسموح (50 ميغابايت).");
      if (error.status === 415) return t("Sorry, only PDF files are accepted.", "عذرًا، يُقبل ملف بصيغة PDF فقط.");
      return errorMessage(error);
    };
    uploadSubmit.addEventListener("click", async function () {
      if (!selectedFile) {
        showUploadError(t("Please select the contract file first.", "يرجى اختيار ملف العقد أولًا."));
        return;
      }
      var file = selectedFile;
      var form = new FormData();
      form.append("file", file);
      uploadError.hidden = true;
      setBusy(uploadSubmit, true, t("Uploading…", "جارٍ الرفع…"));
      try {
        var contract = await request("POST", "/api/contracts", {
          body: form,
          onProgress: function (part) {
            fileSize.textContent = formatSize(file.size) + " · " + t("Uploading", "جارٍ الرفع") + " " + Math.round(part * 100) + "%";
          }
        });
        rememberRecent(contract.id);
        // Start the analysis right away. If this fails, the contract page offers to start it.
        uploadSubmit.textContent = t("Starting analysis…", "جارٍ بدء التحليل…");
        try {
          await request("POST", "/api/contracts/" + encodeURIComponent(contract.id) + "/analyze");
        } catch (error) {
          if (error.redirected) return;
        }
        location.href = pageUrl("/contracts/details/?id=" + encodeURIComponent(contract.id) + "&uploaded=1");
      } catch (error) {
        if (error.redirected) return;
        setBusy(uploadSubmit, false);
        fileSize.textContent = formatSize(file.size) + t(" · Ready to upload", " · جاهز للرفع");
        showUploadError(uploadErrorMessage(error));
      }
    });
  }

  if (page === "dashboard") {
    var recentContracts = document.getElementById("recent-contracts");
    loadContracts().then(function (list) {
      ["uploaded", "processing", "completed", "failed"].forEach(function (status) {
        var count = list.filter(function (contract) { return contract.status === status; }).length;
        var kind = statusInfo(status).css;
        document.querySelector("[data-stat='" + kind + "']").textContent = count;
      });
      recentContracts.innerHTML = list.length
        ? contractTable(list.slice(0, 5))
        : emptyState("contracts", t("No contracts uploaded", "لا توجد عقود مرفوعة"), t("Your most recent contracts and their analysis status will appear here.", "تظهر هنا أحدث العقود المرفوعة وحالة تحليلها."), "<a class='button button-secondary' href='" + pageUrl("/upload/") + "'>" + t("Upload contract", "رفع عقد") + "</a>");
    }).catch(function (error) {
      if (!error.redirected) recentContracts.innerHTML = listState(errorMessage(error), true);
    });
  }

  if (page === "details") {
    var contractId = new URLSearchParams(location.search).get("id");
    var detailStatus = document.getElementById("detail-status");
    var detailError = document.getElementById("detail-error");
    var deleteButton = document.getElementById("delete-contract");
    var renameButton = document.getElementById("apply-suggested-name");
    var suggestedNameNote = document.getElementById("suggested-filename");
    var analysisState = document.getElementById("analysis-state");
    var detailThread = document.getElementById("detail-thread");
    var detailForm = document.getElementById("detail-ask-form");
    var detailQuestion = document.getElementById("detail-question");
    var contractUrl = "/api/contracts/" + encodeURIComponent(contractId || "");
    var currentStatus = null;
    var analysisShown = false;
    var detailFileName = "";
    var suggestedFilename = "";
    var pollTimer = null;
    var pollSince = 0;

    function updateSuggestedName() {
      var useful = /^[a-z0-9][a-z0-9_-]{0,74}\.pdf$/.test(suggestedFilename) && suggestedFilename !== "document.pdf";
      suggestedNameNote.hidden = !useful;
      renameButton.hidden = !useful || suggestedFilename === detailFileName;
      if (useful) {
        suggestedNameNote.textContent = t("Suggested from the document: ", "الاسم المقترح من المستند: ") + suggestedFilename +
          (suggestedFilename === detailFileName ? t(" (in use)", " (مستخدم حاليًا)") : "");
      }
    }

    function showStatus(status) {
      currentStatus = status;
      detailStatus.innerHTML = statusBadge(status);
      document.getElementById("detail-state").textContent = statusInfo(status).label;
      analysisState.textContent = "";
      analysisState.className = "analysis-state";
      analysisState.hidden = status === "completed";
      if (status === "completed") return;

      var text = document.createElement("p");
      if (status === "processing") {
        analysisState.classList.add("is-processing");
        var spinner = document.createElement("span");
        spinner.className = "spinner";
        spinner.setAttribute("aria-hidden", "true");
        analysisState.appendChild(spinner);
        text.textContent = t("The contract is being analyzed. This usually takes a minute or two, and this page updates on its own.", "جارٍ تحليل العقد. يستغرق ذلك عادةً دقيقة أو دقيقتين، وتتحدّث هذه الصفحة تلقائيًا.");
        analysisState.appendChild(text);
        return;
      }
      text.textContent = status === "failed"
        ? t("Sorry, the analysis could not be completed. Please try again.", "عذرًا، تعذّر إكمال التحليل. يرجى المحاولة مرة أخرى.")
        : t("This contract has not been analyzed yet.", "لم يُحلَّل هذا العقد بعد.");
      var button = document.createElement("button");
      button.type = "button";
      button.className = "button button-primary";
      button.textContent = status === "failed" ? t("Retry analysis", "إعادة التحليل") : t("Analyze contract", "تحليل العقد");
      button.addEventListener("click", function () { startAnalysis(button); });
      analysisState.appendChild(text);
      analysisState.appendChild(button);
    }

    function startAnalysis(button) {
      setBusy(button, true, t("Starting…", "جارٍ البدء…"));
      request("POST", contractUrl + "/analyze").then(function () {
        showStatus("processing");
        waitForAnalysis();
      }).catch(function (error) {
        if (error.redirected) return;
        setBusy(button, false);
        // 409: it is already running, so show the current state.
        if (error.status === 409) { loadContract(); return; }
        showToast(contractQuestionError(error));
      });
    }

    // While the analysis runs, the status is checked every 5 seconds, for up to 15 minutes.
    function waitForAnalysis() {
      clearTimeout(pollTimer);
      if (!pollSince) pollSince = Date.now();
      if (Date.now() - pollSince > 15 * 60 * 1000) return;
      pollTimer = setTimeout(loadContract, 5000);
    }

    function factRow(list, label, value, pages) {
      if (value === null || value === undefined || value === "") return;
      var row = document.createElement("div");
      var term = document.createElement("dt");
      term.textContent = label;
      var detail = document.createElement("dd");
      detail.setAttribute("dir", "auto");
      detail.textContent = value;
      var ref = pageRef(pages);
      if (ref) detail.appendChild(ref);
      row.appendChild(term);
      row.appendChild(detail);
      list.appendChild(row);
    }
    function citedSection(title, items, extraClass) {
      var section = document.createElement("section");
      section.className = "analysis-section";
      var heading = document.createElement("h3");
      heading.textContent = title;
      section.appendChild(heading);
      var shown = (items || []).filter(function (item) { return item && typeof item.text === "string" && item.text.trim(); });
      if (!shown.length) {
        var none = document.createElement("p");
        none.className = "muted";
        none.textContent = t("Nothing was found in the contract.", "لم يُعثر على شيء في العقد.");
        section.appendChild(none);
        return section;
      }
      var list = document.createElement("ul");
      list.className = "cited-list" + (extraClass ? " " + extraClass : "");
      shown.forEach(function (item) {
        var entry = document.createElement("li");
        var text = document.createElement("span");
        text.setAttribute("dir", "auto");
        text.textContent = item.text;
        entry.appendChild(text);
        var ref = pageRef(item.pages);
        if (ref) entry.appendChild(ref);
        list.appendChild(entry);
      });
      section.appendChild(list);
      return section;
    }
    function joined(values) {
      return values.filter(function (value) { return typeof value === "string" && value.trim(); }).join(t(", ", "، "));
    }
    function renderAnalysis(analysis) {
      analysisShown = true;
      var payment = analysis.payment_terms || {};
      var termination = analysis.termination || {};
      var renewal = analysis.renewal || {};

      var grid = document.createElement("div");
      grid.className = "detail-grid";
      var summaryBox = document.createElement("div");
      summaryBox.className = "detail-box";
      var summaryTitle = document.createElement("h3");
      summaryTitle.textContent = analysis.is_contract === false ? t("Document summary", "ملخص المستند") : t("Contract summary", "ملخص العقد");
      var summaryText = document.createElement("div");
      summaryText.className = "analysis-text";
      summaryText.setAttribute("dir", "auto");
      summaryText.appendChild(formatReply(analysis.summary || "—"));
      summaryBox.appendChild(summaryTitle);
      summaryBox.appendChild(summaryText);

      if (analysis.is_contract === false) {
        grid.classList.add("detail-grid-single");
        grid.appendChild(summaryBox);
        var documentOverview = document.getElementById("overview-body");
        documentOverview.textContent = "";
        documentOverview.appendChild(grid);
        var documentAnalysis = document.getElementById("analysis-body");
        documentAnalysis.textContent = "";
        var documentNotice = document.createElement("p");
        documentNotice.className = "notice notice-info";
        documentNotice.textContent = t("This document was identified as a non-contract. Contract clauses and risks do not apply.", "صُنّف هذا المستند بأنه ليس عقدًا، لذا لا تُعرض له بنود أو مخاطر عقدية.");
        documentAnalysis.appendChild(documentNotice);
        return;
      }

      var factsBox = document.createElement("div");
      factsBox.className = "detail-box";
      var factsTitle = document.createElement("h3");
      factsTitle.textContent = t("Key information", "المعلومات الأساسية");
      var facts = document.createElement("dl");
      facts.className = "facts";
      var parties = analysis.parties || [];
      factRow(facts, t("Parties", "الأطراف"), joined(parties.map(function (party) { return party.text; })), [].concat.apply([], parties.map(function (party) { return party.pages || []; })));
      factRow(facts, t("Amount", "المبلغ"), joined([payment.amount, payment.currency]), payment.pages);
      factRow(facts, t("Payment frequency", "دورية السداد"), payment.frequency, payment.pages);
      factRow(facts, t("Due terms", "مواعيد الاستحقاق"), payment.due_terms, payment.pages);
      factRow(facts, t("Late fees", "غرامات التأخير"), payment.late_fees, payment.pages);
      factRow(facts, t("Notice period", "مدة الإشعار"), termination.notice_period, termination.pages);
      factRow(facts, t("Termination grounds", "أسباب الإنهاء"), termination.grounds, termination.pages);
      factRow(facts, t("Termination fees", "رسوم الإنهاء"), termination.fees, termination.pages);
      factRow(facts, t("Automatic renewal", "التجديد التلقائي"), renewal.automatic === true ? t("Yes", "نعم") : renewal.automatic === false ? t("No", "لا") : null, renewal.pages);
      factRow(facts, t("Renewal conditions", "شروط التجديد"), renewal.conditions, renewal.pages);
      factRow(facts, t("Renewal notice deadline", "موعد إشعار التجديد"), renewal.notice_deadline, renewal.pages);
      factsBox.appendChild(factsTitle);
      if (facts.children.length) {
        factsBox.appendChild(facts);
      } else {
        var noFacts = document.createElement("p");
        noFacts.textContent = t("No key information was found in the contract.", "لم يُعثر على معلومات أساسية في العقد.");
        factsBox.appendChild(noFacts);
      }
      grid.appendChild(summaryBox);
      grid.appendChild(factsBox);
      var overviewBody = document.getElementById("overview-body");
      overviewBody.textContent = "";
      overviewBody.appendChild(grid);

      var analysisBody = document.getElementById("analysis-body");
      analysisBody.textContent = "";
      var note = document.createElement("p");
      note.className = "notice notice-info";
      note.textContent = t("Each finding shows the page it comes from. Risks are possible concerns to review, not legal advice.", "تظهر مع كل نتيجة الصفحة التي وردت فيها. والمخاطر ملاحظات محتملة للمراجعة، وليست استشارة قانونية.");
      analysisBody.appendChild(note);
      analysisBody.appendChild(citedSection(t("Risks", "المخاطر"), analysis.risks, "risk-list"));
      analysisBody.appendChild(citedSection(t("Obligations", "الالتزامات"), analysis.obligations));
      analysisBody.appendChild(citedSection(t("Material clauses", "البنود الجوهرية"), analysis.important_clauses));
    }

    function loadAnalysis() {
      request("GET", contractUrl + "/analysis").then(function (data) {
        var analysis = data.analysis || {};
        suggestedFilename = analysis.suggested_filename || "";
        updateSuggestedName();
        renderAnalysis(analysis);
      }).catch(function (error) {
        if (!error.redirected && error.status !== 404) showToast(errorMessage(error));
      });
      request("GET", contractUrl + "/chat").then(function (entries) {
        renderChatHistory(detailThread, entries || []);
      }).catch(function () { /* The history is optional; new questions still work. */ });
    }

    function showContract(contract) {
      rememberRecent(contract.id);
      // <bdi> keeps an Arabic name inside an English page (or the reverse) in the right order.
      detailFileName = contract.file_name;
      document.getElementById("detail-file").innerHTML = "<bdi>" + escapeHtml(contract.file_name) + "</bdi>";
      updateSuggestedName();
      document.getElementById("detail-date").textContent = formatDate(contract.created_at, true);
      document.getElementById("detail-actions").hidden = false;
      showStatus(contract.status);
      if (contract.status === "processing") waitForAnalysis();
      if (contract.status === "completed" && !analysisShown) loadAnalysis();
    }

    function loadContract() {
      return request("GET", contractUrl).then(showContract).catch(function (error) {
        if (error.redirected) return;
        // While waiting for the analysis, a passing network error just means "check again later".
        if (currentStatus === "processing" && error.status !== 404) { waitForAnalysis(); return; }
        var missing = error.status === 404 || error.status === 422;
        detailStatus.innerHTML = "<span class='status'>" + (missing ? t("Contract not found", "العقد غير موجود") : "—") + "</span>";
        detailError.textContent = missing ? t("Sorry, this contract does not exist or is no longer available.", "عذرًا، هذا العقد غير موجود أو لم يعد متاحًا.") : errorMessage(error);
        detailError.hidden = false;
      });
    }

    detailForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!contractId) return;
      if (currentStatus !== "completed") {
        showToast(t("Inquiries become available once the contract analysis is complete.", "تتاح الاستفسارات بعد اكتمال تحليل العقد."));
        return;
      }
      var question = readQuestion(detailQuestion);
      if (question) sendContractQuestion(contractId, question, detailThread, detailForm.querySelector("[type='submit']"), detailQuestion);
    });

    if (takeQueryFlag("uploaded")) showToast(t("The contract has been uploaded.", "تم رفع العقد بنجاح."));
    if (contractId) {
      detailStatus.innerHTML = "<span class='status'>" + t("Loading…", "جارٍ التحميل…") + "</span>";
      loadContract();
    }
    renameButton.addEventListener("click", function () {
      setBusy(renameButton, true, t("Applying…", "جارٍ التطبيق…"));
      request("POST", contractUrl + "/apply-suggested-name").then(function (contract) {
        detailFileName = contract.file_name;
        document.getElementById("detail-file").innerHTML = "<bdi>" + escapeHtml(detailFileName) + "</bdi>";
        updateSuggestedName();
        showToast(t("Document name updated.", "تحدّث اسم المستند."));
      }).catch(function (error) {
        if (!error.redirected) showToast(errorMessage(error));
      }).then(function () {
        setBusy(renameButton, false);
      });
    });
    deleteButton.addEventListener("click", async function () {
      if (!window.confirm(t("Delete this contract? The file and its analysis results will be permanently deleted.", "هل تريد حذف هذا العقد؟ سيُحذف الملف ونتائج تحليله نهائيًا."))) return;
      setBusy(deleteButton, true, t("Deleting…", "جارٍ الحذف…"));
      try {
        await request("DELETE", "/api/contracts/" + encodeURIComponent(contractId));
      } catch (error) {
        if (error.redirected) return;
        // 404 means the contract is already gone, which is the result the user asked for.
        if (error.status !== 404) {
          setBusy(deleteButton, false);
          showToast(errorMessage(error));
          return;
        }
      }
      forgetContract(contractId);
      location.replace(pageUrl("/contracts/?deleted=1"));
    });
  }

  if (page === "ask") {
    var askContract = document.getElementById("ask-contract");
    var askNote = document.getElementById("ask-contract-note");
    var askSelected = document.getElementById("ask-selected");
    var askThread = document.getElementById("ask-thread");
    var askWelcome = document.querySelector(".ask-welcome");
    var askBody = document.querySelector(".ask-body");
    var askForm = document.getElementById("ask-form");
    var askInput = document.getElementById("contract-question");
    var askHistoryNote = document.getElementById("ask-history-note");
    var wantedContract = new URLSearchParams(location.search).get("id");

    // Shows the welcome until the selected contract has a conversation.
    function showThread(hasMessages) {
      askWelcome.hidden = hasMessages;
      askBody.classList.toggle("has-thread", hasMessages);
    }
    function selectAskContract() {
      var id = askContract.value;
      askSelected.innerHTML = id ? "<bdi>" + escapeHtml(askContract.options[askContract.selectedIndex].textContent) + "</bdi>" : t("Please select a contract", "يرجى اختيار عقد");
      askThread.textContent = "";
      askThread.hidden = true;
      showThread(false);
      askHistoryNote.textContent = t("No previous inquiries.", "لا توجد استفسارات سابقة.");
      if (!id) return;
      request("GET", "/api/contracts/" + encodeURIComponent(id) + "/chat").then(function (entries) {
        if (askContract.value !== id) return;
        entries = entries || [];
        renderChatHistory(askThread, entries);
        showThread(entries.length > 0);
        if (entries.length) {
          askHistoryNote.textContent = t(entries.length + " previous inquiries", "عدد الاستفسارات السابقة: " + entries.length);
          askThread.lastChild.scrollIntoView({ block: "nearest" });
        }
      }).catch(function (error) {
        if (!error.redirected) showToast(errorMessage(error));
      });
    }

    loadContracts().then(function (list) {
      // Only contracts whose analysis is complete can be asked about.
      var ready = list.filter(function (contract) { return contract.status === "completed"; });
      ready.forEach(function (contract) {
        var option = document.createElement("option");
        option.value = contract.id;
        option.textContent = contract.file_name;
        askContract.appendChild(option);
      });
      askNote.textContent = t("No analyzed contracts available.", "لا توجد عقود مكتملة التحليل.");
      askNote.hidden = ready.length > 0;
      // ?id= opens the page on that contract, for example from the contract page.
      if (wantedContract && ready.some(function (contract) { return contract.id === wantedContract; })) {
        askContract.value = wantedContract;
        selectAskContract();
      }
    }).catch(function (error) {
      if (!error.redirected) askNote.textContent = errorMessage(error);
    });
    askContract.addEventListener("change", selectAskContract);

    askForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!askContract.value) {
        askContract.focus();
        showToast(t("Please select a contract first.", "يرجى اختيار عقد أولًا."));
        return;
      }
      var question = readQuestion(askInput);
      if (!question) return;
      showThread(true);
      sendContractQuestion(askContract.value, question, askThread, askForm.querySelector("[type='submit']"), askInput);
    });
    askInput.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      askForm.requestSubmit();
    });
  }

  if (page === "account") {
    request("GET", "/api/auth/me").then(function (user) {
      document.getElementById("account-email").textContent = user.email;
      // Accounts created before names were added have none, so the dash stays.
      var fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
      if (fullName) document.getElementById("account-name").textContent = fullName;
    }).catch(function (error) {
      if (!error.redirected) showToast(errorMessage(error));
    });
  }

  // ---------- MAEEN Assistant ----------
  // General questions go to /api/assistant/chat. With a contract chosen, the question goes
  // to the AI Backend through /api/contracts/{id}/chat and the answer shows its sources.
  var assistantFab = document.getElementById("assistant-fab");
  if (assistantFab) {
    var assistantPanel = document.getElementById("assistant-panel");
    var assistantLog = document.getElementById("assistant-log");
    var assistantForm = document.getElementById("assistant-form");
    var assistantInput = document.getElementById("assistant-input");
    var assistantSend = assistantForm.querySelector(".assistant-send");
    var assistantContract = document.getElementById("assistant-contract");
    var assistantHead = assistantPanel.querySelector(".assistant-head");
    var assistantMinimize = assistantPanel.querySelector("[data-assistant-minimize]");
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    // The backend reads the latest 12 messages; the tab keeps up to 40.
    var ASSISTANT_SENT = 12;
    var ASSISTANT_KEPT = 40;
    // place is where the user dragged the window, or null for its corner by the button.
    var assistantState = { messages: [], open: false, scope: "", minimized: false, place: null };
    var assistantBusy = false;
    var contractsLoaded = false;
    var typingBubble = null;
    var retryBubble = null;

    try {
      var savedChat = JSON.parse(sessionStorage.getItem(ASSISTANT_KEY) || "null");
      if (savedChat && Array.isArray(savedChat.messages)) {
        assistantState.messages = savedChat.messages.filter(function (message) {
          return message && (message.role === "user" || message.role === "assistant") && typeof message.content === "string" && message.content.trim();
        });
        assistantState.open = savedChat.open === true;
        assistantState.scope = typeof savedChat.scope === "string" ? savedChat.scope : "";
        assistantState.minimized = savedChat.minimized === true;
        var place = savedChat.place;
        if (place && isFinite(place.left) && isFinite(place.top)) assistantState.place = { left: Number(place.left), top: Number(place.top) };
      }
    } catch (error) { /* Start with an empty conversation. */ }

    function saveAssistant() {
      assistantState.messages = assistantState.messages.slice(-ASSISTANT_KEPT);
      try { sessionStorage.setItem(ASSISTANT_KEY, JSON.stringify(assistantState)); } catch (error) { /* The conversation lasts for this page only. */ }
    }

    function scrollAssistant() {
      assistantLog.scrollTop = assistantLog.scrollHeight;
    }
    function addMessage(message) {
      var bubble = message.role === "assistant"
        ? answerBubble(message.content, message.sources)
        : questionBubble(message.content, message.contractName ? t("About: ", "عن: ") + message.contractName : "");
      assistantLog.appendChild(bubble);
      scrollAssistant();
    }
    function addWelcome(withSuggestions) {
      var welcome = document.createElement("div");
      welcome.className = "assistant-welcome";
      var greeting = document.createElement("div");
      greeting.className = "bubble bubble-assistant";
      greeting.textContent = t("Hello. I'm the MAEEN Assistant. I can explain how the platform works and answer general questions about contracts. To ask about one of your analyzed contracts, choose it above.", "مرحبًا، أنا مساعد معين. أستطيع شرح طريقة استخدام المنصة والإجابة عن الأسئلة العامة المتعلقة بالعقود. وللسؤال عن أحد عقودك المحللة، اختره من الأعلى.");
      welcome.appendChild(greeting);
      if (withSuggestions) {
        var group = document.createElement("div");
        group.className = "assistant-suggestions";
        group.setAttribute("role", "group");
        group.setAttribute("aria-label", t("Suggested questions", "أسئلة مقترحة"));
        [
          t("How do I upload a contract?", "كيف أرفع عقدًا؟"),
          t("What does a termination clause mean?", "ما المقصود ببند الإنهاء؟"),
          t("What should I check before signing a lease?", "ما الذي أراجعه قبل توقيع عقد إيجار؟")
        ].forEach(function (question) {
          var button = document.createElement("button");
          button.type = "button";
          button.className = "assistant-suggestion";
          button.textContent = question;
          button.addEventListener("click", function () { sendQuestion(question); });
          group.appendChild(button);
        });
        welcome.appendChild(group);
      }
      assistantLog.appendChild(welcome);
    }

    function showTyping() {
      typingBubble = typingIndicator(t("MAEEN Assistant is typing", "مساعد معين يكتب"));
      assistantLog.appendChild(typingBubble);
      scrollAssistant();
    }
    function hideTyping() {
      if (typingBubble) typingBubble.remove();
      typingBubble = null;
    }
    function clearAssistantError() {
      if (retryBubble) retryBubble.remove();
      retryBubble = null;
    }
    function showAssistantError(message) {
      clearAssistantError();
      retryBubble = errorBubble(message);
      var retry = document.createElement("button");
      retry.type = "button";
      retry.className = "button-link";
      retry.textContent = t("Try again", "إعادة المحاولة");
      retry.addEventListener("click", function () {
        clearAssistantError();
        askAssistant();
      });
      retryBubble.appendChild(retry);
      assistantLog.appendChild(retryBubble);
      scrollAssistant();
    }

    function renderConversation() {
      assistantLog.textContent = "";
      typingBubble = null;
      retryBubble = null;
      addWelcome(assistantState.messages.length === 0);
      assistantState.messages.forEach(addMessage);
      // A question without a reply means the last request did not finish, for example after leaving the page.
      var last = assistantState.messages[assistantState.messages.length - 1];
      if (last && last.role === "user") showAssistantError(t("Sorry, the reply could not be completed.", "عذرًا، تعذّر إكمال الرد."));
    }

    // The list shows only contracts whose analysis is complete; they are the ones the AI can answer from.
    function loadContractChoices() {
      if (contractsLoaded) return;
      contractsLoaded = true;
      loadContracts().then(function (list) {
        var ready = list.filter(function (contract) { return contract.status === "completed"; });
        ready.forEach(function (contract) {
          var option = document.createElement("option");
          option.value = contract.id;
          option.textContent = contract.file_name;
          assistantContract.appendChild(option);
        });
        if (!ready.length) {
          var none = document.createElement("option");
          none.disabled = true;
          none.textContent = t("No analyzed contracts yet", "لا توجد عقود مكتملة التحليل بعد");
          assistantContract.appendChild(none);
        }
        var stillThere = ready.some(function (contract) { return contract.id === assistantState.scope; });
        assistantContract.value = stillThere ? assistantState.scope : "";
        setScope(assistantContract.value);
      }).catch(function (error) {
        contractsLoaded = false;
        if (!error.redirected) showToast(errorMessage(error));
      });
    }
    function setScope(contractId) {
      assistantState.scope = contractId;
      saveAssistant();
      assistantInput.placeholder = contractId ? t("Ask about this contract", "اسأل عن هذا العقد") : t("Type your question", "اكتب سؤالك");
    }

    function setAssistantBusy(busy) {
      assistantBusy = busy;
      assistantSend.disabled = busy;
      assistantContract.disabled = busy;
      assistantForm.setAttribute("aria-busy", busy ? "true" : "false");
    }
    // Writes a reply into its bubble a few letters at a time. When the text arrives faster
    // than it is written, the writing speeds up so it never falls far behind.
    function replyWriter() {
      var bubble = null;
      var text = "";
      var shown = 0;
      var timer = null;
      var whenDone = null;
      function draw() {
        var following = assistantLog.scrollHeight - assistantLog.scrollTop - assistantLog.clientHeight < 48;
        var visible = text.slice(0, shown);
        // Hides a bold mark until its closing mark is written too.
        if (shown < text.length) {
          visible = visible.replace(/\*+$/, "");
          if (visible.split("**").length % 2 === 0) {
            var mark = visible.lastIndexOf("**");
            visible = visible.slice(0, mark) + visible.slice(mark + 2);
          }
        }
        bubble.textContent = "";
        bubble.appendChild(formatReply(visible));
        if (following) scrollAssistant();
      }
      function step() {
        var behind = text.length - shown;
        if (behind > 0) {
          shown = reduceMotion.matches ? text.length : shown + Math.min(6, Math.ceil(behind / 20));
          // Keeps a two-part character, such as an emoji, whole.
          var code = text.charCodeAt(shown - 1);
          if (code >= 0xd800 && code <= 0xdbff) shown += 1;
          draw();
          return;
        }
        clearInterval(timer);
        timer = null;
        if (whenDone) whenDone();
      }
      return {
        add: function (part) {
          if (!bubble) {
            hideTyping();
            bubble = answerBubble("", null);
            // Screen readers read the reply once it is complete.
            bubble.setAttribute("aria-busy", "true");
            assistantLog.appendChild(bubble);
          }
          text += part;
          if (!timer) timer = setInterval(step, 20);
        },
        // Resolves once the whole reply is on screen.
        finish: function (sources) {
          return new Promise(function (resolve) {
            whenDone = function () {
              var shownSources = cleanSources(sources);
              if (shownSources.length) bubble.appendChild(sourcesBlock(shownSources));
              bubble.removeAttribute("aria-busy");
              scrollAssistant();
              resolve();
            };
            if (!timer) whenDone();
          });
        },
        cancel: function () {
          clearInterval(timer);
          timer = null;
          if (bubble) bubble.remove();
        }
      };
    }
    // The general reply arrives as server-sent events: {"delta"} parts, then {"done"} or {"error"}.
    function streamReader(onDelta) {
      var read = 0;
      var result = { done: false, error: false };
      result.take = function (text) {
        var end;
        while ((end = text.indexOf("\n\n", read)) !== -1) {
          var block = text.slice(read, end);
          read = end + 2;
          if (block.indexOf("data: ") !== 0) continue;
          var event;
          try { event = JSON.parse(block.slice(6)); } catch (error) { continue; }
          if (typeof event.delta === "string") onDelta(event.delta);
          else if (event.done) result.done = true;
          else if (event.error) result.error = true;
        }
      };
      return result;
    }
    function saveReply(message) {
      assistantState.messages.push(message);
      saveAssistant();
    }
    function askAssistant() {
      if (assistantBusy) return;
      var last = assistantState.messages[assistantState.messages.length - 1];
      if (!last || last.role !== "user") return;
      setAssistantBusy(true);
      showTyping();

      var writer = replyWriter();
      var reply;
      if (last.contractId) {
        reply = request("POST", "/api/contracts/" + encodeURIComponent(last.contractId) + "/chat", { json: { question: last.content }, timeout: 90000 }).then(function (data) {
          if (!data || typeof data.answer !== "string" || !data.answer.trim()) throw Object.assign(new Error("Empty answer"), { status: 502 });
          var message = { role: "assistant", content: data.answer.trim(), sources: cleanSources(data.sources), contractId: last.contractId };
          saveReply(message);
          writer.add(message.content);
          return writer.finish(message.sources);
        });
      } else {
        var recent = assistantState.messages.slice(-ASSISTANT_SENT).map(function (message) {
          return { role: message.role, content: message.content.slice(0, 8000) };
        });
        var written = "";
        var stream = streamReader(function (part) {
          written += part;
          writer.add(part);
        });
        reply = request("POST", "/api/assistant/chat/stream", { json: { messages: recent }, timeout: 60000, onText: stream.take }).then(function () {
          if (!stream.done || stream.error || !written.trim()) throw Object.assign(new Error("Reply interrupted"), { status: 502 });
          saveReply({ role: "assistant", content: written.trim() });
          return writer.finish();
        });
      }
      reply.catch(function (error) {
        hideTyping();
        writer.cancel();
        if (!error.redirected) showAssistantError(last.contractId ? contractQuestionError(error) : errorMessage(error));
      }).then(function () {
        setAssistantBusy(false);
      });
    }
    function sendQuestion(text) {
      var question = text.trim().slice(0, 2000);
      if (!question || assistantBusy) return;
      clearAssistantError();
      var suggestions = assistantLog.querySelector(".assistant-suggestions");
      if (suggestions) suggestions.remove();
      var message = { role: "user", content: question };
      if (assistantContract.value) {
        message.contractId = assistantContract.value;
        message.contractName = assistantContract.options[assistantContract.selectedIndex].textContent;
      }
      assistantState.messages.push(message);
      saveAssistant();
      addMessage(message);
      assistantInput.value = "";
      askAssistant();
    }

    // Keeps a dragged window fully on screen, for example after the browser window shrinks.
    function placeAssistant() {
      var place = assistantState.place;
      if (!place || assistantPanel.hidden) return;
      var maxLeft = Math.max(8, window.innerWidth - assistantPanel.offsetWidth - 8);
      var maxTop = Math.max(8, window.innerHeight - assistantPanel.offsetHeight - 8);
      place.left = Math.round(Math.min(Math.max(place.left, 8), maxLeft));
      place.top = Math.round(Math.min(Math.max(place.top, 8), maxTop));
      assistantPanel.style.left = place.left + "px";
      assistantPanel.style.top = place.top + "px";
      assistantPanel.style.right = "auto";
      assistantPanel.style.bottom = "auto";
    }
    // Minimized, the window shrinks to its title bar and stays where it is.
    function setMinimized(minimized) {
      assistantState.minimized = minimized;
      assistantPanel.classList.toggle("is-minimized", minimized);
      assistantMinimize.innerHTML = icon(minimized ? "restore" : "minimize");
      assistantMinimize.setAttribute("aria-expanded", minimized ? "false" : "true");
      assistantMinimize.setAttribute("aria-label", minimized ? t("Restore assistant", "استعادة المساعد") : t("Minimize assistant", "تصغير المساعد"));
      assistantMinimize.title = minimized ? t("Restore", "استعادة") : t("Minimize", "تصغير");
      saveAssistant();
      placeAssistant();
      if (!minimized) scrollAssistant();
    }

    function openAssistant(focusInput) {
      assistantPanel.hidden = false;
      assistantFab.setAttribute("aria-expanded", "true");
      assistantFab.setAttribute("aria-label", t("Close MAEEN Assistant", "إغلاق مساعد معين"));
      assistantState.open = true;
      if (focusInput && assistantState.minimized) setMinimized(false);
      saveAssistant();
      placeAssistant();
      loadContractChoices();
      scrollAssistant();
      if (focusInput) assistantInput.focus();
    }
    function closeAssistant(returnFocus) {
      assistantPanel.hidden = true;
      assistantFab.setAttribute("aria-expanded", "false");
      assistantFab.setAttribute("aria-label", t("Open MAEEN Assistant", "فتح مساعد معين"));
      assistantState.open = false;
      saveAssistant();
      if (returnFocus) assistantFab.focus();
    }

    assistantFab.addEventListener("click", function () {
      if (assistantPanel.hidden || assistantState.minimized) openAssistant(true);
      else closeAssistant(true);
    });
    assistantMinimize.addEventListener("click", function () {
      setMinimized(!assistantState.minimized);
      if (!assistantState.minimized) assistantInput.focus();
    });

    // The window moves by dragging its title bar, with a mouse or a finger. A tap on the
    // bar of a minimized window opens it again.
    var drag = null;
    assistantHead.addEventListener("pointerdown", function (event) {
      if (event.button !== 0 || event.target.closest("button")) return;
      var box = assistantPanel.getBoundingClientRect();
      drag = { x: event.clientX, y: event.clientY, left: box.left, top: box.top, moved: false };
      assistantHead.setPointerCapture(event.pointerId);
    });
    assistantHead.addEventListener("pointermove", function (event) {
      if (!drag) return;
      var dx = event.clientX - drag.x;
      var dy = event.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
      drag.moved = true;
      assistantPanel.classList.add("is-dragging");
      assistantState.place = { left: drag.left + dx, top: drag.top + dy };
      placeAssistant();
    });
    assistantHead.addEventListener("pointerup", function () {
      if (!drag) return;
      var moved = drag.moved;
      drag = null;
      assistantPanel.classList.remove("is-dragging");
      if (moved) saveAssistant();
      else if (assistantState.minimized) setMinimized(false);
    });
    assistantHead.addEventListener("pointercancel", function () {
      drag = null;
      assistantPanel.classList.remove("is-dragging");
    });
    window.addEventListener("resize", placeAssistant);
    assistantPanel.querySelector("[data-assistant-close]").addEventListener("click", function () { closeAssistant(true); });
    assistantPanel.querySelector("[data-assistant-new]").addEventListener("click", function () {
      if (assistantBusy) return;
      assistantState.messages = [];
      saveAssistant();
      renderConversation();
      assistantInput.focus();
    });
    assistantContract.addEventListener("change", function () {
      setScope(assistantContract.value);
      assistantInput.focus();
    });
    assistantPanel.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closeAssistant(true);
    });
    assistantForm.addEventListener("submit", function (event) {
      event.preventDefault();
      sendQuestion(assistantInput.value);
    });
    // Enter sends; Shift+Enter starts a new line.
    assistantInput.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      sendQuestion(assistantInput.value);
    });

    renderConversation();
    if (assistantState.minimized) setMinimized(true);
    // Moving between pages keeps the window open, minimized, and where the user left it.
    if (assistantState.open) openAssistant(false);
  }
})();
