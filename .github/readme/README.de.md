<div align="center">

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/panelalpha.svg"><img src="../assets/panelalpha-light.svg" alt="PanelAlpha Single Server Edition" width="360"></picture></p>

<h1>Ein Hosting-Panel<br>für deinen eigenen Server.</h1>

<h3>
Websites, Domains, Backups und Staging im Browser. Es läuft auf PanelAlpha Engine.
</h3>

<h3>
<a href="#das-panel-zum-laufen-bringen"><b>Loslegen</b></a> ·
<a href="https://www.panelalpha.com/documentation/single-server-edition"><b>Dokumentation</b></a> ·
<a href="#sprich-mit-uns-auf-discord"><b>Discord</b></a>
</h3>

<p>
<a href="#wo-du-was-findest">Im Panel</a> ·
<a href="#verbinde-deinen-ki-assistenten">Connect AI</a> ·
<a href="#panelalpha-hub">Hub</a> ·
<a href="#faq">FAQ</a>
</p>

<p>
<a href="../../README.md">English</a>
· <a href="README.pl.md">Polski</a>
· <b>Deutsch</b>
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
<a href="#schritt-1-panel-auf-deinem-vps-installieren"><img src="https://img.shields.io/badge/PanelAlpha_Engine-2.3.0+-E65E12" alt="Benötigt PanelAlpha Engine 2.3.0 oder neuer"></a>
<a href="#schritt-1-panel-auf-deinem-vps-installieren"><img src="https://img.shields.io/badge/Debian_12%2F13-Ubuntu_22.04%2F24.04%2F26.04-a80030" alt="Unterstützte Systeme"></a>
<a href="#lizenz"><img src="https://img.shields.io/badge/license-Apache_2.0-0b7285" alt="Apache 2.0"></a>
<a href="https://discord.gg/9twHWR7xGX"><img src="https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white" alt="Discord beitreten"></a>
</p>

</div>

---

## Was ist PanelAlpha Single Server Edition?

PanelAlpha Single Server Edition ist ein Web-Hosting-Panel, das du auf deinem eigenen VPS installierst. Du öffnest es im Browser und kümmerst dich dort um deine Websites: WordPress, Apps aus Git, Domains, Backups und alles andere. PanelAlpha Engine übernimmt darunter das Hosting, und das Panel gibt dir dafür eine Oberfläche.

Die Community-Edition ist für eine Person und hat kein Projektlimit. Im Panel kannst du:

- Eine WordPress-Website erstellen, eine App aus Git oder aus Dateien bereitstellen oder eine getestete App aus dem Katalog PanelAlpha GO! installieren
- Eine WordPress-Website von einem anderen Hoster importieren
- Domains hinzufügen, mit Zertifikaten von Let's Encrypt
- Backups von Hand oder nach Zeitplan erstellen und wiederherstellen
- Eine Staging-Kopie einer Website pflegen und live schalten
- Datenbanken, Cron-Jobs, FTP- und SFTP-Konten und PHP-Einstellungen verwalten
- Besucherstatistiken, Auslastung und Logs ansehen
- Einen KI-Assistenten verbinden und deine Projekte per Chat verwalten
- Den Server mit deinem PanelAlpha-Hub-Konto verbinden und dich damit anmelden

## So funktioniert es

<div align="center"><img src="../assets/panelalpha-tour.gif" alt="Rundgang durch das Panel: ein Projekt aus PanelAlpha GO! anlegen, die Projektseite, Staging und Push To Live sowie Connect AI" width="800"><br><a href="../assets/panelalpha-tour.mp4">Den ganzen Rundgang ansehen (2,5 Min., MP4)</a></div>

Das Panel ist ein Projekt auf der Engine, in einem eigenen Container. Wenn du eine Website erstellst, bittet das Panel die Engine-API darum, und die Engine legt für diese Website ein eigenes Projekt an. Wenn du das Panel entfernst, wird nur das Projekt des Panels gelöscht. Deine Websites laufen weiter.

## Warum das Panel nutzen

PanelAlpha Engine steuerst du mit einem KI-Assistenten oder mit dem Befehl `pae` auf dem Server. Das Panel zeigt dieselbe Arbeit auf einem Bildschirm. Mit ein paar Klicks fügst du eine Domain hinzu, stellst ein Backup wieder her oder schaltest eine Staging-Kopie live, und alle Websites auf dem Server siehst du in einer Liste. Wenn dir ein Assistent helfen soll, verbindest du ihn mit dem Panel, und er arbeitet an denselben Projekten.

## Das Panel zum Laufen bringen

### Schritt 1: Panel auf deinem VPS installieren

Du brauchst einen frischen Server mit Debian 12/13 oder Ubuntu 22.04/24.04/26.04, 2 GB RAM, `root`-Zugang über SSH und einer Domain, die auf ihn zeigt. **Port 80 muss für alle offen sein**, weil Let's Encrypt ihn nutzt.

```bash
curl -fsSL get.panelalpha.com/single-server | sh
```

Alle Optionen und die Engine-Version, die das Panel braucht: [Das Panel installieren](https://www.panelalpha.com/documentation/single-server-edition/getting-started/install).

### Schritt 2: Anmelden

Öffne `https://panel.example.com`. Der Einrichtungsassistent legt dein Konto an oder verbindet dein PanelAlpha-Hub-Konto und öffnet dann das Panel: [Erste Anmeldung](https://www.panelalpha.com/documentation/single-server-edition/getting-started/first-login).

### Schritt 3: Deine erste Website erstellen

Gehe zu **My Projects**, wähle **Create First Project** und dann **WordPress**, **Git**, **Files** oder **PanelAlpha GO!**. Du kannst auch ein `.zip`- oder `.tar.gz`-Archiv direkt auf die Projektliste ziehen: [Ein Projekt erstellen](https://www.panelalpha.com/documentation/single-server-edition/projects/create-a-project).

**PanelAlpha GO!** ist ein Katalog von Open-Source-Apps, die PanelAlpha auf PanelAlpha Engine bereitgestellt und getestet hat. Du wählst eine App, und das Panel installiert sie, ohne dass du etwas ausfüllen musst. Der Katalog erscheint, sobald das Panel mit [PanelAlpha Hub](#panelalpha-hub) verbunden ist.

<div align="center">
<a href="https://www.panelalpha.com/documentation/single-server-edition/projects/create-a-project"><img src="https://skillicons.dev/icons?i=wordpress,php,laravel,nodejs,nextjs,python,docker,git&perline=8" alt="WordPress, PHP, Laravel, Node.js, Next.js, Python, Docker, Git"></a>
<br>
WordPress oder jede App, die die Engine aus einem Git-Repository oder einem Ordner mit Dateien bauen kann.
</div>

## Wo du was findest

Wähle bei einem Projekt **Manage**, um es zu öffnen. Es hat die Tabs **Project Details**, **Monitoring**, **Backups**, **Plugins** und **Advanced**. **Plugins** erscheint nur bei einer WordPress-Website.

| Du willst | Im Panel |
|:---|:---|
| Eine eigene Domain auf eine Website legen | **Advanced > Domains**, dann **Add Domain** |
| Ein Backup erstellen oder nach Zeitplan sichern | Tab **Backups**. Einen Speicher richtest du einmal in **Settings > Backups** ein |
| Eine Änderung ausprobieren, bevor sie live geht | **Staging** in der oberen Leiste des Projekts, dann **Push To Live** |
| Bei jedem git push neu bereitstellen | **Advanced > Git**, dann **Auto-deploy on push** |
| Eine WordPress-Website von einem anderen Hoster umziehen | Projekt erstellen, **WordPress**, dann **Import Existing WordPress Project** |
| Eine Datenbank und einen Benutzer dafür anlegen | **Advanced > MySQL Databases** |
| Jemandem SFTP-Zugang geben | **Advanced > SFTP Accounts** |
| Ein Skript nach Zeitplan ausführen | **Advanced > Cron Jobs** |
| Die PHP-Version oder `memory_limit` ändern | **Advanced > Developer Settings** |
| Sehen, wie viele Leute die Website besuchen | Tab **Monitoring** |

## Alles, was eine Website braucht, im Panel

- **Domains und HTTPS.** Richte deine eigene Domain auf eine Website aus, füge weitere Domains und Weiterleitungen hinzu und gib jeder ein Let's Encrypt-Zertifikat. Ohne eigene Domain nutzt du eine kostenlose Subdomain, wenn dein Server eine anbietet. [Domains und SSL](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/domains-and-ssl)
- **Backups, die sich wiederherstellen lassen.** Sichere von Hand oder täglich, wöchentlich oder monatlich auf S3, SFTP, FTP, FTPS oder einen lokalen Ordner. Bei einer WordPress-Website kannst du die Dateien und die Datenbank getrennt wiederherstellen. [Backups](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/backups)
- **Staging.** Mache eine Kopie einer Website, probiere dort deine Änderungen aus und übertrage dann die Dateien, die ganze Datenbank oder ausgewählte Tabellen auf die Live-Website. Ein Git-Projekt kann einen Branch auf Staging bereitstellen und die Produktion in Ruhe lassen. [Staging und Vorschau](https://www.panelalpha.com/documentation/single-server-edition/projects/staging-and-preview)
- **Git.** Sieh, wie viele Commits die Website zurückliegt, stelle neu bereit, wechsle den Branch und verfolge das Deploy-Log live. Bei aktivem Auto-Deploy stellt ein Push zu GitHub, GitLab oder Bitbucket die Website neu bereit. [Git](https://www.panelalpha.com/documentation/single-server-edition/projects/git)
- **WordPress.** Melde dich ohne Passwort im Dashboard an, aktualisiere WordPress und WooCommerce, installiere Plugins und Themes über ihren wordpress.org-Namen, verwalte WordPress-Benutzer und schalte automatische Updates ein. [WordPress verwalten](https://www.panelalpha.com/documentation/single-server-edition/projects/wordpress)
- **Dateien, FTP und SFTP.** Bearbeite, lade hoch, packe und entpacke Dateien im Dateimanager, oder gib einem Programm wie FileZilla ein FTP- oder SFTP-Konto. [Dateien und Zugriff](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/files-and-access)
- **Datenbanken.** Lege MySQL-Datenbanken und Benutzer an, setze ihre Rechte und öffne phpMyAdmin aus dem Panel. [Datenbanken](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/databases)
- **Statistiken und Logs.** Besuche nach Land, Referrer und Gerät, Bandbreite, CPU, RAM und Festplatte des ganzen Servers sowie die PHP- und Webserver-Logs jeder Website. [Statistiken und Logs](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/statistics-and-logs)

## Verbinde deinen KI-Assistenten

Du verbindest deinen Assistenten im Panel, auf der Seite **Connect AI** im oberen Menü.

1. Öffne **Connect AI** und wähle dein Tool unter **Your tool**.
2. Wähle unter **Generate an MCP token** die Option **Create Token**, gib dem Token einen Namen wie `Claude on my laptop` und kopiere es. **Das Token wird nur einmal angezeigt.**
3. Der nächste Schritt zeigt, was du in dein Tool eintragen musst, mit deiner Panel-Adresse bereits eingesetzt. Wähle **Copy**, füge es in dein Tool ein und ersetze `YOUR_TOKEN` durch dein Token.
4. Folge auf derselben Seite **Verify the connection**. In Claude Code startest du es neu oder führst `/mcp` aus.

Frage dann im Chat, zum Beispiel `List my projects.`

<div align="center">

<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/claude.png" width="46" alt="Claude Code"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/openai.png" width="46" alt="ChatGPT, Codex"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/cursor.png" width="46" alt="Cursor"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="../assets/windsurf.png" width="46" alt="Windsurf"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://skillicons.dev/icons?i=vscode" width="46" alt="VS Code"></a>

<sub><b>Claude Code&nbsp; · &nbsp;ChatGPT / Codex&nbsp; · &nbsp;Cursor&nbsp; · &nbsp;Windsurf&nbsp; · &nbsp;VS Code</b></sub>

</div>

Jedes dieser Tools hat in **Connect AI** eine eigene Seite, und **Other tool** deckt alles andere ab, was MCP spricht. Der Assistent erreicht deine Live- und Staging-Projekte. Er kann keine serverweiten Einstellungen ändern, keine Projektlimits ändern, kein Projekt sperren und das Projekt des Panels selbst nicht anfassen. **MCP URL & tokens** listet deine Tokens auf und lässt dich eines widerrufen, und **Activity Log** zeigt jede Anfrage: [Connect AI](https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai).

## PanelAlpha Hub

PanelAlpha Hub ist dein PanelAlpha-Konto unter [hub.panelalpha.com](https://hub.panelalpha.com). Das Panel damit zu verbinden ist kostenlos und optional. Das Panel läuft in beiden Fällen auch allein weiter.

Mit verbundenem Panel:

- Du meldest dich mit **Sign in with PanelAlpha** im Panel an, und dein Hub-Konto kann sich mit GitHub oder Google anmelden
- Ein Konto deckt alle deine Server ab
- Du kannst Apps aus dem Katalog PanelAlpha GO! installieren
- Der Hub zeigt den Status jeder Website auf diesem Server

Du verbindest an einer von zwei Stellen. Wähle beim ersten Login im Schritt **Sign in** des Einrichtungsassistenten **Connect with Hub** statt eines lokalen Kontos. Öffne bei einem bereits eingerichteten Panel **Settings** und wähle **Connect to PanelAlpha**. In beiden Fällen meldest du dich bei PanelAlpha an und kommst direkt zum Panel zurück.

Solange das Panel verbunden ist, meldet es dem Hub alle fünf Minuten: Name, Typ und Status jedes Projekts, die Version des Panels und seine Adresse. **Die Anmeldung über PanelAlpha überspringt die Zwei-Faktor-Prüfung des Panels.** Die Anmeldung über den Hub zählt als diese Prüfung.

**Disconnect** in **Settings** entfernt den Server aus deinem Konto und schaltet **Sign in with PanelAlpha** ab. Wenn PanelAlpha dein einziger Zugang ist, lege zuerst in **My Account** ein Passwort fest: [Einstellungen](https://www.panelalpha.com/documentation/single-server-edition/the-panel/settings#panelalpha-hub).

## So sind deine Websites voneinander getrennt

Jede Website ist ein eigenes Projekt auf der Engine, mit eigenen Dateien, Datenbanken, Domains und Backups. Websites aus Git oder aus Dateien laufen in eigenen Containern, sodass eine defekte App die anderen nicht mitreißt.

Das Panel ist ebenfalls ein Projekt. Sobald sein Projekt geschützt ist, können weder das Panel noch ein Token es löschen, stoppen oder neu bereitstellen. Das kann nur `pae` auf dem Server. Wenn du das Panel entfernst, laufen alle Websites weiter.

Deine eigene Anmeldung kann Zwei-Faktor-Authentifizierung haben, und mit **Active Devices** meldest du einen Browser ab, den du nicht mehr nutzt: [Dein Konto](https://www.panelalpha.com/documentation/single-server-edition/the-panel/your-account).

## Wenn etwas nicht funktioniert

Das meiste, was das Panel tut, läuft im Hintergrund: Deploys, Backups, Staging-Kopien. **Tasks** im Benutzermenü listet jeden Vorgang mit Status und Dauer auf und zeigt einen Punkt, solange einer läuft. Eine fehlgeschlagene Aufgabe zeigt unter ihrem Namen die erste Zeile ihres Fehlers. Wähle die Zeile aus, um den vollständigen Fehler zu lesen: [Aufgaben](https://www.panelalpha.com/documentation/single-server-edition/the-panel/tasks).

Bei einer Git- oder Datei-Website öffnet **Show Logs** das Deploy-Log, live oder von früheren Deploys. **Advanced > Logs** enthält die PHP- und Webserver-Logs, und mit **Advanced > Containers** kannst du einen einzelnen Dienst starten, stoppen oder neu starten. Jeder Teil der Dokumentation hat eine Troubleshooting-Seite mit der Meldung, die du siehst, was sie bedeutet und was zu tun ist: [Fehlerbehebung](https://www.panelalpha.com/documentation/single-server-edition/troubleshooting/panel-and-account).

## FAQ

<details>
<summary><b>Brauche ich PanelAlpha Engine?</b></summary>

Ja. Das Panel ist ein Projekt auf der Engine, und jede Hosting-Aktion läuft über die Engine-API. Es braucht Engine 2.3.0 oder neuer: [Anforderungen](https://www.panelalpha.com/documentation/single-server-edition/getting-started/requirements).
</details>

<details>
<summary><b>Kann ein Panel mehrere Server verwalten?</b></summary>

Nein. Ein Panel verwaltet die Engine, auf der es läuft. Viele Engines von einem Panel aus zu verwalten ist Multi Server, ein eigenes Produkt.
</details>

<details>
<summary><b>Was passiert mit meinen Websites, wenn ich das Panel entferne?</b></summary>

Sie laufen weiter. Wenn du das Panel entfernst, werden sein eigenes Projekt und seine Daten gelöscht: Konten, Einstellungen, Projektbezeichnungen und das Aktivitätslog. Jede Website ist ein eigenes Projekt auf der Engine: [Das Panel entfernen](https://www.panelalpha.com/documentation/single-server-edition/getting-started/removing).
</details>

<details>
<summary><b>Sichert sich das Panel selbst?</b></summary>

Nein. Die Backups, die du im Panel einrichtest, gelten für deine Websites. Sichere das Panel auf dem Server mit `pae project:backup:create`: [Wo das Panel seine Daten ablegt](https://www.panelalpha.com/documentation/single-server-edition/getting-started/removing#backing-up-the-panel).
</details>

<details>
<summary><b>Wie aktualisiere ich das Panel?</b></summary>

Stelle die neue Version im Projekt des Panels auf dem Server bereit. Es gibt keine Update-Schaltfläche. Deine Konten, Einstellungen und Sitzungen bleiben erhalten, und das Panel aktualisiert seine Datenbank beim Start: [Das Panel aktualisieren](https://www.panelalpha.com/documentation/single-server-edition/getting-started/updating).
</details>

<details>
<summary><b>Kann ich das Panel auf eine andere Adresse umziehen?</b></summary>

Ja. Richte die neue Domain auf den Server aus und speichere sie dann als **Application URL** in **Settings**. Das Panel fügt die Domain hinzu, holt ein Zertifikat und zieht dorthin um. Die alte Adresse antwortet nicht mehr: [Die Panel-Adresse](https://www.panelalpha.com/documentation/single-server-edition/getting-started/panel-address).
</details>

<details>
<summary><b>Kann ich meine WordPress-Website von einem anderen Hoster mitbringen?</b></summary>

Ja. Erstelle ein Projekt, wähle **WordPress** und dann **Import Existing WordPress Project**. Das Panel verbindet sich mit deinem WordPress-Admin-Login oder über ein Plugin, das du auf der alten Website installierst. Der Import über FTP oder SFTP ist nicht möglich: [Eine WordPress-Website importieren](https://www.panelalpha.com/documentation/single-server-edition/projects/importing-wordpress).
</details>

<details>
<summary><b>Was kann das Panel noch nicht?</b></summary>

Es kann ein Git-Projekt nicht auf einen früheren Commit zurücksetzen, weil es den neuesten Commit eines Branches bereitstellt. Es hat keine Einstellung, um eine ganze Website mit einem Passwort zu schützen. Plugins und Themes werden über ihren wordpress.org-Namen installiert, nicht über eine URL.
</details>

<details>
<summary><b>Ist es kostenlos?</b></summary>

Single Server Community ist kostenlos, Open Source unter der Apache-2.0-Lizenz und hat kein Projektlimit. Du bezahlst deinen Server.
</details>

## Sprich mit uns auf Discord

[Discord](https://discord.gg/9twHWR7xGX) ist der wichtigste Ort, um das PanelAlpha-Team zu erreichen. Stelle eine Frage, sag uns, was nicht funktioniert, oder zeig uns, was du hostest.

<br><div align="center">
<a href="https://discord.gg/9twHWR7xGX">
<img src="../assets/discord-banner.png" alt="Sprich mit uns auf Discord, dem wichtigsten Ort, um das PanelAlpha-Team zu erreichen" width="760">
</a>
</div><br>

Wenn du ein Forum bevorzugst, nutze [community.panelalpha.com](https://community.panelalpha.com/).

## Sicherheit

Melde eine Sicherheitslücke privat, nie in einem öffentlichen Issue: [manage.panelalpha.com/contact](https://manage.panelalpha.com/contact).

## Lizenz

PanelAlpha Single Server Edition ist Open Source unter der [Apache License 2.0](../../LICENSE).
