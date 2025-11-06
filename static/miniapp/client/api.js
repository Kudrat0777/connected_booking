// Модуль: api.js — отвечает за api(), safeGet(), apiCached(), ApiCache

import { showLoading, toast } from './ui.js';

export let csrfToken = null;
export function setCsrfToken(token) { csrfToken = token || null; }

export async function api(url, init, { allow404 = false, fallback = null } = {}) {
  const opts = { ...(init || {}) };
  const method = (opts.method || 'GET').toUpperCase();

  const rawHeaders = opts.headers instanceof Headers
    ? Object.fromEntries(opts.headers.entries())
    : (opts.headers || {});

  if (method === 'POST') {
    opts.headers = {
      ...rawHeaders,
      'X-CSRF-Token': csrfToken || '',
    };
  } else {
    opts.headers = rawHeaders;
  }

  try {
    showLoading(true);
    const res  = await fetch(url, opts);
    const text = await res.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

    if (!res.ok) {
      if (allow404 && res.status === 404) {
        return fallback ?? (Array.isArray(fallback) ? [] : (fallback ?? {}));
      }

      if (res.status === 404)      toast('Данные не найдены');
      else if (res.status === 500) toast('Серверная ошибка. Попробуйте позже');
      else if (res.status >= 400 && res.status < 500) toast('Ошибка запроса. Проверьте данные');

      const err = new Error(`HTTP ${res.status} for ${url}`);
      err.status = res.status;
      err.body   = data;
      throw err;
    }

    return data;
  } catch (e) {
    if (!e?.status) toast('Нет соединения с сервером');
    console.error('[API ERROR]', e);
    throw e;
  } finally {
    showLoading(false);
  }
}

export async function safeGet(url, fallback) {
  try { return await api(url, undefined, {allow404:true, fallback}); }
  catch { return fallback; }
}

export const ApiCache = {
  key: '__cb_api_cache',
  ttl: 15000,
  _read(){ try{return JSON.parse(sessionStorage.getItem(this.key)||'{}')}catch{return{};} },
  _write(map){ try{ sessionStorage.setItem(this.key, JSON.stringify(map)); }catch{} },
  get(url){
    const map = this._read();
    const hit = map[url];
    if (!hit) return null;
    if (Date.now() - hit.t > this.ttl) { delete map[url]; this._write(map); return null; }
    return hit.data;
  },
  set(url, data){
    const map = this._read();
    map[url] = { t: Date.now(), data };
    this._write(map);
  }
};

export async function apiCached(url, init, opts){
  const method = (init?.method || 'GET').toUpperCase();
  const cacheable = method === 'GET';
  if (cacheable){
    const hit = ApiCache.get(url);
    if (hit) return hit;
  }
  const data = await api(url, init, opts);
  if (cacheable) ApiCache.set(url, data);
  return data;
}