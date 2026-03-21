import { Injectable, signal } from '@angular/core';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

@Injectable({
  providedIn: 'root',
})
export class YjsDocumentService {
  private readonly doc: Y.Doc;
  private readonly provider: HocuspocusProvider;
  private readonly websocketUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
  private readonly _isConnected = signal(false);
  private readonly _isSynced = signal(false);

  public readonly isConnected = this._isConnected.asReadonly();
  public readonly isSynced = this._isSynced.asReadonly();

  constructor() {
    this.doc = new Y.Doc();
    this.provider = new HocuspocusProvider({
      url: this.websocketUrl,
      name: 'dev-anien',
      document: this.doc,
    });

    this.provider.on('status', ({ status }: { status: string }) => {
      const isConnected = status === 'connected';
      this._isConnected.set(isConnected);
      if (!isConnected) {
        this._isSynced.set(false);
      }
    });

    this.provider.on('synced', () => {
      this._isSynced.set(true);
    });
  }

  public getDoc(): Y.Doc {
    return this.doc;
  }

  public getMap<T>(name: string): Y.Map<T> {
    return this.doc.getMap(name) as Y.Map<T>;
  }

  public onSynced(callback: () => void): void {
    this.provider.on('synced', callback);
  }
}
