# The template film: "One clock"

The starter every new film copies (`npm run new-film -- <id>`). Nine seconds that show the patterns
worth keeping: `beatmap.ts` as the one clock, a shader wash, a line that draws itself, type that
lands on the beat, and `score.mjs` writing the soundtrack from the same beatmap.

| File | What |
|---|---|
| `film.ts` | the registration: id, title, size, frame rate, length |
| `beatmap.ts` | every frame number: sections, named moments, the audit profile |
| `Template.tsx` | the film, one shot (new films get a component named after them) |
| `theme.ts` | colours and type styles |
| `score.mjs` | the soundtrack, written to `public/films/template/score.wav` |
| `brief.md`, `treatment.md`, `expected.md` | the paper trail, filled in as an example (new films get blank ones) |

The generated `public/films/template/score.wav` ships with the kit so the template plays straight
away in Studio. `npm run score -- template` writes it again from the beatmap.
