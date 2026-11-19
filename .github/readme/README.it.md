<div align="center">

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/panelalpha.svg"><img src="../assets/panelalpha-light.svg" alt="PanelAlpha Single Server Edition" width="360"></picture></p>

<h1>Un pannello di hosting<br>per il tuo server.</h1>

<h3>
Siti, domini, backup e staging nel tuo browser. Funziona su PanelAlpha Engine.
</h3>

<h3>
<a href="#metti-in-funzione-il-pannello"><b>Inizia</b></a> ·
<a href="https://www.panelalpha.com/documentation/single-server-edition"><b>Documentazione</b></a> ·
<a href="#parla-con-noi-su-discord"><b>Discord</b></a>
</h3>

<p>
<a href="#dove-trovare-le-cose">Nel pannello</a> ·
<a href="#collega-il-tuo-assistente-ai">Connect AI</a> ·
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
· <b>Italiano</b>
· <a href="README.pt-BR.md">Português</a>
· <a href="README.uk.md">Українська</a>
· <a href="README.ar.md">العربية</a>
· <a href="README.zh-CN.md">简体中文</a>
</p>

<p>
<a href="#passo-1-installa-il-pannello-sul-tuo-vps"><img src="https://img.shields.io/badge/PanelAlpha_Engine-2.3.0+-E65E12" alt="Richiede PanelAlpha Engine 2.3.0 o successivo"></a>
<a href="#passo-1-installa-il-pannello-sul-tuo-vps"><img src="https://img.shields.io/badge/Debian_12%2F13-Ubuntu_22.04%2F24.04%2F26.04-a80030" alt="Sistemi supportati"></a>
<a href="#licenza"><img src="https://img.shields.io/badge/license-Apache_2.0-0b7285" alt="Apache 2.0"></a>
<a href="https://discord.gg/9twHWR7xGX"><img src="https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white" alt="Unisciti a Discord"></a>
</p>

</div>

---

## Cos'è PanelAlpha Single Server Edition?

PanelAlpha Single Server Edition è un pannello di web hosting che installi sul tuo VPS. Lo apri in un browser e da lì ti occupi dei tuoi siti: WordPress, app da Git, domini, backup e il resto. PanelAlpha Engine si occupa dell'hosting sotto, e il pannello ti dà una schermata per gestirlo.

L'edizione Community è per una persona e non ha limiti di progetti. Nel pannello puoi:

- Creare un sito WordPress, fare il deploy di un'app da Git o da file, o installare un'app testata dal catalogo PanelAlpha GO!
- Importare un sito WordPress da un altro host
- Aggiungere domini, con certificati di Let's Encrypt
- Fare backup a mano o pianificati, e ripristinarli
- Tenere una copia di staging di un sito e pubblicarla in produzione
- Gestire database, cron job, account FTP e SFTP e impostazioni PHP
- Vedere statistiche dei visitatori, utilizzo e log
- Collegare un assistente AI e gestire i tuoi progetti in chat
- Collegare il server al tuo account PanelAlpha Hub e accedere con quello

## Come funziona

<div align="center"><img src="../assets/panelalpha-tour.gif" alt="Tour del pannello: creare un progetto da PanelAlpha GO!, la pagina del progetto, staging e Push To Live, e Connect AI" width="800"><br><a href="../assets/panelalpha-tour.mp4">Guarda il tour completo (2,5 min, MP4)</a></div>

Il pannello è un progetto dell'engine, nel suo container. Quando crei un sito, il pannello chiede all'API dell'engine di farlo, e l'engine dà a quel sito un progetto tutto suo. Rimuovere il pannello elimina solo il progetto del pannello. I tuoi siti continuano a funzionare.

## Perché usare il pannello

PanelAlpha Engine si gestisce da un assistente AI o con il comando `pae` sul server. Il pannello mette lo stesso lavoro su una schermata. Puoi aggiungere un dominio, ripristinare un backup o pubblicare una copia di staging con pochi clic, e vedere tutti i siti del server in un solo elenco. Quando vuoi l'aiuto di un assistente, lo colleghi al pannello e lavora sugli stessi progetti.

## Metti in funzione il pannello

### Passo 1: Installa il pannello sul tuo VPS

Ti serve un server nuovo con Debian 12/13 o Ubuntu 22.04/24.04/26.04, con 2 GB di RAM, accesso `root` via SSH e un dominio che punti ad esso. **La porta 80 deve essere aperta a tutti**, perché Let's Encrypt la usa.

```bash
curl -fsSL get.panelalpha.com/single-server | sh
```

Tutte le opzioni e la versione di Engine che serve al pannello: [Installing the panel](https://www.panelalpha.com/documentation/single-server-edition/getting-started/install).

### Passo 2: Accedi

Apri `https://panel.example.com`. La procedura guidata di configurazione crea il tuo account, oppure collega il tuo account PanelAlpha Hub, e apre il pannello: [First login](https://www.panelalpha.com/documentation/single-server-edition/getting-started/first-login).

### Passo 3: Crea il tuo primo sito

Vai su **My Projects**, seleziona **Create First Project** e scegli **WordPress**, **Git**, **Files** o **PanelAlpha GO!**. Puoi anche trascinare un archivio `.zip` o `.tar.gz` direttamente sull'elenco dei progetti: [Create a project](https://www.panelalpha.com/documentation/single-server-edition/projects/create-a-project).

**PanelAlpha GO!** è un catalogo di app open source che PanelAlpha ha distribuito e testato su PanelAlpha Engine. Scegli un'app e il pannello la installa, senza altro da compilare. Il catalogo compare quando il pannello è collegato a [PanelAlpha Hub](#panelalpha-hub).

<div align="center">
<a href="https://www.panelalpha.com/documentation/single-server-edition/projects/create-a-project"><img src="https://skillicons.dev/icons?i=wordpress,php,laravel,nodejs,nextjs,python,docker,git&perline=8" alt="WordPress, PHP, Laravel, Node.js, Next.js, Python, Docker, Git"></a>
<br>
WordPress, o qualsiasi app che l'engine può costruire da un repository Git o da una cartella di file.
</div>

## Dove trovare le cose

Seleziona **Manage** su un progetto per aprirlo. Le sue schede sono **Project Details**, **Monitoring**, **Backups**, **Plugins** e **Advanced**. **Plugins** compare solo su un sito WordPress.

| Vuoi | Nel pannello |
|:---|:---|
| Mettere il tuo dominio su un sito | **Advanced > Domains**, poi **Add Domain** |
| Fare un backup, o fare backup pianificati | Scheda **Backups**. Imposta un archivio una volta in **Settings > Backups** |
| Provare una modifica prima della pubblicazione | **Staging** nella barra superiore del progetto, poi **Push To Live** |
| Rifare il deploy a ogni git push | **Advanced > Git**, poi **Auto-deploy on push** |
| Spostare un sito WordPress da un altro host | Crea un progetto, **WordPress**, poi **Import Existing WordPress Project** |
| Aggiungere un database e un utente per esso | **Advanced > MySQL Databases** |
| Dare a qualcuno l'accesso SFTP | **Advanced > SFTP Accounts** |
| Eseguire uno script in modo pianificato | **Advanced > Cron Jobs** |
| Cambiare la versione di PHP o `memory_limit` | **Advanced > Developer Settings** |
| Vedere quante persone visitano il sito | Scheda **Monitoring** |

## Tutto ciò di cui un sito ha bisogno, nel pannello

- **Domini e HTTPS.** Punta il tuo dominio a un sito, aggiungi altri domini e reindirizzamenti, e dai a ciascuno un certificato di Let's Encrypt. Se non hai ancora un dominio, usa un sottodominio gratuito quando il tuo server lo offre. [Domains and SSL](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/domains-and-ssl)
- **Backup che puoi ripristinare.** Fai backup a mano o ogni giorno, settimana o mese, su S3, SFTP, FTP, FTPS o una cartella locale. Su un sito WordPress puoi ripristinare i file e il database separatamente. [Backups](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/backups)
- **Staging.** Fai una copia di un sito, prova lì le tue modifiche, poi pubblica sul sito live i file, il database completo o alcune tabelle scelte. Un progetto Git può fare il deploy di un branch in staging e lasciare in pace la produzione. [Staging and preview](https://www.panelalpha.com/documentation/single-server-edition/projects/staging-and-preview)
- **Git.** Vedi di quanti commit il sito è indietro, rifai il deploy, cambia branch e segui il log del deploy mentre gira. Con l'auto-deploy attivo, un push su GitHub, GitLab o Bitbucket rifà il deploy del sito. [Git](https://www.panelalpha.com/documentation/single-server-edition/projects/git)
- **WordPress.** Entra nella dashboard senza password, aggiorna WordPress e WooCommerce, installa plugin e temi con il loro nome su wordpress.org, gestisci gli utenti WordPress e attiva gli aggiornamenti automatici. [Managing WordPress](https://www.panelalpha.com/documentation/single-server-edition/projects/wordpress)
- **File, FTP e SFTP.** Modifica, carica, comprimi e decomprimi file nel gestore file, oppure dai a un programma come FileZilla un account FTP o SFTP. [Files and access](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/files-and-access)
- **Database.** Crea database e utenti MySQL, imposta i loro privilegi e apri phpMyAdmin dal pannello. [Databases](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/databases)
- **Statistiche e log.** Visite per paese, provenienza e dispositivo, banda, CPU, RAM e disco dell'intero server, e i log di PHP e del web server di ogni sito. [Statistics and logs](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/statistics-and-logs)

## Collega il tuo assistente AI

Colleghi il tuo assistente dal pannello, nella pagina **Connect AI** del menu in alto.

1. Apri **Connect AI** e scegli il tuo strumento sotto **Your tool**.
2. Sotto **Generate an MCP token**, seleziona **Create Token**, dagli un nome come `Claude on my laptop` e copialo. **Il token viene mostrato una sola volta.**
3. Il passo successivo mostra cosa inserire nel tuo strumento, con l'indirizzo del tuo pannello già compilato. Seleziona **Copy**, incollalo nel tuo strumento e sostituisci `YOUR_TOKEN` con il tuo token.
4. Segui **Verify the connection** nella stessa pagina. In Claude Code, riavvialo o esegui `/mcp`.

Poi chiedi in chat, per esempio `List my projects.`

<div align="center">

<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/claude.png" width="46" alt="Claude Code"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/openai.png" width="46" alt="ChatGPT, Codex"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/cursor.png" width="46" alt="Cursor"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="../assets/windsurf.png" width="46" alt="Windsurf"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://skillicons.dev/icons?i=vscode" width="46" alt="VS Code"></a>

<sub><b>Claude Code&nbsp; · &nbsp;ChatGPT / Codex&nbsp; · &nbsp;Cursor&nbsp; · &nbsp;Windsurf&nbsp; · &nbsp;VS Code</b></sub>

</div>

Ognuno di questi strumenti ha la sua pagina in **Connect AI**, e **Other tool** copre qualsiasi altro che parli MCP. L'assistente può raggiungere i tuoi progetti live e di staging. Non può cambiare le impostazioni di tutto il server, cambiare i limiti di un progetto, sospendere un progetto né toccare il progetto del pannello stesso. **MCP URL & tokens** elenca i tuoi token e ti permette di revocarne uno, e **Activity Log** mostra ogni richiesta: [Connect AI](https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai).

## PanelAlpha Hub

PanelAlpha Hub è il tuo account PanelAlpha su [hub.panelalpha.com](https://hub.panelalpha.com). Collegarvi il pannello è gratuito e facoltativo. Il pannello continua a funzionare da solo in entrambi i casi.

Con il pannello collegato:

- Accedi al pannello con **Sign in with PanelAlpha**, e il tuo account Hub può accedere con GitHub o Google
- Un solo account copre tutti i tuoi server
- Puoi installare app dal catalogo PanelAlpha GO!
- L'Hub mostra lo stato di ogni sito di questo server

Puoi collegarti in due punti. Durante il primo accesso, scegli **Connect with Hub** nel passo **Sign in** della procedura guidata, al posto di un account locale. Su un pannello già configurato, apri **Settings** e seleziona **Connect to PanelAlpha**. In entrambi i casi accedi su PanelAlpha e torni subito al pannello.

Finché è collegato, il pannello riferisce all'Hub ogni cinque minuti: il nome, il tipo e lo stato di ogni progetto, la versione del pannello e il suo indirizzo. **Accedere tramite PanelAlpha salta la verifica in due passaggi del pannello.** L'accesso all'Hub vale come quella verifica.

**Disconnect** in **Settings** rimuove il server dal tuo account e disattiva **Sign in with PanelAlpha**. Se PanelAlpha è il tuo unico modo di entrare, imposta prima una password in **My Account**: [Settings](https://www.panelalpha.com/documentation/single-server-edition/the-panel/settings#panelalpha-hub).

## Come restano separati i tuoi siti

Ogni sito è un progetto a sé sull'engine, con i suoi file, database, domini e backup. I siti creati da Git o da file girano nei loro container, quindi un'app rotta non butta giù le altre.

Anche il pannello è un progetto. Una volta protetto il suo progetto, né il pannello né alcun token possono eliminarlo, fermarlo o rifare il deploy. Può farlo solo `pae` sul server. Rimuovere il pannello lascia in funzione tutti i siti.

Il tuo accesso personale può avere la verifica in due passaggi, e **Active Devices** ti permette di disconnettere un browser che non usi più: [Your account](https://www.panelalpha.com/documentation/single-server-edition/the-panel/your-account).

## Quando qualcosa non funziona

La maggior parte di ciò che fa il pannello gira in background: deploy, backup, copie di staging. **Tasks** nel menu utente le elenca tutte con il loro stato e il tempo impiegato, e mostra un punto mentre una è in corso. Un'attività fallita mostra la prima riga del suo errore sotto il nome. Seleziona la riga per leggere l'errore completo: [Tasks](https://www.panelalpha.com/documentation/single-server-edition/the-panel/tasks).

Per un sito Git o da file, **Show Logs** apre il log del deploy, in diretta o dei deploy precedenti. **Advanced > Logs** contiene i log di PHP e del web server, e **Advanced > Containers** può avviare, fermare o riavviare un singolo servizio. Ogni parte della documentazione ha una pagina Troubleshooting con il messaggio che vedi, cosa significa e cosa fare: [Troubleshooting](https://www.panelalpha.com/documentation/single-server-edition/troubleshooting/panel-and-account).

## FAQ

<details>
<summary><b>Mi serve PanelAlpha Engine?</b></summary>

Sì. Il pannello è un progetto dell'engine, e ogni operazione di hosting passa dall'API dell'engine. Serve Engine 2.3.0 o successivo: [Requirements](https://www.panelalpha.com/documentation/single-server-edition/getting-started/requirements).
</details>

<details>
<summary><b>Un pannello può gestire più server?</b></summary>

No. Un pannello gestisce l'engine su cui gira. Gestire molti engine da un solo pannello è Multi Server, un prodotto separato.
</details>

<details>
<summary><b>Cosa succede ai miei siti se rimuovo il pannello?</b></summary>

Continuano a funzionare. Rimuovere il pannello elimina il suo progetto e i suoi dati: account, impostazioni, etichette dei progetti e registro attività. Ogni sito è un progetto separato sull'engine: [Removing the panel](https://www.panelalpha.com/documentation/single-server-edition/getting-started/removing).
</details>

<details>
<summary><b>Il pannello fa il backup di se stesso?</b></summary>

No. I backup che imposti nel pannello coprono i tuoi siti. Fai il backup del pannello sul server con `pae project:backup:create`: [Where the panel keeps its data](https://www.panelalpha.com/documentation/single-server-edition/getting-started/removing#backing-up-the-panel).
</details>

<details>
<summary><b>Come aggiorno il pannello?</b></summary>

Fai il deploy della nuova versione nel progetto del pannello sul server. Non c'è un pulsante di aggiornamento. Account, impostazioni e sessioni restano, e il pannello aggiorna il suo database all'avvio: [Updating the panel](https://www.panelalpha.com/documentation/single-server-edition/getting-started/updating).
</details>

<details>
<summary><b>Posso spostare il pannello su un altro indirizzo?</b></summary>

Sì. Punta il nuovo dominio al server, poi salvalo come **Application URL** in **Settings**. Il pannello aggiunge il dominio, ottiene un certificato e si sposta lì. Il vecchio indirizzo smette di rispondere: [The panel address](https://www.panelalpha.com/documentation/single-server-edition/getting-started/panel-address).
</details>

<details>
<summary><b>Posso portare il mio sito WordPress da un altro host?</b></summary>

Sì. Crea un progetto, scegli **WordPress** e poi **Import Existing WordPress Project**. Il pannello si collega con il tuo login di amministratore WordPress o tramite un plugin che installi sul vecchio sito. L'importazione via FTP o SFTP non è disponibile: [Importing a WordPress site](https://www.panelalpha.com/documentation/single-server-edition/projects/importing-wordpress).
</details>

<details>
<summary><b>Cosa non sa ancora fare il pannello?</b></summary>

Non può riportare un progetto Git a un commit precedente, perché fa il deploy dell'ultimo commit di un branch. Non ha un'impostazione per mettere una password davanti a un intero sito. Plugin e temi si installano con il loro nome su wordpress.org, non da un URL.
</details>

<details>
<summary><b>È gratuito?</b></summary>

Single Server Community è gratuito, open source con licenza Apache 2.0 e senza limiti di progetti. Paghi il tuo server.
</details>

## Parla con noi su Discord

[Discord](https://discord.gg/9twHWR7xGX) è il posto principale per raggiungere il team PanelAlpha. Fai una domanda, dicci cosa non funziona o mostraci cosa ospiti.

<br><div align="center">
<a href="https://discord.gg/9twHWR7xGX">
<img src="../assets/discord-banner.png" alt="Parla con noi su Discord, il posto principale per raggiungere il team PanelAlpha" width="760">
</a>
</div><br>

Se preferisci un forum, usa [community.panelalpha.com](https://community.panelalpha.com/).

## Sicurezza

Segnala una vulnerabilità in privato, mai in una issue pubblica: [manage.panelalpha.com/contact](https://manage.panelalpha.com/contact).

## Licenza

PanelAlpha Single Server Edition è open source con la [Apache License 2.0](../../LICENSE).
