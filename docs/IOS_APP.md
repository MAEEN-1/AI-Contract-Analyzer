# تطبيق معين على iOS

تطبيق iOS هو الموقع نفسه (`frontend/`) داخل غلاف Capacitor في مجلد [`mobile/`](../mobile)، ويُبنى على أجهزة Mac لدى Codemagic ويُرفع إلى TestFlight ثم App Store، دون الحاجة إلى جهاز Mac.

## كيف يعمل

```text
frontend/  (الموقع، لا يتغير)
    |  npm run build:web  ينسخه إلى mobile/www ويضيف عنوان السيرفر لنسخة التطبيق فقط
    v
mobile/www  ──  npx cap sync ios  ──>  mobile/ios (مشروع Xcode)
                                            |
                                    Codemagic يبنيه ويوقّعه ويرفعه إلى TestFlight
```

- **الموقع لا يتأثر**: سكربت `mobile/scripts/build-web.mjs` ينسخ الواجهة ويعدّل النسخة فقط (يضيف `window.MAEEN_API_URL`، ويجعل مسارات الملفات مطلقة، ويحذف `data-maeen-page="landing"` لأن Capacitor يفتح `index.html` الرئيسية لكل الصفحات).
- **التطبيق يحمل نسخة من الواجهة وقت البناء**: أي تعديل على `frontend/` يظهر في الموقع فورًا، لكنه لا يصل إلى التطبيق إلا ببناء جديد في Codemagic. أما تعديلات الباك اند فتصل للاثنين مباشرة.
- إعدادات التطبيق: المعرّف `com.maeen.contractanalyzer`، والاسم `MAEEN`، وiOS 16 فأحدث، وآيفون فقط بالوضع العمودي، والأيقونة وشاشة البدء من علامة معين.

## قبل البدء

1. **عضوية Apple Developer Program** (اشتراك سنوي من Apple). بدونها لا يمكن الرفع إلى TestFlight أو App Store.
2. **السيرفر الخاص شغال** بعنوان https (اتبع [DEPLOYMENT.md](DEPLOYMENT.md))، لأن التطبيق يتصل به.
3. حساب على [Codemagic](https://codemagic.io) مربوط بحساب GitHub الذي يصل إلى المستودع.

## الخطوات

### 1. تسجيل المعرّف وإنشاء التطبيق في Apple

1. في [developer.apple.com](https://developer.apple.com/account) ← Certificates, Identifiers & Profiles ← Identifiers ← زر +: اختر App IDs ← App، والمعرّف `com.maeen.contractanalyzer`، والوصف `MAEEN`. لا تفعّل أي قدرات إضافية.
2. في [App Store Connect](https://appstoreconnect.apple.com) ← Apps ← زر + ← New App: المنصة iOS، والاسم (مثل `MAEEN - Contract Analysis` إن كان `MAEEN` محجوزًا)، واللغة الأساسية English، والمعرّف `com.maeen.contractanalyzer`، وSKU أي نص مثل `maeen-ios`.
3. افتح التطبيق ← App Information، وانسخ الرقم المكتوب بجانب **Apple ID**.

### 2. مفتاح App Store Connect API

1. App Store Connect ← Users and Access ← Integrations ← App Store Connect API ← زر + (Generate API Key).
2. الاسم `Codemagic`، والصلاحية **App Manager**.
3. نزّل ملف `.p8` (يُنزَّل مرة واحدة فقط)، واحفظ **Issuer ID** و**Key ID**. لا ترسل الملف لأحد.

### 3. إعداد Codemagic

1. Codemagic ← Add application ← اختر المستودع `MAEEN-1/AI-Contract-Analyzer`، ونوع المشروع **Other** (يقرأ `codemagic.yaml`).
2. Team settings ← Integrations ← **Developer Portal** ← Connect: الاسم **`MAEEN App Store Connect`** بالضبط (هو المكتوب في `codemagic.yaml`)، ثم Issuer ID وKey ID وارفع ملف `.p8`.
3. Team settings ← Code signing identities:
   - **iOS certificates** ← Generate certificate ← النوع Apple Distribution، باستخدام المفتاح السابق.
   - **iOS provisioning profiles** ← Fetch profiles ← اختر ملف App Store للمعرّف `com.maeen.contractanalyzer` (إن لم يوجد، أنشئه في developer.apple.com ← Profiles ← App Store Connect، ثم أعد الجلب).

### 4. تعبئة القيمتين في `codemagic.yaml`

```yaml
MAEEN_API_URL: https://maeen-app.com        # عنوان السيرفر الخاص
APP_STORE_APPLE_ID: "1234567890"           # الرقم من الخطوة 1
```

ادفع التعديل إلى GitHub. هاتان القيمتان ليستا سرّيتين.

### 5. السماح للتطبيق بالاتصال بالسيرفر

على السيرفر، في `/srv/maeen/app/backend/.env`:

```text
FRONTEND_URL=capacitor://localhost
```

ثم:

```bash
systemctl restart maeen-backend
```

بدون هذا يرفض المتصفح داخل التطبيق ردود السيرفر (CORS).

### 6. البناء والتجربة على جوالك

1. Codemagic ← التطبيق ← Start new build ← الفرع `main` ← الـworkflow **MAEEN iOS to TestFlight**.
2. بعد اكتمال البناء (10 إلى 20 دقيقة) ومعالجة Apple له، يظهر في App Store Connect ← TestFlight.
3. أضف نفسك في TestFlight ← Internal Testing، ونزّل تطبيق **TestFlight** على الآيفون، ثم ثبّت معين منه وجرّب: إنشاء حساب، والموافقة على الذكاء الاصطناعي، ورفع عقد، والاستفسار، وحذف الحساب.

كل بناء جديد يأخذ رقم البناء التالي تلقائيًا.

### 7. الإرسال للمراجعة

في App Store Connect ← التطبيق ← الإصدار 1.0:

- **لقطات الشاشة**: مطلوبة لمقاس آيفون 6.9 بوصة (أو 6.5). صوّرها من التطبيق على جوال بهذا المقاس، أو من محاكي.
- **الوصف والكلمات المفتاحية ورابط الدعم**.
- **Privacy Policy URL**: `https://maeen-app.com/privacy/`.
- **App Privacy** (البيانات المجموعة، كلها مرتبطة بهوية المستخدم ولأداء وظائف التطبيق فقط، ولا تتبّع):
  - Contact Info: Name، Email Address.
  - User Content: Other User Content (العقود والاستفسارات ورسائل المساعد).
  - Identifiers: User ID.
- **App Review Information**: حساب تجريبي مفعّل (بريد وكلمة مرور) فيه عقد محلَّل، وملاحظة مثل: «Contract analysis uses OpenAI after the user agrees in the AI processing dialog. Results are informational and not legal advice. Accounts can be deleted from Account > Delete account.»
- **Build**: اختر البناء من TestFlight، ثم Submit for Review.

## ملاحظات

- لتجربة البناء محليًا دون رفع: داخل `mobile/` شغّل `npm ci` ثم `MAEEN_API_URL=https://maeen-app.com npm run sync`.
- لا تعدّل `mobile/ios/App/CapApp-SPM/Package.swift` يدويًا؛ يديره Capacitor.
- إصدار Capacitor مثبّت على 8.5.3 في `mobile/package.json`.
