<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import {
  ApiError,
  clearToken,
  confirmInbound,
  confirmOutbound,
  createInbound,
  createOutbound,
  createProduct,
  deleteProduct,
  getAllProducts,
  getProfile,
  getToken,
  listInbounds,
  listOutbounds,
  listProductLocations,
  listShelves,
  locationsByShelf,
  login,
  register,
  setToken,
  transferStock,
  updateInbound,
  updateOutbound,
  updateProductName,
  voidInbound,
  voidOutbound,
  type Product,
  type ProductLocations,
  type Shelf,
  type ShelfContents,
  type StockInbound,
  type StockOutbound,
} from './api';

const username = ref('');
const password = ref('');
const authMode = ref<'login' | 'register'>('login');
const authBusy = ref(false);
const notice = ref('');
const noticeError = ref(false);

const currentUser = ref('');
const products = ref<Product[]>([]);
const locations = ref<ProductLocations[]>([]);
const shelves = ref<Shelf[]>([]);
const shelfView = ref<ShelfContents | null>(null);
const inbounds = ref<StockInbound[]>([]);
const outbounds = ref<StockOutbound[]>([]);
const loading = ref(false);
const inboundLoading = ref(false);
const outboundLoading = ref(false);
const transferBusy = ref(false);

const createForm = reactive({
  productNo: '',
  name: '',
});

const inboundForm = reactive({
  productNo: '',
  quantity: 10,
  shelfName: 'A区-01',
  remark: '深圳供应商到货',
});

const outboundForm = reactive({
  productNo: '',
  quantity: 5,
  orderNo: 'ORD-1001',
  shelfName: 'A区-01',
});

const transferForm = reactive({
  productNo: '',
  fromShelf: 'A区-01',
  toShelf: 'B区-03',
  quantity: 4,
});

const shelfQuery = ref('A区-01');

const drafts = ref<Record<string, { name: string; busy: boolean }>>({});
const inboundDrafts = ref<
  Record<
    number,
    { quantity: number; remark: string; shelfName: string; busy: boolean }
  >
>({});
const outboundDrafts = ref<
  Record<
    number,
    { quantity: number; orderNo: string; shelfName: string; busy: boolean }
  >
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
    drafts.value[key] = { name: product.name, busy: false };
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
        busy: false,
      };
    }
    drafts.value = nextDrafts;
    if (!inboundForm.productNo && products.value[0]) {
      inboundForm.productNo = products.value[0].productNo;
    }
    if (!outboundForm.productNo && products.value[0]) {
      outboundForm.productNo = products.value[0].productNo;
    }
    if (!transferForm.productNo && products.value[0]) {
      transferForm.productNo = products.value[0].productNo;
    }
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
    await Promise.all([
      loadProducts(),
      loadShelves(),
      loadLocations(),
      loadInbounds(),
      loadOutbounds(),
    ]);
  } catch {
    currentUser.value = '';
  }
}

async function loadShelves() {
  shelves.value = await listShelves();
  if (shelves.value[0]) {
    if (!inboundForm.shelfName) inboundForm.shelfName = shelves.value[0].name;
    if (!outboundForm.shelfName) outboundForm.shelfName = shelves.value[0].name;
    if (!transferForm.fromShelf) transferForm.fromShelf = shelves.value[0].name;
    if (!shelfQuery.value) shelfQuery.value = shelves.value[0].name;
    if (shelves.value[1] && !transferForm.toShelf) {
      transferForm.toShelf = shelves.value[1].name;
    }
  }
}

async function loadLocations() {
  locations.value = await listProductLocations();
}

function shelvesText(productNo: string) {
  const row = locations.value.find((item) => item.productNo === productNo);
  if (!row || !row.shelves.length) return '未上架';
  return row.shelves
    .map((shelf) => `${shelf.shelfName}=${shelf.quantity}`)
    .join('，');
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
    await Promise.all([
      loadProducts(),
      loadShelves(),
      loadLocations(),
      loadInbounds(),
      loadOutbounds(),
    ]);
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
  locations.value = [];
  inbounds.value = [];
  outbounds.value = [];
  shelfView.value = null;
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
      quantity: 0,
    });
    showNotice('商品已创建，请开入库单上架');
    inboundForm.productNo = createForm.productNo.trim() || inboundForm.productNo;
    outboundForm.productNo =
      createForm.productNo.trim() || outboundForm.productNo;
    transferForm.productNo =
      createForm.productNo.trim() || transferForm.productNo;
    createForm.productNo = '';
    createForm.name = '';
    await Promise.all([loadProducts(), loadLocations()]);
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

async function removeProduct(product: Product) {
  const draft = ensureDraft(product);
  draft.busy = true;
  try {
    await deleteProduct(product.productNo);
    showNotice('商品已删除');
    await Promise.all([loadProducts(), loadLocations()]);
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '删除失败', true);
  } finally {
    draft.busy = false;
  }
}

function inboundStatusText(status: StockInbound['status']) {
  if (status === 'draft') return '草稿';
  if (status === 'confirmed') return '已确认';
  return '已作废';
}

function ensureInboundDraft(inbound: StockInbound) {
  if (!inboundDrafts.value[inbound.id]) {
    inboundDrafts.value[inbound.id] = {
      quantity: inbound.quantity,
      remark: inbound.remark,
      shelfName: inbound.shelfName || inboundForm.shelfName,
      busy: false,
    };
  }
  return inboundDrafts.value[inbound.id];
}

async function loadInbounds() {
  inboundLoading.value = true;
  try {
    const list = await listInbounds();
    inbounds.value = list;
    const nextDrafts: typeof inboundDrafts.value = {};
    for (const inbound of list) {
      nextDrafts[inbound.id] = {
        quantity: inbound.quantity,
        remark: inbound.remark,
        shelfName: inbound.shelfName || inboundForm.shelfName,
        busy: false,
      };
    }
    inboundDrafts.value = nextDrafts;
  } catch (error) {
    showNotice(
      error instanceof Error ? error.message : '加载入库单失败',
      true,
    );
    if (error instanceof ApiError && error.status === 401) {
      currentUser.value = '';
    }
  } finally {
    inboundLoading.value = false;
  }
}

async function submitInbound() {
  if (!inboundForm.productNo) {
    showNotice('请选择商品', true);
    return;
  }
  if (!Number.isInteger(inboundForm.quantity) || inboundForm.quantity < 1) {
    showNotice('入库件数必须大于 0', true);
    return;
  }

  try {
    await createInbound({
      productNo: inboundForm.productNo,
      quantity: inboundForm.quantity,
      shelfName: inboundForm.shelfName,
      remark: inboundForm.remark.trim(),
    });
    showNotice('入库单已开为草稿');
    await loadInbounds();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '开单失败', true);
  }
}

async function saveInbound(inbound: StockInbound) {
  const draft = ensureInboundDraft(inbound);
  if (!Number.isInteger(draft.quantity) || draft.quantity < 1) {
    showNotice('入库件数必须大于 0', true);
    return;
  }

  draft.busy = true;
  try {
    await updateInbound({
      id: inbound.id,
      quantity: draft.quantity,
      shelfName: draft.shelfName,
      remark: draft.remark,
    });
    showNotice('草稿已保存');
    await loadInbounds();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '保存失败', true);
  } finally {
    draft.busy = false;
  }
}

async function confirmInboundOrder(inbound: StockInbound) {
  const draft = ensureInboundDraft(inbound);
  draft.busy = true;
  try {
    if (!draft.shelfName) {
      showNotice('请选择上架货架', true);
      return;
    }
    await confirmInbound(inbound.id, draft.shelfName);
    showNotice(`入库单已确认，已上架到 ${draft.shelfName}`);
    await Promise.all([loadProducts(), loadLocations(), loadInbounds()]);
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '确认失败', true);
  } finally {
    draft.busy = false;
  }
}

async function voidInboundOrder(inbound: StockInbound) {
  const draft = ensureInboundDraft(inbound);
  draft.busy = true;
  try {
    await voidInbound(inbound.id);
    showNotice('入库单已作废');
    await loadInbounds();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '作废失败', true);
  } finally {
    draft.busy = false;
  }
}

function outboundStatusText(status: StockOutbound['status']) {
  return inboundStatusText(status);
}

function ensureOutboundDraft(outbound: StockOutbound) {
  if (!outboundDrafts.value[outbound.id]) {
    outboundDrafts.value[outbound.id] = {
      quantity: outbound.quantity,
      orderNo: outbound.orderNo,
      shelfName: outbound.shelfName || outboundForm.shelfName,
      busy: false,
    };
  }
  return outboundDrafts.value[outbound.id];
}

async function loadOutbounds() {
  outboundLoading.value = true;
  try {
    const list = await listOutbounds();
    outbounds.value = list;
    const nextDrafts: typeof outboundDrafts.value = {};
    for (const outbound of list) {
      nextDrafts[outbound.id] = {
        quantity: outbound.quantity,
        orderNo: outbound.orderNo,
        shelfName: outbound.shelfName || outboundForm.shelfName,
        busy: false,
      };
    }
    outboundDrafts.value = nextDrafts;
  } catch (error) {
    showNotice(
      error instanceof Error ? error.message : '加载出库单失败',
      true,
    );
    if (error instanceof ApiError && error.status === 401) {
      currentUser.value = '';
    }
  } finally {
    outboundLoading.value = false;
  }
}

async function submitOutbound() {
  if (!outboundForm.productNo) {
    showNotice('请选择商品', true);
    return;
  }
  if (!outboundForm.orderNo.trim()) {
    showNotice('请填写去向订单号', true);
    return;
  }
  if (!Number.isInteger(outboundForm.quantity) || outboundForm.quantity < 1) {
    showNotice('出库件数必须大于 0', true);
    return;
  }

  try {
    await createOutbound({
      productNo: outboundForm.productNo,
      quantity: outboundForm.quantity,
      orderNo: outboundForm.orderNo.trim(),
      shelfName: outboundForm.shelfName,
    });
    showNotice('出库单已开为草稿');
    await loadOutbounds();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '开单失败', true);
  }
}

async function saveOutbound(outbound: StockOutbound) {
  const draft = ensureOutboundDraft(outbound);
  if (!Number.isInteger(draft.quantity) || draft.quantity < 1) {
    showNotice('出库件数必须大于 0', true);
    return;
  }

  draft.busy = true;
  try {
    await updateOutbound({
      id: outbound.id,
      quantity: draft.quantity,
      orderNo: draft.orderNo,
      shelfName: draft.shelfName,
    });
    showNotice('草稿已保存');
    await loadOutbounds();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '保存失败', true);
  } finally {
    draft.busy = false;
  }
}

async function confirmOutboundOrder(outbound: StockOutbound) {
  const draft = ensureOutboundDraft(outbound);
  draft.busy = true;
  try {
    if (!draft.shelfName) {
      showNotice('请选择出库货架', true);
      return;
    }
    await confirmOutbound(outbound.id, draft.shelfName);
    showNotice(`出库单已确认，已从 ${draft.shelfName} 扣减`);
    await Promise.all([loadProducts(), loadLocations(), loadOutbounds()]);
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '确认失败', true);
  } finally {
    draft.busy = false;
  }
}

async function voidOutboundOrder(outbound: StockOutbound) {
  const draft = ensureOutboundDraft(outbound);
  draft.busy = true;
  try {
    await voidOutbound(outbound.id);
    showNotice('出库单已作废');
    await loadOutbounds();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '作废失败', true);
  } finally {
    draft.busy = false;
  }
}

async function submitTransfer() {
  if (!transferForm.productNo) {
    showNotice('请选择要移架的商品', true);
    return;
  }
  if (transferForm.fromShelf === transferForm.toShelf) {
    showNotice('来源和目标货架不能相同', true);
    return;
  }
  if (!Number.isInteger(transferForm.quantity) || transferForm.quantity < 1) {
    showNotice('移架件数必须大于 0', true);
    return;
  }

  transferBusy.value = true;
  try {
    await transferStock({
      productNo: transferForm.productNo,
      fromShelf: transferForm.fromShelf,
      toShelf: transferForm.toShelf,
      quantity: transferForm.quantity,
    });
    showNotice(
      `已从 ${transferForm.fromShelf} 搬 ${transferForm.quantity} 个到 ${transferForm.toShelf}`,
    );
    await Promise.all([loadProducts(), loadLocations()]);
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '移架失败', true);
  } finally {
    transferBusy.value = false;
  }
}

async function loadShelfContents() {
  if (!shelfQuery.value) {
    showNotice('请选择货架', true);
    return;
  }
  try {
    shelfView.value = await locationsByShelf(shelfQuery.value);
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '查询货架失败', true);
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
        <p>登录后开入/出库单并指定货架；移架需持锁，各货架之和等于总库存</p>
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
            <input v-model="createForm.name" type="text" placeholder="黑色蓝牙耳机" />
          </label>
          <button class="primary" type="submit">创建</button>
        </form>
      </section>

      <section class="panel">
        <div class="panel__title">
          <h2>商品列表</h2>
          <button
            type="button"
            class="ghost"
            :disabled="loading"
            @click="Promise.all([loadProducts(), loadLocations()])"
          >
            {{ loading ? '刷新中…' : '刷新' }}
          </button>
        </div>

        <p v-if="!products.length && !loading" class="empty">还没有商品，先创建一个。</p>

        <div v-for="product in products" :key="productKey(product)" class="product">
          <div class="product__meta">
            <strong>{{ product.name }}</strong>
            <span>
              编号 {{ product.productNo }} · 总计 {{ product.quantity }} ·
              {{ shelvesText(product.productNo) }}
            </span>
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

      <section class="panel">
        <h2>开入库单</h2>
        <p class="hint">草稿不改库存；确认时写入货架，Redis Hash 记下该架件数。</p>
        <form class="form form--row" @submit.prevent="submitInbound">
          <label>
            商品
            <select v-model="inboundForm.productNo">
              <option disabled value="">请选择商品</option>
              <option
                v-for="product in products"
                :key="product.productNo"
                :value="product.productNo"
              >
                {{ product.name }}（{{ product.productNo }}）
              </option>
            </select>
          </label>
          <label>
            货架
            <select v-model="inboundForm.shelfName">
              <option
                v-for="shelf in shelves"
                :key="`in-${shelf.name}`"
                :value="shelf.name"
              >
                {{ shelf.name }}
              </option>
            </select>
          </label>
          <label>
            件数
            <input v-model.number="inboundForm.quantity" type="number" min="1" />
          </label>
          <label>
            备注
            <input
              v-model="inboundForm.remark"
              type="text"
              placeholder="深圳供应商到货"
            />
          </label>
          <button class="primary" type="submit">开草稿单</button>
        </form>
      </section>

      <section class="panel">
        <div class="panel__title">
          <h2>我的入库单</h2>
          <button
            type="button"
            class="ghost"
            :disabled="inboundLoading"
            @click="loadInbounds"
          >
            {{ inboundLoading ? '刷新中…' : '刷新' }}
          </button>
        </div>

        <p v-if="!inbounds.length && !inboundLoading" class="empty">
          还没有入库单，先开一张草稿。
        </p>

        <div v-for="inbound in inbounds" :key="inbound.id" class="product">
          <div class="product__meta">
            <strong>
              {{ inbound.productName }} ·
              {{ inboundStatusText(inbound.status) }}
            </strong>
            <span>
              单号 {{ inbound.id }} · {{ inbound.productNo }} ·
              {{ inbound.quantity }} 件
              <template v-if="inbound.shelfName"> · {{ inbound.shelfName }}</template>
              <template v-if="inbound.remark"> · {{ inbound.remark }}</template>
            </span>
          </div>

          <div v-if="inbound.status === 'draft'" class="product__actions">
            <input
              v-model.number="ensureInboundDraft(inbound).quantity"
              class="delta"
              type="number"
              min="1"
              :disabled="ensureInboundDraft(inbound).busy"
            />
            <select
              v-model="ensureInboundDraft(inbound).shelfName"
              :disabled="ensureInboundDraft(inbound).busy"
            >
              <option
                v-for="shelf in shelves"
                :key="`in-draft-${inbound.id}-${shelf.name}`"
                :value="shelf.name"
              >
                {{ shelf.name }}
              </option>
            </select>
            <input
              v-model="ensureInboundDraft(inbound).remark"
              type="text"
              :disabled="ensureInboundDraft(inbound).busy"
            />
            <button
              type="button"
              class="ghost"
              :disabled="ensureInboundDraft(inbound).busy"
              @click="saveInbound(inbound)"
            >
              保存
            </button>
            <button
              type="button"
              class="primary"
              :disabled="ensureInboundDraft(inbound).busy"
              @click="confirmInboundOrder(inbound)"
            >
              确认入库
            </button>
            <button
              type="button"
              class="ghost ghost--danger"
              :disabled="ensureInboundDraft(inbound).busy"
              @click="voidInboundOrder(inbound)"
            >
              作废
            </button>
          </div>
          <div v-else class="product__actions">
            <span class="readonly">只能查看</span>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2>开出库单</h2>
        <p class="hint">确认时从指定货架扣；该架不够不会去别的架偷，单子仍是草稿。</p>
        <form class="form form--row" @submit.prevent="submitOutbound">
          <label>
            商品
            <select v-model="outboundForm.productNo">
              <option disabled value="">请选择商品</option>
              <option
                v-for="product in products"
                :key="`out-${product.productNo}`"
                :value="product.productNo"
              >
                {{ product.name }}（{{ product.productNo }}）
              </option>
            </select>
          </label>
          <label>
            货架
            <select v-model="outboundForm.shelfName">
              <option
                v-for="shelf in shelves"
                :key="`out-${shelf.name}`"
                :value="shelf.name"
              >
                {{ shelf.name }}
              </option>
            </select>
          </label>
          <label>
            件数
            <input v-model.number="outboundForm.quantity" type="number" min="1" />
          </label>
          <label>
            去向订单号
            <input v-model="outboundForm.orderNo" type="text" placeholder="ORD-1001" />
          </label>
          <button class="primary" type="submit">开草稿单</button>
        </form>
      </section>

      <section class="panel">
        <div class="panel__title">
          <h2>我的出库单</h2>
          <button
            type="button"
            class="ghost"
            :disabled="outboundLoading"
            @click="loadOutbounds"
          >
            {{ outboundLoading ? '刷新中…' : '刷新' }}
          </button>
        </div>

        <p v-if="!outbounds.length && !outboundLoading" class="empty">
          还没有出库单，先开一张草稿。
        </p>

        <div v-for="outbound in outbounds" :key="`out-${outbound.id}`" class="product">
          <div class="product__meta">
            <strong>
              {{ outbound.productName }} ·
              {{ outboundStatusText(outbound.status) }}
            </strong>
            <span>
              单号 {{ outbound.id }} · {{ outbound.productNo }} ·
              {{ outbound.quantity }} 件 · {{ outbound.orderNo }}
              <template v-if="outbound.shelfName"> · {{ outbound.shelfName }}</template>
            </span>
          </div>

          <div v-if="outbound.status === 'draft'" class="product__actions">
            <input
              v-model.number="ensureOutboundDraft(outbound).quantity"
              class="delta"
              type="number"
              min="1"
              :disabled="ensureOutboundDraft(outbound).busy"
            />
            <select
              v-model="ensureOutboundDraft(outbound).shelfName"
              :disabled="ensureOutboundDraft(outbound).busy"
            >
              <option
                v-for="shelf in shelves"
                :key="`out-draft-${outbound.id}-${shelf.name}`"
                :value="shelf.name"
              >
                {{ shelf.name }}
              </option>
            </select>
            <input
              v-model="ensureOutboundDraft(outbound).orderNo"
              type="text"
              :disabled="ensureOutboundDraft(outbound).busy"
            />
            <button
              type="button"
              class="ghost"
              :disabled="ensureOutboundDraft(outbound).busy"
              @click="saveOutbound(outbound)"
            >
              保存
            </button>
            <button
              type="button"
              class="primary"
              :disabled="ensureOutboundDraft(outbound).busy"
              @click="confirmOutboundOrder(outbound)"
            >
              确认出库
            </button>
            <button
              type="button"
              class="ghost ghost--danger"
              :disabled="ensureOutboundDraft(outbound).busy"
              @click="voidOutboundOrder(outbound)"
            >
              作废
            </button>
          </div>
          <div v-else class="product__actions">
            <span class="readonly">只能查看</span>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2>移架</h2>
        <p class="hint">
          同一商品同时只能有一个人搬。抢不到锁或来源架不够都会 409，总数量不变。
        </p>
        <form class="form form--row" @submit.prevent="submitTransfer">
          <label>
            商品
            <select v-model="transferForm.productNo">
              <option disabled value="">请选择商品</option>
              <option
                v-for="product in products"
                :key="`mv-${product.productNo}`"
                :value="product.productNo"
              >
                {{ product.name }}（{{ product.productNo }}）
              </option>
            </select>
          </label>
          <label>
            从
            <select v-model="transferForm.fromShelf">
              <option
                v-for="shelf in shelves"
                :key="`from-${shelf.name}`"
                :value="shelf.name"
              >
                {{ shelf.name }}
              </option>
            </select>
          </label>
          <label>
            到
            <select v-model="transferForm.toShelf">
              <option
                v-for="shelf in shelves"
                :key="`to-${shelf.name}`"
                :value="shelf.name"
              >
                {{ shelf.name }}
              </option>
            </select>
          </label>
          <label>
            件数
            <input v-model.number="transferForm.quantity" type="number" min="1" />
          </label>
          <button class="primary" type="submit" :disabled="transferBusy">
            {{ transferBusy ? '搬移中…' : '确认移架' }}
          </button>
        </form>
      </section>

      <section class="panel">
        <div class="panel__title">
          <h2>货架上有哪些货</h2>
          <button type="button" class="ghost" @click="loadShelfContents">查询</button>
        </div>
        <form class="form form--row" @submit.prevent="loadShelfContents">
          <label>
            货架
            <select v-model="shelfQuery">
              <option
                v-for="shelf in shelves"
                :key="`q-${shelf.name}`"
                :value="shelf.name"
              >
                {{ shelf.name }}
              </option>
            </select>
          </label>
        </form>
        <p v-if="shelfView && !shelfView.items.length" class="empty">
          {{ shelfView.shelfName }} 上还没有货。
        </p>
        <div
          v-for="item in shelfView?.items ?? []"
          :key="`${shelfView?.shelfName}-${item.productNo}`"
          class="product"
        >
          <div class="product__meta">
            <strong>{{ item.productName }}</strong>
            <span>{{ item.productNo }} · {{ item.quantity }} 件</span>
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
input,
select {
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

input,
select {
  padding: 8px 10px;
}

.hint,
.readonly {
  color: var(--text);
  font-size: 14px;
}

.hint {
  margin: 0 0 12px;
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
