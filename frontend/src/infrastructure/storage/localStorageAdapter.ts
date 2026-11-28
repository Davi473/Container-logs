import type { IStoragePort } from '../../domain/ports/ports';

export class LocalStorageAdapter implements IStoragePort {
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignore storage quota / privacy mode errors
    }
  }
}
