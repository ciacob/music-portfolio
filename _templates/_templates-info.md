# Templates

Place your HTML (or any text) snippet files here.
Templates may contain:
  - Plain text / markup
  - Placeholders: {{some.ctx.path}}
  - Function calls: {{fn:namespace.functionName(arg1, arg2)}}

Snippets need not be complete files — they can be any stretch of a string.
They are composed via `resolve` steps in build.json.
