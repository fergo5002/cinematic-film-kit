# Reviews of the example film

How the example was judged, what the reviewers said and what changed because of it. This is the
record every film in the kit should keep (`src/films/<id>/reviews.md`). The reviewers were fresh
agents that saw only the review packet (contact sheets one frame every 1.25 s and a list of what
can be heard), never the brief or the code.

## The finished film

`hark.mp4`, made by `npm run release -- hark`: 22.0 s, 1920x1080, 24 fps, H.264 at 8.0 Mbps with
AAC, BT.709. Every release step passed. Film audit: 15 passed, 1 warning, 0 failed. The warning is
the worst concentration run, 0.297 at 14.3 s against a floor of 0.3, a check the audit itself says
cannot tell a deliberate camera move from noise. Integrated loudness -16 LUFS, loudness range
10 LU, true peak -1.9 dBTP; mean luminance in the standard band; the closing hold is the longest
settled run; three quarters of the frames move.

## Round 1: cold explain-back

The viewer recovered the product, all three claims in order and the sequence of events. The
moment it understood: "the scribble sorted into six tidy coloured rows with names. That's when I
got it." It also reported:

| What it said | What changed |
|---|---|
| "An app or gadget (the film never shows which)" | the close now says "The Hark app, for iPhone and Android" |
| The blackbird's icon "is dark on dark all the way through" | birds on the card are outlined in their own colour |
| "The labels have lines running through them" | once the lanes begin, no trace crosses the label column |
| The woodpigeon "is cut off by the top of the frame" | its branch came down |
| "Whose 19 mornings?" The robin's row ran unbroken for 21 | the robin misses one morning; the note names the wren |
| Sound off, "I might scroll in the first second, when it's a near-empty black box" | the line and the robin's song start on the first frame; the card starts compact and grows |

## Round 2: five-lens critic

Scores out of 10 against the best launch films: composition 5, comprehension 6, pacing 6, sound 7
(provisional, from the event list), brand truth 6. It would not have shipped that cut as the
brand's film or as the kit's example: "examples get copied and this one would teach unreadable type
and time spent in the wrong places."

| What it said | What changed |
|---|---|
| Five names in four seconds, pills too small to read on a phone, Latin unreadable | pills twice the size, each held a second; the Latin left the chips; a medium shot instead of the full wide, so every bird lands in view |
| "A three-note coo is a collared dove's song. A woodpigeon's phrase is five notes" | the woodpigeon sings five notes everywhere |
| The fold from lanes to today "gets under 1.25 s", while the diary then holds too long | the fold takes a beat and a half; the hold is shorter |
| "No words say it keeps a diary" | "And it keeps a diary of your mornings." |
| The garden "could front any nature app"; the card speaks field guide and the garden does not | the trees are drawn as a printed plate: an ink line over a wash set slightly off it |
| The opening card nearly touches the bottom edge and the headline nearly touches the card | reframed with margins on every side |

Not changed, and why: the critic suggested each bird land level with its own name on the card;
that would have meant a garden laid out around the interface rather than around the trees. A paper
grain over the garden was tried and removed: the overlay hid the sky (the blend could not reach a
separate canvas underneath).

## Instruments, checked

The audit first failed this film for being "100% active" although its last two seconds were
measurably still. The fault was in the audit, not the film: ffmpeg's freeze detection never reports
the end of a freeze that lasts to the end of the file. The audit now closes it at the file's end;
with the old audit the film fails, with the fix it passes.

## Not verified

Nobody has listened to the score on speakers or headphones; it was checked as numbers and as
spectrograms. The birdsong is synthesised and stylised: a birder will hear it. The film has not
been watched on a phone.
