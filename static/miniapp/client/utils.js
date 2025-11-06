// Модуль: utils.js — отвечает за toArray(), initials(), debounce(), routeKeyFor()

export function toArray(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  if (typeof payload === 'object') {
    const data = payload.data && typeof payload.data === 'object' ? payload.data : null;
    const keys = ['results','items','data','objects','list','masters','rows','records'];
    for (const obj of [payload, data]) {
      if (!obj) continue;
      for (const k of keys) if (Array.isArray(obj[k])) return obj[k];
      for (const v of Object.values(obj)) if (Array.isArray(v)) return v;
    }
  }
  return [];
}

export const initials = (name='') =>
  name.trim().split(/\s+/).map(w=>w[0]).join('').toUpperCase().slice(0,2);

export const debounce = (fn, ms=120) => {
  let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); };
};

export const routeKeyFor = (name, p={})=>{
  const {masterId='', serviceId='', slotId=''} = p||{};
  return `${name}:${masterId}:${serviceId}:${slotId}`;
};