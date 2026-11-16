import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  platform: process.platform
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
