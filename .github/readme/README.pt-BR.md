<div align="center">

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/panelalpha.svg"><img src="../assets/panelalpha-light.svg" alt="PanelAlpha Single Server Edition" width="360"></picture></p>

<h1>Um painel de hospedagem<br>para o seu próprio servidor.</h1>

<h3>
Sites, domínios, backups e staging no seu navegador. Ele roda no PanelAlpha Engine.
</h3>

<h3>
<a href="#coloque-o-painel-no-ar"><b>Começar</b></a> ·
<a href="https://www.panelalpha.com/documentation/single-server-edition"><b>Documentação</b></a> ·
<a href="#fale-conosco-no-discord"><b>Discord</b></a>
</h3>

<p>
<a href="#onde-encontrar-cada-coisa">No painel</a> ·
<a href="#conecte-seu-assistente-de-ia">Connect AI</a> ·
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
· <b>Português</b>
· <a href="README.uk.md">Українська</a>
· <a href="README.ar.md">العربية</a>
· <a href="README.zh-CN.md">简体中文</a>
</p>

<p>
<a href="#passo-1-instale-o-painel-na-sua-vps"><img src="https://img.shields.io/badge/PanelAlpha_Engine-2.3.0+-E65E12" alt="Requer o PanelAlpha Engine 2.3.0 ou mais recente"></a>
<a href="#passo-1-instale-o-painel-na-sua-vps"><img src="https://img.shields.io/badge/Debian_12%2F13-Ubuntu_22.04%2F24.04%2F26.04-a80030" alt="Sistemas compatíveis"></a>
<a href="#licença"><img src="https://img.shields.io/badge/license-Apache_2.0-0b7285" alt="Apache 2.0"></a>
<a href="https://discord.gg/9twHWR7xGX"><img src="https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white" alt="Entrar no Discord"></a>
</p>

</div>

---

## O que é o PanelAlpha Single Server Edition?

O PanelAlpha Single Server Edition é um painel de hospedagem web que você instala na sua própria VPS. Você o abre em um navegador e cuida dos seus sites por lá: WordPress, apps a partir do Git, domínios, backups e o resto. O PanelAlpha Engine faz a hospedagem por baixo, e o painel dá a você uma tela para isso.

A edição Community é para uma pessoa e não tem limite de projetos. No painel você pode:

- Criar um site WordPress, fazer o deploy de um app a partir do Git ou de arquivos, ou instalar um app testado do catálogo PanelAlpha GO!
- Importar um site WordPress de outra hospedagem
- Adicionar domínios, com certificados do Let's Encrypt
- Fazer backups manualmente ou agendados, e restaurá-los
- Manter uma cópia de staging de um site e publicá-la em produção
- Gerenciar bancos de dados, cron jobs, contas FTP e SFTP e configurações de PHP
- Ver estatísticas de visitantes, uso e logs
- Conectar um assistente de IA e gerenciar seus projetos por chat
- Conectar o servidor à sua conta do PanelAlpha Hub e entrar com ela

## Como funciona

<div align="center"><img src="../assets/panelalpha-tour.gif" alt="Tour pelo painel: criar um projeto a partir do PanelAlpha GO!, a página do projeto, staging e Push To Live, e Connect AI" width="800"><br><a href="../assets/panelalpha-tour.mp4">Assista ao tour completo (2,5 min, MP4)</a></div>

O painel é um projeto do engine, em seu próprio contêiner. Quando você cria um site, o painel pede à API do engine que o faça, e o engine dá a esse site um projeto próprio. Remover o painel apaga só o projeto do painel. Seus sites continuam rodando.

## Por que usar o painel

O PanelAlpha Engine é operado por um assistente de IA ou pelo comando `pae` no servidor. O painel coloca esse mesmo trabalho em uma tela. Você pode adicionar um domínio, restaurar um backup ou publicar uma cópia de staging com poucos cliques, e ver todos os sites do servidor em uma única lista. Quando quiser a ajuda de um assistente, você o conecta ao painel e ele trabalha nos mesmos projetos.

## Coloque o painel no ar

### Passo 1: Instale o painel na sua VPS

Você precisa de um servidor novo com Debian 12/13 ou Ubuntu 22.04/24.04/26.04, com 2 GB de RAM, acesso `root` por SSH e um domínio apontado para ele. **A porta 80 deve estar aberta para todos**, porque o Let's Encrypt a usa.

```bash
curl -fsSL get.panelalpha.com/single-server | sh
```

Todas as opções e a versão do Engine de que o painel precisa: [Installing the panel](https://www.panelalpha.com/documentation/single-server-edition/getting-started/install).

### Passo 2: Entre

Abra `https://panel.example.com`. O assistente de configuração cria sua conta, ou conecta sua conta do PanelAlpha Hub, e abre o painel: [First login](https://www.panelalpha.com/documentation/single-server-edition/getting-started/first-login).

### Passo 3: Crie seu primeiro site

Vá em **My Projects**, selecione **Create First Project** e escolha **WordPress**, **Git**, **Files** ou **PanelAlpha GO!**. Você também pode soltar um arquivo `.zip` ou `.tar.gz` direto na lista de projetos: [Create a project](https://www.panelalpha.com/documentation/single-server-edition/projects/create-a-project).

**PanelAlpha GO!** é um catálogo de apps de código aberto que o PanelAlpha fez o deploy e testou no PanelAlpha Engine. Você escolhe um app e o painel o instala, sem mais nada para preencher. O catálogo aparece quando o painel está conectado ao [PanelAlpha Hub](#panelalpha-hub).

<div align="center">
<a href="https://www.panelalpha.com/documentation/single-server-edition/projects/create-a-project"><img src="https://skillicons.dev/icons?i=wordpress,php,laravel,nodejs,nextjs,python,docker,git&perline=8" alt="WordPress, PHP, Laravel, Node.js, Next.js, Python, Docker, Git"></a>
<br>
WordPress, ou qualquer app que o engine consiga construir a partir de um repositório Git ou de uma pasta de arquivos.
</div>

## Onde encontrar cada coisa

Selecione **Manage** em um projeto para abri-lo. As abas dele são **Project Details**, **Monitoring**, **Backups**, **Plugins** e **Advanced**. **Plugins** aparece só em um site WordPress.

| Você quer | No painel |
|:---|:---|
| Colocar seu próprio domínio em um site | **Advanced > Domains**, depois **Add Domain** |
| Fazer um backup, ou agendar backups | Aba **Backups**. Configure um armazenamento uma vez em **Settings > Backups** |
| Testar uma mudança antes de publicar | **Staging** na barra superior do projeto, depois **Push To Live** |
| Refazer o deploy a cada git push | **Advanced > Git**, depois **Auto-deploy on push** |
| Mover um site WordPress de outra hospedagem | Crie um projeto, **WordPress**, depois **Import Existing WordPress Project** |
| Adicionar um banco de dados e um usuário para ele | **Advanced > MySQL Databases** |
| Dar acesso SFTP a alguém | **Advanced > SFTP Accounts** |
| Executar um script de forma agendada | **Advanced > Cron Jobs** |
| Mudar a versão do PHP ou o `memory_limit` | **Advanced > Developer Settings** |
| Ver quantas pessoas visitam o site | Aba **Monitoring** |

## Tudo o que um site precisa, no painel

- **Domínios e HTTPS.** Aponte seu próprio domínio para um site, adicione mais domínios e redirecionamentos, e dê a cada um um certificado do Let's Encrypt. Se ainda não tem domínio, use um subdomínio gratuito quando o seu servidor oferecer um. [Domains and SSL](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/domains-and-ssl)
- **Backups que você pode restaurar.** Faça backup manualmente ou todo dia, semana ou mês, para S3, SFTP, FTP, FTPS ou uma pasta local. Em um site WordPress, você pode restaurar os arquivos e o banco de dados separadamente. [Backups](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/backups)
- **Staging.** Faça uma cópia de um site, teste suas mudanças ali e depois envie os arquivos, o banco de dados completo ou tabelas selecionadas para o site em produção. Um projeto Git pode fazer o deploy de um branch em staging e deixar a produção em paz. [Staging and preview](https://www.panelalpha.com/documentation/single-server-edition/projects/staging-and-preview)
- **Git.** Veja quantos commits o site está atrasado, refaça o deploy, troque de branch e acompanhe o log do deploy enquanto ele roda. Com o auto-deploy ligado, um push para o GitHub, GitLab ou Bitbucket refaz o deploy do site. [Git](https://www.panelalpha.com/documentation/single-server-edition/projects/git)
- **WordPress.** Entre no painel de controle sem senha, atualize o WordPress e o WooCommerce, instale plugins e temas pelo nome no wordpress.org, gerencie os usuários do WordPress e ative as atualizações automáticas. [Managing WordPress](https://www.panelalpha.com/documentation/single-server-edition/projects/wordpress)
- **Arquivos, FTP e SFTP.** Edite, envie, compacte e descompacte arquivos no gerenciador de arquivos, ou dê a um programa como o FileZilla uma conta FTP ou SFTP. [Files and access](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/files-and-access)
- **Bancos de dados.** Crie bancos de dados e usuários MySQL, defina os privilégios deles e abra o phpMyAdmin pelo painel. [Databases](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/databases)
- **Estatísticas e logs.** Visitas por país, origem e dispositivo, largura de banda, CPU, RAM e disco do servidor inteiro, e os logs de PHP e do servidor web de cada site. [Statistics and logs](https://www.panelalpha.com/documentation/single-server-edition/looking-after-a-project/statistics-and-logs)

## Conecte seu assistente de IA

Você conecta seu assistente pelo painel, na página **Connect AI** do menu superior.

1. Abra **Connect AI** e escolha sua ferramenta em **Your tool**.
2. Em **Generate an MCP token**, selecione **Create Token**, dê um nome como `Claude on my laptop` e copie o token. **O token aparece uma única vez.**
3. O passo seguinte mostra o que colocar na sua ferramenta, com o endereço do seu painel já preenchido. Selecione **Copy**, cole na sua ferramenta e troque `YOUR_TOKEN` pelo seu token.
4. Siga **Verify the connection** na mesma página. No Claude Code, reinicie-o ou execute `/mcp`.

Depois peça no chat, por exemplo `List my projects.`

<div align="center">

<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/claude.png" width="46" alt="Claude Code"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/openai.png" width="46" alt="ChatGPT, Codex"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://github.com/cursor.png" width="46" alt="Cursor"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="../assets/windsurf.png" width="46" alt="Windsurf"></a>&nbsp;&nbsp;
<a href="https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai"><img src="https://skillicons.dev/icons?i=vscode" width="46" alt="VS Code"></a>

<sub><b>Claude Code&nbsp; · &nbsp;ChatGPT / Codex&nbsp; · &nbsp;Cursor&nbsp; · &nbsp;Windsurf&nbsp; · &nbsp;VS Code</b></sub>

</div>

Cada uma dessas ferramentas tem sua própria página em **Connect AI**, e **Other tool** cobre qualquer outra que fale MCP. O assistente pode acessar seus projetos em produção e em staging. Ele não pode mudar as configurações do servidor inteiro, mudar os limites de um projeto, suspender um projeto nem mexer no projeto do próprio painel. **MCP URL & tokens** lista seus tokens e deixa você revogar um, e **Activity Log** mostra cada requisição: [Connect AI](https://www.panelalpha.com/documentation/single-server-edition/the-panel/connect-ai).

## PanelAlpha Hub

O PanelAlpha Hub é a sua conta PanelAlpha em [hub.panelalpha.com](https://hub.panelalpha.com). Conectar o painel a ela é grátis e opcional. O painel continua funcionando sozinho nos dois casos.

Com o painel conectado:

- Você entra no painel com **Sign in with PanelAlpha**, e a sua conta do Hub pode entrar com GitHub ou Google
- Uma única conta cobre todos os seus servidores
- Você pode instalar apps do catálogo PanelAlpha GO!
- O Hub mostra o status de cada site deste servidor

Você pode conectar em dois lugares. No primeiro login, escolha **Connect with Hub** na etapa **Sign in** do assistente de configuração, em vez de uma conta local. Em um painel que já está configurado, abra **Settings** e selecione **Connect to PanelAlpha**. Nos dois casos você entra no PanelAlpha e volta direto para o painel.

Enquanto está conectado, o painel informa ao Hub a cada cinco minutos: o nome, o tipo e o status de cada projeto, a versão do painel e o endereço dele. **Entrar pelo PanelAlpha pula a verificação em duas etapas do painel.** O login no Hub conta como essa verificação.

**Disconnect** em **Settings** remove o servidor da sua conta e desliga **Sign in with PanelAlpha**. Se o PanelAlpha é a sua única forma de entrar, defina antes uma senha em **My Account**: [Settings](https://www.panelalpha.com/documentation/single-server-edition/the-panel/settings#panelalpha-hub).

## Como seus sites ficam separados

Cada site é um projeto próprio no engine, com seus próprios arquivos, bancos de dados, domínios e backups. Sites criados a partir do Git ou de arquivos rodam em seus próprios contêineres, então um app com defeito não derruba os outros.

O painel também é um projeto. Depois que o projeto dele é protegido, nem o painel nem qualquer token pode apagá-lo, pará-lo ou refazer o deploy dele. Só o `pae` no servidor pode. Remover o painel deixa todos os sites rodando.

O seu próprio login pode ter verificação em duas etapas, e **Active Devices** permite encerrar a sessão de um navegador que você não usa mais: [Your account](https://www.panelalpha.com/documentation/single-server-edition/the-panel/your-account).

## Quando algo não funciona

A maior parte do que o painel faz roda em segundo plano: deploys, backups, cópias de staging. **Tasks** no menu do usuário lista cada uma com seu status e quanto tempo levou, e mostra um ponto enquanto uma está rodando. Uma tarefa que falhou mostra a primeira linha do erro abaixo do nome. Selecione a linha para ler o erro completo: [Tasks](https://www.panelalpha.com/documentation/single-server-edition/the-panel/tasks).

Em um site Git ou de arquivos, **Show Logs** abre o log do deploy, ao vivo ou de deploys anteriores. **Advanced > Logs** tem os logs de PHP e do servidor web, e **Advanced > Containers** pode iniciar, parar ou reiniciar um único serviço. Cada parte da documentação tem uma página Troubleshooting com a mensagem que você vê, o que ela significa e o que fazer: [Troubleshooting](https://www.panelalpha.com/documentation/single-server-edition/troubleshooting/panel-and-account).

## FAQ

<details>
<summary><b>Preciso do PanelAlpha Engine?</b></summary>

Sim. O painel é um projeto do engine, e toda operação de hospedagem passa pela API do engine. Ele precisa do Engine 2.3.0 ou mais recente: [Requirements](https://www.panelalpha.com/documentation/single-server-edition/getting-started/requirements).
</details>

<details>
<summary><b>Um painel pode gerenciar vários servidores?</b></summary>

Não. Um painel gerencia o engine em que roda. Gerenciar vários engines a partir de um único painel é o Multi Server, um produto separado.
</details>

<details>
<summary><b>O que acontece com meus sites se eu remover o painel?</b></summary>

Eles continuam rodando. Remover o painel apaga o projeto dele e os dados dele: contas, configurações, rótulos de projetos e o registro de atividade. Cada site é um projeto separado no engine: [Removing the panel](https://www.panelalpha.com/documentation/single-server-edition/getting-started/removing).
</details>

<details>
<summary><b>O painel faz backup de si mesmo?</b></summary>

Não. Os backups que você configura no painel cobrem os seus sites. Faça o backup do painel no servidor com `pae project:backup:create`: [Where the panel keeps its data](https://www.panelalpha.com/documentation/single-server-edition/getting-started/removing#backing-up-the-panel).
</details>

<details>
<summary><b>Como atualizo o painel?</b></summary>

Faça o deploy da nova versão no projeto do painel, no servidor. Não existe botão de atualização. Suas contas, configurações e sessões continuam, e o painel atualiza o próprio banco de dados ao iniciar: [Updating the panel](https://www.panelalpha.com/documentation/single-server-edition/getting-started/updating).
</details>

<details>
<summary><b>Posso mudar o painel para outro endereço?</b></summary>

Sim. Aponte o novo domínio para o servidor e depois salve-o como **Application URL** em **Settings**. O painel adiciona o domínio, obtém um certificado e se muda para lá. O endereço antigo deixa de responder: [The panel address](https://www.panelalpha.com/documentation/single-server-edition/getting-started/panel-address).
</details>

<details>
<summary><b>Posso trazer meu site WordPress de outra hospedagem?</b></summary>

Sim. Crie um projeto, escolha **WordPress** e depois **Import Existing WordPress Project**. O painel se conecta com o seu login de administrador do WordPress ou por um plugin que você instala no site antigo. A importação por FTP ou SFTP não está disponível: [Importing a WordPress site](https://www.panelalpha.com/documentation/single-server-edition/projects/importing-wordpress).
</details>

<details>
<summary><b>O que o painel ainda não faz?</b></summary>

Ele não consegue voltar um projeto Git para um commit anterior, porque faz o deploy do último commit de um branch. Ele não tem uma configuração para pôr uma senha na frente de um site inteiro. Plugins e temas são instalados pelo nome no wordpress.org, não por uma URL.
</details>

<details>
<summary><b>É grátis?</b></summary>

O Single Server Community é grátis, open source sob a licença Apache 2.0 e não tem limite de projetos. Você paga pelo seu servidor.
</details>

## Fale conosco no Discord

O [Discord](https://discord.gg/9twHWR7xGX) é o principal lugar para falar com a equipe do PanelAlpha. Faça uma pergunta, conte o que não funciona ou mostre o que você hospeda.

<br><div align="center">
<a href="https://discord.gg/9twHWR7xGX">
<img src="../assets/discord-banner.png" alt="Fale conosco no Discord, o principal lugar para falar com a equipe do PanelAlpha" width="760">
</a>
</div><br>

Se você prefere um fórum, use [community.panelalpha.com](https://community.panelalpha.com/).

## Segurança

Relate uma vulnerabilidade em privado, nunca em uma issue pública: [manage.panelalpha.com/contact](https://manage.panelalpha.com/contact).

## Licença

O PanelAlpha Single Server Edition é open source sob a [Apache License 2.0](../../LICENSE).
