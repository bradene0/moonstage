# moonstage-plugin-__SLUG__

__NAME__: a [Moonstage](https://github.com/bradene0/moonstage) plugin.

## Use it in a project

```bash
npm install moonstage-plugin-__SLUG__
```

```json
"plugins": {
  "__SLUG__": { "module": "moonstage-plugin-__SLUG__", "config": { "speed": 1 } }
}
```

Mark entities with `"extensions": { "__SLUG__": { "amplitude": 8 } }`.

During development you can also copy `index.js` into a project and register it as
`{ "module": "./plugins/__SLUG__.js" }`.

## Develop

```bash
npm install
npm test            # conformance suite through node:test
npm run check       # the same suite through `moonstage plugin check`
```
