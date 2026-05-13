# Resolvers

Place your Node.js resolver modules here.
Each file must export a plain object whose keys are namespace names:

  // utils.js
  module.exports = {
    utils: {
      getLanguage() { ... },
      translate(key, lang) { ... },
    }
  };

Functions are then callable as {{fn:utils.getLanguage()}} in templates or build.json.
Namespaces must be unique across all resolver files.
