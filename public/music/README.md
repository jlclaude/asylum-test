# Spin music

Place operator-owned `.mp3`, `.wav`, `.m4a`, or `.ogg` files in this folder, then add each file to `manifest.json`:

```json
[{ "id": "industrial-strike", "label": "Industrial Strike", "file": "/music/industrial-strike.mp3" }]
```

Use unique IDs and root-relative `/music/...` paths. Tracks may be any length because spin playback loops. For dependable streaming playback, use reasonably sized files (roughly 128–256 kbps for compressed audio); browser codec support varies, especially for M4A. The operator is responsible for obtaining all music and broadcast rights. Do not commit music without authorization.
