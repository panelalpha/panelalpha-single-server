<div align="center" dir="rtl">

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/panelalpha.svg"><img src="../assets/panelalpha-light.svg" alt="PanelAlpha Single Server Edition" width="360"></picture></p>

<h1>لوحة استضافة<br>لخادمك الخاص.</h1>

<h3>
المواقع والنطاقات والنسخ الاحتياطية وبيئة staging في متصفحك. تعمل على PanelAlpha Engine.
</h3>

<h3>
<a href="#شغل-اللوحة"><b>ابدأ</b></a> ·
<a href="https://www.panelalpha.com/documentation/single-server-edition"><b>التوثيق</b></a> ·
<a href="#تحدث-معنا-على-discord"><b>Discord</b></a>
</h3>

<p>
<a href="#أين-تجد-كل-شيء">في اللوحة</a> ·
<a href="#اربط-مساعدك-الذكي">ربط الذكاء الاصطناعي</a> ·
<a href="#panelalpha-hub">Hub</a> ·
<a href="#الأسئلة-الشائعة">الأسئلة الشائعة</a>
</p>

<p dir="ltr">
<a href="../../README.md">English</a>
· <a href="README.pl.md">Polski</a>
· <a href="README.de.md">Deutsch</a>
· <a href="README.nl.md">Nederlands</a>
· <a href="README.es.md">Español</a>
· <a href="README.fr.md">Français</a>
· <a href="README.it.md">Italiano</a>
· <a href="README.pt-BR.md">Português</a>
· <a href="README.uk.md">Українська</a>
· <b>العربية</b>
· <a href="README.zh-CN.md">简体中文</a>
</p>

<p>
<a href="#الخطوة-1-قم-بتثبيت-اللوحة-على-خادمك-vps"><img src="https://img.shields.io/badge/PanelAlpha_Engine-2.3.0+-E65E12" alt="يتطلب PanelAlpha Engine 2.3.0 أو أحدث"></a>
<a href="#الخطوة-1-قم-بتثبيت-اللوحة-على-خادمك-vps"><img src="https://img.shields.io/badge/Debian_12%2F13-Ubuntu_22.04%2F24.04%2F26.04-a80030" alt="أنظمة التشغيل المدعومة"></a>
<a href="#الترخيص"><img src="https://img.shields.io/badge/license-Apache_2.0-0b7285" alt="Apache 2.0"></a>
<a href="https://discord.gg/9twHWR7xGX"><img src="https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white" alt="انضم إلى Discord"></a>
</p>

</div>

<div dir="rtl">

---

## ما هو PanelAlpha Single Server Edition؟

PanelAlpha Single Server Edition لوحة استضافة ويب تثبّتها على خادم VPS الخاص بك. تفتحها في المتصفح وتدير فيها مواقعك: WordPress وتطبيقات Git والنطاقات والنسخ الاحتياطية وغيرها. يتولى PanelAlpha Engine الاستضافة في الخلفية، وتمنحك اللوحة شاشة للتحكم بها.

نسخة Community مخصصة لشخص واحد وليس فيها حد لعدد المشاريع. في اللوحة يمكنك:

- إنشاء موقع WordPress، أو نشر تطبيق من Git أو من ملفات، أو تثبيت تطبيق مُختبَر من كتالوج PanelAlpha GO!
- استيراد موقع WordPress من مزوّد استضافة آخر
- إضافة نطاقات بشهادات من Let's Encrypt
- أخذ نسخ احتياطية يدوياً أو بجدول زمني واستعادتها
- الاحتفاظ بنسخة staging من الموقع ونقلها إلى الموقع الحي
- إدارة قواعد البيانات ومهام cron وحسابات FTP وSFTP وإعدادات PHP
- عرض إحصاءات الزوار والاستخدام والسجلات
- ربط مساعد ذكي وإدارة مشاريعك بالمحادثة
- ربط الخادم بحسابك في PanelAlpha Hub وتسجيل الدخول به

## كيف يعمل

<div align="center"><img src="../assets/panelalpha-tour.gif" alt="جولة في اللوحة: إنشاء مشروع من PanelAlpha GO!، وصفحة المشروع، وstaging وPush To Live، وConnect AI" width="800"><br><a href="../assets/panelalpha-tour.mp4">شاهد الجولة كاملة (2.5 دقيقة، MP4)</a></div>

اللوحة مشروع واحد على المحرك، في حاويتها الخاصة. عندما تنشئ موقعاً، تطلب اللوحة من Engine API ذلك، ويمنح المحرك هذا الموقع مشروعاً خاصاً به. حذف اللوحة يحذف مشروع اللوحة وحده. تبقى مواقعك تعمل.

## لماذا تستخدم اللوحة

يُشغَّل PanelAlpha Engine من مساعد ذكي أو من الأمر `pae` على الخادم. اللوحة تضع العمل نفسه على شاشة. تستطيع إضافة نطاق أو استعادة نسخة احتياطية أو نقل نسخة staging إلى الموقع الحي ببضع نقرات، وترى كل مواقع الخادم في قائمة واحدة. وعندما تريد مساعدة من مساعد ذكي، تربطه باللوحة فيعمل على المشاريع نفسها.

## شغل اللوحة

### الخطوة 1: قم بتثبيت اللوحة على خادمك VPS

تحتاج إلى خادم جديد بنظام Debian 12/13 أو Ubuntu 22.04/24.04/26.04، وذاكرة RAM بحجم 2 غيغابايت، ووصول `root` عبر SSH، ونطاق موجَّه إليه. **يجب أن يكون المنفذ 80 مفتوحاً للجميع**، لأن Let's Encrypt يستخدمه.

```bash
curl -fsSL get.panelalpha.com/single-server | sh
```

كل الخيارات وإصدار Engine الذي تحتاجه اللوحة: [Installing the panel](https://www.panelalpha.com/documentation/single-server-edition/getting-started/install).

### الخطوة 2: تسجيل الدخول

افتح `https://panel.example.com`. ينشئ معالج الإعداد حسابك، أو يربط حسابك في PanelAlpha Hub، ثم يفتح اللوحة: [First login](https://www.panelalpha.com/documentation/single-server-edition/getting-started/first-login).

### الخطوة 3: أنشئ أول موقع لك

اذهب إلى **My Projects**، واختر **Create First Project**، ثم اختر **WordPress** أو **Git** أو **Files** أو **PanelAlpha GO!**. يمكنك أيضاً إسقاط أرشيف `.zip` أو `.tar.gz` مباشرة على قائمة المشاريع: [Create a project](https://www.panelalpha.com/documentation/single-server-edition/projects/create-a-project).

**PanelAlpha GO!** كتالوج لتطبيقات مفتوحة المصدر نشرها PanelAlpha واختبرها على PanelAlpha Engine. تختار تطبيقاً فتثبّته اللوحة، دون أي شيء آخر لتملأه. يظهر الكتالوج بمجرد ربط اللوحة بـ [PanelAlpha Hub](#panelalpha-hub).

<div align="center">
<a href="https://www.panelalpha.com/documentation/single-server-edition/projects/create-a-project"><img src="https://skillicons.dev/icons?i=wordpress,php,laravel,nodejs,nextjs,python,docker,git&perline=8" alt="WordPress, PHP, Laravel, Node.js, Next.js, Python, Docker, Git"></a>
<br>
WordPress، أو أي تطبيق يستطيع المحرك بناءه من مستودع Git أو من مجلد ملفات.
</div>

## أين تجد كل شيء

اختر **Manage** على مشروع لفتحه. تبويباته هي **Project Details** و**Monitoring** و**Backups** و**Plugins** و**Advanced**. يظهر **Plugins** على موقع WordPress فقط.

| تريد أن | في اللوحة |
|:---|:---|
| تضع نطاقك الخاص على موقع | **Advanced > Domains**، ثم **Add Domain** |
| تأخذ نسخة احتياطية، أو تنسخ احتياطياً بجدول زمني | تبويب **Backups**. أعدّ مخزناً مرة واحدة في **Settings > Backups** |
| تجرب تغييراً قبل أن يصل إلى الموقع الحي | **Staging** في الشريط العلوي للمشروع، ثم **Push To Live** |
| تعيد النشر مع كل git push | **Advanced > Git**، ثم **Auto-deploy on push** |
| تنقل موقع WordPress من مزوّد آخر | أنشئ مشروعاً، ثم **WordPress**، ثم **Import Existing WordPress Project** |
| تضيف قاعدة بيانات ومستخدماً لها | **Advanced > MySQL Databases** |
| تمنح أحداً وصول SFTP | **Advanced > SFTP Accounts** |
| تشغّل سكربتاً بجدول زمني | **Advanced > Cron Jobs** |
| تغيّر إصدار PHP أو `memory_limit` | **Advanced > Developer Settings** |
| ترى كم شخصاً يزور الموقع | تبويب **Monitoring** |

## كل ما يحتاجه الموقع، داخل اللوحة

- **النطاقات وHTTPS.** وجّه نطاقك الخاص إلى موقع، وأضف نطاقات وعمليات إعادة توجيه أخرى، وامنح كل نطاق شهادة Let's Encrypt. إذا لم يكن لديك نطاق بعد، فاستخدم نطاقاً فرعياً مجانياً عندما يوفره خادمك. [Domains and SSL](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/domains-and-ssl)
- **نسخ احتياطية يمكن استعادتها.** انسخ يدوياً أو يومياً أو أسبوعياً أو شهرياً إلى S3 أو SFTP أو FTP أو FTPS أو مجلد محلي. في موقع WordPress يمكنك استعادة الملفات وقاعدة البيانات كلاً على حدة. [Backups](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/backups)
- **Staging.** اصنع نسخة من الموقع، وجرّب تغييراتك فيها، ثم انقل الملفات أو قاعدة البيانات كاملة أو جداول محددة إلى الموقع الحي. يستطيع مشروع Git نشر فرع على staging وترك production كما هو. [Staging and preview](https://www.panelalpha.com/documentation/single-server-edition/projects/staging-and-preview)
- **Git.** اعرف كم commit يتأخر الموقع، وأعد النشر، وبدّل الفرع، وتابع سجل النشر أثناء تشغيله. عند تفعيل النشر التلقائي، يعيد أي push إلى GitHub أو GitLab أو Bitbucket نشر الموقع. [Git](https://www.panelalpha.com/documentation/single-server-edition/projects/git)
- **WordPress.** ادخل إلى لوحة التحكم بلا كلمة مرور، وحدّث WordPress وWooCommerce، وثبّت الإضافات والقوالب باسمها في wordpress.org، وأدر مستخدمي WordPress، وفعّل التحديثات التلقائية. [Managing WordPress](https://www.panelalpha.com/documentation/single-server-edition/projects/wordpress)
- **الملفات وFTP وSFTP.** حرّر الملفات وارفعها وضغطها وفك ضغطها في مدير الملفات، أو امنح برنامجاً مثل FileZilla حساب FTP أو SFTP. [Files and access](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/files-and-access)
- **قواعد البيانات.** أنشئ قواعد بيانات ومستخدمي MySQL، وحدد صلاحياتهم، وافتح phpMyAdmin من اللوحة. [Databases](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/databases)
- **الإحصاءات والسجلات.** الزيارات بحسب البلد والمصدر والجهاز، وعرض النطاق، ومعالج CPU والذاكرة RAM والقرص للخادم كله، وسجلات PHP وخادم الويب لكل موقع. [Statistics and logs](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/statistics-and-logs)

## اربط مساعدك الذكي

تربط مساعدك من اللوحة، في صفحة **Connect AI** في القائمة العلوية.

1. افتح **Connect AI** واختر أداتك تحت **Your tool**.
2. تحت **Generate an MCP token**، اختر **Create Token**، وسمّه باسم مثل `Claude on my laptop`، ثم انسخه. **يظهر الرمز مرة واحدة فقط.**
3. تعرض الخطوة التالية ما يجب وضعه في أداتك، وعنوان لوحتك مكتوب فيه مسبقاً. اختر **Copy**، والصقه في أداتك، واستبدل `YOUR_TOKEN` برمزك.
4. اتبع **Verify the connection** في الصفحة نفسها. في Claude Code، أعد تشغيله أو نفّذ `/mcp`.

ثم اطلب في المحادثة، مثلاً `List my projects.`

<div align="center">

<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/claude.png" width="46" alt="Claude Code"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/openai.png" width="46" alt="ChatGPT, Codex"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/cursor.png" width="46" alt="Cursor"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="../assets/windsurf.png" width="46" alt="Windsurf"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://skillicons.dev/icons?i=vscode" width="46" alt="VS Code"></a>

<sub><b>Claude Code&nbsp; · &nbsp;ChatGPT / Codex&nbsp; · &nbsp;Cursor&nbsp; · &nbsp;Windsurf&nbsp; · &nbsp;VS Code</b></sub>

</div>

لكل أداة من هذه صفحتها الخاصة في **Connect AI**، و**Other tool** تغطي أي شيء آخر يتحدث MCP. يستطيع المساعد الوصول إلى مشاريعك الحية ومشاريع staging. ولا يستطيع تغيير إعدادات الخادم كله، أو تغيير حدود مشروع، أو تعليق مشروع، أو لمس مشروع اللوحة نفسه. **MCP URL & tokens** يعرض رموزك ويتيح لك إلغاء أي منها، و**Activity Log** يعرض كل طلب: [Connect AI](https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai).

## PanelAlpha Hub

PanelAlpha Hub هو حسابك في PanelAlpha على [hub.panelalpha.com](https://hub.panelalpha.com). ربط اللوحة به مجاني واختياري. تواصل اللوحة العمل بمفردها في الحالتين.

عند ربط اللوحة:

- تسجّل الدخول إلى اللوحة عبر **Sign in with PanelAlpha**، ويمكن لحسابك في Hub تسجيل الدخول عبر GitHub أو Google
- حساب واحد يغطي كل خوادمك
- يمكنك تثبيت تطبيقات من كتالوج PanelAlpha GO!
- يعرض Hub حالة كل موقع على هذا الخادم

يمكنك الربط في أحد مكانين. أثناء تسجيل الدخول الأول، اختر **Connect with Hub** في خطوة **Sign in** من معالج الإعداد بدلاً من حساب محلي. وفي لوحة أُعدّت من قبل، افتح **Settings** واختر **Connect to PanelAlpha**. في الحالتين تسجّل الدخول في PanelAlpha وتعود مباشرة إلى اللوحة.

أثناء الربط، ترسل اللوحة إلى Hub كل خمس دقائق: اسم كل مشروع ونوعه وحالته، وإصدار اللوحة وعنوانها. **تسجيل الدخول عبر PanelAlpha يتخطى فحص التحقق بخطوتين الخاص باللوحة.** تسجيل الدخول عبر Hub يُعدّ ذلك الفحص.

**Disconnect** في **Settings** يزيل الخادم من حسابك ويوقف **Sign in with PanelAlpha**. إذا كان PanelAlpha هو طريقك الوحيد للدخول، فعيّن كلمة مرور في **My Account** أولاً: [Settings](https://www.panelalpha.com/documentation/single-server-edition/the-panel/settings#panelalpha-hub).

## كيف تبقى مواقعك منفصلة عن بعضها

كل موقع مشروع قائم بذاته على المحرك، بملفاته وقواعد بياناته ونطاقاته ونسخه الاحتياطية. المواقع المبنية من Git أو من ملفات تعمل في حاويات خاصة بها، فلا يُسقط تطبيق معطّل التطبيقات الأخرى.

اللوحة مشروع أيضاً. عندما يكون مشروعها محمياً، لا تستطيع اللوحة ولا أي رمز حذفه أو إيقافه أو إعادة نشره. لا يستطيع ذلك إلا `pae` على الخادم. حذف اللوحة يترك كل المواقع تعمل.

يمكن أن يكون لتسجيل دخولك تحقق بخطوتين، ويتيح **Active Devices** إنهاء الجلسة في متصفح لم تعد تستخدمه: [Your account](https://www.panelalpha.com/documentation/single-server-edition/the-panel/your-account).

## عندما لا يعمل شيء ما

معظم ما تفعله اللوحة يعمل في الخلفية: عمليات النشر والنسخ الاحتياطية ونسخ staging. **Tasks** في قائمة المستخدم يعرض كل مهمة بحالتها ومدتها، ويُظهر نقطة أثناء تشغيل إحداها. تعرض المهمة الفاشلة السطر الأول من خطئها تحت اسمها. اختر الصف لقراءة الخطأ كاملاً: [Tasks](https://www.panelalpha.com/documentation/single-server-edition/the-panel/tasks).

لموقع Git أو ملفات، يفتح **Show Logs** سجل النشر، مباشراً أو من عمليات نشر سابقة. يحتوي **Advanced > Logs** على سجلات PHP وخادم الويب، ويستطيع **Advanced > Containers** تشغيل خدمة واحدة أو إيقافها أو إعادة تشغيلها. لكل جزء من التوثيق صفحة Troubleshooting فيها الرسالة التي تراها، ومعناها، وما يجب فعله: [Troubleshooting](https://www.panelalpha.com/documentation/single-server-edition/troubleshooting/panel-and-account).

## الأسئلة الشائعة

<details>
<summary><b>هل أحتاج إلى PanelAlpha Engine؟</b></summary>

نعم. اللوحة مشروع على المحرك، وكل عملية استضافة تمر عبر Engine API. تحتاج إلى Engine 2.3.0 أو أحدث: [Requirements](https://www.panelalpha.com/documentation/single-server-edition/getting-started/requirements).
</details>

<details>
<summary><b>هل تستطيع لوحة واحدة إدارة عدة خوادم؟</b></summary>

لا. اللوحة الواحدة تدير المحرك الذي تعمل عليه. إدارة محركات كثيرة من لوحة واحدة هي Multi Server، منتج منفصل.
</details>

<details>
<summary><b>ماذا يحدث لمواقعي إذا حذفت اللوحة؟</b></summary>

تبقى تعمل. حذف اللوحة يحذف مشروعها الخاص وبياناته: الحسابات والإعدادات وتسميات المشاريع وسجل النشاط. كل موقع مشروع منفصل على المحرك: [Removing the panel](https://www.panelalpha.com/documentation/single-server-edition/getting-started/removing).
</details>

<details>
<summary><b>هل تأخذ اللوحة نسخة احتياطية من نفسها؟</b></summary>

لا. النسخ الاحتياطية التي تعدّها في اللوحة تغطي مواقعك. خذ نسخة احتياطية من اللوحة على الخادم بالأمر `pae project:backup:create`: [Where the panel keeps its data](https://www.panelalpha.com/documentation/single-server-edition/getting-started/removing#backing-up-the-panel).
</details>

<details>
<summary><b>كيف أحدّث اللوحة؟</b></summary>

انشر الإصدار الجديد في مشروع اللوحة على الخادم. لا يوجد زر تحديث. تبقى حساباتك وإعداداتك وجلساتك، وتحدّث اللوحة قاعدة بياناتها عند بدء التشغيل: [Updating the panel](https://www.panelalpha.com/documentation/single-server-edition/getting-started/updating).
</details>

<details>
<summary><b>هل يمكنني نقل اللوحة إلى عنوان آخر؟</b></summary>

نعم. وجّه النطاق الجديد إلى الخادم، ثم احفظه باسم **Application URL** في **Settings**. تضيف اللوحة النطاق وتحصل على شهادة وتنتقل إليه. يتوقف العنوان القديم عن الاستجابة: [The panel address](https://www.panelalpha.com/documentation/single-server-edition/getting-started/panel-address).
</details>

<details>
<summary><b>هل يمكنني نقل موقع WordPress من مزوّد آخر؟</b></summary>

نعم. أنشئ مشروعاً، واختر **WordPress** ثم **Import Existing WordPress Project**. تتصل اللوحة ببيانات دخول مدير WordPress لديك أو عبر إضافة تثبّتها على الموقع القديم. الاستيراد عبر FTP أو SFTP غير متاح: [Importing a WordPress site](https://www.panelalpha.com/documentation/single-server-edition/projects/importing-wordpress).
</details>

<details>
<summary><b>ما الذي لا تستطيع اللوحة فعله بعد؟</b></summary>

لا تستطيع إرجاع مشروع Git إلى commit سابق، لأنها تنشر آخر commit في فرع. وليس فيها إعداد لوضع كلمة مرور أمام موقع كامل. تُثبَّت الإضافات والقوالب باسمها في wordpress.org، لا من عنوان URL.
</details>

<details>
<summary><b>هل هي مجانية؟</b></summary>

Single Server Community مجانية، ومفتوحة المصدر برخصة Apache 2.0، وليس فيها حد لعدد المشاريع. تدفع ثمن خادمك فقط.
</details>

## تحدث معنا على Discord

[Discord](https://discord.gg/9twHWR7xGX) هو المكان الأساسي للتواصل مع فريق PanelAlpha. اطرح سؤالاً، أو أخبرنا بما لا يعمل، أو أرنا ما تستضيفه.

<br><div align="center">
<a href="https://discord.gg/9twHWR7xGX">
<img src="../assets/discord-banner.png" alt="تحدث معنا على Discord، المكان الأساسي للتواصل مع فريق PanelAlpha" width="760">
</a>
</div><br>

إذا كنت تفضّل منتدى، فاستخدم [community.panelalpha.com](https://community.panelalpha.com/).

## الأمان

أبلغ عن أي ثغرة بشكل خاص، وليس أبداً في بلاغ عام: [manage.panelalpha.com/contact](https://manage.panelalpha.com/contact).

## الترخيص

PanelAlpha Single Server Edition مفتوح المصدر برخصة [Apache License 2.0](../../LICENSE).

</div>
