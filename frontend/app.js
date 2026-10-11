(function () {
  "use strict";

  var savedTheme = "light";
  try { savedTheme = localStorage.getItem("maeen-theme") || "light"; } catch (error) { /* Private browsing may block storage. */ }
  document.documentElement.dataset.theme = savedTheme === "dark" ? "dark" : "light";

  var app = document.getElementById("app");
  var path = window.location.pathname.replace(/\/+$/, "") || "/";
  var routes = {
    "/": "landing",
    "/signin": "signin",
    "/signup": "signup",
    "/dashboard": "dashboard",
    "/upload": "upload",
    "/contracts": "contracts",
    "/contracts/details": "details",
    "/ask": "ask",
    "/account": "account"
  };
  var page = document.body.getAttribute("data-maeen-page") || routes[path] || "landing";
  document.body.classList.add("page-" + page);

  var UNAVAILABLE = "عذرًا، هذه الخدمة غير متاحة حاليًا.";
  var DISCLAIMER = "تستند الإجابات إلى نص العقد فقط، ولا تُعد استشارة قانونية.";
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
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
    };
    return '<svg class="ui-icon icon-' + name + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[name] + '</svg>';
  }

  function brand() {
    return [
      "<a class='wordmark' href='/' aria-label='منصة معين، الصفحة الرئيسية'>",
      "<span class='mark' aria-hidden='true'><svg viewBox='0 0 64 64' fill='none' stroke='currentColor' stroke-width='6' stroke-linecap='round'><path d='M18 39c10-17 16-21 26-17M18 39c12-1 22-3 28-10M18 39l12 9'/></svg></span>",
      "<span>معين<small>MAEEN</small></span>",
      "</a>"
    ].join("");
  }

  function themeToggle() {
    return "<button class='icon-button theme-toggle' type='button' data-theme-toggle title='تبديل المظهر' aria-label='تبديل المظهر' aria-pressed='false'>" + icon("moon") + icon("sun") + "</button>";
  }

  function skipLink() {
    return "<a class='skip-link' href='#main-content'>تجاوز إلى المحتوى الرئيسي</a>";
  }

  function navLink(href, label, active) {
    var name = {"/dashboard/": "home", "/contracts/": "contracts", "/ask/": "ask", "/upload/": "upload", "/account/": "account"}[href];
    return "<a class='nav-link" + (active ? " active" : "") + "' href='" + href + "'" + (active ? " aria-current='page'" : "") + ">" + icon(name) + "<span>" + label + "</span></a>";
  }

  function emptyState(iconName, title, text, action) {
    return "<div class='empty'><span class='empty-icon'>" + icon(iconName) + "</span><h3>" + title + "</h3><p>" + text + "</p>" + (action || "") + "</div>";
  }

  function shell(current, title, content) {
    return [
      skipLink(),
      "<div class='app'>",
      "<aside class='sidebar' id='sidebar' aria-label='القائمة الرئيسية'>",
      brand(),
      "<nav class='sidebar-nav' aria-label='التنقل الرئيسي'>",
      navLink("/dashboard/", "الرئيسية", current === "dashboard"),
      navLink("/contracts/", "العقود", current === "contracts" || current === "details"),
      navLink("/ask/", "الاستفسارات", current === "ask"),
      navLink("/upload/", "رفع عقد", current === "upload"),
      navLink("/account/", "الحساب", current === "account"),
      "</nav>",
      "<div class='sidebar-footer'><button class='nav-button' type='button' data-unavailable>", icon("logout"), "<span>تسجيل الخروج</span></button></div>",
      "</aside>",
      "<button class='sidebar-backdrop' type='button' aria-label='إغلاق القائمة' data-menu-close></button>",
      "<main class='main' id='main-content' tabindex='-1'>",
      "<header class='topbar'><div class='topbar-start'><button class='icon-button mobile-menu-button' type='button' aria-label='فتح القائمة الرئيسية' aria-controls='sidebar' aria-expanded='false' data-menu-toggle>", icon("menu"), "</button><span class='topbar-title'>", title, "</span></div>", themeToggle(), "</header>",
      "<div class='content'>", content, "</div>",
      "</main></div>"
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
      "<nav class='site-nav' aria-label='أقسام الصفحة'><a href='#services'>الخدمات</a><a href='#how'>آلية العمل</a></nav>",
      "<div class='header-actions'>", themeToggle(), "<a class='header-signin' href='/signin/'>تسجيل الدخول</a><a class='button button-light' href='/signup/'>إنشاء حساب جديد</a></div>",
      "</div></header>",
      "<main id='main-content' tabindex='-1'>",
      "<section class='hero on-dark' aria-labelledby='hero-title'><div class='wrap hero-copy'>",
      "<span class='eyebrow'>تحليل العقود بالذكاء الاصطناعي</span>",
      "<h1 id='hero-title'>منصة معين لتحليل العقود</h1>",
      "<p>تلخيص العقود، وتحديد البنود التي تستوجب المراجعة، والإجابة عن استفساراتك مع الإحالة إلى موضع كل نتيجة في النص الأصلي.</p>",
      "<div class='hero-actions'><a class='button button-light' href='/upload/'>رفع عقد</a><a class='button button-outline-light' href='#how'>آلية العمل</a></div>",
      "</div></section>",
      "<div class='wrap'><div class='product-shot' role='img' aria-label='مثال توضيحي لنتيجة تحليل عقد إيجار سكني'>",
      "<div class='shot-nav' aria-hidden='true'><span class='active'>العقود</span><span>الاستفسارات</span><span>رفع عقد</span></div>",
      "<div class='shot-main' aria-hidden='true'>",
      "<div class='shot-title'><strong>عقد إيجار سكني</strong><span class='status status-complete'>مكتمل</span></div>",
      "<div class='shot-facts'><div><span>مدة العقد</span><b>12 شهرًا</b></div><div><span>دورية السداد</span><b>شهرية</b></div><div><span>الإنهاء</span><b>إشعار مسبق 30 يومًا</b></div></div>",
      "<p class='source-note'>المصدر: البند 7، الصفحة 3</p>",
      "</div></div></div>",
      "<section class='section' id='services' aria-labelledby='services-title'><div class='wrap'>",
      "<div class='section-head'><h2 id='services-title'>خدمات المنصة</h2></div>",
      "<div class='services'>",
      service("summary", "ملخص العقد", "عرض موجز لأطراف العقد والتزاماته وشروطه الأساسية."),
      service("risk", "تحديد المخاطر", "إبراز البنود التي تستوجب المراجعة قبل التوقيع."),
      service("source", "الإحالة إلى المصدر", "ربط كل نتيجة برقم الصفحة والبند في النص الأصلي."),
      "</div></div></section>",
      "<section class='section' id='how' aria-labelledby='how-title'><div class='wrap'>",
      "<div class='section-head'><h2 id='how-title'>آلية العمل</h2></div>",
      "<ol class='steps'>",
      step(1, "رفع العقد", "ارفع العقد بصيغة PDF."),
      step(2, "التحليل", "تستخرج المنصة البنود والمعلومات الأساسية."),
      step(3, "مراجعة النتائج", "اطّلع على الملخص والمخاطر، وارجع إلى موضع كل نتيجة في العقد."),
      "</ol>",
      "<div class='cta-band on-dark'><div><h2>إجابات مستندة إلى نص العقد</h2><p>أنشئ حسابك لرفع العقود ومتابعة نتائج تحليلها.</p></div><a class='button button-light' href='/signup/'>إنشاء حساب جديد</a></div>",
      "</div></section>",
      "</main>",
      "<footer class='wrap site-footer'><span>جميع الحقوق محفوظة لمنصة معين © 2026</span><span>المعلومات المقدمة لأغراض توضيحية ولا تُعد استشارة قانونية.</span></footer>"
    ].join("");
  }

  function auth(type) {
    var signup = type === "signup";
    return [
      skipLink(),
      "<div class='auth'>",
      "<aside class='auth-aside on-dark'>",
      "<div class='auth-aside-top'>", brand(), themeToggle(), "</div>",
      "<div><h1>منصة معين لتحليل العقود</h1><p>تلخيص العقود وتحديد المخاطر، مع الإحالة إلى موضع كل نتيجة في النص الأصلي.</p></div>",
      "<small>جميع الحقوق محفوظة لمنصة معين © 2026</small>",
      "</aside>",
      "<main class='auth-main' id='main-content' tabindex='-1'><div class='auth-card'>",
      "<h2>", signup ? "إنشاء حساب جديد" : "تسجيل الدخول", "</h2>",
      "<p>", signup ? "يرجى إدخال البيانات المطلوبة لإنشاء حسابك." : "يرجى إدخال بيانات تسجيل الدخول.", "</p>",
      "<form data-auth-form>",
      "<div class='field'><label for='email'>البريد الإلكتروني</label><input class='input' id='email' name='email' type='email' dir='ltr' autocomplete='email' placeholder='name@example.com' required></div>",
      "<div class='field'><label for='password'>كلمة المرور</label><input class='input' id='password' name='password' type='password' required",
      signup ? " autocomplete='new-password' minlength='8' aria-describedby='password-hint'>" : " autocomplete='current-password'>",
      signup ? "<span class='hint' id='password-hint'>يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.</span>" : "",
      "</div>",
      "<button class='button button-primary button-block' type='submit'>", signup ? "إنشاء الحساب" : "تسجيل الدخول", "</button>",
      "</form>",
      "<p class='auth-switch'>", signup ? "لديك حساب؟ <a class='text-link' href='/signin/'>تسجيل الدخول</a>" : "ليس لديك حساب؟ <a class='text-link' href='/signup/'>إنشاء حساب جديد</a>", "</p>",
      "<a class='text-link auth-back' href='/'>العودة إلى الصفحة الرئيسية</a>",
      "</div></main></div>"
    ].join("");
  }

  function dashboard() {
    function stat(kind, label) {
      return "<div class='stat'><span class='status status-" + kind + "'>" + label + "</span><b><span aria-hidden='true'>—</span><span class='sr-only'>لا توجد بيانات</span></b></div>";
    }
    var content = [
      "<div class='page-head'><div><h1>أهلًا بك في منصة معين</h1><p>تابع عقودك وحالة تحليلها، أو ارفع عقدًا جديدًا.</p></div><a class='button button-primary' href='/upload/'>رفع عقد</a></div>",
      "<section class='block' aria-labelledby='services-title'><h2 class='section-title' id='services-title'>الخدمات</h2><div class='actions'>",
      "<a class='action' href='/upload/'><span class='action-icon'>", icon("upload"), "</span><span><strong>رفع عقد</strong><span>رفع عقد بصيغة PDF لتحليله.</span></span></a>",
      "<a class='action' href='/ask/'><span class='action-icon'>", icon("ask"), "</span><span><strong>الاستفسار عن عقد</strong><span>طرح استفسار حول عقد مكتمل التحليل والاطلاع على مصدر الإجابة.</span></span></a>",
      "</div></section>",
      "<section class='panel block' aria-labelledby='overview-title'><div class='panel-head'><h2 id='overview-title'>ملخص العقود</h2></div>",
      "<div class='stats'>", stat("uploaded", "تم الرفع"), stat("processing", "قيد التحليل"), stat("complete", "مكتمل"), stat("failed", "تعذّر التحليل"), "</div>",
      "<div class='panel-head'><h3>أحدث العقود</h3><div class='panel-links'><a class='text-link' href='/contracts/#favorites'>المفضلة</a><a class='text-link' href='/contracts/'>عرض جميع العقود</a></div></div>",
      emptyState("contracts", "لا توجد عقود مرفوعة", "تظهر هنا أحدث العقود المرفوعة وحالة تحليلها.", "<a class='button button-secondary' href='/upload/'>رفع عقد</a>"),
      "</section>"
    ].join("");
    return shell("dashboard", "الرئيسية", content);
  }

  function contracts() {
    var content = [
      "<div class='page-head'><div><h1>العقود</h1><p>جميع العقود المرفوعة وحالة تحليلها.</p></div><a class='button button-primary' href='/upload/'>رفع عقد</a></div>",
      "<section class='panel' aria-label='قائمة العقود'>",
      "<div class='panel-tabs'><div class='tabs' role='group' aria-label='تصفية العقود'>",
      "<button class='tab active' type='button' data-library-tab='all' aria-pressed='true'>جميع العقود</button>",
      "<button class='tab' type='button' data-library-tab='recent' aria-pressed='false'>الأحدث</button>",
      "<button class='tab' type='button' data-library-tab='favorites' aria-pressed='false'>المفضلة</button>",
      "</div></div>",
      "<div class='toolbar'><label class='sr-only' for='contract-search'>البحث باسم العقد</label><input class='input search-input' id='contract-search' type='search' placeholder='البحث باسم العقد'>",
      "<label class='sr-only' for='contract-sort'>ترتيب العقود</label><select class='input sort-select' id='contract-sort'><option>الأحدث أولًا</option><option>الأقدم أولًا</option></select></div>",
      "<div class='list-head' aria-hidden='true'><span>اسم العقد</span><span>الحالة</span><span>تاريخ آخر تحديث</span><span>المفضلة</span></div>",
      "<div data-library-panel='all'>", emptyState("contracts", "لا توجد عقود مرفوعة", "تظهر العقود هنا بعد رفعها.", "<a class='button button-secondary' href='/upload/'>رفع عقد</a>"), "</div>",
      "<div data-library-panel='recent' hidden>", emptyState("recent", "لا توجد عقود حديثة", "تظهر هنا العقود التي رفعتها أو اطّلعت عليها مؤخرًا."), "</div>",
      "<div data-library-panel='favorites' hidden>", emptyState("star", "لا توجد عقود في المفضلة", "أضف العقود المهمة إلى المفضلة للوصول إليها بسرعة."), "</div>",
      "</section>",
      "<div class='legend'><span>حالات العقد:</span><span class='status status-uploaded'>تم الرفع</span><span class='status status-processing'>قيد التحليل</span><span class='status status-complete'>مكتمل</span><span class='status status-failed'>تعذّر التحليل</span></div>"
    ].join("");
    return shell("contracts", "العقود", content);
  }

  function upload() {
    var content = [
      "<div class='page-head'><div><h1>رفع عقد</h1><p>يرجى اختيار ملف العقد بصيغة PDF.</p></div></div>",
      "<div class='upload-grid'><section class='panel upload-card' aria-label='اختيار ملف العقد'>",
      "<div class='dropzone' id='dropzone'><span class='empty-icon'>", icon("upload"), "</span><h2>اسحب ملف العقد وأفلته هنا</h2><p>أو اختر الملف من جهازك. الصيغة المقبولة: PDF، والحد الأقصى للحجم: 50 ميغابايت.</p>",
      "<button class='button button-secondary' type='button' id='select-file'>اختيار ملف</button><input class='file-input' id='file-input' type='file' accept='.pdf,application/pdf' tabindex='-1' aria-hidden='true'></div>",
      "<div class='file-row' id='file-preview' hidden><div><strong id='file-name'></strong><span id='file-size'></span></div><button class='button-link' type='button' id='remove-file'>إزالة</button></div>",
      "<p class='alert' id='upload-error' role='alert' hidden></p>",
      "<div class='upload-actions'><button class='button button-primary' type='button' id='upload-submit'>رفع العقد</button></div>",
      "</section>",
      "<aside class='panel help'><h2>قبل الرفع</h2><p>تأكد من أن الملف بصيغة PDF، وأن صفحاته واضحة وقابلة للقراءة.</p><hr class='divider'><h2>بعد الرفع</h2><p>تظهر حالة العقد في صفحة العقود، ويبدأ التحليل تلقائيًا بعد اكتمال الرفع.</p></aside>",
      "</div>"
    ].join("");
    return shell("upload", "رفع عقد", content);
  }

  function details() {
    function tab(name, label, selected) {
      return "<button class='tab" + (selected ? " active" : "") + "' type='button' role='tab' id='tab-" + name + "' aria-controls='panel-" + name + "' aria-selected='" + (selected ? "true" : "false") + "' data-tab='" + name + "'>" + label + "</button>";
    }
    var tags = ["الأطراف", "الالتزامات", "شروط الدفع", "الإنهاء", "التجديد", "البنود الجوهرية", "المخاطر"].map(function (label) {
      return "<span class='tag' role='listitem'>" + label + "</span>";
    }).join("");
    var content = [
      "<a class='text-link back-link' href='/contracts/'>العودة إلى العقود</a>",
      "<div class='page-head'><div><h1>تفاصيل العقد</h1></div><span class='status'>لم يُحدَّد عقد</span></div>",
      "<div class='panel meta'><div><span>اسم الملف</span><strong>—</strong></div><div><span>الحالة</span><strong>—</strong></div><div><span>تاريخ الرفع</span><strong>—</strong></div></div>",
      "<section class='panel'><div class='panel-tabs'><div class='tabs' role='tablist' aria-label='أقسام العقد'>",
      tab("overview", "نظرة عامة", true), tab("analysis", "نتائج التحليل", false), tab("ask", "الاستفسارات", false),
      "</div></div>",
      "<div class='tab-panel' role='tabpanel' id='panel-overview' aria-labelledby='tab-overview' data-tab-panel='overview'><div class='detail-grid'>",
      "<div class='detail-box'><h3>ملخص العقد</h3><p>يظهر الملخص بعد اكتمال تحليل العقد.</p></div>",
      "<div class='detail-box'><h3>المعلومات الأساسية</h3><p>تظهر المعلومات الأساسية بعد اكتمال تحليل العقد.</p></div>",
      "</div></div>",
      "<div class='tab-panel' role='tabpanel' id='panel-analysis' aria-labelledby='tab-analysis' data-tab-panel='analysis' hidden>",
      emptyState("summary", "لا توجد نتائج تحليل", "تظهر هنا نتائج التحليل مع الإحالة إلى مصدر كل نتيجة."),
      "<div class='tags' role='list' aria-label='أقسام التحليل'>", tags, "</div>",
      "</div>",
      "<div class='tab-panel' role='tabpanel' id='panel-ask' aria-labelledby='tab-ask' data-tab-panel='ask' hidden>",
      "<h2 class='section-title'>الاستفسار عن العقد</h2><p class='muted'>تظهر الإجابة مع رقم الصفحة والبند والنص الذي تستند إليه.</p>",
      "<form class='qa-form' data-qa-form><label class='sr-only' for='detail-question'>اكتب استفسارك</label><textarea class='input' id='detail-question' rows='3' placeholder='مثال: ما شروط إنهاء العقد؟'></textarea><button class='button button-primary' type='submit'>إرسال الاستفسار</button></form>",
      "<p class='disclaimer'>", DISCLAIMER, "</p>",
      "</div>",
      "</section>"
    ].join("");
    return shell("details", "تفاصيل العقد", content);
  }

  function ask() {
    var content = [
      "<div class='page-head'><div><h1>الاستفسارات</h1><p>يرجى اختيار عقد للبدء.</p></div></div>",
      "<section class='panel ask' aria-label='الاستفسار عن عقد'>",
      "<aside class='ask-aside'>",
      "<div><label class='aside-label' for='ask-contract'>العقد المحدد</label><select class='input' id='ask-contract'><option>اختيار عقد</option></select><p class='aside-note'>لا توجد عقود مكتملة التحليل.</p></div>",
      "<div class='history'><span class='aside-label'>سجل الاستفسارات</span><p class='aside-note'>لا توجد استفسارات سابقة.</p></div>",
      "<a class='button button-secondary' href='/upload/'>رفع عقد</a>",
      "</aside>",
      "<div class='ask-main'>",
      "<div class='ask-top'><strong>استفسار جديد</strong><span>يرجى اختيار عقد</span></div>",
      "<div class='ask-body' role='log' aria-label='محادثة الاستفسار'><div class='ask-welcome'><span class='empty-icon'>", icon("ask"), "</span>",
      "<h3>الاستفسار عن عقد</h3><p>اختر عقدًا مكتمل التحليل، ثم اكتب استفسارك. تظهر كل إجابة مع رقم الصفحة والبند والنص الذي تستند إليه.</p>",
      "<div class='suggestions' role='group' aria-label='أمثلة على الاستفسارات'><button class='suggestion' type='button'>ما التزاماتي في العقد؟</button><button class='suggestion' type='button'>ما شروط إنهاء العقد؟</button><button class='suggestion' type='button'>ما شروط التجديد؟</button></div>",
      "</div></div>",
      "<div class='composer-wrap'><form class='composer' data-qa-form><label class='sr-only' for='contract-question'>اكتب استفسارك</label><textarea class='input' id='contract-question' rows='1' placeholder='اكتب استفسارك هنا'></textarea><button class='button button-primary' type='submit'>إرسال الاستفسار</button></form>",
      "<p class='disclaimer'>", DISCLAIMER, "</p></div>",
      "</div></section>"
    ].join("");
    return shell("ask", "الاستفسارات", content);
  }

  function account() {
    var content = [
      "<div class='page-head'><div><h1>الحساب</h1><p>بيانات حسابك وإعدادات الدخول.</p></div></div>",
      "<div class='account-grid'>",
      "<section class='panel' aria-labelledby='account-info-title'><div class='panel-head'><h2 id='account-info-title'>بيانات الحساب</h2></div><div class='panel-body'>",
      "<div class='field-row'><span>البريد الإلكتروني</span><strong>—</strong></div>",
      "<div class='field-row'><span>حالة الحساب</span><strong>غير مسجّل الدخول</strong></div>",
      "</div></section>",
      "<section class='panel panel-pad account-login' aria-labelledby='account-login-title'><h2 class='section-title' id='account-login-title'>تسجيل الدخول</h2><p class='muted'>يرجى تسجيل الدخول للاطلاع على بيانات حسابك.</p><a class='button button-primary' href='/signin/'>تسجيل الدخول</a></section>",
      "</div>"
    ].join("");
    return shell("account", "الحساب", content);
  }

  var views = {
    landing: landing,
    signin: function () { return auth("signin"); },
    signup: function () { return auth("signup"); },
    dashboard: dashboard,
    upload: upload,
    contracts: contracts,
    details: details,
    ask: ask,
    account: account
  };
  app.innerHTML = views[page]();
  if (location.protocol === "file:") {
    var root = new URL(".", document.querySelector('script[src$="app.js"]').src);
    app.querySelectorAll('a[href^="/"]').forEach(function (link) {
      var original = link.getAttribute("href");
      var pieces = original.split("#");
      var route = pieces[0].replace(/^\/|\/$/g, "");
      var destination = (route ? route + "/" : "") + "index.html" + (pieces[1] ? "#" + pieces[1] : "");
      link.href = new URL(destination, root).href;
    });
  }

  var darkHeader = page === "landing" || page === "signin" || page === "signup";
  function syncThemeButtons() {
    var dark = document.documentElement.dataset.theme === "dark";
    var themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute("content", darkHeader ? (dark ? "#12223a" : "#13294b") : (dark ? "#0f1218" : "#f7f8fa"));
    document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
      button.setAttribute("aria-pressed", dark ? "true" : "false");
      button.setAttribute("aria-label", dark ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن");
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
  document.title = ({ landing: "منصة معين لتحليل العقود", signin: "تسجيل الدخول | معين", signup: "إنشاء حساب جديد | معين", dashboard: "الرئيسية | معين", upload: "رفع عقد | معين", contracts: "العقود | معين", details: "تفاصيل العقد | معين", ask: "الاستفسارات | معين", account: "الحساب | معين" })[page];

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

  var authForm = document.querySelector("[data-auth-form]");
  if (authForm) {
    authForm.addEventListener("submit", function (event) {
      event.preventDefault();
      showToast(UNAVAILABLE);
    });
  }
  document.querySelectorAll("[data-unavailable]").forEach(function (button) {
    button.addEventListener("click", function () { showToast(button.getAttribute("data-unavailable") || UNAVAILABLE); });
  });
  document.querySelectorAll("[data-qa-form]").forEach(function (qaForm) {
    qaForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var question = qaForm.querySelector("textarea");
      if (!question.value.trim()) {
        question.focus();
        showToast("يرجى كتابة الاستفسار أولًا.");
        return;
      }
      showToast(UNAVAILABLE);
    });
  });
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
      if (event.key === "ArrowLeft") next = (index + 1) % detailTabs.length;
      else if (event.key === "ArrowRight") next = (index - 1 + detailTabs.length) % detailTabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = detailTabs.length - 1;
      else return;
      event.preventDefault();
      activateDetailTab(detailTabs[next], true);
    });
  });

  var libraryTabs = Array.from(document.querySelectorAll("[data-library-tab]"));
  function setLibraryView(view) {
    libraryTabs.forEach(function (button) {
      var active = button.getAttribute("data-library-tab") === view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    document.querySelectorAll("[data-library-panel]").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-library-panel") !== view;
    });
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
    if (bytes < 1024) return bytes + " بايت";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " كيلوبايت";
    return (bytes / (1024 * 1024)).toFixed(1) + " ميغابايت";
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
      showUploadError("عذرًا، يُقبل ملف بصيغة PDF فقط.");
      return;
    }
    if (file.size === 0) {
      showUploadError("عذرًا، الملف المختار فارغ. يرجى اختيار ملف آخر.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      showUploadError("عذرًا، يتجاوز حجم الملف الحد المسموح (50 ميغابايت).");
      return;
    }
    try {
      var signature = await file.slice(0, 5).text();
      if (signature !== "%PDF-") {
        showUploadError("عذرًا، تعذّر التحقق من صيغة الملف. يرجى اختيار ملف PDF صالح.");
        return;
      }
    } catch (error) {
      showUploadError("عذرًا، تعذّرت قراءة الملف. يرجى المحاولة مرة أخرى.");
      return;
    }
    selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatSize(file.size) + " · جاهز للرفع";
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
    uploadSubmit.addEventListener("click", function () {
      if (!selectedFile) {
        showUploadError("يرجى اختيار ملف العقد أولًا.");
        return;
      }
      showToast(UNAVAILABLE);
    });
  }
})();
