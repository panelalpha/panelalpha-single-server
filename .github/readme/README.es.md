<div align="center">

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/panelalpha.svg"><img src="../assets/panelalpha-light.svg" alt="PanelAlpha Single Server Edition" width="360"></picture></p>

<h1>Un panel de hosting<br>para tu propio servidor.</h1>

<h3>
Sitios, dominios, copias de seguridad y staging en tu navegador. Funciona sobre PanelAlpha Engine.
</h3>

<h3>
<a href="#pon-en-marcha-el-panel"><b>Empezar</b></a> ·
<a href="https://www.panelalpha.com/documentation/single-server-edition"><b>Documentación</b></a> ·
<a href="#habla-con-nosotros-en-discord"><b>Discord</b></a>
</h3>

<p>
<a href="#dónde-encontrar-cada-cosa">En el panel</a> ·
<a href="#conecta-tu-asistente-de-ia">Connect AI</a> ·
<a href="#panelalpha-hub">Hub</a> ·
<a href="#faq">FAQ</a>
</p>

<p>
<a href="../../README.md">English</a>
· <a href="README.pl.md">Polski</a>
· <a href="README.de.md">Deutsch</a>
· <a href="README.nl.md">Nederlands</a>
· <b>Español</b>
· <a href="README.fr.md">Français</a>
· <a href="README.it.md">Italiano</a>
· <a href="README.pt-BR.md">Português</a>
· <a href="README.uk.md">Українська</a>
· <a href="README.ar.md">العربية</a>
· <a href="README.zh-CN.md">简体中文</a>
</p>

<p>
<a href="#paso-1-instala-el-panel-en-tu-vps"><img src="https://img.shields.io/badge/PanelAlpha_Engine-2.3.0+-E65E12" alt="Requiere PanelAlpha Engine 2.3.0 o posterior"></a>
<a href="#paso-1-instala-el-panel-en-tu-vps"><img src="https://img.shields.io/badge/Debian_12%2F13-Ubuntu_22.04%2F24.04%2F26.04-a80030" alt="Sistemas soportados"></a>
<a href="#licencia"><img src="https://img.shields.io/badge/license-Apache_2.0-0b7285" alt="Apache 2.0"></a>
<a href="https://discord.gg/9twHWR7xGX"><img src="https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white" alt="Unirse a Discord"></a>
</p>

</div>

---

## ¿Qué es PanelAlpha Single Server Edition?

PanelAlpha Single Server Edition es un panel de hosting web que instalas en tu propio VPS. Lo abres en un navegador y desde ahí te ocupas de tus sitios: WordPress, apps desde Git, dominios, copias de seguridad y el resto. PanelAlpha Engine se encarga del hosting por debajo, y el panel te da una pantalla para manejarlo.

La edición Community es para una persona y no tiene límite de proyectos. En el panel puedes:

- Crear un sitio WordPress, desplegar una app desde Git o desde archivos, o instalar una app probada del catálogo de PanelAlpha GO!
- Importar un sitio WordPress desde otro hosting
- Añadir dominios, con certificados de Let's Encrypt
- Hacer copias de seguridad a mano o programadas, y restaurarlas
- Mantener una copia de staging de un sitio y pasarla a producción
- Gestionar bases de datos, cron jobs, cuentas FTP y SFTP y ajustes de PHP
- Ver estadísticas de visitas, uso y logs
- Conectar un asistente de IA y gestionar tus proyectos por chat
- Conectar el servidor a tu cuenta de PanelAlpha Hub e iniciar sesión con ella

## Cómo funciona

<div align="center"><img src="../assets/panelalpha-tour.gif" alt="Recorrido por el panel: crear un proyecto desde PanelAlpha GO!, la página del proyecto, staging y Push To Live, y Connect AI" width="800"><br><a href="../assets/panelalpha-tour.mp4">Ver el recorrido completo (2,5 min, MP4)</a></div>

El panel es un proyecto del engine, en su propio contenedor. Cuando creas un sitio, el panel pide a la API del engine que lo haga, y el engine da a ese sitio un proyecto propio. Si quitas el panel, solo se borra el proyecto del panel. Tus sitios siguen funcionando.

## Por qué usar el panel

PanelAlpha Engine se maneja desde un asistente de IA o con el comando `pae` en el servidor. El panel pone ese mismo trabajo en una pantalla. Puedes añadir un dominio, restaurar una copia o pasar una copia de staging a producción con unos pocos clics, y ver todos los sitios del servidor en una sola lista. Cuando quieres que te ayude un asistente, lo conectas al panel y trabaja sobre los mismos proyectos.

## Pon en marcha el panel

### Paso 1: Instala el panel en tu VPS

Necesitas un servidor nuevo con Debian 12/13 o Ubuntu 22.04/24.04/26.04, con 2 GB de RAM, acceso `root` por SSH y un dominio que apunte a él. **El puerto 80 debe estar abierto para todos**, porque Let's Encrypt lo usa.

```bash
curl -fsSL get.panelalpha.com/single-server | sh
```

Todas las opciones y la versión de Engine que necesita el panel: [Installing the panel](https://www.panelalpha.com/documentation/single-server-edition/getting-started/install).

### Paso 2: Inicia sesión

Abre `https://panel.example.com`. El asistente de configuración crea tu cuenta, o conecta tu cuenta de PanelAlpha Hub, y abre el panel: [First login](https://www.panelalpha.com/documentation/single-server-edition/getting-started/first-login).

### Paso 3: Crea tu primer sitio

Ve a **My Projects**, selecciona **Create First Project** y elige **WordPress**, **Git**, **Files** o **PanelAlpha GO!**. También puedes soltar un archivo `.zip` o `.tar.gz` directamente sobre la lista de proyectos: [Create a project](https://www.panelalpha.com/documentation/single-server-edition/projects/create-a-project).

**PanelAlpha GO!** es un catálogo de apps de código abierto que PanelAlpha desplegó y probó en PanelAlpha Engine. Eliges una app y el panel la instala, sin nada más que rellenar. El catálogo aparece cuando el panel está conectado a [PanelAlpha Hub](#panelalpha-hub).

<div align="center">
<a href="https://www.panelalpha.com/documentation/single-server-edition/projects/create-a-project"><img src="https://skillicons.dev/icons?i=wordpress,php,laravel,nodejs,nextjs,python,docker,git&perline=8" alt="WordPress, PHP, Laravel, Node.js, Next.js, Python, Docker, Git"></a>
<br>
WordPress, o cualquier app que el engine pueda construir desde un repositorio Git o una carpeta de archivos.
</div>

## Dónde encontrar cada cosa

Selecciona **Manage** en un proyecto para abrirlo. Sus pestañas son **Project Details**, **Monitoring**, **Backups**, **Plugins** y **Advanced**. **Plugins** solo aparece en un sitio WordPress.

| Quieres | En el panel |
|:---|:---|
| Poner tu propio dominio en un sitio | **Advanced > Domains**, luego **Add Domain** |
| Hacer una copia de seguridad, o programarla | Pestaña **Backups**. Configura un almacén una sola vez en **Settings > Backups** |
| Probar un cambio antes de publicarlo | **Staging** en la barra superior del proyecto, luego **Push To Live** |
| Redesplegar en cada git push | **Advanced > Git**, luego **Auto-deploy on push** |
| Mover un sitio WordPress desde otro hosting | Crea un proyecto, **WordPress**, luego **Import Existing WordPress Project** |
| Añadir una base de datos y un usuario para ella | **Advanced > MySQL Databases** |
| Dar acceso SFTP a alguien | **Advanced > SFTP Accounts** |
| Ejecutar un script de forma programada | **Advanced > Cron Jobs** |
| Cambiar la versión de PHP o `memory_limit` | **Advanced > Developer Settings** |
| Ver cuánta gente visita el sitio | Pestaña **Monitoring** |

## Todo lo que necesita un sitio, en el panel

- **Dominios y HTTPS.** Apunta tu propio dominio a un sitio, añade más dominios y redirecciones, y da a cada uno un certificado de Let's Encrypt. Si aún no tienes dominio, usa un subdominio gratuito cuando tu servidor lo ofrezca. [Domains and SSL](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/domains-and-ssl)
- **Copias de seguridad que puedes restaurar.** Haz copias a mano o cada día, semana o mes, en S3, SFTP, FTP, FTPS o una carpeta local. En un sitio WordPress puedes restaurar los archivos y la base de datos por separado. [Backups](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/backups)
- **Staging.** Haz una copia de un sitio, prueba tus cambios allí y luego pasa los archivos, la base de datos completa o tablas seleccionadas al sitio en producción. Un proyecto Git puede desplegar una rama en staging y dejar producción intacta. [Staging and preview](https://www.panelalpha.com/documentation/single-server-edition/projects/staging-and-preview)
- **Git.** Mira cuántos commits va por detrás el sitio, redespliega, cambia de rama y sigue el log del despliegue mientras se ejecuta. Con el auto-deploy activado, un push a GitHub, GitLab o Bitbucket redespliega el sitio. [Git](https://www.panelalpha.com/documentation/single-server-edition/projects/git)
- **WordPress.** Entra al escritorio sin contraseña, actualiza WordPress y WooCommerce, instala plugins y temas por su nombre en wordpress.org, gestiona los usuarios de WordPress y activa las actualizaciones automáticas. [Managing WordPress](https://www.panelalpha.com/documentation/single-server-edition/projects/wordpress)
- **Archivos, FTP y SFTP.** Edita, sube, comprime y descomprime archivos en el gestor de archivos, o da a un programa como FileZilla una cuenta FTP o SFTP. [Files and access](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/files-and-access)
- **Bases de datos.** Crea bases de datos y usuarios MySQL, define sus privilegios y abre phpMyAdmin desde el panel. [Databases](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/databases)
- **Estadísticas y logs.** Visitas por país, origen y dispositivo, ancho de banda, la CPU, la RAM y el disco de todo el servidor, y los logs de PHP y del servidor web de cada sitio. [Statistics and logs](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/statistics-and-logs)

## Conecta tu asistente de IA

Conectas tu asistente desde el panel, en la página **Connect AI** del menú superior.

1. Abre **Connect AI** y elige tu herramienta en **Your tool**.
2. En **Generate an MCP token**, selecciona **Create Token**, ponle un nombre como `Claude on my laptop` y cópialo. **El token se muestra una sola vez.**
3. El paso siguiente muestra qué poner en tu herramienta, con la dirección de tu panel ya rellenada. Selecciona **Copy**, pégalo en tu herramienta y cambia `YOUR_TOKEN` por tu token.
4. Sigue **Verify the connection** en la misma página. En Claude Code, reinícialo o ejecuta `/mcp`.

Después pide en el chat, por ejemplo `List my projects.`

<div align="center">

<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/claude.png" width="46" alt="Claude Code"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/openai.png" width="46" alt="ChatGPT, Codex"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/cursor.png" width="46" alt="Cursor"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="../assets/windsurf.png" width="46" alt="Windsurf"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://skillicons.dev/icons?i=vscode" width="46" alt="VS Code"></a>

<sub><b>Claude Code&nbsp; · &nbsp;ChatGPT / Codex&nbsp; · &nbsp;Cursor&nbsp; · &nbsp;Windsurf&nbsp; · &nbsp;VS Code</b></sub>

</div>

Cada una de estas herramientas tiene su propia página en **Connect AI**, y **Other tool** cubre cualquier otra que hable MCP. El asistente puede acceder a tus proyectos en producción y en staging. No puede cambiar los ajustes de todo el servidor, cambiar los límites de un proyecto, suspender un proyecto ni tocar el proyecto del propio panel. **MCP URL & tokens** lista tus tokens y te deja revocar uno, y **Activity Log** muestra cada petición: [Connect AI](https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai).

## PanelAlpha Hub

PanelAlpha Hub es tu cuenta de PanelAlpha en [hub.panelalpha.com](https://hub.panelalpha.com). Conectar el panel a ella es gratis y opcional. El panel sigue funcionando por sí solo en ambos casos.

Con el panel conectado:

- Inicias sesión en el panel con **Sign in with PanelAlpha**, y tu cuenta del Hub puede iniciar sesión con GitHub o Google
- Una sola cuenta cubre todos tus servidores
- Puedes instalar apps del catálogo de PanelAlpha GO!
- El Hub muestra el estado de cada sitio de este servidor

Puedes conectar en dos lugares. Durante el primer inicio de sesión, elige **Connect with Hub** en el paso **Sign in** del asistente de configuración, en lugar de una cuenta local. En un panel que ya está configurado, abre **Settings** y selecciona **Connect to PanelAlpha**. En ambos casos inicias sesión en PanelAlpha y vuelves directamente al panel.

Mientras está conectado, el panel informa al Hub cada cinco minutos: el nombre, el tipo y el estado de cada proyecto, la versión del panel y su dirección. **Iniciar sesión a través de PanelAlpha omite la verificación en dos pasos del panel.** El inicio de sesión del Hub cuenta como esa verificación.

**Disconnect** en **Settings** quita el servidor de tu cuenta y desactiva **Sign in with PanelAlpha**. Si PanelAlpha es tu única forma de entrar, define antes una contraseña en **My Account**: [Settings](https://www.panelalpha.com/documentation/single-server-edition/the-panel/settings#panelalpha-hub).

## Cómo se mantienen separados tus sitios

Cada sitio es su propio proyecto en el engine, con sus propios archivos, bases de datos, dominios y copias de seguridad. Los sitios creados desde Git o desde archivos se ejecutan en sus propios contenedores, así que una app rota no tumba a las demás.

El panel también es un proyecto. Una vez protegido su proyecto, ni el panel ni ningún token pueden borrarlo, detenerlo o redesplegarlo. Solo puede `pae` en el servidor. Quitar el panel deja todos los sitios funcionando.

Tu propio inicio de sesión puede tener verificación en dos pasos, y **Active Devices** te permite cerrar la sesión de un navegador que ya no usas: [Your account](https://www.panelalpha.com/documentation/single-server-edition/the-panel/your-account).

## Cuando algo no funciona

La mayor parte de lo que hace el panel se ejecuta en segundo plano: despliegues, copias de seguridad, copias de staging. **Tasks** en el menú de usuario lista cada una con su estado y lo que tardó, y muestra un punto mientras una se ejecuta. Una tarea fallida muestra la primera línea de su error bajo su nombre. Selecciona la fila para leer el error completo: [Tasks](https://www.panelalpha.com/documentation/single-server-edition/the-panel/tasks).

En un sitio de Git o de archivos, **Show Logs** abre el log del despliegue, en vivo o de despliegues anteriores. **Advanced > Logs** tiene los logs de PHP y del servidor web, y **Advanced > Containers** puede iniciar, detener o reiniciar un solo servicio. Cada parte de la documentación tiene una página Troubleshooting con el mensaje que ves, qué significa y qué hacer: [Troubleshooting](https://www.panelalpha.com/documentation/single-server-edition/troubleshooting/panel-and-account).

## FAQ

<details>
<summary><b>¿Necesito PanelAlpha Engine?</b></summary>

Sí. El panel es un proyecto del engine, y cada operación de hosting pasa por la API del engine. Necesita Engine 2.3.0 o posterior: [Requirements](https://www.panelalpha.com/documentation/single-server-edition/getting-started/requirements).
</details>

<details>
<summary><b>¿Puede un panel gestionar varios servidores?</b></summary>

No. Un panel gestiona el engine en el que se ejecuta. Gestionar muchos engines desde un solo panel es Multi Server, un producto aparte.
</details>

<details>
<summary><b>¿Qué pasa con mis sitios si quito el panel?</b></summary>

Siguen funcionando. Quitar el panel borra su propio proyecto y sus datos: cuentas, ajustes, etiquetas de proyectos y el registro de actividad. Cada sitio es un proyecto separado en el engine: [Removing the panel](https://www.panelalpha.com/documentation/single-server-edition/getting-started/removing).
</details>

<details>
<summary><b>¿El panel hace copias de seguridad de sí mismo?</b></summary>

No. Las copias de seguridad que configuras en el panel cubren tus sitios. Haz la copia del panel en el servidor con `pae project:backup:create`: [Where the panel keeps its data](https://www.panelalpha.com/documentation/single-server-edition/getting-started/removing#backing-up-the-panel).
</details>

<details>
<summary><b>¿Cómo actualizo el panel?</b></summary>

Despliega la nueva versión en el proyecto del panel en el servidor. No hay botón de actualización. Tus cuentas, ajustes y sesiones se mantienen, y el panel actualiza su base de datos al arrancar: [Updating the panel](https://www.panelalpha.com/documentation/single-server-edition/getting-started/updating).
</details>

<details>
<summary><b>¿Puedo mover el panel a otra dirección?</b></summary>

Sí. Apunta el nuevo dominio al servidor y luego guárdalo como **Application URL** en **Settings**. El panel añade el dominio, obtiene un certificado y se mueve allí. La dirección anterior deja de responder: [The panel address](https://www.panelalpha.com/documentation/single-server-edition/getting-started/panel-address).
</details>

<details>
<summary><b>¿Puedo traer mi sitio WordPress desde otro hosting?</b></summary>

Sí. Crea un proyecto, elige **WordPress** y luego **Import Existing WordPress Project**. El panel se conecta con tu acceso de administrador de WordPress o mediante un plugin que instalas en el sitio anterior. No se puede importar por FTP ni SFTP: [Importing a WordPress site](https://www.panelalpha.com/documentation/single-server-edition/projects/importing-wordpress).
</details>

<details>
<summary><b>¿Qué no puede hacer todavía el panel?</b></summary>

No puede devolver un proyecto Git a un commit anterior, porque despliega el último commit de una rama. No tiene un ajuste para poner una contraseña delante de todo un sitio. Los plugins y los temas se instalan por su nombre en wordpress.org, no desde una URL.
</details>

<details>
<summary><b>¿Es gratis?</b></summary>

Single Server Community es gratis, open source bajo la licencia Apache 2.0 y no tiene límite de proyectos. Tú pagas tu servidor.
</details>

## Habla con nosotros en Discord

[Discord](https://discord.gg/9twHWR7xGX) es el lugar principal para hablar con el equipo de PanelAlpha. Haz una pregunta, cuéntanos qué no funciona o enséñanos lo que alojas.

<br><div align="center">
<a href="https://discord.gg/9twHWR7xGX">
<img src="../assets/discord-banner.png" alt="Habla con nosotros en Discord, el lugar principal para hablar con el equipo de PanelAlpha" width="760">
</a>
</div><br>

Si prefieres un foro, usa [community.panelalpha.com](https://community.panelalpha.com/).

## Seguridad

Informa de una vulnerabilidad en privado, nunca en un issue público: [manage.panelalpha.com/contact](https://manage.panelalpha.com/contact).

## Licencia

PanelAlpha Single Server Edition es open source bajo la [Apache License 2.0](../../LICENSE).
