# Technical Notes

Pantheon runs as a local Node.js CLI. The default generation provider is Ollama. Style examples are stored as paths in `.pantheon/style.json`, while embeddings live in `.pantheon/style-index.json`.

The system should avoid copying full style examples into generated output. Generated artifacts should reference the style profile and the examples used.
