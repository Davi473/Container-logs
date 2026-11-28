import type {
  BatchActionResult,
  Container,
  ContainerAction,
  ContainerDetails,
} from '../../domain/entities/container';
import type { SystemInfo } from '../../domain/entities/telemetry';
import type { IContainerGateway } from '../../domain/ports/ports';

// Driven Adapter: Fetch-based HTTP implementation of IContainerGateway
export class FetchContainerGateway implements IContainerGateway {
  private readonly baseUrl: string;

  constructor(baseUrl = '/api/v1') {
    this.baseUrl = baseUrl;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
    const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `Falha na requisição (${res.status})`);
    }
    return data as T;
  }

  async listContainers(): Promise<Container[]> {
    const res = await this.request<{ ok: boolean; containers: Container[] }>('/containers');
    return res.containers || [];
  }

  async inspectContainer(id: string): Promise<ContainerDetails> {
    const res = await this.request<{ ok: boolean; details: ContainerDetails }>(
      `/containers/${encodeURIComponent(id)}/inspect`
    );
    return res.details;
  }

  async executeAction(id: string, action: ContainerAction): Promise<void> {
    await this.request(`/containers/${encodeURIComponent(id)}/actions/${encodeURIComponent(action)}`, {
      method: 'POST',
    });
  }

  async removeContainer(id: string, force: boolean): Promise<void> {
    await this.request(`/containers/${encodeURIComponent(id)}?force=${force ? 'true' : 'false'}`, {
      method: 'DELETE',
    });
  }

  async executeComposeAction(project: string, action: ContainerAction): Promise<BatchActionResult> {
    return this.request<BatchActionResult>(
      `/compose/${encodeURIComponent(project)}/actions/${encodeURIComponent(action)}`,
      { method: 'POST' }
    );
  }

  async removeComposeProject(project: string, force: boolean): Promise<BatchActionResult> {
    return this.request<BatchActionResult>(
      `/compose/${encodeURIComponent(project)}?force=${force ? 'true' : 'false'}`,
      { method: 'DELETE' }
    );
  }

  async getSystemInfo(): Promise<SystemInfo> {
    const res = await this.request<{ ok: boolean; info: SystemInfo }>('/system/info');
    return res.info;
  }
}
