// Gemeinsamer Zustand der Oberfläche.
import { todayISO } from './format.js';

export const state = {
  date: todayISO(), // angezeigter Tag auf „Heute“
};

let rerender = () => {};
export const setRerender = (fn) => (rerender = fn);
/** Aktuelle Hauptansicht neu zeichnen (nach Datenänderungen). */
export const refreshView = () => rerender();
