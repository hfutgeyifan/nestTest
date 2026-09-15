<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import {
  ApiError,
  clearToken,
  createProduct,
  deleteProduct,
  getAllProducts,
  getProfile,
  getToken,
  login,
  register,
  setToken,
  updateProductName,
  updateProductQuantity,
  type Product,
} from './api';

const username = ref('');
const password = ref('');
const authMode = ref<'login' | 'register'>('login');
const authBusy = ref(false);
const notice = ref('');
const noticeError = ref(false);

const currentUser = ref('');
const products = ref<Product[]>([]);
const loading = ref(false);

const createForm = reactive({
  productNo: '',
  name: '',
  quantity: 0,
});

const drafts = ref<
  Record<string, { name: string; delta: number; busy: boolean }>
>({});

function showNotice(message: string, isError = false) {
  notice.value = message;
  noticeError.value = isError;
}

function productKey(product: Product) {
  return String(product.productNo);
}

function ensureDraft(product: Product) {
  const key = productKey(product);
  if (!drafts.value[key]) {
    drafts.value[key] = { name: product.name, delta: 1, busy: false };
  }
  return drafts.value[key];
}

async function loadProducts() {
  loading.value = true;
  try {
    const list = await getAllProducts();
    products.value = list.map((item) => ({
      ...item,
      productNo: String(item.productNo),
    }));
    const nextDrafts: typeof drafts.value = {};
    for (const product of products.value) {
      const key = productKey(product);
      nextDrafts[key] = {
        name: product.name,
        delta: drafts.value[key]?.delta ?? 1,
        busy: false,
      };
    }
    drafts.value = nextDrafts;
  } catch (error) {
    showNotice(
      error instanceof Error ? error.message : '加载商品失败',
      true,
    );
    if (error instanceof ApiError && error.status === 401) {
      currentUser.value = '';
    }
  } finally {
    loading.value = false;
  }
}

async function restoreSession() {
  if (!getToken()) return;
  try {
    const profile = await getProfile();
    currentUser.value = profile.username;
    await loadProducts();
  } catch {
    currentUser.value = '';
  }
}

async function submitAuth() {
  if (!username.value.trim() || !password.value) {
    showNotice('请输入用户名和密码', true);
    return;
  }

  authBusy.value = true;
  try {
    if (authMode.value === 'register') {
      await register(username.value.trim(), password.value);
    }
    const result = await login(username.value.trim(), password.value);
    setToken(result.access_token);
    currentUser.value = username.value.trim();
    password.value = '';
    showNotice(authMode.value === 'register' ? '注册并登录成功' : '登录成功');
    await loadProducts();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '登录失败', true);
  } finally {
    authBusy.value = false;
  }
}

function logout() {
  clearToken();
  currentUser.value = '';
  products.value = [];
  showNotice('已退出登录');
}

async function submitCreate() {
  if (!createForm.productNo.trim() || !createForm.name.trim()) {
    showNotice('请填写商品编号和名称', true);
    return;
  }

  try {
    await createProduct({
      productNo: createForm.productNo.trim(),
      name: createForm.name.trim(),
      quantity: Number(createForm.quantity) || 0,
    });
    createForm.productNo = '';
    createForm.name = '';
    createForm.quantity = 0;
    showNotice('商品已创建');
    await loadProducts();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '创建失败', true);
  }
}

async function saveName(product: Product) {
  const draft = ensureDraft(product);
  if (!draft.name.trim()) {
    showNotice('商品名称不能为空', true);
    return;
  }

  draft.busy = true;
  try {
    await updateProductName(product.productNo, draft.name.trim());
    showNotice('名称已更新');
    await loadProducts();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '改名失败', true);
  } finally {
    draft.busy = false;
  }
}

async function changeQuantity(product: Product, delta: number) {
  const draft = ensureDraft(product);
  draft.busy = true;
  try {
    await updateProductQuantity(product.productNo, delta);
    showNotice(delta > 0 ? `库存 +${delta}` : `库存 ${delta}`);
    await loadProducts();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '改库存失败', true);
  } finally {
    draft.busy = false;
  }
}

async function removeProduct(product: Product) {
  const draft = ensureDraft(product);
  draft.busy = true;
  try {
    await deleteProduct(product.productNo);
    showNotice('商品已删除');
    await loadProducts();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '删除失败', true);
  } finally {
    draft.busy = false;
  }
}

onMounted(() => {
  void restoreSession();
});
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div>
        <h1>仓储库存</h1>
        <p>注册登录后管理商品和库存</p>
      </div>
      <div v-if="currentUser" class="user">
        <span>{{ currentUser }}</span>
        <button type="button" class="ghost" @click="logout">退出</button>
      </div>
    </header>

    <p v-if="notice" class="notice" :class="{ 'is-error': noticeError }">
      {{ notice }}
    </p>

    <section v-if="!currentUser" class="panel auth">
      <div class="tabs">
        <button
          type="button"
          :class="{ active: authMode === 'login' }"
          @click="authMode = 'login'"
        >
          登录
        </button>
        <button
          type="button"
          :class="{ active: authMode === 'register' }"
          @click="authMode = 'register'"
        >
          注册
        </button>
      </div>
      <form class="form" @submit.prevent="submitAuth">
        <label>
          用户名
          <input v-model="username" type="text" autocomplete="username" />
        </label>
        <label>
          密码
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
          />
        </label>
        <button class="primary" type="submit" :disabled="authBusy">
          {{
            authBusy
              ? '提交中…'
              : authMode === 'register'
                ? '注册并登录'
                : '登录'
          }}
        </button>
      </form>
    </section>

    <template v-else>
      <section class="panel">
        <h2>新增商品</h2>
        <form class="form form--row" @submit.prevent="submitCreate">
          <label>
            编号
            <input v-model="createForm.productNo" type="text" placeholder="P001" />
          </label>
          <label>
            名称
            <input v-model="createForm.name" type="text" placeholder="苹果" />
          </label>
          <label>
            初始库存
            <input v-model.number="createForm.quantity" type="number" min="0" />
          </label>
          <button class="primary" type="submit">创建</button>
        </form>
      </section>

      <section class="panel">
        <div class="panel__title">
          <h2>商品列表</h2>
          <button type="button" class="ghost" :disabled="loading" @click="loadProducts">
            {{ loading ? '刷新中…' : '刷新' }}
          </button>
        </div>

        <p v-if="!products.length && !loading" class="empty">还没有商品，先创建一个。</p>

        <div v-for="product in products" :key="productKey(product)" class="product">
          <div class="product__meta">
            <strong>{{ product.name }}</strong>
            <span>编号 {{ product.productNo }} · 库存 {{ product.quantity }}</span>
          </div>

          <div class="product__actions">
            <input
              v-model="ensureDraft(product).name"
              type="text"
              :disabled="ensureDraft(product).busy"
            />
            <button
              type="button"
              class="ghost"
              :disabled="ensureDraft(product).busy"
              @click="saveName(product)"
            >
              改名
            </button>
            <input
              v-model.number="ensureDraft(product).delta"
              class="delta"
              type="number"
              min="1"
              :disabled="ensureDraft(product).busy"
            />
            <button
              type="button"
              class="ghost"
              :disabled="ensureDraft(product).busy"
              @click="changeQuantity(product, ensureDraft(product).delta || 1)"
            >
              入库
            </button>
            <button
              type="button"
              class="ghost"
              :disabled="ensureDraft(product).busy"
              @click="changeQuantity(product, -(ensureDraft(product).delta || 1))"
            >
              出库
            </button>
            <button
              type="button"
              class="ghost ghost--danger"
              :disabled="ensureDraft(product).busy || product.quantity !== 0"
              @click="removeProduct(product)"
            >
              删除
            </button>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.app {
  width: min(960px, 100%);
  margin: 0 auto;
  padding: 32px 24px 48px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.topbar,
.panel__title,
.product,
.form--row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.tabs {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
}

.topbar h1,
.panel h2 {
  margin: 0 0 6px;
}

.topbar h1 {
  font-size: 36px;
}

.user,
.product__actions,
.form,
.auth {
  display: flex;
  gap: 8px;
}

.user,
.product__actions {
  align-items: center;
  flex-wrap: wrap;
}

.notice,
.panel,
.empty {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
}

.notice,
.panel,
.empty {
  padding: 16px;
}

.notice.is-error {
  color: #b42318;
}

.auth {
  flex-direction: column;
  max-width: 420px;
}

.tabs button,
.ghost,
.primary,
input {
  font: inherit;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text-h);
}

.tabs button,
.ghost,
.primary {
  cursor: pointer;
  padding: 8px 12px;
}

.tabs button.active,
.primary {
  background: var(--accent);
  border-color: transparent;
  color: #fff;
}

.ghost {
  background: var(--social-bg);
}

.ghost--danger {
  color: #b42318;
}

.ghost:disabled,
.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.form {
  flex-direction: column;
}

.form--row {
  align-items: flex-end;
  flex-wrap: wrap;
}

label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
  flex: 1;
  min-width: 140px;
}

input {
  padding: 8px 10px;
}

.delta {
  width: 88px;
  flex: none;
}

.product {
  padding: 12px 0;
  border-top: 1px solid var(--border);
  align-items: flex-start;
  flex-wrap: wrap;
}

.product__meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 180px;
}

.product__actions input {
  width: 140px;
}

.empty {
  color: var(--text);
}

@media (max-width: 800px) {
  .topbar,
  .product,
  .form--row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
