# WATT Managed AI WebView 站点对接指南

本文档面向运行在 WATT App WebView 中的站点开发者，说明站点如何读取 App 注入的 AI 配置。

当前适用站点：

- 钓鱼大师：`https://rink1969.github.io/fishing-game/`
- 你画我猜：`https://rink1969.github.io/draw-it-ill-guess-lumavill/`

## 1. 注入协议

WATT App 会在页面主窗口挂载 `window.__WATT_HOST__`：

```ts
export type WattManagedAiHost = {
  ai: {
    apiKey: string;
    endpoint: string;
    model: string;
    provider: string;
  };
  capabilities: Record<string, never>;
  mode: "managed";
};

declare global {
  interface Window {
    __WATT_HOST__?: WattManagedAiHost;
  }
}
```

当前字段值：

| 字段 | 说明 |
| --- | --- |
| `ai.apiKey` | WATT App 获取的 AI API 凭据 |
| `ai.endpoint` | AI 服务基础地址，具体值由 App 配置接口返回 |
| `ai.model` | 当前为 `watt-professional` |
| `ai.provider` | 当前为 `WATT` |
| `capabilities` | 当前为空对象，暂未开放额外 Native 能力 |
| `mode` | 固定为 `managed`，表示配置由 WATT App 托管 |

当前协议没有 `version` 字段，也没有向 localStorage 写入配置。

## 2. 初始化时机

App 会尝试在网页业务脚本执行前注入配置，并在页面加载完成后再次注入。每次注入都会派发：

```ts
window.dispatchEvent(
  new CustomEvent("watt:host-ready", {
    detail: window.__WATT_HOST__,
  }),
);
```

站点需要同时支持以下两种情况：

1. 页面脚本启动时 `window.__WATT_HOST__` 已存在，直接读取。
2. 页面脚本启动时配置尚不可用，监听 `watt:host-ready`。

事件可能派发多次，因此初始化逻辑必须可以重复执行。不要只监听事件而跳过首次同步读取，因为首次事件可能早于站点脚本注册监听器。

## 3. React 接入示例

建议封装为一个站点内部 hook：

```tsx
import { useEffect, useState } from "react";

export type WattManagedAiHost = {
  ai: {
    apiKey: string;
    endpoint: string;
    model: string;
    provider: string;
  };
  capabilities: Record<string, never>;
  mode: "managed";
};

declare global {
  interface Window {
    __WATT_HOST__?: WattManagedAiHost;
  }
}

function readWattHost() {
  return window.__WATT_HOST__ ?? null;
}

export function useWattHost() {
  const [host, setHost] = useState<WattManagedAiHost | null>(readWattHost);

  useEffect(() => {
    const syncHost = () => {
      setHost(readWattHost());
    };

    syncHost();
    window.addEventListener("watt:host-ready", syncHost);

    return () => {
      window.removeEventListener("watt:host-ready", syncHost);
    };
  }, []);

  return host;
}
```

页面中使用：

```tsx
export function GameApp() {
  const wattHost = useWattHost();

  if (!wattHost) {
    return <div>请在 WATT App 中打开此应用</div>;
  }

  return (
    <Game
      aiConfig={{
        apiKey: wattHost.ai.apiKey,
        baseURL: wattHost.ai.endpoint,
        model: wattHost.ai.model,
        provider: wattHost.ai.provider,
      }}
    />
  );
}
```

`Game` 代表站点自己的业务组件；站点应把 `endpoint`、`apiKey` 和 `model` 传给现有 AI 客户端。具体请求路径、请求体和流式协议不属于本注入协议，应以站点所使用 AI 客户端的接口约定为准。

## 4. 原生 JavaScript 接入示例

```js
function initializeWithWattHost() {
  const host = window.__WATT_HOST__;

  if (!host) {
    return false;
  }

  initializeGameAi({
    apiKey: host.ai.apiKey,
    baseURL: host.ai.endpoint,
    model: host.ai.model,
    provider: host.ai.provider,
  });

  return true;
}

initializeWithWattHost();

window.addEventListener("watt:host-ready", () => {
  initializeWithWattHost();
});
```

`initializeGameAi` 必须支持重复调用，或自行判断相同配置是否已经初始化。

## 5. 运行环境与降级

- 在普通浏览器直接打开站点时，不存在 `window.__WATT_HOST__`。
- 站点可以保留自己的开发环境配置，但 WATT 托管模式下应优先使用 `window.__WATT_HOST__.ai`。
- 如果 Host 不存在，生产页面应显示明确提示，不要无限等待。
- App 只有在 endpoint 和 API key 均有效时才会加载 WebView；配置加载失败由 App 展示错误和重试入口。
- WebView 只允许停留在各自站点路径及其 query、hash 和子路径内，跨项目路径或跨域跳转会被 App 阻止。

## 6. 安全要求

`ai.apiKey` 属于敏感数据。站点必须遵守：

- 不将 API key 写入 localStorage、sessionStorage、IndexedDB、Cookie 或其他持久化介质。
- 不在控制台、错误上报、埋点、分析平台或用户界面中输出 API key。
- 不将 Host 配置转发给非 WATT endpoint 或第三方服务。
- 不把 Host 配置放入 URL、query、hash 或跨窗口消息。
- 页面卸载时清理持有配置的长生命周期对象、定时器和请求客户端。

## 7. 当前不支持的能力

两个游戏页面当前只注入 AI 配置，不包含 Lumi 页面已有的照片保存桥接。因此请勿依赖：

- `window.__WATT_HOST__.postMessage`
- `window.__WATT_HOST__.request`
- `window.__WATT_HOST__.savePhotoToLibrary`
- `window.__WATT_HOST__.onNativeMessage`
- `watt:host-message`
- `watt:lumi:savePhotoResult`

如果后续需要 Native 能力，应先扩展并确认协议，不要复用未声明的 Lumi 私有事件。

## 8. 对接验收清单

- [ ] 在 WATT App 中打开页面后，可以读取完整的 `window.__WATT_HOST__.ai`。
- [ ] 页面首次读取和 `watt:host-ready` 事件两条路径都能完成初始化。
- [ ] 重复收到 `watt:host-ready` 不会重复创建任务、监听器或请求。
- [ ] 普通浏览器中没有 Host 时展示明确的非托管环境提示。
- [ ] AI 请求使用注入的 endpoint、apiKey 和 model。
- [ ] 页面及监控系统不会记录、持久化或转发 API key。
- [ ] 刷新页面后可以重新完成 Host 初始化。
