# Label font

`CommissionerLabel.ttf` is the face ffmpeg's `drawtext` filter uses for the timestamps on contact
sheets (`tools/sheet.mjs`, `tools/packet.mjs`, `tools/shotwatch.mjs`). FreeType cannot be relied on
to read WOFF2, and a variable font draws its default instance, which for Commissioner is Thin.

It is a Modified Version of Commissioner 1.001 (`public/fonts/Commissioner.woff2`): a static
instance at weight 600, subset to Latin-1, renamed "Commissioner Label". Commissioner declares no
Reserved Font Name. Licence: SIL Open Font License 1.1, in `CommissionerLabel-OFL.txt` beside it.
