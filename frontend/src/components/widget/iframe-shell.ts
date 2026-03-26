/**
 * iframe-shell — Shared iframe utilities for widget rendering
 *
 * Extracted from WidgetPanel so both InlineWidget and WidgetPanel
 * can reuse the same iframe shell, CSP, theme sync, and validation helpers.
 */

export interface WidgetThemeMessage {
  colorScheme: 'light' | 'dark'
  vars: Record<string, string>
}

export const IFRAME_CSP = [
  "default-src 'none'",
  "img-src data: blob: https:",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
].join('; ')

const LIGHT_SUCCESS = '#10b981'
const LIGHT_WARNING = '#f59e0b'
const LIGHT_DANGER = '#ef4444'
const DARK_SUCCESS = '#34d399'
const DARK_WARNING = '#fbbf24'
const DARK_DANGER = '#f87171'

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function isSerializablePayload(value: unknown, depth = 0): boolean {
  if (depth > 8) return false
  if (value == null) return true
  const valueType = typeof value
  if (valueType === 'string' || valueType === 'boolean') return true
  if (valueType === 'number') return Number.isFinite(value as number)
  if (Array.isArray(value)) {
    return value.length <= 200 && value.every((item) => isSerializablePayload(item, depth + 1))
  }
  if (!isPlainObject(value)) return false
  const entries = Object.entries(value)
  if (entries.length > 200) return false
  return entries.every(([key, item]) => key.length <= 200 && isSerializablePayload(item, depth + 1))
}

function readCssVar(style: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = style.getPropertyValue(name).trim()
  return value || fallback
}

export function readHostWidgetTheme(): WidgetThemeMessage {
  if (typeof document === 'undefined') {
    return {
      colorScheme: 'light',
      vars: {
        '--color-bg': '#ffffff',
        '--color-surface': '#f8f9fa',
        '--color-text': '#1a1a2e',
        '--color-text-muted': '#6b7280',
        '--color-accent': '#7c3aed',
        '--color-border': '#e5e7eb',
        '--color-success': LIGHT_SUCCESS,
        '--color-warning': LIGHT_WARNING,
        '--color-danger': LIGHT_DANGER,
      },
    }
  }

  const root = document.documentElement
  const body = document.body
  const style = getComputedStyle(root)
  const isDark = root.classList.contains('dark') || body?.classList.contains('dark') || false

  return {
    colorScheme: isDark ? 'dark' : 'light',
    vars: {
      '--color-bg': readCssVar(style, '--background', isDark ? '#1a1a2e' : '#ffffff'),
      '--color-surface': readCssVar(style, '--card', isDark ? '#252540' : '#f8f9fa'),
      '--color-text': readCssVar(style, '--foreground', isDark ? '#e5e7eb' : '#1a1a2e'),
      '--color-text-muted': readCssVar(style, '--muted-foreground', isDark ? '#9ca3af' : '#6b7280'),
      '--color-accent': readCssVar(style, '--primary', isDark ? '#a78bfa' : '#7c3aed'),
      '--color-border': readCssVar(style, '--border', isDark ? '#374151' : '#e5e7eb'),
      '--color-success': isDark ? DARK_SUCCESS : LIGHT_SUCCESS,
      '--color-warning': isDark ? DARK_WARNING : LIGHT_WARNING,
      '--color-danger': isDark ? DARK_DANGER : LIGHT_DANGER,
    },
  }
}

export interface BuildIframeShellOptions {
  /** When true, inject height reporting via postMessage after each render */
  reportHeight?: boolean
}

export function buildIframeShellDoc(widgetId: string, options?: BuildIframeShellOptions): string {
  const heightReportSnippet = options?.reportHeight
    ? `
          var newHeight = document.body.scrollHeight;
          window.parent.postMessage({
            type: 'widget-resize',
            source: 'laborany-widget',
            widgetId: widgetId,
            height: newHeight
          }, '*');`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${IFRAME_CSP}">
  <style>
    :root {
      --color-bg: #ffffff;
      --color-surface: #f8f9fa;
      --color-text: #1a1a2e;
      --color-text-muted: #6b7280;
      --color-accent: #7c3aed;
      --color-border: #e5e7eb;
      --color-success: #10b981;
      --color-warning: #f59e0b;
      --color-danger: #ef4444;
      color-scheme: light;
    }
    * {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      min-height: 100%;
      background: var(--color-bg);
      color: var(--color-text);
      font-family: system-ui, -apple-system, sans-serif;
    }
    body {
      padding: 16px;
    }
    #widget-root {
      min-height: ${options?.reportHeight ? '0' : 'calc(100vh - 32px)'};
    }
    #widget-root[data-render-phase="streaming"] > * {
      animation: laborany-widget-fade 180ms ease-out;
    }
    @keyframes laborany-widget-fade {
      from {
        opacity: 0.72;
        transform: translateY(3px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  </style>
  <script>
    (function() {
      var widgetId = ${JSON.stringify('__WIDGET_ID__')};
      var root = null;
      var latestRender = null;
      var renderFrame = 0;

      function ensureRoot() {
        if (!root) {
          root = document.getElementById('widget-root');
        }
        return root;
      }

      function isSandboxStorageError(value) {
        var message = String(value || '');
        return /Failed to read the '(?:localStorage|sessionStorage)' property from 'Window'/i.test(message)
          || /document is sandboxed and lacks the 'allow-same-origin' flag/i.test(message);
      }

      function createMemoryStorage() {
        var store = Object.create(null);
        return {
          get length() {
            return Object.keys(store).length;
          },
          clear: function() {
            store = Object.create(null);
          },
          getItem: function(key) {
            return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
          },
          key: function(index) {
            var keys = Object.keys(store);
            return typeof index === 'number' && index >= 0 && index < keys.length ? keys[index] : null;
          },
          removeItem: function(key) {
            delete store[key];
          },
          setItem: function(key, value) {
            store[String(key)] = String(value);
          }
        };
      }

      function installStorageShim() {
        try {
          var memoryLocalStorage = createMemoryStorage();
          var memorySessionStorage = createMemoryStorage();
          Object.defineProperty(window, 'localStorage', {
            configurable: true,
            enumerable: false,
            value: memoryLocalStorage
          });
          Object.defineProperty(window, 'sessionStorage', {
            configurable: true,
            enumerable: false,
            value: memorySessionStorage
          });
        } catch (error) {
          // Ignore shim install failures and let the sandbox defaults apply.
        }
      }

      function installErrorGuards() {
        window.addEventListener('error', function(event) {
          var message = event && (event.message || (event.error && event.error.message));
          if (!isSandboxStorageError(message)) return;
          event.preventDefault();
          event.stopImmediatePropagation();
        }, true);
        window.addEventListener('unhandledrejection', function(event) {
          var reason = event && event.reason;
          var message = reason && (reason.message || String(reason));
          if (!isSandboxStorageError(message)) return;
          event.preventDefault();
        }, true);
      }

      function installAgentBridge() {
        var userActivated = false;
        var markActivated = function(event) {
          if (!event || event.isTrusted !== true) return;
          userActivated = true;
        };

        ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'input', 'change', 'click'].forEach(function(type) {
          document.addEventListener(type, markActivated, true);
        });

        window.sendToAgent = function(data) {
          if (!userActivated) return;
          window.parent.postMessage(
            {
              type: 'widget_interaction',
              source: 'laborany-widget',
              widgetId: widgetId,
              payload: data
            },
            '*'
          );
        };
      }

      function applyTheme(theme) {
        if (!theme || typeof theme !== 'object') return;
        var vars = theme.vars;
        if (vars && typeof vars === 'object') {
          Object.keys(vars).forEach(function(key) {
            document.documentElement.style.setProperty(key, String(vars[key]));
          });
        }
        if (theme.colorScheme === 'dark' || theme.colorScheme === 'light') {
          document.documentElement.style.colorScheme = theme.colorScheme;
        }
      }

      function replaceScriptNode(node) {
        if (!node || !node.parentNode) return;
        var replacement = document.createElement('script');
        Array.prototype.forEach.call(node.attributes, function(attr) {
          replacement.setAttribute(attr.name, attr.value);
        });
        replacement.textContent = node.textContent || '';
        node.parentNode.replaceChild(replacement, node);
      }

      function getNodeKey(node) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return '';
        var element = node;
        return (
          element.getAttribute('data-widget-key')
          || element.getAttribute('id')
          || ''
        );
      }

      function syncAttributes(fromEl, toEl) {
        var seen = Object.create(null);

        Array.prototype.forEach.call(toEl.attributes, function(attr) {
          seen[attr.name] = true;
          if (fromEl.getAttribute(attr.name) !== attr.value) {
            fromEl.setAttribute(attr.name, attr.value);
          }
        });

        Array.prototype.slice.call(fromEl.attributes).forEach(function(attr) {
          if (!seen[attr.name]) {
            fromEl.removeAttribute(attr.name);
          }
        });
      }

      function syncFormState(fromEl, toEl) {
        var tagName = fromEl.tagName;
        if (tagName === 'INPUT') {
          if (toEl.type === 'checkbox' || toEl.type === 'radio') {
            fromEl.checked = toEl.checked;
          } else if (fromEl.value !== toEl.value) {
            fromEl.value = toEl.value;
          }
          return;
        }

        if (tagName === 'TEXTAREA') {
          if (fromEl.value !== toEl.value) {
            fromEl.value = toEl.value;
          }
          return;
        }

        if (tagName === 'SELECT') {
          fromEl.selectedIndex = toEl.selectedIndex;
        }
      }

      function canMorphNode(fromNode, toNode) {
        if (!fromNode || !toNode) return false;
        if (fromNode.nodeType !== toNode.nodeType) return false;
        if (fromNode.nodeType === Node.ELEMENT_NODE) {
          return fromNode.tagName === toNode.tagName;
        }
        return true;
      }

      function cloneNodeForInsert(node, runScripts) {
        if (!node) return null;
        if (!runScripts && node.nodeType === Node.ELEMENT_NODE && node.tagName === 'SCRIPT') {
          return null;
        }
        return node.cloneNode(true);
      }

      function morphNode(fromNode, toNode, runScripts) {
        if (!canMorphNode(fromNode, toNode)) {
          var replacement = cloneNodeForInsert(toNode, runScripts);
          if (replacement) {
            fromNode.parentNode.replaceChild(replacement, fromNode);
          } else if (fromNode.parentNode) {
            fromNode.parentNode.removeChild(fromNode);
          }
          return;
        }

        if (fromNode.nodeType === Node.TEXT_NODE || fromNode.nodeType === Node.COMMENT_NODE) {
          if (fromNode.textContent !== toNode.textContent) {
            fromNode.textContent = toNode.textContent;
          }
          return;
        }

        syncAttributes(fromNode, toNode);
        syncFormState(fromNode, toNode);
        morphChildren(fromNode, toNode, runScripts);
      }

      function morphChildren(fromParent, toParent, runScripts) {
        var oldChildren = Array.prototype.slice.call(fromParent.childNodes);
        var newChildren = Array.prototype.slice.call(toParent.childNodes);
        var keyedOld = Object.create(null);

        oldChildren.forEach(function(child) {
          var key = getNodeKey(child);
          if (!key) return;
          keyedOld[key] = child;
        });

        var cursor = fromParent.firstChild;

        newChildren.forEach(function(newChild) {
          if (!runScripts && newChild.nodeType === Node.ELEMENT_NODE && newChild.tagName === 'SCRIPT') {
            return;
          }

          var matched = null;
          var key = getNodeKey(newChild);

          if (key && keyedOld[key]) {
            matched = keyedOld[key];
            delete keyedOld[key];
          } else if (cursor) {
            matched = cursor;
          }

          if (!matched) {
            var appended = cloneNodeForInsert(newChild, runScripts);
            if (appended) {
              fromParent.appendChild(appended);
            }
            return;
          }

          if (matched !== cursor) {
            fromParent.insertBefore(matched, cursor);
          }

          if (canMorphNode(matched, newChild)) {
            morphNode(matched, newChild, runScripts);
            cursor = matched.nextSibling;
            return;
          }

          var replacement = cloneNodeForInsert(newChild, runScripts);
          if (replacement) {
            fromParent.replaceChild(replacement, matched);
            cursor = replacement.nextSibling;
          } else {
            cursor = matched.nextSibling;
            fromParent.removeChild(matched);
          }
        });

        while (cursor) {
          var next = cursor.nextSibling;
          fromParent.removeChild(cursor);
          cursor = next;
        }
      }

      function morphRoot(target, fragment, runScripts) {
        var wrapper = document.createElement('div');
        wrapper.appendChild(fragment);
        morphChildren(target, wrapper, runScripts);
      }

      function scheduleRender(payload) {
        latestRender = payload;
        if (renderFrame) return;
        renderFrame = window.requestAnimationFrame(function() {
          renderFrame = 0;
          if (!latestRender) return;
          var renderPayload = latestRender;
          latestRender = null;
          var target = ensureRoot();
          if (!target) return;

          target.setAttribute('data-render-phase', renderPayload.runScripts ? 'committed' : 'streaming');

          var template = document.createElement('template');
          template.innerHTML = String(renderPayload.html || '');
          var fragment = template.content.cloneNode(true);

          if (!renderPayload.runScripts) {
            Array.prototype.forEach.call(fragment.querySelectorAll('script'), function(scriptNode) {
              scriptNode.remove();
            });
          }

          morphRoot(target, fragment, renderPayload.runScripts);

          if (renderPayload.runScripts) {
            Array.prototype.forEach.call(target.querySelectorAll('script'), replaceScriptNode);
          }__HEIGHT_REPORT__
        });
      }

      window.addEventListener('message', function(event) {
        var data = event.data;
        if (!data || typeof data !== 'object') return;
        if (data.source !== 'laborany-host' || data.widgetId !== widgetId) return;

        if (data.type === 'widget-theme') {
          applyTheme(data.theme);
          return;
        }

        if (data.type === 'widget-render') {
          scheduleRender({
            html: data.html || '',
            runScripts: Boolean(data.runScripts)
          });
        }
      });

      function installLinkInterceptor() {
        document.addEventListener('click', function(e) {
          var target = e.target;
          while (target && target.tagName !== 'A') target = target.parentElement;
          if (!target || !target.href) return;
          var href = target.href;
          if (href.startsWith('http:') || href.startsWith('https:')) {
            e.preventDefault();
            e.stopPropagation();
            window.parent.postMessage({
              type: 'external-link',
              source: 'laborany-widget',
              url: href
            }, '*');
          }
        }, true);
      }

      installStorageShim();
      installErrorGuards();
      installAgentBridge();
      installLinkInterceptor();
    })();
  </script>
</head>
<body>
  <div id="widget-root" data-render-phase="idle"></div>
</body>
</html>`
    .replace('__WIDGET_ID__', widgetId.replace(/\\/g, '\\\\').replace(/"/g, '\\"'))
    .replace('__HEIGHT_REPORT__', heightReportSnippet)
}
