// 生物接口层：behavior.js 只认 K.creature，不再直接依赖 K.cat。
// 这样猫 / 像素八爪鱼只要实现同一组接口，就能随时互换，行为层不用改。
'use strict';
(() => {
  const registry = {};        // id -> 生物实现对象
  let currentId = null;       // 当前生效的实现 id

  // 稳定代理：behavior.js 只在启动时拿到它一次；切换实现时代理不变，
  // 内部把属性读写转发给当前实现，所以行为层无需重新绑定。
  const api = new Proxy({}, {
    get(_t, prop) {
      const impl = registry[currentId];
      if (!impl) return undefined;
      const v = impl[prop];
      // 方法要绑回实现对象，避免 this 指向代理本身
      return typeof v === 'function' ? v.bind(impl) : v;
    },
    set(_t, prop, value) {
      const impl = registry[currentId];
      if (impl) impl[prop] = value;
      return true;
    },
    has(_t, prop) {
      const impl = registry[currentId];
      return !!impl && (prop in impl);
    },
  });

  K.creature = api;
  K.creatures = registry;

  // 切换可见性：只显示当前生物。优先用实现自带的 setVisible（猫的手臂/尾巴挂在 scene
  // 下，body.visible 盖不到），否则退回直接设 body.visible。
  function syncVisible() {
    for (const key of Object.keys(registry)) {
      const impl = registry[key];
      const show = key === currentId;
      if (impl.setVisible) impl.setVisible(show);
      else if (impl.body) impl.body.visible = show;
    }
  }

  // 注册一个实现。第一个注册自动成为默认。
  K.registerCreature = function (id, impl) {
    if (!id || !impl) return;
    registry[id] = impl;
    if (currentId === null) currentId = id;
    syncVisible();  // 新实现加入时立即按当前选择互斥显示
  };

  // 切换当前生物；返回是否成功。
  K.setCreature = function (id) {
    if (!registry[id]) return false;
    currentId = id;
    syncVisible();
    return true;
  };

  K.currentCreatureId = function () { return currentId; };
})();
