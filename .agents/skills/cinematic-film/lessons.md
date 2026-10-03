# Lessons

Rules learnt from real productions between July and October 2026, each with the situation that
taught it. Names, brands, colours and on-screen copy are left out; the numbers are as measured at
the time. `SKILL.md` section "Seven ways a film dies" is the short version of this file.

## Direction

1. **A brand nobody knows yet says what it does in the first two seconds, and keeps saying it.**
   A young product's first brand film ran 87 s at 72 BPM and showed the brand's name for the first
   time at 1:22; the founder called it slow and unclear. A 34 s cut that said what the product does
   in the first two seconds, in the product's own words, and built the list of what it does as each
   thing happened, read correctly to a cold viewer in one viewing.
2. **A code-drawn film drifts slow.** Every element is placed by hand, so each arrives on its own.
   The same film's recut started from 120 BPM and let several things move at once.
3. **Run the cold explain-back before anyone else sees a cut.** On that film a fresh agent reading
   timestamped frames, and a five-lens critic, had already predicted every point the founder made.
4. **A blank beat before the lockup is an exit.** The explain-back on the 34 s cut said it would have
   stopped watching at a full-frame colour field with nothing on it, 25 s in, so it never saw the
   closing line or the address. The critic scored that cut 6, 6, 6, 7 and 7 across its five lenses
   and would not ship it: the promise in the closing line was carried by the score and small print,
   not by the picture, and the framing barely changed between 4 s and 17 s.
5. **Read the product's source before concepting.** A comment in the product's code, describing
   how the interface colours an item as it changes state, stated the film's idea better than a
   concept round, and the code settled every state, label and layout rule the film needed.
6. **Build the peak on the word the category does not own.** Category research moved that film's
   peak from the benefit every competitor claimed to the one nobody in the category owned.
7. **Keep the engineering, never the costume.** A 54 s product film with one beatmap driving
   picture and a code-made score, every cut on the grid and numbers that reconciled, became a house
   standard. Three months later it read as a disciplined motion-graphics deck: default tech faces,
   decorative monospace chrome, a flat ground with no light or world, a hairline phone outline
   standing in for the product, no frame anyone would remember, and every feature left-brain (words
   on screen, a rhythmic bed, no character, no place). Measured then: 7 shots, mean 7.7 s, luma 37%,
   -15.3 LUFS, LRA 9.1 LU. A concept-led mechanic is necessary, not sufficient.
8. **Personalise the mechanic, not the costume.** That film was then made config-driven for
   twenty-odd prospect brands: six fixed scenes with the colours, copy and packshot swapped. A system
   that makes the same film for every brand is a template. If the structure survives a brand swap,
   the swap test fails.
9. **A new cut needs a new script, not a new costume.** Five cuts of one deck film shared one
   screenplay. Restyling it five times fixed nothing.
10. **Timing, sound and selection are the craft.** Short reels cut from raw phone vlog clips were a
    hit with the person who asked: about one second in ten of the source survived, the hook landed
    inside two seconds, every cut changed the picture, effects were placed from word timestamps and
    never over speech, pauses were cut rather than speech sped up, captions came in short chunks with
    the active word marked, two type sizes and one accent, and each reel ended on stillness. Real
    footage and ruthless editing beat generated spectacle.

## Gates and measurement

11. **Gate a band wherever more is not better.** A deck film's first cut was dead: 100 s, no cuts,
    80% frozen, mean luma 7.5%, flat audio. The next cut was built to pass ten numeric floors, scored
    19 of 19, and a viewer found it messy and hard to follow: a camera moving on a random seed every
    shot, 99 background threads, grain regenerating at 30 Hz. All uncorrelated motion, which is the
    definition of visual noise. A floor with no ceiling is an instruction to maximise.
12. **Every criterion that matters fails the build.** On that film ten criteria were enforced and
    fourteen were prose. Under pressure the ten became the whole specification and the fourteen were
    traded away: Goodhart's law inside one agent's workflow. For the same reason, a recorded manual
    pass, checkbox or sign-off beside executable checks is not independent judgement.
13. **If you cut, the cut must change the picture.** A rejected cut cut sixteen times and never
    changed more than a quarter of the frame (maximum cut strength 24.2%, against 40 to 82 for films
    that cut well). The viewer said it flowed badly. Below about 40% it wants to be a camera move.
14. **Build the instrument before judging the film, and prove it on a known case.** The accepted
    build came from a tool that let frames be seen, first checked against a cut whose mean luma was
    already recorded (it matched to the decimal), and from reading stills before every render. A
    48-cell contact sheet had hidden, at 200 px a cell, that one cut had no product in it at all.
15. **Prove the instrument before you accuse the film.** An onset check on a full mix reported the
    designed hits 80 to 180 ms early. The instrument was wrong: a 5 ms window on a low room tone
    jitters by 8 dB. Checked on the stems, every hit was on its frame.
16. **Calibrate a band on films you admire before trusting it.** The audit's lightest luma band
    failed four well-regarded light-mode product demos, so it gained a light-mode UI profile (195 to
    245) backed by those four films. A gate that fails the canon is measuring the wrong thing.
17. **Reviewers reading stills cannot feel a transition.** Two reviewers cut a 3D turn of the mark
    from that film; the founder, watching the moving film, liked that transition most, and it
    went back in. On a moment whose value is motion, a person's reaction to the moving film outranks
    a still-based critique.

## Product truth

18. **Product truth needs screen-specific evidence.** The fifth cut of the deck film reached the
    deck with an invented product world that did not match the real application, and with no audio.
    Generated or invented interface states never ship, and calling one "simulated" does not help.
19. **A film can be data with claims attached.** A 60 s in-browser demo film was built as data (a
    timeline, chapters, one clock, a function returning the state at any time) from the product's own
    interface components, and checked by more than 500 automated tests, including every chart claim
    against the product's shared data model.
20. **Import brand assets, never redraw them.** One film imported its symbol, mask, wordmark
    and 3D curve from the approved library with hashes. Its flat symbol was the 3D curve's exact front
    view, so cuts between the drawn line, the 3D object and the flat mark landed on the same shape.

## Craft

21. **Render every colour state on every ground it will meet.** The accent that marked a finished
    item vanished the moment the background's fill reached the same step of its colour ramp. Only a still at
    that exact step showed it.
22. **Style frames take rounds.** One film needed four rounds of stills, each fixing
    something only pixels showed.
23. **In a drawn film, draw steam as a shape.** Soft noise read as grey smoke and a noise-edged wipe
    as torn paper; a union of growing discs with an outline read as a drawn cloud
    ([references/procedural-graphics.md](references/procedural-graphics.md)).
24. **Clear what has done its job.** Leftover arrival lines cluttered every frame until each trail
    retracted once it had landed.
25. **A full spin of the mark is the cheap logo spin.** The mark's own behaviour, a sway, carried it
    instead: it leans past its hero pose and back.
26. **One geometry can carry a match cut.** The film's main space was the same rectangle as one item
    in the product's calendar, so the pull-back shrank one into the other and handed its label over.
27. **The score can be the data.** Each item of data was a note, and returning ones came back on the
    same notes, so sync was structural rather than adjusted.
28. **A held grid needs life.** A calendar grid held dead still for 6.1 s, over the 5.25 s band; the
    entries then filled across four seconds instead.
29. **A flat logo scaled up becomes a different object.** A logo's vector fill scaled up six times
    read as the wrong thing entirely, and 21 shots of the same picture with the data swapped did not
    make a montage.
30. **Default glass and glow read as slop on sight.** Dark frosted glass tilted 56 degrees with neon
    glows was rejected on sight as AI slop while it passed every numeric gate.
31. **A random field is not direction.** About 30 objects scattered with a seeded PRNG, with a camera
    pushed through them, measured fine and looked like debris; the opening nine seconds had no
    subject. Split the world into a few staged objects that carry every moment and a background
    field for parallax ([references/watching-video.md](references/watching-video.md) section 5).

## Sound

32. **Master with a limiter first and a linear trim last.** Two-pass `loudnorm` with `linear=true`
    turned a score with LRA 7.5 LU into 2.1 LU by falling back to dynamic mode without saying so.
    `npm run master -- <id>` limits first, iterates to target and fails unless the trim is linear.
33. **Silence is not a style.** Every rejected cut of the deck film had no audio stream at all, and
    every reference film it was measured against carried audio.

## Testing this skill

34. **Ask at most one question.** In pressure tests of this skill, plans that asked two or three
    questions handed the directing back to the person. One question, the rest stated as assumptions,
    and a default the person can switch, scored better on retest.
35. **An ambient loop is a state, not an event.** A plan that put a single burst event into a hero
    loop behind a headline, and left out `muted` and `playsinline`, lost a blind comparison to an
    older plan. These tests measure the plan a director writes, not the film.

## Engineering traps (all observed; the kit handles most of them)

| Trap | Symptom | Fix |
|---|---|---|
| A shader uniform declared in the fragment and auto-declared by the wrapper | "Shader compile failed" with an empty log, every frame | dedupe declarations; put the compiler log on the error's first line. Reverting the fix brought back `'u_amount' : redefinition` |
| `renderMedia({output})` | render reports success, no file exists | the key is `outputLocation` (`renderStill` uses `output`) |
| `@react-three/postprocessing` `<EffectComposer>` inside `<ThreeCanvas>` | an empty frame with any effect; the bare scene renders | drive `postprocessing` by hand, sized from the video config (`src/engine/three/Post.tsx`). Isolated, mechanism not explained |
| Two-pass `loudnorm` with `linear=true` | LRA 7.5 LU became 2.1: silent fallback to dynamic mode | gain plus a 4x-oversampled limiter, iterate to target, a final trim that must report `linear` |
| Wide default bloom | a dark brand ground visibly lifted towards olive beside a bright object | a high threshold, 5 mip levels, radius 0.6; sample the ground against the brand's hex value |
| Baked grain | a 16 s film at CRF 18 was 87 MB | light grain in the master; decide delivery grain separately (AV1 film-grain synthesis) |
| `import {Audio} from 'remotion'` | silently the deprecated HTML5 tag | import from `@remotion/media` |
| The default `--gl` backend | WebGL on the CPU, about 30x slower, looks identical | `npm run doctor` picks the backend that works; on the measured laptop it was `angle` |
| A loaded machine | Chrome failed to connect within 25 s in 2 of 9 runs | retry once; lower concurrency; bundle once per batch |
