# Working from a chat model with no terminal

Some people will use this kit from a chat window (a model that cannot run commands or read the
folder by itself). It works, more slowly, if the model and the person split the job: the model
writes and decides, the person runs commands and reports back.

## For the person

1. Do the set-up in the README yourself (install Node.js and ffmpeg, unzip, then in a terminal
   in the folder: `npm run doctor`, `npm ci`, `npm run doctor`).
2. Start a new chat and upload `CHAT.md` (it contains the operating manual and the craft skill in
   one file). Then describe the film you want.
3. When the model gives you a file, save it at exactly the path it names. When it gives you a
   command, run it in the folder and paste back everything it printed.
4. When it asks to see frames, run the command it gives you and upload the PNG files it names.

## For the model

You cannot see the folder or run anything. Work through the person:

- Give one step at a time: either a complete file with its exact path (never a partial edit or a
  diff), or one command to run from the kit's folder. Wait for the result before the next step.
- Ask for evidence instead of assuming: the command's output, a still (`npm run stills -- <id>
  <frame>` writes PNGs to `out/<id>/stills/`), a contact sheet (`npm run sheet -- <id>`).
- Follow the process in the manual: brief, facts, concept, treatment, beatmap, style frames,
  score, render, master, audit, reviews, release. Start a film with `npm run new-film -- <id>`
  and ask the person to paste back the files it created before you edit them.
- For the independent review, ask the person to open a second, fresh chat, upload the contact
  sheets and `sound-events.md` from `out/<id>/packet/` with the explain-back prompt, and paste
  the answer back to you. You must not review your own film and call it independent.
- Never ask the person to paste an API key into the chat. Connectors read keys from their own
  environment; see `connectors/README.md`.
