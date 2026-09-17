const TOKEN_KEY = 'storage.access_token';

export type Product = {
  productNo: string;
  name: string;
  quantity: number;
};

export type JwtPayload = {
  sub: number;
  username: string;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function messageFromBody(body: unknown, fallback: string) {
  if (typeof body === 'string' && body) return body;
  if (body && typeof body === 'object' && 'message' in body) {
    const message = body.message;
    if (Array.isArray(message)) return message.join('；');
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`/api${path}`, { ...init, headers });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (res.status === 401) {
    clearToken();
  }

  if (!res.ok) {
    throw new ApiError(res.status, messageFromBody(data, res.statusText));
  }

  return data as T;
}

export function login(username: string, password: string) {
  return request<{ access_token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function register(username: string, password: string) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function getProfile() {
  return request<JwtPayload>('/auth/profile');
}

export function getAllProducts() {
  return request<Product[]>('/products/getAllProducts', { method: 'POST' });
}

export function createProduct(product: Product) {
  return request('/products/create', {
    method: 'POST',
    body: JSON.stringify(product),
  });
}

export function updateProductName(productNo: string, name: string) {
  return request('/products/updateProductName', {
    method: 'POST',
    body: JSON.stringify({ productNo, name }),
  });
}

export function deleteProduct(productNo: string) {
  return request('/products/deleteProduct', {
    method: 'POST',
    body: JSON.stringify({ productNo }),
  });
}

export type InboundStatus = 'draft' | 'confirmed' | 'voided';

export type Shelf = {
  name: string;
  remark: string;
};

export type ProductLocationRow = {
  productNo: string;
  shelfName: string;
  quantity: number;
};

export type ProductLocations = {
  productNo: string;
  productName: string;
  quantity: number;
  shelves: ProductLocationRow[];
  total: number;
};

export type ShelfContents = {
  shelfName: string;
  items: { productNo: string; productName: string; quantity: number }[];
};

export type StockInbound = {
  id: number;
  productNo: string;
  productName: string;
  quantity: number;
  shelfName: string;
  remark: string;
  status: InboundStatus;
  createdBy: number;
};

export function listInbounds() {
  return request<StockInbound[]>('/stock/inbounds/list', { method: 'POST' });
}

export function listShelves() {
  return request<Shelf[]>('/stock/shelves/list', { method: 'POST' });
}

export function listProductLocations() {
  return request<ProductLocations[]>('/stock/locations/list', {
    method: 'POST',
  });
}

export function locationsByShelf(shelfName: string) {
  return request<ShelfContents>('/stock/locations/by-shelf', {
    method: 'POST',
    body: JSON.stringify({ shelfName }),
  });
}

export function transferStock(body: {
  productNo: string;
  fromShelf: string;
  toShelf: string;
  quantity: number;
}) {
  return request<ProductLocations>('/stock/transfers', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function createInbound(body: {
  productNo: string;
  quantity: number;
  shelfName?: string;
  remark?: string;
}) {
  return request<StockInbound>('/stock/inbounds', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateInbound(body: {
  id: number;
  quantity?: number;
  shelfName?: string;
  remark?: string;
}) {
  return request<StockInbound>('/stock/inbounds/update', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function confirmInbound(id: number, shelfName: string) {
  return request<StockInbound>('/stock/inbounds/confirm', {
    method: 'POST',
    body: JSON.stringify({ id, shelfName }),
  });
}

export function voidInbound(id: number) {
  return request<StockInbound>('/stock/inbounds/void', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}

export type OutboundStatus = 'draft' | 'confirmed' | 'voided';

export type StockOutbound = {
  id: number;
  productNo: string;
  productName: string;
  quantity: number;
  orderNo: string;
  shelfName: string;
  status: OutboundStatus;
  createdBy: number;
};

export function listOutbounds() {
  return request<StockOutbound[]>('/stock/outbounds/list', { method: 'POST' });
}

export function createOutbound(body: {
  productNo: string;
  quantity: number;
  orderNo: string;
  shelfName?: string;
}) {
  return request<StockOutbound>('/stock/outbounds', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateOutbound(body: {
  id: number;
  quantity?: number;
  orderNo?: string;
  shelfName?: string;
}) {
  return request<StockOutbound>('/stock/outbounds/update', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function confirmOutbound(id: number, shelfName: string) {
  return request<StockOutbound>('/stock/outbounds/confirm', {
    method: 'POST',
    body: JSON.stringify({ id, shelfName }),
  });
}

export function voidOutbound(id: number) {
  return request<StockOutbound>('/stock/outbounds/void', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}
