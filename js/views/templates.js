// Liste der Mahlzeit-Vorlagen: antippen trägt ein, Papierkorb löscht.
import { h, icon, openScreen, closeAllScreens, toast, confirmAction } from '../ui.js';
import { refreshView } from '../state.js';
import { fmtKcal, fmtDateLong } from '../format.js';
import { totalsOf, deleteEntry, mealLabel } from '../log.js';
import { listTemplates, applyTemplate, deleteTemplate } from '../templates.js';

export function openTemplates(ctx) {
  return openScreen({
    title: `Vorlagen · ${mealLabel(ctx.meal)}`,
    async render(body) {
      const list = h('div', { class: 'list' });
      const draw = async () => {
        const templates = await listTemplates();
        if (!templates.length) {
          list.replaceChildren(h('p', { class: 'empty' },
            'Noch keine Vorlagen. Trag eine Mahlzeit ein und wähle bei ihr unter „…“ den Punkt „Als Vorlage speichern“.'));
          return;
        }
        list.replaceChildren(...templates.map((t) => h('div', { class: 'list-item' },
          h('button', { class: 'main template-pick', onclick: () => use(t) },
            h('span', { class: 'title' }, t.name),
            h('span', { class: 'sub' }, t.items.map((i) => i.name).join(', ')),
          ),
          h('span', { class: 'value' }, `${fmtKcal(totalsOf(t.items).kcal)} kcal`, h('small', null, `${t.items.length} ${t.items.length === 1 ? 'Eintrag' : 'Einträge'}`)),
          h('button', { class: 'btn-icon', 'aria-label': `Vorlage ${t.name} löschen`, onclick: async () => {
            if (!(await confirmAction(`Vorlage „${t.name}“ löschen? Bereits eingetragene Tage bleiben unverändert.`, 'Löschen', true))) return;
            await deleteTemplate(t.id);
            draw();
          } }, icon('trash')),
        )));
      };
      const use = async (t) => {
        const created = await applyTemplate(t, ctx);
        closeAllScreens();
        refreshView();
        toast(`${t.name} eingetragen (${fmtDateLong(ctx.date)}, ${mealLabel(ctx.meal)})`, {
          action: 'Rückgängig',
          onAction: async () => { for (const e of created) await deleteEntry(e.id); refreshView(); },
        });
      };
      body.append(h('div', { class: 'card' }, list));
      await draw();
    },
  });
}
