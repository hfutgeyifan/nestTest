<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type ParamRow = { id: number; key: string; value: string; enabled: boolean }

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

const PRESETS = [
  { label: '健康检查', method: 'GET' as const, url: '/api/health' },
  { label: '全部商品', method: 'GET' as const, url: '/api/products/getAllProducts' },
  { label: '创建商品', method: 'POST' as const, url: '/api/products/create' },
  { label: '根路径', method: 'GET' as const, url: '/api/' },
]

let nextId = 1
const createRow = (key = '', value = ''): ParamRow => ({
  id: nextId++,
  key,
  value,
  enabled: true,
})

const method = ref<HttpMethod>('GET')
const url = ref('/api/health')
const queryRows = ref<ParamRow[]>([createRow()])
const headerRows = ref<ParamRow[]>([createRow('Content-Type', 'application/json')])
const bodyText = ref(
  JSON.stringify({ productNo: '', name: '', quantity: 0 }, null, 2),
)
const sending = ref(false)
const response = reactive({
  status: 0,
  statusText: '',
  timeMs: 0,
  body: '',
  error: '',
})

const usesBody = computed(() =>
  method.value === 'POST' || method.value === 'PUT' || method.value === 'PATCH',
)

const methodHint = computed(() => {
  switch (method.value) {
    case 'GET':
    case 'DELETE':
      return '参数会作为 Query 拼到 URL 上，例如 ?key=value'
    case 'POST':
    case 'PUT':
    case 'PATCH':
      return 'Query 仍会拼到 URL；请求体以 JSON 发送'
    default:
      return ''
  }
})

watch(method, (next) => {
  if (next === 'POST' && url.value === '/api/health') {
    url.value = '/api/products/create'
  }
})

function applyPreset(preset: (typeof PRESETS)[number]) {
  method.value = preset.method
  url.value = preset.url
  if (preset.method === 'POST' && preset.url.includes('create')) {
    bodyText.value = JSON.stringify(
      { productNo: 'P001', name: '示例商品', quantity: 10 },
      null,
      2,
    )
  }
}

function addRow(rows: ParamRow[]) {
  rows.push(createRow())
}

function removeRow(rows: ParamRow[], id: number) {
  const index = rows.findIndex((row) => row.id === id)
  if (index >= 0) rows.splice(index, 1)
  if (rows.length === 0) rows.push(createRow())
}

function rowsToRecord(rows: ParamRow[]) {
  const record: Record<string, string> = {}
  for (const row of rows) {
    if (!row.enabled || !row.key.trim()) continue
    record[row.key.trim()] = row.value
  }
  return record
}

function buildUrl() {
  const query = new URLSearchParams(rowsToRecord(queryRows.value)).toString()
  if (!query) return url.value
  return url.value.includes('?') ? `${url.value}&${query}` : `${url.value}?${query}`
}

async function sendRequest() {
  sending.value = true
  response.status = 0
  response.statusText = ''
  response.timeMs = 0
  response.body = ''
  response.error = ''

  const started = performance.now()
  try {
    const headers = rowsToRecord(headerRows.value)
    const init: RequestInit = { method: method.value, headers }

    if (usesBody.value) {
      const trimmed = bodyText.value.trim()
      if (trimmed) {
        JSON.parse(trimmed)
        init.body = trimmed
        if (!headers['Content-Type'] && !headers['content-type']) {
          headers['Content-Type'] = 'application/json'
        }
      }
    }

    const res = await fetch(buildUrl(), init)
    const text = await res.text()
    response.status = res.status
    response.statusText = res.statusText
    response.timeMs = Math.round(performance.now() - started)

    if (!text) {
      response.body = ''
      return
    }
    try {
      response.body = JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      response.body = text
    }
  } catch (error) {
    response.timeMs = Math.round(performance.now() - started)
    response.error = error instanceof Error ? error.message : String(error)
  } finally {
    sending.value = false
  }
}

const statusClass = computed(() => {
  if (response.error) return 'is-error'
  if (!response.status) return ''
  if (response.status >= 200 && response.status < 300) return 'is-ok'
  if (response.status >= 400) return 'is-error'
  return 'is-warn'
})
</script>

<template>
  <div class="requester">
    <header class="requester__header">
      <div>
        <h1>接口调试</h1>
        <p>选择地址、方法和参数，直接请求后端。</p>
      </div>
    </header>

    <section class="panel">
      <div class="presets">
        <span class="label">快捷地址</span>
        <div class="preset-list">
          <button
            v-for="preset in PRESETS"
            :key="preset.url"
            type="button"
            class="chip"
            @click="applyPreset(preset)"
          >
            {{ preset.label }}
          </button>
        </div>
      </div>

      <form class="request-bar" @submit.prevent="sendRequest">
        <select v-model="method" class="method" :class="`method--${method.toLowerCase()}`">
          <option v-for="item in METHODS" :key="item" :value="item">{{ item }}</option>
        </select>
        <input
          v-model="url"
          class="url"
          type="text"
          spellcheck="false"
          placeholder="/api/health 或完整 URL"
        />
        <button class="send" type="submit" :disabled="sending">
          {{ sending ? '请求中…' : '发送' }}
        </button>
      </form>
      <p class="hint">{{ methodHint }}</p>
    </section>

    <section class="grid">
      <div class="panel">
        <div class="panel__title">
          <h2>Query 参数</h2>
          <button type="button" class="ghost" @click="addRow(queryRows)">添加</button>
        </div>
        <div v-for="row in queryRows" :key="row.id" class="kv-row">
          <input v-model="row.enabled" type="checkbox" :aria-label="`启用 ${row.key || '参数'}`" />
          <input v-model="row.key" type="text" placeholder="key" />
          <input v-model="row.value" type="text" placeholder="value" />
          <button type="button" class="ghost ghost--danger" @click="removeRow(queryRows, row.id)">
            删除
          </button>
        </div>
      </div>

      <div class="panel">
        <div class="panel__title">
          <h2>请求头</h2>
          <button type="button" class="ghost" @click="addRow(headerRows)">添加</button>
        </div>
        <div v-for="row in headerRows" :key="row.id" class="kv-row">
          <input v-model="row.enabled" type="checkbox" :aria-label="`启用 ${row.key || '请求头'}`" />
          <input v-model="row.key" type="text" placeholder="Header" />
          <input v-model="row.value" type="text" placeholder="Value" />
          <button type="button" class="ghost ghost--danger" @click="removeRow(headerRows, row.id)">
            删除
          </button>
        </div>
      </div>
    </section>

    <section v-if="usesBody" class="panel">
      <div class="panel__title">
        <h2>JSON Body</h2>
      </div>
      <textarea
        v-model="bodyText"
        class="body"
        spellcheck="false"
        placeholder='{"productNo":"P001","name":"示例商品","quantity":10}'
      />
    </section>

    <section class="panel">
      <div class="panel__title">
        <h2>响应</h2>
        <span v-if="response.status || response.error" class="status" :class="statusClass">
          <template v-if="response.error">请求失败</template>
          <template v-else>{{ response.status }} {{ response.statusText }}</template>
          <template v-if="response.timeMs"> · {{ response.timeMs }}ms</template>
        </span>
      </div>
      <pre class="response">{{ response.error || response.body || '发送请求后会显示结果' }}</pre>
    </section>
  </div>
</template>

<style scoped>
.requester {
  width: min(960px, 100%);
  margin: 0 auto;
  padding: 32px 24px 48px;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.requester__header h1 {
  margin: 0 0 8px;
  font-size: 36px;
}

.requester__header p,
.hint {
  color: var(--text);
}

.panel {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  background: var(--bg);
}

.panel__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.panel__title h2,
.label {
  margin: 0;
  font-size: 16px;
  color: var(--text-h);
}

.presets {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.preset-list,
.request-bar,
.kv-row,
.grid {
  display: flex;
  gap: 8px;
}

.preset-list {
  flex-wrap: wrap;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.request-bar {
  align-items: stretch;
}

.method,
.url,
.send,
.chip,
.ghost,
.kv-row input[type='text'],
.body {
  font: inherit;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text-h);
}

.method,
.send,
.chip,
.ghost {
  cursor: pointer;
}

.method {
  min-width: 110px;
  font-weight: 600;
  padding: 0 10px;
}

.method--get { color: #157347; }
.method--post { color: #b45309; }
.method--put { color: #1d4ed8; }
.method--patch { color: #6d28d9; }
.method--delete { color: #b42318; }

.url {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
}

.send {
  padding: 0 18px;
  background: var(--accent);
  border-color: transparent;
  color: #fff;
  font-weight: 600;
}

.send:disabled {
  opacity: 0.6;
  cursor: wait;
}

.chip,
.ghost {
  padding: 6px 10px;
  background: var(--social-bg);
}

.ghost--danger {
  color: #b42318;
}

.hint {
  margin: 10px 0 0;
  font-size: 14px;
}

.kv-row {
  align-items: center;
  margin-bottom: 8px;
}

.kv-row input[type='text'] {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
}

.body,
.response {
  width: 100%;
  min-height: 180px;
  box-sizing: border-box;
  margin: 0;
  padding: 12px;
  border-radius: 8px;
  background: var(--code-bg);
  color: var(--text-h);
  font-family: var(--mono);
  font-size: 14px;
  line-height: 1.5;
  overflow: auto;
}

.body {
  resize: vertical;
  border: 1px solid var(--border);
}

.status {
  font-size: 13px;
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--code-bg);
}

.status.is-ok { color: #157347; }
.status.is-warn { color: #b45309; }
.status.is-error { color: #b42318; }

@media (max-width: 800px) {
  .grid,
  .request-bar,
  .kv-row {
    display: flex;
    flex-direction: column;
  }

  .method,
  .send {
    min-height: 42px;
  }
}
</style>
