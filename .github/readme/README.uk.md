<div align="center">

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/panelalpha.svg"><img src="../assets/panelalpha-light.svg" alt="PanelAlpha Single Server Edition" width="360"></picture></p>

<h1>Панель хостингу<br>для вашого сервера.</h1>

<h3>
Сайти, домени, резервні копії та staging у браузері. Працює на PanelAlpha Engine.
</h3>

<h3>
<a href="#запустіть-панель"><b>Почати</b></a> ·
<a href="https://www.panelalpha.com/documentation/single-server-edition"><b>Документація</b></a> ·
<a href="#поговоріть-з-нами-в-discord"><b>Discord</b></a>
</h3>

<p>
<a href="#де-що-знайти">У панелі</a> ·
<a href="#підключіть-свого-ші-асистента">Підключити ШІ</a> ·
<a href="#panelalpha-hub">Hub</a> ·
<a href="#faq">FAQ</a>
</p>

<p>
<a href="../../README.md">English</a>
· <a href="README.pl.md">Polski</a>
· <a href="README.de.md">Deutsch</a>
· <a href="README.nl.md">Nederlands</a>
· <a href="README.es.md">Español</a>
· <a href="README.fr.md">Français</a>
· <a href="README.it.md">Italiano</a>
· <a href="README.pt-BR.md">Português</a>
· <b>Українська</b>
· <a href="README.ar.md">العربية</a>
· <a href="README.zh-CN.md">简体中文</a>
</p>

<p>
<a href="#крок-1-встановіть-панель-на-свій-vps"><img src="https://img.shields.io/badge/PanelAlpha_Engine-2.3.0+-E65E12" alt="Потрібен PanelAlpha Engine 2.3.0 або новіший"></a>
<a href="#крок-1-встановіть-панель-на-свій-vps"><img src="https://img.shields.io/badge/Debian_12%2F13-Ubuntu_22.04%2F24.04%2F26.04-a80030" alt="Підтримувані системи"></a>
<a href="#ліцензія"><img src="https://img.shields.io/badge/license-Apache_2.0-0b7285" alt="Apache 2.0"></a>
<a href="https://discord.gg/9twHWR7xGX"><img src="https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white" alt="Приєднатися до Discord"></a>
</p>

</div>

---

## Що таке PanelAlpha Single Server Edition?

PanelAlpha Single Server Edition це панель веб-хостингу, яку ви встановлюєте на власний VPS. Ви відкриваєте її в браузері й керуєте там своїми сайтами: WordPress, застосунками з Git, доменами, резервними копіями та іншим. Хостинг забезпечує PanelAlpha Engine, а панель дає для нього екран.

Редакція Community призначена для однієї людини й не має ліміту на проєкти. У панелі можна:

- Створити сайт WordPress, розгорнути застосунок з Git чи з файлів або встановити перевірений застосунок з каталогу PanelAlpha GO!
- Імпортувати сайт WordPress з іншого хостингу
- Додавати домени із сертифікатами від Let's Encrypt
- Створювати резервні копії вручну або за розкладом і відновлювати їх
- Тримати staging-копію сайту й переносити її на робочий сайт
- Керувати базами даних, завданнями cron, обліковими записами FTP і SFTP та налаштуваннями PHP
- Дивитися статистику відвідувачів, використання ресурсів і логи
- Підключити ШІ-асистента й керувати проєктами через чат
- Підключити сервер до свого облікового запису PanelAlpha Hub і входити через нього

## Як це працює

<div align="center"><img src="../assets/panelalpha-tour.gif" alt="Огляд панелі: створення проєкту з PanelAlpha GO!, сторінка проєкту, staging і Push To Live та Connect AI" width="800"><br><a href="../assets/panelalpha-tour.mp4">Переглянути весь огляд (2,5 хв, MP4)</a></div>

Панель це один проєкт на рушії, у власному контейнері. Коли ви створюєте сайт, панель просить API рушія зробити це, і рушій створює для цього сайту окремий проєкт. Видалення панелі видаляє лише проєкт панелі. Ваші сайти продовжують працювати.

## Навіщо потрібна панель

PanelAlpha Engine керується з ШІ-асистента або командою `pae` на сервері. Панель виводить ту саму роботу на екран. Додати домен, відновити резервну копію чи перенести staging-копію на робочий сайт можна кількома кліками, а всі сайти сервера видно в одному списку. Коли потрібна допомога асистента, ви підключаєте його до панелі, і він працює з тими самими проєктами.

## Запустіть панель

### Крок 1: Встановіть панель на свій VPS

Вам потрібен чистий сервер із Debian 12/13 або Ubuntu 22.04/24.04/26.04, з 2 ГБ RAM, доступом `root` по SSH і доменом, спрямованим на нього. **Порт 80 має бути відкритий для всіх**, бо його використовує Let's Encrypt.

```bash
curl -fsSL get.panelalpha.com/single-server | sh
```

Усі опції та версія Engine, потрібна панелі: [Installing the panel](https://www.panelalpha.com/documentation/single-server-edition/getting-started/install).

### Крок 2: Увійдіть

Відкрийте `https://panel.example.com`. Майстер налаштування створює ваш обліковий запис або підключає ваш обліковий запис PanelAlpha Hub і відкриває панель: [First login](https://www.panelalpha.com/documentation/single-server-edition/getting-started/first-login).

### Крок 3: Створіть перший сайт

Перейдіть у **My Projects**, натисніть **Create First Project** і виберіть **WordPress**, **Git**, **Files** або **PanelAlpha GO!**. Також можна перетягнути архів `.zip` або `.tar.gz` просто на список проєктів: [Create a project](https://www.panelalpha.com/documentation/single-server-edition/projects/create-a-project).

**PanelAlpha GO!** це каталог застосунків з відкритим кодом, які PanelAlpha розгорнув і перевірив на PanelAlpha Engine. Ви обираєте застосунок, і панель встановлює його, нічого більше заповнювати не треба. Каталог з'являється, коли панель підключено до [PanelAlpha Hub](#panelalpha-hub).

<div align="center">
<a href="https://www.panelalpha.com/documentation/single-server-edition/projects/create-a-project"><img src="https://skillicons.dev/icons?i=wordpress,php,laravel,nodejs,nextjs,python,docker,git&perline=8" alt="WordPress, PHP, Laravel, Node.js, Next.js, Python, Docker, Git"></a>
<br>
WordPress або будь-який застосунок, який рушій може зібрати з репозиторію Git чи з теки з файлами.
</div>

## Де що знайти

Натисніть **Manage** біля проєкту, щоб відкрити його. Його вкладки: **Project Details**, **Monitoring**, **Backups**, **Plugins** і **Advanced**. **Plugins** є лише на сайті WordPress.

| Що ви хочете | У панелі |
|:---|:---|
| Підключити власний домен до сайту | **Advanced > Domains**, потім **Add Domain** |
| Зробити резервну копію або налаштувати їх за розкладом | Вкладка **Backups**. Сховище налаштовується один раз у **Settings > Backups** |
| Спробувати зміну до того, як вона з'явиться на робочому сайті | **Staging** у верхній панелі проєкту, потім **Push To Live** |
| Розгортати заново після кожного git push | **Advanced > Git**, потім **Auto-deploy on push** |
| Перенести сайт WordPress з іншого хостингу | Створіть проєкт, **WordPress**, потім **Import Existing WordPress Project** |
| Додати базу даних і користувача для неї | **Advanced > MySQL Databases** |
| Дати комусь доступ по SFTP | **Advanced > SFTP Accounts** |
| Запускати скрипт за розкладом | **Advanced > Cron Jobs** |
| Змінити версію PHP або `memory_limit` | **Advanced > Developer Settings** |
| Побачити, скільки людей відвідує сайт | Вкладка **Monitoring** |

## Усе, що потрібно сайту, у панелі

- **Домени та HTTPS.** Спрямуйте власний домен на сайт, додайте інші домени й перенаправлення та видайте кожному сертифікат Let's Encrypt. Якщо домену ще немає, скористайтеся безкоштовним піддоменом, коли ваш сервер його пропонує. [Domains and SSL](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/domains-and-ssl)
- **Резервні копії, які можна відновити.** Копіюйте вручну або щодня, щотижня чи щомісяця в S3, SFTP, FTP, FTPS або локальну теку. На сайті WordPress файли й базу даних можна відновлювати окремо. [Backups](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/backups)
- **Staging.** Зробіть копію сайту, випробуйте там свої зміни, а потім перенесіть на робочий сайт файли, повну базу даних або вибрані таблиці. Проєкт Git може розгортати гілку на staging і не чіпати production. [Staging and preview](https://www.panelalpha.com/documentation/single-server-edition/projects/staging-and-preview)
- **Git.** Дивіться, на скільки комітів сайт відстає, розгортайте заново, змінюйте гілку та стежте за журналом розгортання в реальному часі. Коли автоматичне розгортання увімкнено, push у GitHub, GitLab або Bitbucket розгортає сайт заново. [Git](https://www.panelalpha.com/documentation/single-server-edition/projects/git)
- **WordPress.** Входьте в консоль без пароля, оновлюйте WordPress і WooCommerce, встановлюйте плагіни й теми за назвою на wordpress.org, керуйте користувачами WordPress і вмикайте автоматичні оновлення. [Managing WordPress](https://www.panelalpha.com/documentation/single-server-edition/projects/wordpress)
- **Файли, FTP і SFTP.** Редагуйте, завантажуйте, архівуйте й розархівовуйте файли у файловому менеджері або дайте програмі на кшталт FileZilla обліковий запис FTP чи SFTP. [Files and access](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/files-and-access)
- **Бази даних.** Створюйте бази даних і користувачів MySQL, задавайте їхні привілеї та відкривайте phpMyAdmin просто з панелі. [Databases](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/databases)
- **Статистика та логи.** Відвідування за країною, джерелом переходу й пристроєм, трафік, CPU, RAM і диск усього сервера, а також логи PHP і веб-сервера кожного сайту. [Statistics and logs](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/statistics-and-logs)

## Підключіть свого ШІ-асистента

Асистента підключають з панелі, на сторінці **Connect AI** у верхньому меню.

1. Відкрийте **Connect AI** і виберіть свій інструмент у розділі **Your tool**.
2. У розділі **Generate an MCP token** натисніть **Create Token**, дайте токену назву, наприклад `Claude on my laptop`, і скопіюйте його. **Токен показується один раз.**
3. Наступний крок показує, що вставити в інструмент, з уже підставленою адресою вашої панелі. Натисніть **Copy**, вставте це в інструмент і замініть `YOUR_TOKEN` на свій токен.
4. Виконайте **Verify the connection** на тій самій сторінці. У Claude Code перезапустіть його або виконайте `/mcp`.

Потім напишіть у чаті, наприклад `List my projects.`

<div align="center">

<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/claude.png" width="46" alt="Claude Code"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/openai.png" width="46" alt="ChatGPT, Codex"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/cursor.png" width="46" alt="Cursor"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="../assets/windsurf.png" width="46" alt="Windsurf"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://skillicons.dev/icons?i=vscode" width="46" alt="VS Code"></a>

<sub><b>Claude Code&nbsp; · &nbsp;ChatGPT / Codex&nbsp; · &nbsp;Cursor&nbsp; · &nbsp;Windsurf&nbsp; · &nbsp;VS Code</b></sub>

</div>

Кожен із цих інструментів має в **Connect AI** власну сторінку, а **Other tool** охоплює все інше, що працює з MCP. Асистент має доступ до ваших робочих і staging-проєктів. Він не може змінювати налаштування всього сервера, змінювати ліміти проєкту, призупиняти проєкт або чіпати власний проєкт панелі. **MCP URL & tokens** показує ваші токени й дає змогу відкликати будь-який, а **Activity Log** показує кожен запит: [Connect AI](https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai).

## PanelAlpha Hub

PanelAlpha Hub це ваш обліковий запис PanelAlpha на [hub.panelalpha.com](https://hub.panelalpha.com). Підключити до нього панель можна безкоштовно, і це необов'язково. Панель працює самостійно в обох випадках.

Коли панель підключена:

- Ви входите в панель через **Sign in with PanelAlpha**, а ваш обліковий запис Hub може входити через GitHub або Google
- Один обліковий запис охоплює всі ваші сервери
- Ви можете встановлювати застосунки з каталогу PanelAlpha GO!
- Hub показує стан кожного сайту на цьому сервері

Підключитися можна в одному з двох місць. Під час першого входу виберіть **Connect with Hub** на кроці **Sign in** майстра налаштування замість локального облікового запису. У панелі, яку вже налаштовано, відкрийте **Settings** і натисніть **Connect to PanelAlpha**. В обох випадках ви входите на PanelAlpha і одразу повертаєтеся в панель.

Поки панель підключена, вона кожні п'ять хвилин надсилає до Hub: назву, тип і стан кожного проєкту, версію панелі та її адресу. **Вхід через PanelAlpha пропускає двофакторну перевірку панелі.** Вхід через Hub вважається цією перевіркою.

**Disconnect** у **Settings** видаляє сервер з вашого облікового запису й вимикає **Sign in with PanelAlpha**. Якщо PanelAlpha це ваш єдиний спосіб входу, спершу задайте пароль у **My Account**: [Settings](https://www.panelalpha.com/documentation/single-server-edition/the-panel/settings#panelalpha-hub).

## Як сайти ізольовані один від одного

Кожен сайт це окремий проєкт на рушії зі своїми файлами, базами даних, доменами та резервними копіями. Сайти з Git або з файлів працюють у власних контейнерах, тому один зламаний застосунок не зупиняє решту.

Панель теж проєкт. Коли її проєкт захищено, ані панель, ані жоден токен не може його видалити, зупинити чи розгорнути заново. Це може лише `pae` на сервері. Видалення панелі залишає всі сайти працювати.

Ваш власний вхід може мати двофакторну автентифікацію, а **Active Devices** дає змогу вийти з браузера, яким ви більше не користуєтеся: [Your account](https://www.panelalpha.com/documentation/single-server-edition/the-panel/your-account).

## Коли щось не працює

Більшість того, що робить панель, виконується у фоні: розгортання, резервні копії, staging-копії. **Tasks** у меню користувача показує кожну з них зі статусом і тривалістю та світиться крапкою, поки одна виконується. Невдале завдання показує перший рядок своєї помилки під назвою. Виберіть рядок, щоб прочитати повну помилку: [Tasks](https://www.panelalpha.com/documentation/single-server-edition/the-panel/tasks).

Для сайту з Git або з файлів **Show Logs** відкриває журнал розгортання, наживо або з попередніх розгортань. **Advanced > Logs** містить логи PHP і веб-сервера, а **Advanced > Containers** може запустити, зупинити чи перезапустити окремий сервіс. Кожна частина документації має сторінку Troubleshooting з повідомленням, яке ви бачите, що воно означає і що робити: [Troubleshooting](https://www.panelalpha.com/documentation/single-server-edition/troubleshooting/panel-and-account).

## FAQ

<details>
<summary><b>Чи потрібен мені PanelAlpha Engine?</b></summary>

Так. Панель це проєкт на рушії, і кожна операція хостингу йде через API рушія. Потрібен Engine 2.3.0 або новіший: [Requirements](https://www.panelalpha.com/documentation/single-server-edition/getting-started/requirements).
</details>

<details>
<summary><b>Чи може одна панель керувати кількома серверами?</b></summary>

Ні. Одна панель керує рушієм, на якому працює. Керування багатьма рушіями з однієї панелі це Multi Server, окремий продукт.
</details>

<details>
<summary><b>Що буде з моїми сайтами, якщо я видалю панель?</b></summary>

Вони продовжать працювати. Видалення панелі видаляє її власний проєкт і дані: облікові записи, налаштування, мітки проєктів і журнал активності. Кожен сайт це окремий проєкт на рушії: [Removing the panel](https://www.panelalpha.com/documentation/single-server-edition/getting-started/removing).
</details>

<details>
<summary><b>Чи робить панель резервні копії самої себе?</b></summary>

Ні. Резервні копії, які ви налаштовуєте в панелі, охоплюють ваші сайти. Резервну копію самої панелі робіть на сервері командою `pae project:backup:create`: [Where the panel keeps its data](https://www.panelalpha.com/documentation/single-server-edition/getting-started/removing#backing-up-the-panel).
</details>

<details>
<summary><b>Як оновити панель?</b></summary>

Розгорніть нову версію в проєкті панелі на сервері. Кнопки оновлення немає. Ваші облікові записи, налаштування та сесії залишаються, а базу даних панель оновлює під час запуску: [Updating the panel](https://www.panelalpha.com/documentation/single-server-edition/getting-started/updating).
</details>

<details>
<summary><b>Чи можна перенести панель на іншу адресу?</b></summary>

Так. Спрямуйте новий домен на сервер, потім збережіть його як **Application URL** у **Settings**. Панель додає домен, отримує сертифікат і переходить туди. Стара адреса перестає відповідати: [The panel address](https://www.panelalpha.com/documentation/single-server-edition/getting-started/panel-address).
</details>

<details>
<summary><b>Чи можу я перенести сайт WordPress з іншого хостингу?</b></summary>

Так. Створіть проєкт, виберіть **WordPress**, а потім **Import Existing WordPress Project**. Панель підключається з вашим логіном адміністратора WordPress або через плагін, який ви встановлюєте на старому сайті. Імпорт через FTP або SFTP недоступний: [Importing a WordPress site](https://www.panelalpha.com/documentation/single-server-edition/projects/importing-wordpress).
</details>

<details>
<summary><b>Чого панель поки не вміє?</b></summary>

Вона не може відкотити проєкт Git до попереднього коміту, бо розгортає останній коміт гілки. У ній немає налаштування, щоб поставити пароль на весь сайт. Плагіни й теми встановлюються за назвою на wordpress.org, а не за URL.
</details>

<details>
<summary><b>Чи це безкоштовно?</b></summary>

Single Server Community безкоштовна, має відкритий код за ліцензією Apache 2.0 і не має ліміту на проєкти. Ви платите за свій сервер.
</details>

## Поговоріть з нами в Discord

[Discord](https://discord.gg/9twHWR7xGX) це основне місце, де можна зв'язатися з командою PanelAlpha. Поставте запитання, розкажіть, що не працює, або покажіть, що ви хостите.

<br><div align="center">
<a href="https://discord.gg/9twHWR7xGX">
<img src="../assets/discord-banner.png" alt="Поговоріть з нами в Discord, основному місці зв'язку з командою PanelAlpha" width="760">
</a>
</div><br>

Якщо ви віддаєте перевагу форуму, скористайтеся [community.panelalpha.com](https://community.panelalpha.com/).

## Безпека

Повідомляйте про вразливість приватно, ніколи в публічному issue: [manage.panelalpha.com/contact](https://manage.panelalpha.com/contact).

## Ліцензія

PanelAlpha Single Server Edition має відкритий код за [Apache License 2.0](../../LICENSE).
