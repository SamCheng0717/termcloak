# Security

Termcloak is designed to read local books without network access or telemetry. Book content is treated as untrusted terminal input and sanitized before rendering.

Do not include book text, private filenames, environment variables or full diagnostic archives in public reports. A useful report contains the Termcloak version, Node.js version, operating system, terminal name, reproduction steps and a minimal synthetic text sample.

Until a public security contact is configured, do not publish an exploit payload against a released version. Open a minimal issue asking for a private reporting channel.

Progress is stored in `~/.termcloak/progress.json`. Delete that directory to remove local reading history.
