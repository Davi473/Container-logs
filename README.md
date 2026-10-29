# Control Tower — Observabilidade, Logs & Terminais Docker

Dashboard web em tempo real para monitorar logs, telemetria (CPU/RAM/Rede), inspecionar configurações e abrir terminais interativos (`bash`/`sh`) em qualquer container Docker — tudo em um workspace multi-painel inspirado em IDEs modernas.

## Principais Funcionalidades

### 1. Logs em Tempo Real Avançados
- **Renderização de cores ANSI**: Suporte nativo a sequências de cores de terminal nos logs.
- **Filtro por Nível & Stream**: Pílulas rápidas para filtrar `Todos`, `Erros`, `Avisos` (`WARN`) e `stderr`.
- **Busca com Regex (`.*`)**: Busca instantânea com contador de ocorrências e destaque visual (`<mark>`).
- **Controles de Visualização**: Alternância de quebra de linha (`Wrap`), exibição de horários (`Hora`), numeração de linhas, `Pausar/Retomar` (com contador de linhas recebidas durante a pausa) e `Auto-scroll` inteligente com botão flutuante **"Ir para o fim"**.
- **Exportação**: Copie os logs filtrados para a área de transferência ou baixe o arquivo `.log`.

### 2. Terminal Interativo (`docker exec` + `xterm.js`)
- Abre sessões `bash` (ou `sh` como fallback) reais com TTY completo (`TERM=xterm-256color`).
- Redimensionamento automático via `ResizeObserver` ao dividir painéis ou ajustar a barra lateral.
- Tema do terminal sincronizado automaticamente com o tema Claro/Escuro da interface.

### 3. Inspeção de Container & Telemetria ao Vivo (`Info`)
- **Métricas em Tempo Real**: Uso de CPU (`%`), Memória RAM (uso/limite + barra de progresso), tráfego de rede (`RX`/`TX`) e contagem de processos (`PIDs`) diretamente nos cards da barra lateral e na aba de inspeção.
- **Portas Clicáveis**: Portas mapeadas no host (`ex: 4173->4173`) funcionam como links diretos para abrir o serviço em uma nova aba.
- **Variáveis de Ambiente com Proteção de Segredos**: Busca rápida de variáveis, cópia em 1 clique e ocultação automática (blur) de chaves sensíveis (`PASSWORD`, `SECRET`, `TOKEN`, `KEY`, etc.) até que sejam clicadas.
- **Volumes & Redes**: Listagem completa de bind mounts, volumes (`RW`/`RO`), endereços IP, Gateway e MAC.

### 4. Workspace Multi-Painel & Produtividade
- **Divisão em 1 Clique ou Drag-and-Drop**: Use os botões de dividir à direita/abaixo no topo de cada painel ou arraste qualquer aba até as bordas (`esquerda`, `direita`, `topo`, `base`) para dividir a tela.
- **Paleta de Comandos (`Ctrl+K`)**: Acesse rapidamente logs, terminal, inspeção ou ações de ciclo de vida (`iniciar`, `parar`, `reiniciar`) de qualquer container usando apenas o teclado.
- **Agrupamento por Docker Compose**: Agrupa containers automaticamente por projeto do `docker compose`, permitindo iniciar, parar, reiniciar ou remover um stack inteiro de uma só vez.
- **Tema Escuro & Claro**: Alternância instantânea com persistência local (`localStorage`), além de barra lateral redimensionável e retrátil (`Ctrl+B`).
- **Eventos Docker em Tempo Real**: Escuta eventos diretamente do Docker Daemon (`docker.getEvents`) para refletir mudanças de estado instantaneamente.

## Atalhos de Teclado

| Atalho | Ação |
| :--- | :--- |
| `Ctrl + K` / `Cmd + K` | Abrir Paleta de Comandos |
| `/` | Focar busca de containers |
| `Ctrl + B` | Mostrar / ocultar barra lateral |
| `Alt + W` | Fechar aba ativa no painel focado |
| `?` | Abrir guia de atalhos de teclado |
| `Esc` | Fechar modal ativo ou limpar foco da busca |

## Como Rodar (Docker Compose)

```bash
docker compose up -d --build
```

Acesse via proxy reverso em: **http://docker.local**

Para parar:

```bash
docker compose down
```

## Como Rodar Localmente (Node.js)

Requer Node.js 18+ e acesso ao `/var/run/docker.sock` (ou `DOCKER_HOST` configurado):

```bash
npm install
npm start
```

## Notas de Segurança

Montar `/var/run/docker.sock` concede ao aplicativo controle sobre o daemon Docker do host (incluindo `docker exec` e remoção de containers).
- **Nunca** exponha a porta `4173` diretamente na internet pública.
- Para acesso remoto, utilize VPN, túnel SSH ou um reverse proxy autenticado.
