import { Injectable } from '@angular/core';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

@Injectable({
  providedIn: 'root',
})
export class YjsDocumentService {
  private readonly doc: Y.Doc;
  private readonly provider: HocuspocusProvider;
  private readonly channels = new Map<string, BroadcastChannel>();

  constructor() {
    this.doc = new Y.Doc();
    this.provider = new HocuspocusProvider({
      url: 'ws://127.0.0.1:14202',
      name: 'dev-anien',
      document: this.doc,
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

  public getBroadcastChannel(name: string): BroadcastChannel {
    const existing = this.channels.get(name);
    if (existing) {
      return existing;
    }
    const channel = new BroadcastChannel(name);
    this.channels.set(name, channel);
    return channel;
  }
}
