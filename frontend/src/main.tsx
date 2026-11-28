import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/global.css';
import './styles/theme-refined.css';
import { App } from './App';
import { FetchContainerGateway } from './infrastructure/http/fetchContainerGateway';
import { WebSocketRealtimeAdapter } from './infrastructure/ws/websocketAdapter';
import { LocalStorageAdapter } from './infrastructure/storage/localStorageAdapter';

// Composition Root: Dependency Injection wiring of Driven Adapters into Ports
const deps = {
  gateway: new FetchContainerGateway('/api/v1'),
  realtime: new WebSocketRealtimeAdapter(),
  storage: new LocalStorageAdapter(),
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App deps={deps} />
  </React.StrictMode>
);
