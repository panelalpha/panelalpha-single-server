<div align="center">

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/panelalpha.svg"><img src="../assets/panelalpha-light.svg" alt="PanelAlpha Single Server Edition" width="360"></picture></p>

<h1>Een hostingpaneel<br>voor je eigen server.</h1>

<h3>
Sites, domeinen, back-ups en staging in je browser. Het draait op PanelAlpha Engine.
</h3>

<h3>
<a href="#zet-het-paneel-aan-de-praat"><b>Beginnen</b></a> ·
<a href="https://www.panelalpha.com/documentation/single-server-edition"><b>Documentatie</b></a> ·
<a href="#praat-met-ons-op-discord"><b>Discord</b></a>
</h3>

<p>
<a href="#waar-je-wat-vindt">In het paneel</a> ·
<a href="#verbind-je-ai-assistent">Connect AI</a> ·
<a href="#panelalpha-hub">Hub</a> ·
<a href="#faq">FAQ</a>
</p>

<p>
<a href="../../README.md">English</a>
· <a href="README.pl.md">Polski</a>
· <a href="README.de.md">Deutsch</a>
· <b>Nederlands</b>
· <a href="README.es.md">Español</a>
· <a href="README.fr.md">Français</a>
· <a href="README.it.md">Italiano</a>
· <a href="README.pt-BR.md">Português</a>
· <a href="README.uk.md">Українська</a>
· <a href="README.ar.md">العربية</a>
· <a href="README.zh-CN.md">简体中文</a>
</p>

<p>
<a href="#stap-1-installeer-het-paneel-op-je-vps"><img src="https://img.shields.io/badge/PanelAlpha_Engine-2.3.0+-E65E12" alt="Vereist PanelAlpha Engine 2.3.0 of nieuwer"></a>
<a href="#stap-1-installeer-het-paneel-op-je-vps"><img src="https://img.shields.io/badge/Debian_12%2F13-Ubuntu_22.04%2F24.04%2F26.04-a80030" alt="Ondersteunde systemen"></a>
<a href="#licentie"><img src="https://img.shields.io/badge/license-Apache_2.0-0b7285" alt="Apache 2.0"></a>
<a href="https://discord.gg/9twHWR7xGX"><img src="https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white" alt="Word lid van Discord"></a>
</p>

</div>

---

## Wat is PanelAlpha Single Server Edition?

PanelAlpha Single Server Edition is een webhostingpaneel dat je op je eigen VPS installeert. Je opent het in een browser en beheert daar je sites: WordPress, apps uit Git, domeinen, back-ups en de rest. PanelAlpha Engine regelt daaronder de hosting, en het paneel geeft je er een scherm voor.

De Community-editie is voor één persoon en heeft geen projectlimiet. In het paneel kun je:

- Een WordPress-site maken, een app uit Git of uit bestanden uitrollen of een geteste app uit de catalogus van PanelAlpha GO! installeren
- Een WordPress-site van een andere host importeren
- Domeinen toevoegen, met certificaten van Let's Encrypt
- Back-ups met de hand of volgens een schema maken en terugzetten
- Een stagingkopie van een site bijhouden en live zetten
- Databases, cronjobs, FTP- en SFTP-accounts en PHP-instellingen beheren
- Bezoekersstatistieken, gebruik en logs bekijken
- Een AI-assistent koppelen en je projecten via chat beheren
- De server koppelen aan je PanelAlpha Hub-account en daarmee inloggen

## Hoe het werkt

<div align="center"><img src="../assets/panelalpha-tour.gif" alt="Rondleiding door het paneel: een project maken vanuit PanelAlpha GO!, de projectpagina, staging en Push To Live, en Connect AI" width="800"><br><a href="../assets/panelalpha-tour.mp4">Bekijk de hele rondleiding (2,5 min, MP4)</a></div>

Het paneel is één project op de Engine, in een eigen container. Als je een site maakt, vraagt het paneel de Engine-API dat te doen, en de Engine geeft die site een eigen project. Als je het paneel verwijdert, wordt alleen het project van het paneel gewist. Je sites blijven draaien.

## Waarom het paneel gebruiken

PanelAlpha Engine bedien je vanuit een AI-assistent of met het commando `pae` op de server. Het paneel zet hetzelfde werk op een scherm. Met een paar klikken voeg je een domein toe, zet je een back-up terug of zet je een stagingkopie live, en je ziet alle sites op de server in één lijst. Wil je dat een assistent helpt, dan koppel je hem aan het paneel en werkt hij aan dezelfde projecten.

## Zet het paneel aan de praat

### Stap 1: Installeer het paneel op je VPS

Je hebt een verse server nodig met Debian 12/13 of Ubuntu 22.04/24.04/26.04, 2 GB RAM, `root`-toegang via SSH en een domein dat ernaar wijst. **Poort 80 moet voor iedereen open staan**, omdat Let's Encrypt die gebruikt.

```bash
curl -fsSL get.panelalpha.com/single-server | sh
```

Alle opties en de Engine-versie die het paneel nodig heeft: [Het paneel installeren](https://www.panelalpha.com/documentation/single-server-edition/getting-started/install).

### Stap 2: Log in

Open `https://panel.example.com`. De installatiewizard maakt je account aan, of koppelt je PanelAlpha Hub-account, en opent het paneel: [Eerste keer inloggen](https://www.panelalpha.com/documentation/single-server-edition/getting-started/first-login).

### Stap 3: Maak je eerste site

Ga naar **My Projects**, kies **Create First Project** en kies **WordPress**, **Git**, **Files** of **PanelAlpha GO!**. Je kunt ook een `.zip`- of `.tar.gz`-archief direct op de projectlijst slepen: [Een project maken](https://www.panelalpha.com/documentation/single-server-edition/projects/create-a-project).

**PanelAlpha GO!** is een catalogus van open-sourceapps die PanelAlpha op PanelAlpha Engine heeft uitgerold en getest. Je kiest een app en het paneel installeert die, zonder dat je iets hoeft in te vullen. De catalogus verschijnt zodra het paneel is gekoppeld aan [PanelAlpha Hub](#panelalpha-hub).

<div align="center">
<a href="https://www.panelalpha.com/documentation/single-server-edition/projects/create-a-project"><img src="https://skillicons.dev/icons?i=wordpress,php,laravel,nodejs,nextjs,python,docker,git&perline=8" alt="WordPress, PHP, Laravel, Node.js, Next.js, Python, Docker, Git"></a>
<br>
WordPress, of elke app die de Engine kan bouwen uit een Git-repository of een map met bestanden.
</div>

## Waar je wat vindt

Kies **Manage** bij een project om het te openen. De tabbladen zijn **Project Details**, **Monitoring**, **Backups**, **Plugins** en **Advanced**. **Plugins** staat alleen bij een WordPress-site.

| Je wilt | In het paneel |
|:---|:---|
| Je eigen domein op een site zetten | **Advanced > Domains**, dan **Add Domain** |
| Een back-up maken, of volgens een schema | Tabblad **Backups**. Een opslag stel je één keer in via **Settings > Backups** |
| Een wijziging uitproberen voordat die live gaat | **Staging** in de bovenbalk van het project, dan **Push To Live** |
| Bij elke git push opnieuw uitrollen | **Advanced > Git**, dan **Auto-deploy on push** |
| Een WordPress-site van een andere host verhuizen | Maak een project, **WordPress**, dan **Import Existing WordPress Project** |
| Een database en een gebruiker ervoor toevoegen | **Advanced > MySQL Databases** |
| Iemand SFTP-toegang geven | **Advanced > SFTP Accounts** |
| Een script volgens een schema draaien | **Advanced > Cron Jobs** |
| De PHP-versie of `memory_limit` wijzigen | **Advanced > Developer Settings** |
| Zien hoeveel mensen de site bezoeken | Tabblad **Monitoring** |

## Alles wat een site nodig heeft, in het paneel

- **Domeinen en HTTPS.** Laat je eigen domein naar een site wijzen, voeg meer domeinen en doorverwijzingen toe en geef elk een Let's Encrypt-certificaat. Heb je nog geen domein, gebruik dan een gratis subdomein als je server er een biedt. [Domeinen en SSL](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/domains-and-ssl)
- **Back-ups die je kunt terugzetten.** Maak back-ups met de hand of dagelijks, wekelijks of maandelijks, naar S3, SFTP, FTP, FTPS of een lokale map. Bij een WordPress-site kun je de bestanden en de database apart terugzetten. [Back-ups](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/backups)
- **Staging.** Maak een kopie van een site, probeer daar je wijzigingen uit en zet dan de bestanden, de hele database of geselecteerde tabellen naar de live site. Een Git-project kan een branch naar staging uitrollen en productie met rust laten. [Staging en voorbeeld](https://www.panelalpha.com/documentation/single-server-edition/projects/staging-and-preview)
- **Git.** Zie hoeveel commits de site achterloopt, rol opnieuw uit, wissel van branch en volg het deploylog terwijl het loopt. Met auto-deploy aan rolt een push naar GitHub, GitLab of Bitbucket de site opnieuw uit. [Git](https://www.panelalpha.com/documentation/single-server-edition/projects/git)
- **WordPress.** Log zonder wachtwoord in op het dashboard, werk WordPress en WooCommerce bij, installeer plugins en thema's op hun wordpress.org-naam, beheer WordPress-gebruikers en zet automatische updates aan. [WordPress beheren](https://www.panelalpha.com/documentation/single-server-edition/projects/wordpress)
- **Bestanden, FTP en SFTP.** Bewerk, upload, zip en unzip bestanden in de bestandsbeheerder, of geef een programma zoals FileZilla een FTP- of SFTP-account. [Bestanden en toegang](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/files-and-access)
- **Databases.** Maak MySQL-databases en gebruikers, stel hun rechten in en open phpMyAdmin vanuit het paneel. [Databases](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/databases)
- **Statistieken en logs.** Bezoeken per land, verwijzer en apparaat, bandbreedte, de CPU, het RAM en de schijf van de hele server, en de PHP- en webserverlogs van elke site. [Statistieken en logs](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/statistics-and-logs)

## Verbind je AI-assistent

Je koppelt je assistent vanuit het paneel, op de pagina **Connect AI** in het bovenmenu.

1. Open **Connect AI** en kies je tool onder **Your tool**.
2. Kies onder **Generate an MCP token** **Create Token**, geef het een naam zoals `Claude on my laptop` en kopieer het. **Het token wordt maar één keer getoond.**
3. De volgende stap toont wat je in je tool moet zetten, met je paneeladres al ingevuld. Kies **Copy**, plak het in je tool en vervang `YOUR_TOKEN` door je token.
4. Volg **Verify the connection** op dezelfde pagina. Start Claude Code opnieuw of voer `/mcp` uit.

Vraag dan in de chat, bijvoorbeeld `List my projects.`

<div align="center">

<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/claude.png" width="46" alt="Claude Code"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/openai.png" width="46" alt="ChatGPT, Codex"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/cursor.png" width="46" alt="Cursor"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="../assets/windsurf.png" width="46" alt="Windsurf"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://skillicons.dev/icons?i=vscode" width="46" alt="VS Code"></a>

<sub><b>Claude Code&nbsp; · &nbsp;ChatGPT / Codex&nbsp; · &nbsp;Cursor&nbsp; · &nbsp;Windsurf&nbsp; · &nbsp;VS Code</b></sub>

</div>

Elk van deze tools heeft een eigen pagina in **Connect AI**, en **Other tool** dekt alles wat verder MCP spreekt. De assistent kan bij je live en staging projecten. Hij kan geen instellingen voor de hele server wijzigen, geen projectlimieten wijzigen, geen project opschorten en het eigen project van het paneel niet aanraken. **MCP URL & tokens** toont je tokens en laat je er een intrekken, en **Activity Log** toont elk verzoek: [Connect AI](https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai).

## PanelAlpha Hub

PanelAlpha Hub is je PanelAlpha-account op [hub.panelalpha.com](https://hub.panelalpha.com). Het paneel daaraan koppelen is gratis en optioneel. Het paneel blijft in beide gevallen ook zelfstandig werken.

Met het paneel gekoppeld:

- Je logt in op het paneel met **Sign in with PanelAlpha**, en je Hub-account kan inloggen met GitHub of Google
- Eén account dekt al je servers
- Je kunt apps installeren uit de catalogus van PanelAlpha GO!
- De Hub toont de status van elke site op deze server

Je koppelt op een van twee plekken. Kies bij de eerste login **Connect with Hub** in de stap **Sign in** van de installatiewizard, in plaats van een lokaal account. Open bij een paneel dat al is ingesteld **Settings** en kies **Connect to PanelAlpha**. In beide gevallen log je in bij PanelAlpha en kom je meteen terug in het paneel.

Zolang het paneel gekoppeld is, meldt het elke vijf minuten aan de Hub: de naam, het type en de status van elk project, de versie van het paneel en het adres. **Inloggen via PanelAlpha slaat de tweestapscontrole van het paneel over.** De Hub-login telt als die controle.

**Disconnect** in **Settings** haalt de server uit je account en zet **Sign in with PanelAlpha** uit. Als PanelAlpha je enige manier is om binnen te komen, stel dan eerst een wachtwoord in via **My Account**: [Instellingen](https://www.panelalpha.com/documentation/single-server-edition/the-panel/settings#panelalpha-hub).

## Hoe je sites gescheiden blijven

Elke site is een eigen project op de Engine, met eigen bestanden, databases, domeinen en back-ups. Sites uit Git of uit bestanden draaien in eigen containers, zodat één kapotte app de andere niet meeneemt.

Het paneel is ook een project. Zodra het project beschermd is, kunnen noch het paneel noch een token het verwijderen, stoppen of opnieuw uitrollen. Alleen `pae` op de server kan dat. Als je het paneel verwijdert, blijven alle sites draaien.

Je eigen login kan tweestapsverificatie hebben, en met **Active Devices** log je een browser uit die je niet meer gebruikt: [Je account](https://www.panelalpha.com/documentation/single-server-edition/the-panel/your-account).

## Als iets niet werkt

Het meeste van wat het paneel doet, loopt op de achtergrond: deploys, back-ups, stagingkopieën. **Tasks** in het gebruikersmenu somt elk op met zijn status en hoe lang het duurde, en toont een stipje zolang er een loopt. Een mislukte taak toont onder zijn naam de eerste regel van de fout. Selecteer de rij om de volledige fout te lezen: [Taken](https://www.panelalpha.com/documentation/single-server-edition/the-panel/tasks).

Bij een Git- of bestandssite opent **Show Logs** het deploylog, live of van eerdere deploys. **Advanced > Logs** heeft de PHP- en webserverlogs, en met **Advanced > Containers** kun je één service starten, stoppen of herstarten. Elk onderdeel van de documentatie heeft een Troubleshooting-pagina met de melding die je ziet, wat die betekent en wat je kunt doen: [Probleemoplossing](https://www.panelalpha.com/documentation/single-server-edition/troubleshooting/panel-and-account).

## FAQ

<details>
<summary><b>Heb ik PanelAlpha Engine nodig?</b></summary>

Ja. Het paneel is een project op de Engine, en elke hostingactie loopt via de Engine-API. Het heeft Engine 2.3.0 of nieuwer nodig: [Vereisten](https://www.panelalpha.com/documentation/single-server-edition/getting-started/requirements).
</details>

<details>
<summary><b>Kan één paneel meerdere servers beheren?</b></summary>

Nee. Eén paneel beheert de Engine waarop het draait. Veel Engines vanuit één paneel beheren is Multi Server, een apart product.
</details>

<details>
<summary><b>Wat gebeurt er met mijn sites als ik het paneel verwijder?</b></summary>

Ze blijven draaien. Als je het paneel verwijdert, worden het eigen project en de gegevens ervan gewist: accounts, instellingen, projectlabels en het activiteitenlog. Elke site is een apart project op de Engine: [Het paneel verwijderen](https://www.panelalpha.com/documentation/single-server-edition/getting-started/removing).
</details>

<details>
<summary><b>Maakt het paneel een back-up van zichzelf?</b></summary>

Nee. De back-ups die je in het paneel instelt, gelden voor je sites. Maak een back-up van het paneel op de server met `pae project:backup:create`: [Waar het paneel zijn gegevens bewaart](https://www.panelalpha.com/documentation/single-server-edition/getting-started/removing#backing-up-the-panel).
</details>

<details>
<summary><b>Hoe werk ik het paneel bij?</b></summary>

Rol de nieuwe versie uit in het project van het paneel op de server. Er is geen updateknop. Je accounts, instellingen en sessies blijven bewaard, en het paneel werkt zijn database bij als het start: [Het paneel bijwerken](https://www.panelalpha.com/documentation/single-server-edition/getting-started/updating).
</details>

<details>
<summary><b>Kan ik het paneel naar een ander adres verhuizen?</b></summary>

Ja. Laat het nieuwe domein naar de server wijzen en sla het dan op als **Application URL** in **Settings**. Het paneel voegt het domein toe, haalt een certificaat op en verhuist daarheen. Het oude adres antwoordt niet meer: [Het paneeladres](https://www.panelalpha.com/documentation/single-server-edition/getting-started/panel-address).
</details>

<details>
<summary><b>Kan ik mijn WordPress-site van een andere host meenemen?</b></summary>

Ja. Maak een project, kies **WordPress** en dan **Import Existing WordPress Project**. Het paneel verbindt met je WordPress-beheerderslogin of via een plugin die je op de oude site installeert. Importeren via FTP of SFTP is niet beschikbaar: [Een WordPress-site importeren](https://www.panelalpha.com/documentation/single-server-edition/projects/importing-wordpress).
</details>

<details>
<summary><b>Wat kan het paneel nog niet?</b></summary>

Het kan een Git-project niet terugzetten naar een eerdere commit, omdat het de nieuwste commit van een branch uitrolt. Het heeft geen instelling om een hele site met een wachtwoord af te schermen. Plugins en thema's installeer je op hun wordpress.org-naam, niet vanaf een URL.
</details>

<details>
<summary><b>Is het gratis?</b></summary>

Single Server Community is gratis, open source onder de Apache 2.0-licentie en heeft geen projectlimiet. Je betaalt voor je server.
</details>

## Praat met ons op Discord

[Discord](https://discord.gg/9twHWR7xGX) is de belangrijkste plek om het PanelAlpha-team te bereiken. Stel een vraag, vertel ons wat niet werkt of laat zien wat je host.

<br><div align="center">
<a href="https://discord.gg/9twHWR7xGX">
<img src="../assets/discord-banner.png" alt="Praat met ons op Discord, de belangrijkste plek om het PanelAlpha-team te bereiken" width="760">
</a>
</div><br>

Heb je liever een forum, gebruik dan [community.panelalpha.com](https://community.panelalpha.com/).

## Beveiliging

Meld een kwetsbaarheid privé, nooit in een openbare issue: [manage.panelalpha.com/contact](https://manage.panelalpha.com/contact).

## Licentie

PanelAlpha Single Server Edition is open source onder de [Apache License 2.0](../../LICENSE).
