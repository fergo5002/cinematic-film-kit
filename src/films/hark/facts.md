# Facts

For a real product this file holds what is true about it, each fact with its source, and the
evidence for every screen the film shows (current, privacy-safe captures of the real interface).
Hark is made up, so its facts are invented and labelled as such; the film must still be
consistent with them.

## About the product (invented)

- Hark is a phone app, for iPhone and Android. It listens through the phone's microphone and names
  the birds it hears, with the Latin name.
- It shows what it hears as it hears it, and marks each bird's song in that bird's colour once
  it knows it.
- It can separate several birds singing at once.
- It keeps a diary: which birds were heard on which mornings, and streaks.

## About the birds (real, and the film keeps to them)

| Bird | Latin name | What its song looks like and sounds like |
|---|---|---|
| Robin | Erithacus rubecula | thin, high, liquid phrases of short notes with sudden jumps, about 3 to 8 kHz |
| Wren | Troglodytes troglodytes | loud for its size; fast trills, about 4 to 8 kHz |
| Blackbird | Turdus merula | low, fluty, slurred notes around 1.5 to 3 kHz, often ending in a quiet scratchy twitter |
| Great tit | Parus major | a repeated two-note "tea-cher", high then lower |
| Chaffinch | Fringilla coelebs | a falling run of notes that speeds up and ends in a flourish |
| Woodpigeon | Columba palumbus | a low, breathy five-note coo, the second note longest |

The film's birdsong is synthesised from these descriptions (`birds.mjs`), checked on a
spectrogram, not recorded. A birder will hear that it is stylised.

## Consistency the film must keep

- The diary's numbers reconcile: the wren is heard on 19 mornings in a row (3 to 21 May), the note
  says so, and no other bird has a longer run (the robin missed the 10th).
- Today is 21 May; days after it are empty.
- Every dot and line on the card is computed from the soundtrack (`score.mjs` writes both).
