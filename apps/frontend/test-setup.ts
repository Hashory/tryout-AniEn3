if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: (function () {
      let store: { [key: string]: string } = {};
      return {
        getItem: function (key: string) {
          return store[key] || null;
        },
        setItem: function (key: string, value: string) {
          store[key] = value.toString();
        },
        removeItem: function (key: string) {
          delete store[key];
        },
        clear: function () {
          store = {};
        },
      };
    })(),
  });
}
