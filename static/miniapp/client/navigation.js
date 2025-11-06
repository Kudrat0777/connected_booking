// Модуль: navigation.js — отвечает за Route, NavStack, ScrollMem и функции навигации

import { TG } from './telegram.js';
import { routeKeyFor } from './utils.js';
import { state } from './views/state.js';

export const $hero    = document.getElementById('hero');
export const $app     = document.getElementById('app-shell');
export const $content = document.getElementById('content');

export const Route = {
  key: 'cb_route',
  save(name, params={}){ try{ sessionStorage.setItem(this.key, JSON.stringify({name, params})) }catch{} },
  load(){ try{ return JSON.parse(sessionStorage.getItem(this.key)||'null') }catch{ return null } },
};

export const NavStack = {
  key: 'cb_stack',
  read(){ try{ return JSON.parse(sessionStorage.getItem(this.key)||'[]') }catch{ return [] } },
  write(arr){ try{ sessionStorage.setItem(this.key, JSON.stringify(arr)) }catch{} },
  clear(){ this.write([]); Route.save('home'); },
  push(entry){
    const arr = this.read();
    const last = arr[arr.length-1];
    const same = last && last.name === entry.name &&
                 JSON.stringify(last.params||{}) === JSON.stringify(entry.params||{});
    if (!same) { arr.push(entry); this.write(arr); }
    Route.save(entry.name, entry.params||{});
  },
  pop(){
    const arr = this.read();
    if (arr.length) arr.pop();
    this.write(arr);
    const top = arr[arr.length-1];
    Route.save(top?.name || 'home', top?.params || {});
    return top || null;
  }
};

export const ScrollMem = {
  key: '__cb_scroll',
  read(){ try{return JSON.parse(sessionStorage.getItem(this.key)||'{}')}catch{return{};} },
  write(map){ try{sessionStorage.setItem(this.key, JSON.stringify(map))}catch{} },
  save(k, y){ const m=this.read(); m[k]=y; this.write(m); },
  load(k){ const m=this.read(); return m[k]||0; }
};

export function markRoute(name, params={}){
  if (window.__RESTORING) { Route.save(name, params); return; }
  NavStack.push({ name, params });
}

export function bindTgBack(){
  const tg = TG(); if (!tg?.BackButton) return;
  tg.BackButton.show();
  tg.BackButton.offClick?.();
  tg.BackButton.onClick(goBackOrHero);
}
export function unbindTgBack(){
  const tg = TG(); if (!tg?.BackButton) return;
  tg.BackButton.offClick?.();
  tg.BackButton.hide();
}

const ViewStack = [];
let routeResolver = null; // (name) => () => viewFn()

export function setRouteResolver(fn) { routeResolver = fn; }

export function startFlow(fn){
  $hero.style.display = 'none';
  $app.style.display  = 'block';
  ViewStack.length = 0;
  navigate(fn);
}

export function navigate(viewFn){
  const cur = NavStack.read().slice(-1)[0];
  if (cur) ScrollMem.save(routeKeyFor(cur.name, cur.params), $content.scrollTop || 0);

  ViewStack.push(viewFn);
  viewFn();

  if (ViewStack.length > 1) bindTgBack(); else unbindTgBack();
}

export function goBackOrHero(){
  if (ViewStack.length > 1){
    const cur = NavStack.read().slice(-1)[0];
    if (cur) ScrollMem.save(routeKeyFor(cur.name, cur.params), $content.scrollTop || 0);

    ViewStack.pop();
    NavStack.pop();
    const top = ViewStack[ViewStack.length - 1];
    top && top();
  } else {
    $app.style.display  = 'none';
    $hero.style.display = 'flex';
    NavStack.clear();
  }
}

export function openByRoute(entry, first){
  const p = entry.params || {};
  // проставляем state по маршруту
  if (entry.name === 'master_profile') { state.masterId  = p.masterId ?? p.master ?? state.masterId; }
  if (entry.name === 'services')       { state.masterId  = p.masterId ?? p.master ?? state.masterId; }
  if (entry.name === 'slots')          { state.masterId  = p.masterId ?? p.master ?? state.masterId;
                                         state.serviceId = p.serviceId ?? p.service ?? state.serviceId; }
  if (entry.name === 'confirm')        { state.masterId  = p.masterId ?? p.master ?? state.masterId;
                                         state.serviceId = p.serviceId ?? p.service ?? state.serviceId;
                                         state.slotId    = p.slotId    ?? p.slot    ?? state.slotId; }

  const handlerFactory = routeResolver?.(entry.name);
  const fn = typeof handlerFactory === 'function' ? handlerFactory : routeResolver?.('masters');

  const go = (f) => first ? startFlow(f) : navigate(f);
  go(fn);
}

export function restoreFromStack(){
  const stack = NavStack.read();
  if (!stack.length) return false;
  window.__RESTORING = true;
  try{
    openByRoute(stack[0], true);
    for (let i=1;i<stack.length;i++) openByRoute(stack[i], false);
  } finally {
    window.__RESTORING = false;
  }
  return true;
}