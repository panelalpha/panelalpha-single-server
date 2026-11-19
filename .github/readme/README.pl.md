<div align="center">

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/panelalpha.svg"><img src="../assets/panelalpha-light.svg" alt="PanelAlpha Single Server Edition" width="360"></picture></p>

<h1>Panel hostingowy<br>dla Twojego własnego serwera.</h1>

<h3>
Strony, domeny, kopie zapasowe i staging w przeglądarce. Działa na PanelAlpha Engine.
</h3>

<h3>
<a href="#uruchom-panel"><b>Zacznij</b></a> ·
<a href="https://www.panelalpha.com/documentation/single-server-edition"><b>Dokumentacja</b></a> ·
<a href="#porozmawiaj-z-nami-na-discordzie"><b>Discord</b></a>
</h3>

<p>
<a href="#gdzie-co-znaleźć">W panelu</a> ·
<a href="#połącz-swojego-asystenta-ai">Connect AI</a> ·
<a href="#panelalpha-hub">Hub</a> ·
<a href="#faq">FAQ</a>
</p>

<p>
<a href="../../README.md">English</a>
· <b>Polski</b>
· <a href="README.de.md">Deutsch</a>
· <a href="README.nl.md">Nederlands</a>
· <a href="README.es.md">Español</a>
· <a href="README.fr.md">Français</a>
· <a href="README.it.md">Italiano</a>
· <a href="README.pt-BR.md">Português</a>
· <a href="README.uk.md">Українська</a>
· <a href="README.ar.md">العربية</a>
· <a href="README.zh-CN.md">简体中文</a>
</p>

<p>
<a href="#krok-1-zainstaluj-panel-na-swoim-vps"><img src="https://img.shields.io/badge/PanelAlpha_Engine-2.3.0+-E65E12" alt="Wymaga PanelAlpha Engine 2.3.0 lub nowszego"></a>
<a href="#krok-1-zainstaluj-panel-na-swoim-vps"><img src="https://img.shields.io/badge/Debian_12%2F13-Ubuntu_22.04%2F24.04%2F26.04-a80030" alt="Wspierane systemy"></a>
<a href="#licencja"><img src="https://img.shields.io/badge/license-Apache_2.0-0b7285" alt="Apache 2.0"></a>
<a href="https://discord.gg/9twHWR7xGX"><img src="https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white" alt="Dołącz do Discorda"></a>
</p>

</div>

---

## Czym jest PanelAlpha Single Server Edition?

PanelAlpha Single Server Edition to webowy panel hostingowy, który instalujesz na własnym VPS. Otwierasz go w przeglądarce i tam zajmujesz się swoimi stronami: WordPressem, aplikacjami z Gita, domenami, kopiami zapasowymi i resztą. Hosting obsługuje pod spodem PanelAlpha Engine, a panel daje Ci do niego ekran.

Wersja Community jest dla jednej osoby i nie ma limitu projektów. W panelu możesz:

- Utworzyć stronę WordPress, wdrożyć aplikację z Gita lub z plików albo zainstalować sprawdzoną aplikację z katalogu PanelAlpha GO!
- Zaimportować stronę WordPress z innego hostingu
- Dodawać domeny z certyfikatami od Let's Encrypt
- Wykonywać kopie zapasowe ręcznie lub według harmonogramu i je przywracać
- Trzymać kopię stagingową strony i wypychać ją na produkcję
- Zarządzać bazami danych, zadaniami cron, kontami FTP i SFTP oraz ustawieniami PHP
- Przeglądać statystyki odwiedzin, zużycie zasobów i logi
- Połączyć asystenta AI i zarządzać projektami przez czat
- Połączyć serwer z kontem PanelAlpha Hub i logować się przez nie

## Jak to działa

<div align="center"><img src="../assets/panelalpha-tour.gif" alt="Przegląd panelu: tworzenie projektu z PanelAlpha GO!, strona projektu, staging i Push To Live oraz Connect AI" width="800"><br><a href="../assets/panelalpha-tour.mp4">Obejrzyj cały przegląd (2,5 min, MP4)</a></div>

Panel to jeden projekt w Engine, w osobnym kontenerze. Gdy tworzysz stronę, panel prosi o to API Engine, a Engine tworzy dla tej strony własny projekt. Usunięcie panelu kasuje tylko projekt panelu. Twoje strony działają dalej.

## Dlaczego warto używać panelu

PanelAlpha Engine obsługujesz z asystenta AI albo poleceniem `pae` na serwerze. Panel pokazuje tę samą pracę na ekranie. Kilkoma kliknięciami dodasz domenę, przywrócisz kopię zapasową albo wypchniesz kopię stagingową na produkcję, a wszystkie strony na serwerze zobaczysz na jednej liście. Gdy chcesz, żeby pomógł asystent, łączysz go z panelem i pracuje na tych samych projektach.

## Uruchom panel

### Krok 1: Zainstaluj panel na swoim VPS

Potrzebujesz świeżego serwera z Debianem 12/13 lub Ubuntu 22.04/24.04/26.04, z 2 GB RAM, dostępu `root` przez SSH i domeny skierowanej na serwer. **Port 80 musi być otwarty dla wszystkich**, bo korzysta z niego Let's Encrypt.

```bash
curl -fsSL get.panelalpha.com/single-server | sh
```

Wszystkie opcje i wersja Engine wymagana przez panel: [Instalacja panelu](https://www.panelalpha.com/documentation/single-server-edition/getting-started/install).

### Krok 2: Zaloguj się

Otwórz `https://panel.example.com`. Kreator konfiguracji tworzy Twoje konto albo łączy Twoje konto PanelAlpha Hub, a potem otwiera panel: [Pierwsze logowanie](https://www.panelalpha.com/documentation/single-server-edition/getting-started/first-login).

### Krok 3: Utwórz pierwszą stronę

Przejdź do **My Projects**, wybierz **Create First Project** i wskaż **WordPress**, **Git**, **Files** lub **PanelAlpha GO!**. Możesz też upuścić archiwum `.zip` lub `.tar.gz` prosto na listę projektów: [Tworzenie projektu](https://www.panelalpha.com/documentation/single-server-edition/projects/create-a-project).

**PanelAlpha GO!** to katalog aplikacji open source, które PanelAlpha wdrożył i przetestował na PanelAlpha Engine. Wybierasz aplikację, a panel ją instaluje. Nie trzeba niczego więcej wypełniać. Katalog pojawia się, gdy panel jest połączony z [PanelAlpha Hub](#panelalpha-hub).

<div align="center">
<a href="https://www.panelalpha.com/documentation/single-server-edition/projects/create-a-project"><img src="https://skillicons.dev/icons?i=wordpress,php,laravel,nodejs,nextjs,python,docker,git&perline=8" alt="WordPress, PHP, Laravel, Node.js, Next.js, Python, Docker, Git"></a>
<br>
WordPress albo dowolna aplikacja, którą Engine zbuduje z repozytorium Git lub z folderu z plikami.
</div>

## Gdzie co znaleźć

Wybierz **Manage** przy projekcie, aby go otworzyć. Ma karty **Project Details**, **Monitoring**, **Backups**, **Plugins** i **Advanced**. **Plugins** pojawia się tylko przy stronie WordPress.

| Chcesz | W panelu |
|:---|:---|
| Podpiąć własną domenę do strony | **Advanced > Domains**, potem **Add Domain** |
| Zrobić kopię zapasową lub ustawić harmonogram | Karta **Backups**. Magazyn skonfigurujesz raz w **Settings > Backups** |
| Wypróbować zmianę, zanim trafi na produkcję | **Staging** na górnym pasku projektu, potem **Push To Live** |
| Wdrażać ponownie przy każdym git push | **Advanced > Git**, potem **Auto-deploy on push** |
| Przenieść stronę WordPress z innego hostingu | Utwórz projekt, **WordPress**, potem **Import Existing WordPress Project** |
| Dodać bazę danych i użytkownika do niej | **Advanced > MySQL Databases** |
| Dać komuś dostęp SFTP | **Advanced > SFTP Accounts** |
| Uruchamiać skrypt według harmonogramu | **Advanced > Cron Jobs** |
| Zmienić wersję PHP lub `memory_limit` | **Advanced > Developer Settings** |
| Zobaczyć, ilu ludzi odwiedza stronę | Karta **Monitoring** |

## Wszystko, czego potrzebuje strona, w panelu

- **Domeny i HTTPS.** Skieruj własną domenę na stronę, dodaj kolejne domeny i przekierowania i daj każdej certyfikat Let's Encrypt. Gdy nie masz jeszcze domeny, użyj darmowej subdomeny, jeśli Twój serwer ją oferuje. [Domeny i SSL](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/domains-and-ssl)
- **Kopie zapasowe, które można przywrócić.** Rób kopie ręcznie albo codziennie, co tydzień lub co miesiąc, do S3, SFTP, FTP, FTPS lub lokalnego folderu. Na stronie WordPress możesz osobno przywrócić pliki i bazę danych. [Kopie zapasowe](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/backups)
- **Staging.** Zrób kopię strony, wypróbuj tam zmiany, a potem wypchnij pliki, całą bazę danych albo wybrane tabele na stronę produkcyjną. Projekt Git może wdrożyć gałąź na staging i nie ruszać produkcji. [Staging i podgląd](https://www.panelalpha.com/documentation/single-server-edition/projects/staging-and-preview)
- **Git.** Zobacz, o ile commitów strona jest w tyle, wdróż ją ponownie, zmień gałąź i śledź log wdrożenia na żywo. Przy włączonym auto-deploy push do GitHub, GitLab lub Bitbucket wdraża stronę ponownie. [Git](https://www.panelalpha.com/documentation/single-server-edition/projects/git)
- **WordPress.** Zaloguj się do kokpitu bez hasła, aktualizuj WordPress i WooCommerce, instaluj wtyczki i motywy po nazwie z wordpress.org, zarządzaj użytkownikami WordPress i włącz automatyczne aktualizacje. [Zarządzanie WordPress](https://www.panelalpha.com/documentation/single-server-edition/projects/wordpress)
- **Pliki, FTP i SFTP.** Edytuj, wgrywaj, pakuj i rozpakowuj pliki w menedżerze plików albo daj programowi takiemu jak FileZilla konto FTP lub SFTP. [Pliki i dostęp](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/files-and-access)
- **Bazy danych.** Twórz bazy MySQL i użytkowników, ustawiaj ich uprawnienia i otwieraj phpMyAdmin z panelu. [Bazy danych](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/databases)
- **Statystyki i logi.** Odwiedziny według kraju, źródła i urządzenia, transfer, CPU, RAM i dysk całego serwera oraz logi PHP i serwera WWW każdej strony. [Statystyki i logi](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/statistics-and-logs)

## Połącz swojego asystenta AI

Asystenta łączysz z poziomu panelu, na stronie **Connect AI** w górnym menu.

1. Otwórz **Connect AI** i wybierz swoje narzędzie w **Your tool**.
2. W **Generate an MCP token** wybierz **Create Token**, nadaj mu nazwę, na przykład `Claude on my laptop`, i skopiuj go. **Token jest pokazywany tylko raz.**
3. Następny krok pokazuje, co wpisać w swoim narzędziu, z już uzupełnionym adresem panelu. Wybierz **Copy**, wklej to w narzędziu i zamień `YOUR_TOKEN` na swój token.
4. Wykonaj **Verify the connection** na tej samej stronie. W Claude Code uruchom go ponownie albo użyj `/mcp`.

Potem zapytaj na czacie, na przykład `List my projects.`

<div align="center">

<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/claude.png" width="46" alt="Claude Code"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/openai.png" width="46" alt="ChatGPT, Codex"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/cursor.png" width="46" alt="Cursor"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="../assets/windsurf.png" width="46" alt="Windsurf"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://skillicons.dev/icons?i=vscode" width="46" alt="VS Code"></a>

<sub><b>Claude Code&nbsp; · &nbsp;ChatGPT / Codex&nbsp; · &nbsp;Cursor&nbsp; · &nbsp;Windsurf&nbsp; · &nbsp;VS Code</b></sub>

</div>

Każde z tych narzędzi ma własną stronę w **Connect AI**, a **Other tool** obejmuje wszystko inne, co obsługuje MCP. Asystent ma dostęp do Twoich projektów produkcyjnych i stagingowych. Nie może zmieniać ustawień całego serwera, zmieniać limitów projektu, zawieszać projektu ani ruszać projektu samego panelu. **MCP URL & tokens** pokazuje Twoje tokeny i pozwala unieważnić jeden z nich, a **Activity Log** pokazuje każde żądanie: [Connect AI](https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai).

## PanelAlpha Hub

PanelAlpha Hub to Twoje konto PanelAlpha pod adresem [hub.panelalpha.com](https://hub.panelalpha.com). Połączenie panelu z nim jest darmowe i opcjonalne. Panel działa samodzielnie w obu przypadkach.

Gdy panel jest połączony:

- Logujesz się do panelu przez **Sign in with PanelAlpha**, a konto Hub może logować się przez GitHub lub Google
- Jedno konto obejmuje wszystkie Twoje serwery
- Możesz instalować aplikacje z katalogu PanelAlpha GO!
- Hub pokazuje stan każdej strony na tym serwerze

Połączyć możesz w jednym z dwóch miejsc. Podczas pierwszego logowania wybierz **Connect with Hub** w kroku **Sign in** kreatora konfiguracji zamiast konta lokalnego. W panelu, który jest już skonfigurowany, otwórz **Settings** i wybierz **Connect to PanelAlpha**. W obu przypadkach logujesz się w PanelAlpha i od razu wracasz do panelu.

Dopóki panel jest połączony, co pięć minut przesyła do Hub: nazwę, typ i stan każdego projektu, wersję panelu i jego adres. **Logowanie przez PanelAlpha pomija dwuskładnikową weryfikację panelu.** Logowanie przez Hub liczy się jako ta weryfikacja.

**Disconnect** w **Settings** usuwa serwer z Twojego konta i wyłącza **Sign in with PanelAlpha**. Jeśli PanelAlpha to Twój jedyny sposób logowania, najpierw ustaw hasło w **My Account**: [Ustawienia](https://www.panelalpha.com/documentation/single-server-edition/the-panel/settings#panelalpha-hub).

## Jak oddzielone są Twoje strony

Każda strona to osobny projekt w Engine, z własnymi plikami, bazami danych, domenami i kopiami zapasowymi. Strony z Gita lub z plików działają we własnych kontenerach, więc jedna zepsuta aplikacja nie kładzie pozostałych.

Panel też jest projektem. Gdy jego projekt jest chroniony, ani panel, ani żaden token nie może go usunąć, zatrzymać ani wdrożyć ponownie. Może to zrobić tylko `pae` na serwerze. Usunięcie panelu zostawia wszystkie strony uruchomione.

Twoje logowanie może mieć uwierzytelnianie dwuskładnikowe, a **Active Devices** pozwala wylogować przeglądarkę, której już nie używasz: [Twoje konto](https://www.panelalpha.com/documentation/single-server-edition/the-panel/your-account).

## Gdy coś nie działa

Większość tego, co robi panel, dzieje się w tle: wdrożenia, kopie zapasowe, kopie stagingowe. **Tasks** w menu użytkownika wylicza każde z nich ze statusem i czasem trwania oraz pokazuje kropkę, gdy któreś trwa. Nieudane zadanie pokazuje pod nazwą pierwszą linię swojego błędu. Wybierz wiersz, aby przeczytać cały błąd: [Zadania](https://www.panelalpha.com/documentation/single-server-edition/the-panel/tasks).

Dla strony z Gita lub z plików **Show Logs** otwiera log wdrożenia, na żywo lub z wcześniejszych wdrożeń. **Advanced > Logs** zawiera logi PHP i serwera WWW, a **Advanced > Containers** może uruchomić, zatrzymać lub zrestartować pojedynczą usługę. Każda część dokumentacji ma stronę Troubleshooting z komunikatem, który widzisz, co oznacza i co zrobić: [Rozwiązywanie problemów](https://www.panelalpha.com/documentation/single-server-edition/troubleshooting/panel-and-account).

## FAQ

<details>
<summary><b>Czy potrzebuję PanelAlpha Engine?</b></summary>

Tak. Panel to projekt w Engine, a każda operacja hostingowa idzie przez API Engine. Wymaga Engine 2.3.0 lub nowszego: [Wymagania](https://www.panelalpha.com/documentation/single-server-edition/getting-started/requirements).
</details>

<details>
<summary><b>Czy jeden panel może zarządzać kilkoma serwerami?</b></summary>

Nie. Jeden panel zarządza Engine, na którym działa. Zarządzanie wieloma Engine z jednego panelu to Multi Server, osobny produkt.
</details>

<details>
<summary><b>Co się stanie z moimi stronami, jeśli usunę panel?</b></summary>

Działają dalej. Usunięcie panelu kasuje jego własny projekt i jego dane: konta, ustawienia, etykiety projektów i log aktywności. Każda strona to osobny projekt w Engine: [Usuwanie panelu](https://www.panelalpha.com/documentation/single-server-edition/getting-started/removing).
</details>

<details>
<summary><b>Czy panel robi kopię zapasową samego siebie?</b></summary>

Nie. Kopie zapasowe ustawione w panelu obejmują Twoje strony. Kopię panelu zrobisz na serwerze poleceniem `pae project:backup:create`: [Gdzie panel trzyma swoje dane](https://www.panelalpha.com/documentation/single-server-edition/getting-started/removing#backing-up-the-panel).
</details>

<details>
<summary><b>Jak zaktualizować panel?</b></summary>

Wdróż nową wersję do projektu panelu na serwerze. Nie ma przycisku aktualizacji. Twoje konta, ustawienia i sesje zostają, a panel aktualizuje swoją bazę danych przy starcie: [Aktualizacja panelu](https://www.panelalpha.com/documentation/single-server-edition/getting-started/updating).
</details>

<details>
<summary><b>Czy mogę przenieść panel pod inny adres?</b></summary>

Tak. Skieruj nową domenę na serwer, a potem zapisz ją jako **Application URL** w **Settings**. Panel dodaje domenę, pobiera certyfikat i przenosi się tam. Stary adres przestaje odpowiadać: [Adres panelu](https://www.panelalpha.com/documentation/single-server-edition/getting-started/panel-address).
</details>

<details>
<summary><b>Czy mogę przenieść swoją stronę WordPress z innego hostingu?</b></summary>

Tak. Utwórz projekt, wybierz **WordPress**, a potem **Import Existing WordPress Project**. Panel łączy się przez login administratora WordPress albo przez wtyczkę, którą instalujesz na starej stronie. Import przez FTP lub SFTP nie jest dostępny: [Import strony WordPress](https://www.panelalpha.com/documentation/single-server-edition/projects/importing-wordpress).
</details>

<details>
<summary><b>Czego panel jeszcze nie potrafi?</b></summary>

Nie cofnie projektu Git do wcześniejszego commita, bo wdraża najnowszy commit gałęzi. Nie ma ustawienia, które zabezpiecza całą stronę hasłem. Wtyczki i motywy instalują się po nazwie z wordpress.org, nie z adresu URL.
</details>

<details>
<summary><b>Czy to jest darmowe?</b></summary>

Single Server Community jest darmowy, open source na licencji Apache 2.0 i nie ma limitu projektów. Płacisz za swój serwer.
</details>

## Porozmawiaj z nami na Discordzie

[Discord](https://discord.gg/9twHWR7xGX) to główne miejsce kontaktu z zespołem PanelAlpha. Zadaj pytanie, napisz nam, co nie działa, albo pokaż, co hostujesz.

<br><div align="center">
<a href="https://discord.gg/9twHWR7xGX">
<img src="../assets/discord-banner.png" alt="Porozmawiaj z nami na Discordzie, głównym miejscu kontaktu z zespołem PanelAlpha" width="760">
</a>
</div><br>

Jeśli wolisz forum, użyj [community.panelalpha.com](https://community.panelalpha.com/).

## Bezpieczeństwo

Lukę w zabezpieczeniach zgłoś prywatnie, nigdy w publicznym zgłoszeniu: [manage.panelalpha.com/contact](https://manage.panelalpha.com/contact).

## Licencja

PanelAlpha Single Server Edition jest open source na licencji [Apache License 2.0](../../LICENSE).
