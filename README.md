# Control Tower — Observabilidade, Logs & Terminais Docker

Dashboard web em tempo real para monitorar logs, telemetria (CPU/RAM/Rede), inspecionar configurações e abrir terminais interativos (`bash`/`sh`) em qualquer container Docker — reescrito com **Backend em Go** e **Frontend em React + Vite + TypeScript**, aplicando **Clean Architecture**, **Arquitetura Hexagonal (Ports & Adapters)** e **Design Patterns**.

## Arquitetura do Projeto

### Backend (`backend/` — Go 1.23)

Organizado em camadas concêntricas de **Clean Architecture** e **Arquitetura Hexagonal**:

- **Domain (`internal/domain/`)** — Sem dependências externas:
  - `entity/`: Entidades puras (`Container`, `ContainerDetails`, `ContainerStats`, `LogLine`, `DockerEvent`, `SystemInfo`, `ContainerAction`).
  - `errors/`: Erros tipados de domínio (`ErrInvalidAction`, `ErrContainerNotFound`, `ErrDaemonUnavailable`).
  - `port/`: **Ports Hexagonais** (`DockerEnginePort`, `EventBus`, `TerminalSession`).
- **Application (`internal/application/`)** — Casos de uso e regras de orquestração:
  - `strategy/`: **Strategy / Command Pattern** (`ActionRegistry`) para despacho extensível de ações de ciclo de vida (`start`, `stop`, `restart`, `pause`, `unpause`, `kill`).
  - `usecase/`: `ContainerUseCase`, `ComposeUseCase`, `SystemUseCase`, `LogStreamUseCase` (streams compartilhados com contagem de referências — **Flyweight**), `TerminalUseCase` e `MonitorUseCase` (eventos Docker + polling de telemetria).
- **Infrastructure (`internal/infrastructure/`)** — **Adapters** (Driven & Driving):
  - `adapter/docker/`: **Driven Adapter** nativo para a Docker Engine API via Unix Socket (`/var/run/docker.sock`) ou `DOCKER_HOST`, com **Data Mapper** (`mapper.go`), demultiplexador de frames de 8 bytes (`demux.go`), calculadora de stats (`stats_calc.go`) e hijack TTY (`terminal_session.go`).
  - `adapter/eventbus/`: **Observer / Pub-Sub Pattern** (`MemoryEventBus`).
  - `delivery/http/`: **Driving Adapter REST** (`/api/v1/*`) + SPA static server + middlewares em **Chain of Responsibility** (`RecoveryMiddleware`, `CORSMiddleware`).
  - `delivery/ws/`: **Driving Adapter WebSocket** (`/ws`) com **Mediator Pattern** (`Hub`) conectado ao `EventBus`.
- **Composition Root (`cmd/server/main.go`)**: Injeção de dependências explícita e graceful shutdown.

### Frontend (`frontend/` — React 19 + Vite + TypeScript)

Espelha a mesma separação em camadas:

- **Domain (`src/domain/`)**:
  - `entities/`: Tipos puros de domínio (`container.ts`, `telemetry.ts`, `workspace.ts`).
  - `ports/`: Interfaces de saída (`IContainerGateway`, `IRealtimePort`, `IStoragePort`).
  - `services/`: Serviços puros de domínio — parser ANSI + **Strategy Pattern** de busca plain/regex (`logParser.ts`), motor imutável de árvore binária de split-panes (`layoutEngine.ts`) e formatadores (`formatters.ts`).
- **Application (`src/application/`)**:
  - `store/AppContext.tsx`: Contêiner de injeção de dependências e gerenciamento de estado reativo (com refcounting de log streams e sincronização WebSocket).
- **Infrastructure (`src/infrastructure/`)**:
  - `http/fetchContainerGateway.ts`: Adapter REST implementando `IContainerGateway`.
  - `ws/websocketAdapter.ts`: Adapter WebSocket nativo com auto-reconexão e **Observer Pattern** implementando `IRealtimePort`.
  - `storage/localStorageAdapter.ts`: Adapter de persistência implementando `IStoragePort`.
- **Presentation (`src/presentation/`)**:
  - `components/`: `TopBar`, `Sidebar`, `ContainerCard`, `OverviewView`, `WorkspaceView`, `SplitLayoutRenderer`, `PaneView`, `LogPanel`, `TerminalPanel` (`@xterm/xterm`), `InspectPanel`, `CommandPalette`, `ConfirmModal`, `ShortcutsModal`, `ToastContainer`.
  - `hooks/useGlobalShortcuts.ts`: Atalhos globais de teclado.

## Principais Funcionalidades

1. **Logs em Tempo Real**: Cores ANSI, filtro por nível (`Todos`, `Erros`, `Avisos`, `stderr`), busca com Regex (`.*`) e destaque, `Wrap`, `Hora`, `Pausar/Retomar`, `Auto-scroll` + botão *"Ir para o fim"*, copiar e baixar `.log`.
2. **Terminal Interativo**: Sessões `bash`/`sh` reais via `docker exec` com TTY (`@xterm/xterm` + `@xterm/addon-fit`) e redimensionamento automático.
3. **Inspeção & Telemetria ao Vivo**: CPU, RAM, rede RX/TX, PIDs, portas clicáveis, volumes, redes e variáveis de ambiente com mascaramento automático de segredos.
4. **Workspace Multi-Painel & Produtividade**: Divisão de painéis por drag-and-drop ou 1 clique, Paleta de Comandos (`Ctrl+K`), agrupamento por Docker Compose e tema Escuro/Claro.

## Como Rodar (Docker Compose)

O projeto roda com **dois containers separados** orquestrados pelo `docker-compose.yml`:
- `log-monitor-backend` (`backend/Dockerfile`): API REST + WebSocket em Go 1.23 na porta interna `8080`, conectada ao `/var/run/docker.sock` e com healthcheck em `/api/v1/health`.
- `log-monitor` (`frontend/Dockerfile`): Frontend React + Vite + TypeScript servido via Nginx na porta `80` (conectado à rede `rede-proxy`), fazendo proxy reverso de `/api/` e `/ws` para o container `backend`.

```bash
docker compose up -d --build
```

Para parar:

```bash
docker compose down
```
